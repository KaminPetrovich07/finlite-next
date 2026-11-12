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

/** Download today's NBKR rates (daily + weekly feeds) and store them. */
export async function fetchNbkr(): Promise<{ date: string; count: number }[]> {
  const out: { date: string; count: number }[] = [];
  for (const url of FEEDS) {
    const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) });
    if (!res.ok) throw new HttpError(502, `НБКР ответил ${res.status} на ${url}`);
    // the feed is windows-1251; only ASCII matters for parsing, but decode properly anyway
    const text = new TextDecoder("windows-1251").decode(await res.arrayBuffer());
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
