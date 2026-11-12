// Server-side: download the feeds of «Новости и наука» and store new items as
// posts (auto = true). Run by the daily cron, by «Обновить ленту» and, at most
// once in REFRESH_EVERY, when somebody opens the news page.
import { createHash } from "node:crypto";
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { isPostKind, type PostKind } from "./types";
import { autoTags, classify, isRelevant, ogImage, parseFeed, parseTelegram, type FeedItem } from "./feeds";
import { DEFAULT_SOURCES } from "./sources";

export const REFRESH_EVERY_MIN = 180;
const UA = "Mozilla/5.0 (compatible; FinLiteKG-NewsBot/1.0; +https://finlite.kg)";
const MAX_AGE_DAYS = 45;
const PER_SOURCE = 25;

function rethrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/FeedSource|imageUrl|externalId|does not exist|P2021|P2022/i.test(msg)) throw new HttpError(503, "В базе ещё нет таблиц для автосбора. Выполните один раз: npx prisma db push");
  throw e;
}

/** Feed text in its own charset (windows-1251 sites are still around). */
export async function fetchText(url: string, timeoutMs = 10000): Promise<string> {
  const res = await fetch(url, { headers: { "User-Agent": UA, Accept: "application/rss+xml, application/atom+xml, application/xml, text/xml, text/html;q=0.9, */*;q=0.5" }, cache: "no-store", redirect: "follow", signal: AbortSignal.timeout(timeoutMs) });
  if (!res.ok) throw new Error(`сайт ответил ${res.status}`);
  const buf = new Uint8Array(await res.arrayBuffer());
  const head = new TextDecoder("latin1").decode(buf.slice(0, 1024));
  const cs = (res.headers.get("content-type")?.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? "utf-8").toLowerCase();
  try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

export async function readSource(url: string, type: string): Promise<FeedItem[]> {
  const text = await fetchText(url);
  if (type === "telegram") return parseTelegram(text, url.split("/").pop() ?? "");
  if (!/<(rss|feed|rdf:RDF)\b/i.test(text.slice(0, 5000))) throw new Error("по адресу не лента RSS/Atom (похоже на обычную страницу)");
  return parseFeed(text, url);
}

const extId = (sourceUrl: string, itemId: string) => createHash("sha256").update(`${sourceUrl}|${itemId}`).digest("hex").slice(0, 40);

async function ensureDefaults() {
  const n = await prisma.feedSource.count();
  if (n) return;
  await prisma.feedSource.createMany({ data: DEFAULT_SOURCES.map((s) => ({ ...s, tags: s.tags })), skipDuplicates: true });
}

/** Понятная причина сбоя загрузки. */
export function errorText(e: unknown): string {
  if (!(e instanceof Error)) return String(e);
  if (e.name === "TimeoutError" || e.name === "AbortError") return "сайт не ответил за 10 секунд";
  if (/fetch failed|ECONNREFUSED|ENOTFOUND|EAI_AGAIN|ECONNRESET|certificate/i.test(`${e.message} ${(e as any).cause?.code ?? ""}`)) return "сайт недоступен или не принимает подключение";
  return e.message;
}

export interface RunResult { source: string; ok: boolean; found: number; added: number; error?: string }

let running: Promise<RunResult[]> | null = null;

/** Last run of any source, or null — for «обновлено N минут назад». */
export async function lastRun(): Promise<Date | null> {
  try {
    const r = await prisma.feedSource.findFirst({ where: { lastRunAt: { not: null } }, orderBy: { lastRunAt: "desc" }, select: { lastRunAt: true } });
    return r?.lastRunAt ?? null;
  } catch { return null; }
}

/** Download all enabled sources (or one) and add the new items. */
export function collect(opts: { force?: boolean; sourceId?: string } = {}): Promise<RunResult[]> {
  if (running) return running;
  running = run(opts).finally(() => { running = null; });
  return running;
}

async function run({ force, sourceId }: { force?: boolean; sourceId?: string }): Promise<RunResult[]> {
  try {
    await ensureDefaults();
    if (!force && !sourceId) {
      const last = await lastRun();
      if (last && Date.now() - last.getTime() < 20 * 60e3) return [];
    }
    const sources = await prisma.feedSource.findMany({ where: sourceId ? { id: sourceId } : { enabled: true } });
    const cutoff = Date.now() - MAX_AGE_DAYS * 864e5;
    let ogBudget = 10;
    const results = await Promise.all(sources.map(async (s): Promise<RunResult> => {
      try {
        const items = (await readSource(s.url, s.type))
          .filter((i) => !i.date || Date.parse(i.date) >= cutoff)
          .filter((i) => !s.filter || isRelevant(`${i.title} ${i.summary} ${i.categories.join(" ")}`))
          .slice(0, PER_SOURCE);
        const ids = items.map((i) => extId(s.url, i.id));
        const have = new Set((await prisma.post.findMany({ where: { externalId: { in: ids } }, select: { externalId: true } })).map((p) => p.externalId));
        const fresh = items.filter((_, k) => !have.has(ids[k]));
        // картинка со страницы статьи, если в ленте её нет (Telegram отдаёт свои)
        await Promise.all(fresh.map(async (i) => {
          if (i.image || s.type === "telegram" || ogBudget <= 0) return;
          ogBudget--;
          try { i.image = ogImage(await fetchText(i.url, 5000), i.url); } catch { /* без картинки */ }
        }));
        const fallback: PostKind = isPostKind(s.kind) ? s.kind : "news";
        const now = Date.now();
        for (const i of fresh) {
          const text = `${i.title} ${i.summary} ${i.categories.join(" ")}`;
          const own = i.categories.filter((c) => /^[\p{L}\d_]{2,30}$/u.test(c)).slice(0, 2);
          const tags = Array.from(new Set([...s.tags, ...autoTags(text), ...own])).slice(0, 6);
          const at = i.date && Date.parse(i.date) <= now ? new Date(i.date) : new Date();
          await prisma.post.create({
            data: {
              kind: classify(i.title, i.url, fallback), title: i.title, summary: i.summary || null, body: i.summary || i.title,
              sourceUrl: i.url, sourceName: s.name, imageUrl: i.image, externalId: extId(s.url, i.id), auto: true,
              docDate: at, createdAt: at, tags, authorName: s.name, authorOrg: "автосбор FinLite",
            },
          }).catch((e) => { if (!/Unique constraint|P2002/.test(String(e))) throw e; });
        }
        await prisma.feedSource.update({ where: { id: s.id }, data: { lastRunAt: new Date(), lastOk: true, lastCount: items.length, lastAdded: fresh.length, lastError: null } });
        return { source: s.name, ok: true, found: items.length, added: fresh.length };
      } catch (e) {
        const error = errorText(e);
        await prisma.feedSource.update({ where: { id: s.id }, data: { lastRunAt: new Date(), lastOk: false, lastError: error.slice(0, 300), lastAdded: 0 } }).catch(() => {});
        return { source: s.name, ok: false, found: 0, added: 0, error };
      }
    }));
    return results;
  } catch (e) { rethrow(e); }
}
