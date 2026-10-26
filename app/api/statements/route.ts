import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { buildStatements } from "@/lib/ledger/engine";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { countUnpostedBankTx, loadEntries } from "@/lib/ledger/repo";
import { isRegimeKey } from "@/lib/ledger/taxes";
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
  const regimeParam = sp.get("regime");
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });
  if (!ISO.test(from) || !ISO.test(to) || from > to) {
    return NextResponse.json({ error: "Период задан неверно" }, { status: 400 });
  }

  if (companyId === DEMO_COMPANY.id) {
    const entries = demoEntries();
    const regime = isRegimeKey(regimeParam) ? regimeParam : DEMO_COMPANY.regime;
    const statements = buildStatements(entries, { from, to }, { regime, patentMonthly: DEMO_COMPANY.patentAmount });
    return NextResponse.json({
      company: { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name, regime, patentAmount: DEMO_COMPANY.patentAmount },
      demo: true,
      statements,
      entries: visible(entries, from, to),
    });
  }

  try {
    const company = await prisma.company.findUnique({
      where: { id: companyId },
      select: { id: true, name: true, defaultRegime: true, patentAmount: true },
    });
    if (!company) return NextResponse.json({ error: "Компания не найдена" }, { status: 404 });

    const regime = isRegimeKey(regimeParam) ? regimeParam : isRegimeKey(company.defaultRegime) ? company.defaultRegime : null;
    const [entries, unpostedBankTx] = await Promise.all([
      loadEntries(companyId, to),
      countUnpostedBankTx(companyId, from, to),
    ]);
    const statements = buildStatements(entries, { from, to }, { regime, patentMonthly: company.patentAmount, unpostedBankTx });
    return NextResponse.json({
      company: { id: company.id, name: company.name, regime, patentAmount: company.patentAmount },
      demo: false,
      statements,
      entries: visible(entries, from, to),
    });
  } catch {
    return NextResponse.json({ error: "База данных недоступна. Откройте демо-компанию, чтобы посмотреть отчётность." }, { status: 503 });
  }
}

/** Opening entries + entries of the period (what drill-down can show). */
function visible(entries: LedgerEntry[], from: string, to: string): LedgerEntry[] {
  return entries.filter((e) => e.source === "opening" ? e.date <= to : e.date >= from && e.date <= to);
}
