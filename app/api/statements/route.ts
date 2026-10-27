import { NextRequest, NextResponse } from "next/server";
import { loadCompanyPeriod, NotFoundError } from "@/lib/ledger/load";
import type { LedgerEntry } from "@/lib/ledger/types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/statements?companyId=…&from=…&to=…[&regime=…]
 * One call returns every statement for the period plus the entries behind
 * them, so the page can drill down without further requests.
 * companyId=demo works without a database.
 */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  const from = sp.get("from") ?? "";
  const to = sp.get("to") ?? "";
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });
  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "Период задан неверно" }, { status: 400 });
  }
  try {
    const d = await loadCompanyPeriod(companyId, { from, to }, sp.get("regime"));
    return NextResponse.json({
      company: d.company,
      demo: d.demo,
      statements: d.statements,
      previous: d.previous,
      esg: d.esg,
      entries: visible(d.entries, from, to),
    });
  } catch (e) {
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    return NextResponse.json({ error: "База данных недоступна. Откройте демо-компанию, чтобы посмотреть отчётность." }, { status: 503 });
  }
}

/** Opening entries + entries of the period (what drill-down can show). */
function visible(entries: LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((e) => e.source === "opening" ? e.date <= to : e.date >= from && e.date <= to);
}
