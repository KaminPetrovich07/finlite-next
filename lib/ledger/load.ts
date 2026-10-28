// Server-side: everything a page or an export needs for one company and period.
// companyId = "demo" works without a database.
import { prisma } from "@/lib/db";
import { buildStatements, type Statements } from "./engine";
import { demoEntries, DEMO_COMPANY, DEMO_ESG, DEMO_PERIOD } from "./demo";
import { countUnpostedBankTx, fromIsoDate, loadEntries } from "./repo";
import { isRegimeKey, REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import { normalizeEsgInput, type EsgInput } from "@/lib/esg/input";
import type { LedgerEntry, Period } from "./types";

export interface CompanyInfo {
  id: string;
  name: string;
  regime: RegimeKey | null;
  regimeName: string;
  patentAmount: number;
  activity?: string;
}

export interface CompanyPeriodData {
  company: CompanyInfo;
  demo: boolean;
  period: Period;
  /** all entries up to period end (earlier ones give opening balances) */
  entries: LedgerEntry[];
  statements: Statements;
  /** same company, the period of equal length right before — for comparisons */
  previous: Statements;
  esg: EsgInput | null;
  /** ESG data saved for the previous period, for year-on-year comparison */
  prevEsg: EsgInput | null;
}

export class NotFoundError extends Error {}

export function previousPeriod(p: Period): Period {
  const from = fromIsoDate(p.from), to = fromIsoDate(p.to);
  const sameMonths = p.from.endsWith("-01") && new Date(to.getTime() + 86_400_000).getUTCDate() === 1;
  if (sameMonths) {
    const months = (to.getUTCFullYear() - from.getUTCFullYear()) * 12 + to.getUTCMonth() - from.getUTCMonth() + 1;
    const pf = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() - months, 1));
    const pt = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 0));
    return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
  }
  const days = Math.round((to.getTime() - from.getTime()) / 86_400_000) + 1;
  const pt = new Date(from.getTime() - 86_400_000);
  const pf = new Date(pt.getTime() - (days - 1) * 86_400_000);
  return { from: pf.toISOString().slice(0, 10), to: pt.toISOString().slice(0, 10) };
}

export async function loadCompanyPeriod(companyId: string, period: Period, regimeOverride?: string | null): Promise<CompanyPeriodData> {
  const prev = previousPeriod(period);
  if (companyId === DEMO_COMPANY.id) {
    const entries = demoEntries().filter((e) => e.date <= period.to);
    const regime = isRegimeKey(regimeOverride) ? regimeOverride : DEMO_COMPANY.regime;
    const opts = { regime, patentMonthly: DEMO_COMPANY.patentAmount };
    const coversDemo = period.from <= DEMO_PERIOD.to && period.to >= DEMO_PERIOD.from;
    return {
      company: { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name, regime, regimeName: REGIME_INFO[regime].name, patentAmount: 0, activity: DEMO_COMPANY.activity },
      demo: true,
      period,
      entries,
      statements: buildStatements(entries, period, opts),
      previous: buildStatements(entries, prev, opts),
      esg: coversDemo ? normalizeEsgInput(DEMO_ESG) : null,
      prevEsg: null,
    };
  }

  const company = await prisma.company.findUnique({
    where: { id: companyId },
    select: { id: true, name: true, defaultRegime: true, patentAmount: true },
  });
  if (!company) throw new NotFoundError("Компания не найдена");
  const regime = isRegimeKey(regimeOverride) ? regimeOverride : isRegimeKey(company.defaultRegime) ? company.defaultRegime : null;
  const esgKey = (p: Period) => ({ companyId_periodFrom_periodTo: { companyId, periodFrom: fromIsoDate(p.from), periodTo: fromIsoDate(p.to) } });
  const [entries, unpostedBankTx, esgRow, prevEsgRow] = await Promise.all([
    loadEntries(companyId, period.to),
    countUnpostedBankTx(companyId, period.from, period.to),
    prisma.esgReport.findUnique({ where: esgKey(period) }),
    prisma.esgReport.findUnique({ where: esgKey(prev) }),
  ]);
  const opts = { regime, patentMonthly: company.patentAmount };
  return {
    company: { id: company.id, name: company.name, regime, regimeName: regime ? REGIME_INFO[regime].name : "не выбран", patentAmount: company.patentAmount },
    demo: false,
    period,
    entries,
    statements: buildStatements(entries, period, { ...opts, unpostedBankTx }),
    previous: buildStatements(entries, prev, opts),
    esg: esgRow ? normalizeEsgInput(esgRow.data) : null,
    prevEsg: prevEsgRow ? normalizeEsgInput(prevEsgRow.data) : null,
  };
}
