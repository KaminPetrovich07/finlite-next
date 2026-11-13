// Server-side: official rates in the FxRate table.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { parseNbkrXml, type Rate } from "./fx";

const FEEDS = ["https://www.nbkr.kg/XML/daily.xml", "https://www.nbkr.kg/XML/weekly.xml"];

const iso = (d: Date) => d.toISOString().slice(0, 10);

function rethrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/FxRate|does not exist|P2021|currency|amountCur/i.test(msg)) throw new HttpError(503, "В базе ещё нет таблицы курсов. Выполните один раз: npx prisma db push");
  throw e;
}

/** Today in Bishkek (UTC+6): НБКР устанавливает курс на эту дату. */
export const bishkekToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

async function download(url: string): Promise<string> {
  let last: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
      if (!res.ok) throw new HttpError(502, `НБКР ответил ${res.status} на ${url}`);
      // the feed is windows-1251; only ASCII matters for parsing, but decode properly anyway
      return new TextDecoder("windows-1251").decode(await res.arrayBuffer());
    } catch (e) { last = e; }
  }
  if (last instanceof HttpError) throw last;
  throw new HttpError(502, `Сайт НБКР не ответил (${last instanceof Error ? last.message : String(last)})`);
}

/**
 * Download the NBKR rates (daily + weekly feeds) and store them.
 * НБКР публикует курс накануне: вечером в ленте уже курс на завтра — он сохраняется своей датой
 * и вступает в силу с неё. Ошибка еженедельной ленты не мешает ежедневной.
 */
export async function fetchNbkr(): Promise<{ date: string; count: number }[]> {
  const out: { date: string; count: number }[] = [];
  for (const [i, url] of FEEDS.entries()) {
    let text: string;
    try { text = await download(url); } catch (e) { if (i === 0) throw e; continue; }
    const { date, rates } = parseNbkrXml(text);
    try {
      for (const r of rates) {
        await prisma.fxRate.upsert({
          where: { date_code: { date: new Date(`${date}T00:00:00Z`), code: r.code } },
          create: { date: new Date(`${date}T00:00:00Z`), code: r.code, rate: r.rate, source: "nbkr" },
          update: { rate: r.rate, source: "nbkr" },
        });
      }
    } catch (e) { rethrow(e); }
    out.push({ date, count: rates.length });
  }
  return out;
}

const TRY_KEY = "fx:lastTry";

/**
 * If the rate in force today is missing (cron did not run or the NBKR site was down),
 * try to load it — at most once in 20 minutes, so a dead feed is not hammered on every page view.
 */
export async function ensureFresh(): Promise<void> {
  const today = bishkekToday();
  try {
    const last = await prisma.fxRate.findFirst({ where: { code: "USD" }, orderBy: { date: "desc" }, select: { date: true } });
    if (last && iso(last.date) >= today) return;
    const t = await prisma.appSetting.findUnique({ where: { key: TRY_KEY } });
    const at = Number((t?.value as { at?: number } | null)?.at ?? 0);
    if (Date.now() - at < 20 * 60 * 1000) return;
    await prisma.appSetting.upsert({ where: { key: TRY_KEY }, create: { key: TRY_KEY, value: { at: Date.now() } }, update: { value: { at: Date.now() } } });
    await fetchNbkr();
  } catch { /* курсы покажем из базы; причина будет видна при ручной загрузке и в журнале ошибок от cron */ }
}

export async function saveRate(date: string, code: string, rate: number): Promise<void> {
  try {
    await prisma.fxRate.upsert({
      where: { date_code: { date: new Date(`${date}T00:00:00Z`), code } },
      create: { date: new Date(`${date}T00:00:00Z`), code, rate, source: "manual" },
      update: { rate, source: "manual" },
    });
  } catch (e) { rethrow(e); }
}

/** All stored rates up to `to` (enough history to find the rate in force on any date). */
export async function loadRates(to: string, codes?: string[]): Promise<Rate[]> {
  try {
    const rows = await prisma.fxRate.findMany({
      where: { date: { lte: new Date(`${to}T00:00:00Z`) }, ...(codes?.length ? { code: { in: codes } } : {}) },
      orderBy: [{ date: "asc" }],
    });
    return rows.map((r) => ({ date: iso(r.date), code: r.code, rate: Number(r.rate) }));
  } catch (e) { rethrow(e); }
}
