// ════════════════════════════════════════════════════════════════════════
// lib/budget/budget.ts — бюджет доходов и расходов, план-факт и прогноз
// остатка денежных средств на 3 месяца с предупреждением о кассовом разрыве.
//
// Статьи бюджета — группы счетов ОПиУ. По умолчанию — строки отчёта о
// прибыли по МСФО (выручка, себестоимость, коммерческие …); статью можно
// разбить на свои, указав счета. Факт берётся из журнала (без проводок
// закрытия периода), поэтому план-факт всегда сходится с ОПиУ.
// ════════════════════════════════════════════════════════════════════════

import { ACCOUNTS, getAccount } from "@/lib/ledger/accounts";
import { ifrsLine, PL_LABEL, type PlLine } from "@/lib/ledger/ifrs";
import { round2, type LedgerEntry } from "@/lib/ledger/types";

export interface Article {
  id: string;
  name: string;
  kind: "income" | "expense";
  /** account codes; a code ending in "*" is a prefix ("61*" — all 61xx) */
  accounts: string[];
  /** plan by month, Jan..Dec, positive numbers */
  plan: number[];
}

export interface Budget {
  year: number;
  articles: Article[];
  /** minimum cash balance; the forecast warns below it */
  minCash: number;
}

const PL_ORDER: PlLine[] = ["revenue", "otherIncome", "financeIncome", "shareOfAssoc", "cogs", "selling", "admin", "otherExpense", "financeCosts", "incomeTax"];
const INCOME_LINES = new Set<PlLine>(["revenue", "otherIncome", "financeIncome", "shareOfAssoc"]);
const zeros = () => Array(12).fill(0) as number[];

export function defaultBudget(year: number): Budget {
  const articles: Article[] = PL_ORDER.map((l) => ({
    id: l,
    name: PL_LABEL[l],
    kind: INCOME_LINES.has(l) ? "income" : "expense",
    accounts: ACCOUNTS.filter((a) => !a.header && (a.type === "income" || a.type === "expense") && ifrsLine(a.code) === l).map((a) => a.code),
    plan: zeros(),
  }));
  return { year, articles, minCash: 0 };
}

const matches = (code: string, pattern: string) => (pattern.endsWith("*") ? code.startsWith(pattern.slice(0, -1)) : code === pattern);

/** Which article an account belongs to: the last matching article wins, so an added article takes accounts from the default ones. */
export function articleOf(b: Budget, code: string): Article | null {
  for (let i = b.articles.length - 1; i >= 0; i--) if (b.articles[i].accounts.some((p) => matches(code, p))) return b.articles[i];
  return null;
}

/** P&L amount of every account by month of `year` (income and expense positive, contra accounts negative). */
export function monthlyPl(entries: LedgerEntry[], year: number): Map<string, number[]> {
  const out = new Map<string, number[]>();
  const y = String(year);
  for (const e of entries) {
    if (e.source === "closing" || e.source === "opening" || e.date.slice(0, 4) !== y) continue;
    const m = Number(e.date.slice(5, 7)) - 1;
    for (const l of e.lines) {
      const a = getAccount(l.account);
      if (!a || (a.type !== "income" && a.type !== "expense")) continue;
      const v = a.type === "income" ? l.credit - l.debit : l.debit - l.credit;
      const row = out.get(l.account) ?? zeros();
      row[m] = round2(row[m] + v);
      out.set(l.account, row);
    }
  }
  return out;
}

export interface PlanFactRow {
  id: string;
  name: string;
  kind: "income" | "expense" | "result";
  plan: number[];
  fact: number[];
}

export function planFact(b: Budget, entries: LedgerEntry[]): { rows: PlanFactRow[]; unassigned: Array<{ account: string; total: number }> } {
  const pl = monthlyPl(entries, b.year);
  const fact = new Map<string, number[]>(b.articles.map((a) => [a.id, zeros()]));
  const unassigned: Array<{ account: string; total: number }> = [];
  for (const [code, months] of pl) {
    const a = articleOf(b, code);
    if (!a) { unassigned.push({ account: code, total: round2(months.reduce((s, x) => s + x, 0)) }); continue; }
    const row = fact.get(a.id)!;
    months.forEach((v, i) => { row[i] = round2(row[i] + v); });
  }
  const rows: PlanFactRow[] = b.articles.map((a) => ({ id: a.id, name: a.name, kind: a.kind, plan: a.plan.map((x) => round2(x || 0)), fact: fact.get(a.id)! }));
  const result = (pick: "plan" | "fact") => zeros().map((_, i) => round2(rows.reduce((s, r) => s + (r.kind === "income" ? 1 : -1) * r[pick][i], 0)));
  rows.push({ id: "result", name: "Прибыль (убыток)", kind: "result", plan: result("plan"), fact: result("fact") });
  return { rows, unassigned };
}

