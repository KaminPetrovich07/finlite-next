// Server side: the weekly OpenAlex snapshot is kept in AppSetting («science:snapshot»).
// Titles, topics and keywords are translated into Russian once (Claude Haiku, if ANTHROPIC_API_KEY
// is set) and the translations are reused on the next update.
import Anthropic from "@anthropic-ai/sdk";
import { prisma } from "@/lib/db";
import { applyTranslations, fetchScope, SCOPES, untranslated, type Fetcher, type ScienceSnapshot } from "./openalex";

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

/** fetch with a polite pause, a timeout and one retry on 429/5xx. */
export const openAlexFetch: Fetcher = async (u) => {
  for (let attempt = 0; attempt < 2; attempt++) {
    await sleep(attempt ? 2000 : 150);
    const res = await fetch(u, { headers: { "User-Agent": "FinLite KG (finlite.kg; science digest)", Accept: "application/json" }, signal: AbortSignal.timeout(20_000) });
    if (res.ok) return res.json();
    if (res.status !== 429 && res.status < 500) throw new Error(`OpenAlex ответил ${res.status} на ${new URL(u).pathname}`);
  }
  throw new Error("OpenAlex не ответил — попробуем при следующем обновлении");
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

/** Builds a new snapshot. A scope that fails keeps its previous data; errors are reported. */
export async function refreshSnapshot(get: Fetcher = openAlexFetch): Promise<ScienceSnapshot> {
  const prev = await loadSnapshot();
  const apiKey = process.env.OPENALEX_API_KEY || undefined;
  const scopes = [];
  const errors: string[] = [];
  for (const sc of SCOPES) {
    try { scopes.push(await fetchScope(sc, get, new Date(), apiKey)); }
    catch (e) {
      errors.push(`${sc.title}: ${e instanceof Error ? e.message : String(e)}`);
      const old = prev?.scopes.find((s) => s.key === sc.key);
      if (old) scopes.push(old);
    }
  }
  if (!scopes.length) throw new Error(errors.join("; ") || "Нет данных");
  let snap: ScienceSnapshot = { source: "OpenAlex", updatedAt: new Date().toISOString(), scopes, errors, translations: prev?.translations ?? {} };
  snap.translations = { ...snap.translations, ...(await translate(untranslated(snap))) };
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
  const n = await refreshSnapshot();
  return { refreshed: true, updatedAt: n.updatedAt, ...(n.errors.length ? { errors: n.errors } : {}) };
}
