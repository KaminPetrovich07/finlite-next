// Server side: the weekly OpenAlex snapshot is kept in AppSetting («science:snapshot»).
// Titles, topics and keywords are translated into Russian once (Claude Haiku, if ANTHROPIC_API_KEY
// is set) and the translations are reused on the next update.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { applyTranslations, fetchScope, SCOPES, untranslated, type Fetcher, type ScienceSnapshot, type ScopeSnapshot } from "./openalex";

const KEY = "science:snapshot";
export const REFRESH_DAYS = 7;

export async function loadSnapshot(): Promise<ScienceSnapshot | null> {
  const r = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  return r ? (r.value as unknown as ScienceSnapshot) : null;
}

async function saveSnapshot(s: ScienceSnapshot) {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: s as object }, update: { value: s as object } });
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** fetch with a polite pause, a timeout and one retry on 429/5xx or a network error. */
export const openAlexFetch: Fetcher = async (u) => {
  const path = new URL(u).pathname;
  let last = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(attempt ? 2000 : 150);
    let res: Response;
    try {
      res = await fetch(u, { headers: { "User-Agent": "FinLite KG (finlite.kg; science digest)", Accept: "application/json" }, signal: AbortSignal.timeout(15_000) });
    } catch (e) {
      last = e instanceof Error && (e.name === "TimeoutError" || e.name === "AbortError") ? `OpenAlex не ответил за 15 с на ${path}` : `нет связи с OpenAlex (${e instanceof Error ? e.message : String(e)})`;
      continue;
    }
    if (res.ok) return res.json();
    last = `OpenAlex ответил ${res.status} на ${path}${res.status === 429 ? " — превышен дневной лимит запросов" : ""}`;
    if (res.status !== 429 && res.status < 500) break;
  }
  throw new Error(last || "OpenAlex не ответил");
};

/** Strings per run: one batch keeps the daily job well inside its time limit; the rest follow on the next days. */
const TRANSLATE_PER_RUN = 60;

async function translate(all: string[]): Promise<Record<string, string>> {
  const texts = all.slice(0, TRANSLATE_PER_RUN);
  if (!process.env.ANTHROPIC_API_KEY || !texts.length) return {};
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  const out: Record<string, string> = {};
  for (let i = 0; i < texts.length; i += 60) {
    const batch = texts.slice(i, i + 60);
    try {
      const msg = await client.messages.create({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 6000,
        system: "Ты переводишь названия научных работ, тем и ключевые слова по бухгалтерскому учёту, аудиту и финансам на русский язык. " +
          "Используй принятую в русскоязычной профессиональной литературе терминологию (МСФО, аудит, раскрытие информации, корпоративное управление). " +
          "Аббревиатуры (ESG, IFRS → МСФО, CSR, IPO) переводи или оставляй так, как принято. Отвечай ТОЛЬКО JSON-массивом строк той же длины и в том же порядке.",
        messages: [{ role: "user", content: JSON.stringify(batch) }],
      });
      const t = msg.content.find((b) => b.type === "text");
      const arr = t && t.type === "text" ? JSON.parse(t.text.trim().replace(/^```json?\n?/, "").replace(/```$/, "")) : null;
      if (Array.isArray(arr) && arr.length === batch.length) batch.forEach((s, j) => { if (typeof arr[j] === "string" && arr[j].trim()) out[s] = arr[j].trim(); });
    } catch { /* без перевода — покажем оригинал */ }
  }
  return out;
}

export type RefreshOptions = {
  /** only this scope (the page refreshes scopes one request at a time to stay inside Vercel's time limit) */
  scope?: string;
  /** stop starting new scopes after this many ms; the rest keep their previous data */
  budgetMs?: number;
  /** translate new titles in this run (skipped when the budget is nearly spent) */
  translate?: boolean;
};

/**
 * Builds a new snapshot. Every scope is collected section by section: a failed section keeps the previous
 * data and is listed in the scope's `errors`; a scope that fails entirely keeps its previous data too.
 * Whatever was collected is saved, even if other scopes failed.
 */
export async function refreshSnapshot(get: Fetcher = openAlexFetch, opts: RefreshOptions = {}): Promise<ScienceSnapshot> {
  const started = Date.now();
  const left = () => (opts.budgetMs ?? Infinity) - (Date.now() - started);
  const prev = await loadSnapshot();
  const apiKey = process.env.OPENALEX_API_KEY || undefined;
  const wanted = opts.scope ? SCOPES.filter((s) => s.key === opts.scope) : SCOPES;
  if (!wanted.length) throw new Error(`Неизвестная область: ${opts.scope}`);
  const errors: string[] = [];
  const fresh = new Map<string, ScopeSnapshot>();
  for (const sc of wanted) {
    const old = prev?.scopes.find((s) => s.key === sc.key) ?? null;
    if (left() < 15_000) { errors.push(`${sc.title}: не успели — обновится в следующий раз`); continue; }
    try {
      const got = await fetchScope(sc, get, new Date(), apiKey, old);
      fresh.set(sc.key, got);
      for (const e of got.errors ?? []) errors.push(`${sc.title} — ${e}`);
    } catch (e) {
      errors.push(`${sc.title}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  // keep scopes in their usual order: fresh where collected, previous otherwise
  const scopes = SCOPES.map((sc) => fresh.get(sc.key) ?? prev?.scopes.find((s) => s.key === sc.key)).filter((x): x is ScopeSnapshot => !!x);
  if (!fresh.size) throw new Error(errors.join("; ") || "Нет данных");
  let snap: ScienceSnapshot = { source: "OpenAlex", updatedAt: new Date().toISOString(), scopes, errors, translations: prev?.translations ?? {} };
  if (opts.translate !== false && left() > 20_000) {
    try { snap.translations = { ...snap.translations, ...(await translate(untranslated(snap))) }; } catch { /* переведём позже */ }
  }
  snap = applyTranslations(snap);
  await saveSnapshot(snap);
  return snap;
}

/** Daily cron: refresh when the snapshot is missing or older than a week; otherwise translate what is left. */
export async function refreshIfStale(): Promise<{ refreshed: boolean; updatedAt: string | null; translated?: number; errors?: string[] }> {
  const s = await loadSnapshot();
  if (s && Date.now() - Date.parse(s.updatedAt) < REFRESH_DAYS * 864e5) {
    const todo = untranslated(s);
    if (!todo.length || !process.env.ANTHROPIC_API_KEY) return { refreshed: false, updatedAt: s.updatedAt };
    const add = await translate(todo);
    const next = applyTranslations({ ...s, translations: { ...s.translations, ...add } });
    await saveSnapshot(next);
    return { refreshed: false, updatedAt: s.updatedAt, translated: Object.keys(add).length };
  }
  // cron has up to 60 s: leave room for the other daily jobs
  const n = await refreshSnapshot(openAlexFetch, { budgetMs: 40_000 });
  return { refreshed: true, updatedAt: n.updatedAt, ...(n.errors.length ? { errors: n.errors } : {}) };
}