/** Plan = last year's actual × (1 + growth), month by month. */
export function planFromLastYear(b: Budget, entries: LedgerEntry[], growthPct: number): Budget {
  const prev = planFact({ ...b, year: b.year - 1 }, entries);
  const k = 1 + growthPct / 100;
  return { ...b, articles: b.articles.map((a) => ({ ...a, plan: (prev.rows.find((r) => r.id === a.id)?.fact ?? zeros()).map((v) => Math.max(0, Math.round(v * k))) })) };
}

// ── прогноз денег ──────────────────────────────────────────────────────────

export interface ForecastInput {
  /** cash at the start of the first forecast month */
  cashNow: number;
  /** the last complete months, oldest first: cash in and out (positive) */
  history: Array<{ month: string; cashIn: number; cashOut: number }>;
  /** first forecast month, YYYY-MM */
  start: string;
  horizon: number;
  method: "average" | "budget";
  budget?: Budget | null;
  /** planned depreciation by month (non-cash, removed from planned expenses) */
  depreciation?: Record<string, number>;
  /** add today's receivables and payables to the first month */
  debts?: { receivable: number; payable: number } | null;
  minCash: number;
  /** part of the first month still ahead (0..1): the rest of the current month */
  firstMonthShare?: number;
}

export interface ForecastRow { month: string; opening: number; inflow: number; outflow: number; closing: number; gap: boolean; low: boolean; basis: string }

const addMonth = (ym: string, k: number) => { const [y, m] = ym.split("-").map(Number); const d = new Date(Date.UTC(y, m - 1 + k, 1)); return d.toISOString().slice(0, 7); };

export function forecast(i: ForecastInput): { rows: ForecastRow[]; firstGap: string | null; avgIn: number; avgOut: number } {
  const h = i.history.filter((x) => x.cashIn || x.cashOut);
  const avgIn = h.length ? round2(h.reduce((s, x) => s + x.cashIn, 0) / h.length) : 0;
  const avgOut = h.length ? round2(h.reduce((s, x) => s + x.cashOut, 0) / h.length) : 0;
  const rows: ForecastRow[] = [];
  let cash = round2(i.cashNow);
  for (let k = 0; k < i.horizon; k++) {
    const month = addMonth(i.start, k);
    let inflow = avgIn, outflow = avgOut, basis = `среднее за ${h.length} мес.`;
    const b = i.budget;
    if (i.method === "budget" && b && Number(month.slice(0, 4)) === b.year) {
      const m = Number(month.slice(5, 7)) - 1;
      const inc = b.articles.filter((a) => a.kind === "income").reduce((s, a) => s + (a.plan[m] || 0), 0);
      const exp = b.articles.filter((a) => a.kind === "expense").reduce((s, a) => s + (a.plan[m] || 0), 0);
      if (inc || exp) {
        inflow = round2(inc);
        outflow = round2(Math.max(0, exp - (i.depreciation?.[month] ?? 0)));
        basis = "бюджет (без амортизации)";
      }
    }
    if (k === 0 && i.firstMonthShare !== undefined && i.firstMonthShare < 1) {
      inflow = round2(inflow * i.firstMonthShare);
      outflow = round2(outflow * i.firstMonthShare);
      basis += `, остаток месяца (${Math.round(i.firstMonthShare * 100)} %)`;
    }
    if (k === 0 && i.debts) {
      inflow = round2(inflow + i.debts.receivable);
      outflow = round2(outflow + i.debts.payable);
      basis += " + текущие долги";
    }
    const opening = cash;
    cash = round2(cash + inflow - outflow);
    rows.push({ month, opening, inflow, outflow, closing: cash, gap: cash < 0, low: cash >= 0 && cash < i.minCash, basis });
  }
  return { rows, firstGap: rows.find((r) => r.gap)?.month ?? null, avgIn, avgOut };
}
