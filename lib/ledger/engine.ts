// ════════════════════════════════════════════════════════════════════════
// lib/ledger/engine.ts — журнал проводок → все формы отчётности.
//
//   entries ──► ОСВ (оборотно-сальдовая ведомость)
//                ├─► ОПиУ (Ф.2)  обороты счетов 6000–9900 за период, кроме проводок закрытия
//                ├─► Баланс (Ф.1) сальдо на начало и конец; незакрытая прибыль → стр. 530
//                ├─► ОДДС (Ф.3)  прямой метод: строки по корр. счёту денежных проводок
//                ├─► Капитал (Ф.4) движения по счетам 5000 + чистая прибыль из ОПиУ
//                └─► Налоги      расчёт по режиму из оборотов периода
//   + сверки между формами
//
// Проводки закрытия (source = "closing", счёт 5999) переносят прибыль на 5300.
// Они участвуют в сальдо и ОСВ, но не в ОПиУ и не в Ф.4 — иначе прибыль
// периода обнулилась бы или посчиталась дважды.
//
// Pure functions only — no Prisma, no fetch — so every invariant is unit
// tested in lib/ledger/engine.test.ts.
// ════════════════════════════════════════════════════════════════════════

import {
  ACCOUNTS, CASH_ACCOUNTS, SUSPENSE_ACCOUNTS, getAccount, isCash, isPl, isPostable, accountName,
  type CfRole, type Nature, type PlRole,
} from "./accounts";
import { computeBalanceTotals } from "@/lib/balance-sheet";
import { computeCashFlowTotals } from "@/lib/cash-flow";
import { equityKey, type EquityValues } from "@/lib/equity";
import { computeTaxAccrual, monthsInPeriod, type TaxAccrual } from "./taxes";
import type { RegimeKey } from "@/lib/tax-engine";
import { EPS, round2, type LedgerEntry, type LedgerLine, type Period } from "./types";

// ── validation ─────────────────────────────────────────────────────────────

export function validateEntry(e: Pick<LedgerEntry, "lines" | "date">): string[] {
  const errors: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(e.date)) errors.push("Дата должна быть в формате ГГГГ-ММ-ДД");
  if (e.lines.length < 2) errors.push("В проводке должно быть минимум две строки");
  let dr = 0, cr = 0;
  e.lines.forEach((l, i) => {
    const a = getAccount(l.account);
    if (!a) errors.push(`Строка ${i + 1}: счёта ${l.account} нет в плане счетов`);
    else if (a.header) errors.push(`Строка ${i + 1}: ${l.account} — групповой счёт, выберите субсчёт`);
    if (l.debit < 0 || l.credit < 0) errors.push(`Строка ${i + 1}: суммы не могут быть отрицательными`);
    if (l.debit > EPS && l.credit > EPS) errors.push(`Строка ${i + 1}: укажите либо дебет, либо кредит`);
    if (l.debit <= EPS && l.credit <= EPS) errors.push(`Строка ${i + 1}: пустая сумма`);
    dr += l.debit; cr += l.credit;
  });
  if (Math.abs(dr - cr) > EPS) errors.push(`Дебет (${round2(dr)}) ≠ кредит (${round2(cr)})`);
  return errors;
}

// ── partitioning ───────────────────────────────────────────────────────────

/** Opening-balance entries are balances only — never turnover, never cash flow. */
function isBefore(e: LedgerEntry, p: Period): boolean {
  return e.source === "opening" ? e.date <= p.to : e.date < p.from;
}
function isInPeriod(e: LedgerEntry, p: Period): boolean {
  return e.source !== "opening" && e.date >= p.from && e.date <= p.to;
}

type Net = Map<string, number>; // account → debit − credit

function addNet(m: Net, l: LedgerLine) {
  m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit);
}

// ── result shapes ──────────────────────────────────────────────────────────

export interface TbRow {
  account: string;
  name: string;
  openingDr: number; openingCr: number;
  turnoverDr: number; turnoverCr: number;
  closingDr: number; closingCr: number;
}

export interface TrialBalance {
  rows: TbRow[];
  totals: Omit<TbRow, "account" | "name">;
}

export interface IsLine {
  key: string;
  label: string;
  amount: number;
  accounts: string[];
  kind: "line" | "sub" | "subtotal" | "total";
}

export interface IncomeStatement {
  lines: IsLine[];
  /** by ОПиУ section; expenses positive, incomes positive */
  byLine: Record<PlRole, number>;
  /** expenses by nature (элементы затрат), positive */
  byNature: Partial<Record<Nature, number>>;
  revenueGross: number;
  returns: number;
  netRevenue: number;
  /** чистая выручка + прочие операционные доходы — база для оборотных налогов */
  revenueTotal: number;
  grossProfit: number;
  operatingProfit: number;
  ebt: number;
  incomeTax: number;
  ordinaryProfit: number;
  extraordinary: number;
  netProfit: number;
  /** чистая прибыль / чистая выручка, % */
  margin: number;
  /** @deprecated alias of operatingProfit */
  ebit: number;
}

export interface BalanceSheet {
  closing: Record<number, number>;
  opening: Record<number, number>;
  accountsByRow: Record<number, string[]>;
}

export interface CashFlowStatement {
  values: Record<number, number>;
  entriesByRow: Record<number, string[]>;
  /** counter-account → cash in (+) / out (−) over the period */
  byAccount: Record<string, number>;
}

export interface EquityStatement {
  values: EquityValues;
  entriesByRow: Record<number, string[]>;
}

export type CheckStatus = "ok" | "warn" | "error";

export interface Check {
  id: string;
  title: string;
  status: CheckStatus;
  detail: string;
  left?: { label: string; value: number };
  right?: { label: string; value: number };
}

export interface TaxSection {
  computed: TaxAccrual | null;
  posted: number;
  postedEntryIds: string[];
  vatOutput: number;
  vatInput: number;
  cashRevenue: number;
}

export interface MonthlyPoint {
  month: string; // YYYY-MM
  revenue: number;
  expenses: number;
  netProfit: number;
  cashIn: number;
  cashOut: number;
  cashEnd: number;
}

export interface Statements {
  period: Period;
  regime: RegimeKey | null;
  trialBalance: TrialBalance;
  incomeStatement: IncomeStatement;
  balanceSheet: BalanceSheet;
  cashFlow: CashFlowStatement;
  equity: EquityStatement;
  taxes: TaxSection;
  checks: Check[];
  monthly: MonthlyPoint[];
  entryCount: number;
}

export interface BuildOptions {
  regime: RegimeKey | null;
  patentMonthly?: number;
  /** bank transactions in the period that have no journal entry yet */
  unpostedBankTx?: number;
}

// ── main ───────────────────────────────────────────────────────────────────

export function buildStatements(entries: LedgerEntry[], period: Period, opts: BuildOptions): Statements {
  const before: Net = new Map();
  const turnDr = new Map<string, number>();
  const turnCr = new Map<string, number>();
  const plDr = new Map<string, number>();
  const plCr = new Map<string, number>();
  const inPeriod: LedgerEntry[] = [];

  for (const e of entries) {
    if (isBefore(e, period)) {
      e.lines.forEach((l) => addNet(before, l));
    } else if (isInPeriod(e, period)) {
      inPeriod.push(e);
      for (const l of e.lines) {
        turnDr.set(l.account, (turnDr.get(l.account) ?? 0) + l.debit);
        turnCr.set(l.account, (turnCr.get(l.account) ?? 0) + l.credit);
        if (e.source !== "closing") {
          plDr.set(l.account, (plDr.get(l.account) ?? 0) + l.debit);
          plCr.set(l.account, (plCr.get(l.account) ?? 0) + l.credit);
        }
      }
    }
  }

  const closing: Net = new Map(before);
  for (const e of inPeriod) e.lines.forEach((l) => addNet(closing, l));

  const trialBalance = buildTrialBalance(before, turnDr, turnCr, closing);
  const incomeStatement = buildIncomeStatement(plDr, plCr);
  const balanceSheet = buildBalanceSheet(before, closing);
  const cashFlow = buildCashFlow(inPeriod, before);
  const equity = buildEquity(inPeriod, before, incomeStatement.netProfit);
  const taxes = buildTaxSection(inPeriod, period, incomeStatement, opts);
  const monthly = buildMonthly(inPeriod, before);

  const statements: Statements = {
    period, regime: opts.regime,
    trialBalance, incomeStatement, balanceSheet, cashFlow, equity, taxes, monthly,
    checks: [],
    entryCount: inPeriod.length,
  };
  statements.checks = runChecks(entries, statements, closing, opts);
  return statements;
}

// ── ОСВ ────────────────────────────────────────────────────────────────────

function split(net: number): [number, number] {
  const r = round2(net);
  return r >= 0 ? [r, 0] : [0, -r];
}

const ORDER = new Map(ACCOUNTS.map((a, i) => [a.code, i]));

function buildTrialBalance(before: Net, turnDr: Map<string, number>, turnCr: Map<string, number>, closing: Net): TrialBalance {
  const codes = new Set<string>([...before.keys(), ...turnDr.keys(), ...turnCr.keys()]);
  const rows: TbRow[] = [...codes]
    .sort((a, b) => (ORDER.get(a) ?? 9999) - (ORDER.get(b) ?? 9999) || a.localeCompare(b))
    .map((code) => {
      const [openingDr, openingCr] = split(before.get(code) ?? 0);
      const [closingDr, closingCr] = split(closing.get(code) ?? 0);
      return {
        account: code, name: accountName(code),
        openingDr, openingCr,
        turnoverDr: round2(turnDr.get(code) ?? 0), turnoverCr: round2(turnCr.get(code) ?? 0),
        closingDr, closingCr,
      };
    })
    .filter((r) => r.openingDr || r.openingCr || r.turnoverDr || r.turnoverCr || r.closingDr || r.closingCr);

  const sum = (k: keyof Omit<TbRow, "account" | "name">) => round2(rows.reduce((s, r) => s + r[k], 0));
  return {
    rows,
    totals: {
      openingDr: sum("openingDr"), openingCr: sum("openingCr"),
      turnoverDr: sum("turnoverDr"), turnoverCr: sum("turnoverCr"),
      closingDr: sum("closingDr"), closingCr: sum("closingCr"),
    },
  };
}

// ── ОПиУ (Ф.2) ─────────────────────────────────────────────────────────────

export const PL_LINES: PlRole[] = [
  "revenue", "otherOpIncome", "cogs", "selling", "otherOpExpense", "admin",
  "nonOpIncome", "nonOpExpense", "extraordinaryIncome", "extraordinaryExpense", "incomeTax",
];

function buildIncomeStatement(dr: Map<string, number>, cr: Map<string, number>): IncomeStatement {
  const byLine = Object.fromEntries(PL_LINES.map((r) => [r, 0])) as Record<PlRole, number>;
  const accountsBy = Object.fromEntries(PL_LINES.map((r) => [r, [] as string[]])) as Record<PlRole, string[]>;
  const byNature: Partial<Record<Nature, number>> = {};
  let revenueGross = 0, returns = 0;

  for (const a of ACCOUNTS) {
    if (!a.pl) continue;
    const d = dr.get(a.code) ?? 0, c = cr.get(a.code) ?? 0;
    if (Math.abs(d) < EPS && Math.abs(c) < EPS) { accountsBy[a.pl].push(a.code); continue; }
    const amount = a.type === "income" ? c - d : d - c;
    byLine[a.pl] += amount;
    accountsBy[a.pl].push(a.code);
    if (a.pl === "revenue") {
      if (a.contra) returns += -amount; else revenueGross += amount;
    }
    if (a.type === "expense" && a.pl !== "incomeTax") {
      const n: Nature = a.nature ?? "other";
      byNature[n] = (byNature[n] ?? 0) + amount;
    }
  }
  for (const r of PL_LINES) byLine[r] = round2(byLine[r]);
  for (const k of Object.keys(byNature) as Nature[]) {
    byNature[k] = round2(byNature[k]!);
    if (Math.abs(byNature[k]!) < EPS) delete byNature[k];
  }

  const b = byLine;
  const acc = (...roles: PlRole[]) => roles.flatMap((r) => accountsBy[r]);
  const netRevenue = round2(b.revenue);
  const grossProfit = round2(netRevenue - b.cogs);
  const operatingProfit = round2(grossProfit + b.otherOpIncome - b.selling - b.admin - b.otherOpExpense);
  const ebt = round2(operatingProfit + b.nonOpIncome - b.nonOpExpense);
  const ordinaryProfit = round2(ebt - b.incomeTax);
  const extraordinary = round2(b.extraordinaryIncome - b.extraordinaryExpense);
  const netProfit = round2(ordinaryProfit + extraordinary);
  const revenueTotal = round2(netRevenue + b.otherOpIncome);

  const lines: IsLine[] = [
    { key: "revenueGross", label: "Выручка от реализации", amount: round2(revenueGross), accounts: acc("revenue").filter((c) => c !== "6120"), kind: "line" },
    { key: "returns", label: "Возвраты проданных товаров и скидки", amount: -round2(returns), accounts: ["6120"], kind: "sub" },
    { key: "netRevenue", label: "Чистая выручка", amount: netRevenue, accounts: acc("revenue"), kind: "subtotal" },
    { key: "cogs", label: "Себестоимость реализованной продукции и товаров", amount: -b.cogs, accounts: acc("cogs"), kind: "line" },
    { key: "gross", label: "Валовая прибыль", amount: grossProfit, accounts: acc("revenue", "cogs"), kind: "subtotal" },
    { key: "otherOpIncome", label: "Прочие доходы от операционной деятельности", amount: b.otherOpIncome, accounts: acc("otherOpIncome"), kind: "line" },
    { key: "selling", label: "Расходы, связанные с реализацией", amount: -b.selling, accounts: acc("selling"), kind: "line" },
    { key: "admin", label: "Общие и административные расходы", amount: -b.admin, accounts: acc("admin"), kind: "line" },
    { key: "otherOpExpense", label: "Прочие производственные расходы", amount: -b.otherOpExpense, accounts: acc("otherOpExpense"), kind: "line" },
    { key: "operating", label: "Прибыль от операционной деятельности", amount: operatingProfit, accounts: [], kind: "subtotal" },
    { key: "nonOpIncome", label: "Доходы от неоперационной деятельности", amount: b.nonOpIncome, accounts: acc("nonOpIncome"), kind: "line" },
    { key: "nonOpExpense", label: "Расходы по неоперационной деятельности", amount: -b.nonOpExpense, accounts: acc("nonOpExpense"), kind: "line" },
    { key: "ebt", label: "Прибыль до налогообложения", amount: ebt, accounts: [], kind: "subtotal" },
    { key: "incomeTax", label: "Налог на прибыль (единый налог, патент)", amount: -b.incomeTax, accounts: acc("incomeTax"), kind: "line" },
    { key: "ordinary", label: "Прибыль от обычной деятельности", amount: ordinaryProfit, accounts: [], kind: "subtotal" },
    { key: "extraordinary", label: "Чрезвычайные статьи", amount: extraordinary, accounts: acc("extraordinaryIncome", "extraordinaryExpense"), kind: "line" },
    { key: "net", label: "Чистая прибыль (убыток)", amount: netProfit, accounts: acc(...PL_LINES), kind: "total" },
  ];

  return {
    lines, byLine, byNature,
    revenueGross: round2(revenueGross), returns: round2(returns), netRevenue, revenueTotal,
    grossProfit, operatingProfit, ebt, incomeTax: b.incomeTax, ordinaryProfit, extraordinary, netProfit,
    margin: netRevenue > 0 ? round2((netProfit / netRevenue) * 100) : 0,
    ebit: operatingProfit,
  };
}

// ── Баланс (Ф.1) ───────────────────────────────────────────────────────────

function balanceValues(net: Net): Record<number, number> {
  const v: Record<number, number> = {};
  const add = (row: number | undefined, amount: number) => {
    if (row === undefined) return;
    v[row] = (v[row] ?? 0) + amount;
  };
  let pl = 0;
  for (const [code, n] of net) {
    const a = getAccount(code);
    if (!a) continue;
    if (isPl(code)) { pl += n; continue; }
    const amount = a.type === "asset" ? n : -n;
    add(a.bsRow, amount);
    if (a.bsSub !== undefined && a.bsSub !== a.bsRow) add(a.bsSub, amount);
  }
  // virtual closing of whatever P&L has not been closed to 5300 yet
  v[530] = (v[530] ?? 0) - pl;
  for (const k of Object.keys(v)) v[Number(k)] = round2(v[Number(k)]);
  const totals = computeBalanceTotals(v);
  for (const k of Object.keys(totals)) totals[Number(k)] = round2(totals[Number(k)]);
  return totals;
}

function buildBalanceSheet(before: Net, closing: Net): BalanceSheet {
  const accountsByRow: Record<number, string[]> = {};
  for (const a of ACCOUNTS) {
    if (a.header) continue;
    if (a.bsRow !== undefined) (accountsByRow[a.bsRow] ??= []).push(a.code);
    if (a.bsSub !== undefined && a.bsSub !== a.bsRow) (accountsByRow[a.bsSub] ??= []).push(a.code);
    if (a.pl) (accountsByRow[530] ??= []).push(a.code);
  }
  return { opening: balanceValues(before), closing: balanceValues(closing), accountsByRow };
}

// ── ОДДС (Ф.3, прямой метод) ───────────────────────────────────────────────

const CF_IN: Partial<Record<CfRole, number>> = {
  sales: 10, supplies: 20, services: 20, interest: 20, otherOperating: 20, incomeTax: 20,
  fixedAssets: 210, securities: 220, intangibles: 230, investIncome: 240, loansGiven: 250, otherInvesting: 260,
  ownerCapital: 430, borrowings: 440, dividends: 450,
};
const CF_OUT: Partial<Record<CfRole, number>> = {
  supplies: 50, services: 60, interest: 70, otherOperating: 80, incomeTax: 90, sales: 100,
  fixedAssets: 280, intangibles: 290, securities: 300, loansGiven: 310, otherInvesting: 320, investIncome: 320,
  dividends: 470, borrowings: 480, ownerCapital: 490,
};

/**
 * Splits one entry's net cash movement across its non-cash counterpart lines.
 * Returns [] for entries that don't touch cash or only move money between cash accounts.
 */
export function cashFlowAllocation(e: LedgerEntry): Array<{ row: number; amount: number; account: string }> {
  let netCash = 0;
  for (const l of e.lines) if (isCash(l.account)) netCash += l.debit - l.credit;
  if (Math.abs(netCash) <= EPS) return [];
  const inflow = netCash > 0;
  const counter = e.lines.filter((l) => !isCash(l.account) && (inflow ? l.credit > EPS : l.debit > EPS));
  const total = counter.reduce((s, l) => s + (inflow ? l.credit : l.debit), 0);
  if (total <= EPS) return [];
  return counter.map((l) => {
    const role = getAccount(l.account)?.cf;
    const row = (role && (inflow ? CF_IN[role] : CF_OUT[role])) ?? (inflow ? 20 : 100);
    return { row, account: l.account, amount: (Math.abs(netCash) * (inflow ? l.credit : l.debit)) / total };
  });
}

const INFLOW_ROWS = new Set([10, 20, 30, 210, 220, 230, 240, 250, 260, 410, 420, 430, 440, 450]);
export function isInflowRow(row: number) { return INFLOW_ROWS.has(row); }

function buildCashFlow(inPeriod: LedgerEntry[], before: Net): CashFlowStatement {
  const values: Record<number, number> = {};
  const entriesByRow: Record<number, string[]> = {};
  const byAccount: Record<string, number> = {};
  for (const e of inPeriod) {
    for (const a of cashFlowAllocation(e)) {
      values[a.row] = (values[a.row] ?? 0) + a.amount;
      byAccount[a.account] = round2((byAccount[a.account] ?? 0) + (isInflowRow(a.row) ? a.amount : -a.amount));
      const ids = (entriesByRow[a.row] ??= []);
      if (!ids.includes(e.id)) ids.push(e.id);
    }
  }
  values[720] = CASH_ACCOUNTS.reduce((s, c) => s + (before.get(c) ?? 0), 0);
  values[600] = 0;
  for (const k of Object.keys(values)) values[Number(k)] = round2(values[Number(k)]);
  const all = computeCashFlowTotals(values);
  for (const k of Object.keys(all)) all[Number(k)] = round2(all[Number(k)]);
  return { values: all, entriesByRow, byAccount };
}

// ── Отчёт об изменениях в капитале (Ф.4) ───────────────────────────────────

/** column of Ф.4: 0 уставный, 1 прочий, 2 нераспределённая прибыль */
function equityCol(code: string): number | undefined {
  const a = getAccount(code);
  if (!a || a.type !== "equity") return undefined;
  if (a.bsRow === 510 || a.bsRow === 514) return 0;
  if (a.bsRow === 520 || a.bsRow === 540) return 1;
  if (a.bsRow === 530) return 2;
  return undefined;
}

function buildEquity(inPeriod: LedgerEntry[], before: Net, netProfit: number): EquityStatement {
  const v: EquityValues = {};
  const entriesByRow: Record<number, string[]> = {};
  const add = (row: number, col: number, amount: number, entryId?: string) => {
    const k = equityKey(row, col);
    v[k] = (v[k] ?? 0) + amount;
    if (entryId) {
      const ids = (entriesByRow[row] ??= []);
      if (!ids.includes(entryId)) ids.push(entryId);
    }
  };

  // opening balances (credit-positive); unclosed prior P&L belongs to retained earnings
  let priorPl = 0;
  for (const [code, n] of before) {
    if (isPl(code)) { priorPl += n; continue; }
    const col = equityCol(code);
    if (col !== undefined) add(10, col, -n);
  }
  add(10, 2, -priorPl);

  for (const e of inPeriod) {
    if (e.source === "closing") continue; // profit is shown once, in row 080
    const counterCodes = e.lines.filter((l) => equityCol(l.account) === undefined).map((l) => l.account);
    for (const l of e.lines) {
      const col = equityCol(l.account);
      if (col === undefined) continue;
      const amount = l.credit - l.debit;
      let row: number;
      if (l.account === "5220") row = 50;
      else if (l.account === "5230") row = 70;
      else if (counterCodes.includes("3540")) row = 90;
      else if (counterCodes.some((c) => isCash(c) || c === "1900")) row = col === 2 && amount < 0 ? 90 : 100;
      else if (counterCodes.length === 0) row = 110; // between equity accounts, e.g. to reserve capital
      else row = 20;
      add(row, col, amount, e.id);
    }
  }

  add(80, 2, netProfit);

  for (let col = 0; col <= 2; col++) {
    const g = (row: number) => v[equityKey(row, col)] ?? 0;
    v[equityKey(30, col)] = g(10) + g(20);
    v[equityKey(120, col)] = g(30) + g(50) + g(60) + g(70) + g(80) + g(90) + g(100) + g(110);
  }
  for (const row of [10, 20, 30, 50, 60, 70, 80, 90, 100, 110, 120]) {
    v[equityKey(row, 3)] = [0, 1, 2].reduce((s, col) => s + (v[equityKey(row, col)] ?? 0), 0);
  }
  for (const k of Object.keys(v)) v[k] = round2(v[k]);
  return { values: v, entriesByRow };
}

// ── Налоги ─────────────────────────────────────────────────────────────────

const TAX_EXPENSE_ACCOUNTS = new Set(["9910", "8190"]);

function buildTaxSection(inPeriod: LedgerEntry[], period: Period, is: IncomeStatement, opts: BuildOptions): TaxSection {
  let cashRevenue = 0, posted = 0, postedTurnoverTax = 0;
  const postedEntryIds: string[] = [];
  let vatOutput = 0, vatInput = 0;

  for (const e of inPeriod) {
    if (e.source === "closing") continue;
    const revCredit = e.lines
      .filter((l) => { const r = getAccount(l.account)?.pl; return r === "revenue" || r === "otherOpIncome"; })
      .reduce((s, l) => s + l.credit - l.debit, 0);
    if (revCredit > EPS) {
      const debits = e.lines.filter((l) => l.debit > EPS);
      const totalDr = debits.reduce((s, l) => s + l.debit, 0);
      const cashDr = debits.filter((l) => l.account === "1110" || l.account === "1120").reduce((s, l) => s + l.debit, 0);
      if (totalDr > EPS) cashRevenue += revCredit * (cashDr / totalDr);
    }
    if (e.source === "tax") {
      postedEntryIds.push(e.id);
      for (const l of e.lines) {
        if (TAX_EXPENSE_ACCOUNTS.has(l.account)) posted += l.debit - l.credit;
        if (l.account === "8190") postedTurnoverTax += l.debit - l.credit;
      }
    }
    for (const l of e.lines) {
      if (l.account === "3430") vatOutput += l.credit - l.debit;
      if (l.account === "1540") vatInput += l.debit - l.credit;
    }
  }

  // EBT before the period's own tax accrual, so re-running it is idempotent
  const computed = opts.regime
    ? computeTaxAccrual(opts.regime, {
        revenueTotal: is.revenueTotal,
        cashRevenue: round2(cashRevenue),
        ebtBeforeTaxEntry: round2(is.ebt + postedTurnoverTax),
        months: monthsInPeriod(period.from, period.to),
      }, opts.patentMonthly ?? 0)
    : null;

  return {
    computed, posted: round2(posted), postedEntryIds,
    vatOutput: round2(vatOutput), vatInput: round2(vatInput), cashRevenue: round2(cashRevenue),
  };
}

// ── Помесячная динамика (для графиков) ─────────────────────────────────────

function buildMonthly(inPeriod: LedgerEntry[], before: Net): MonthlyPoint[] {
  const months = new Map<string, MonthlyPoint>();
  const get = (m: string) => {
    let p = months.get(m);
    if (!p) { p = { month: m, revenue: 0, expenses: 0, netProfit: 0, cashIn: 0, cashOut: 0, cashEnd: 0 }; months.set(m, p); }
    return p;
  };
  for (const e of inPeriod) {
    const p = get(e.date.slice(0, 7));
    if (e.source !== "closing") {
      for (const l of e.lines) {
        const a = getAccount(l.account);
        if (a?.type === "income") p.revenue += l.credit - l.debit;
        if (a?.type === "expense") p.expenses += l.debit - l.credit;
      }
    }
    for (const alloc of cashFlowAllocation(e)) {
      if (isInflowRow(alloc.row)) p.cashIn += alloc.amount; else p.cashOut += alloc.amount;
    }
  }
  let cash = CASH_ACCOUNTS.reduce((s, c) => s + (before.get(c) ?? 0), 0);
  return [...months.values()]
    .sort((a, b) => a.month.localeCompare(b.month))
    .map((p) => {
      cash += p.cashIn - p.cashOut;
      return {
        month: p.month,
        revenue: round2(p.revenue), expenses: round2(p.expenses), netProfit: round2(p.revenue - p.expenses),
        cashIn: round2(p.cashIn), cashOut: round2(p.cashOut), cashEnd: round2(cash),
      };
    });
}

// ── Сверки ─────────────────────────────────────────────────────────────────

function eq(a: number, b: number, tol = 0.01) { return Math.abs(a - b) <= tol; }
function money(n: number) { return n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }); }

function runChecks(all: LedgerEntry[], s: Statements, closing: Net, opts: BuildOptions): Check[] {
  const checks: Check[] = [];

  const unbalanced = all.filter((e) => Math.abs(e.lines.reduce((x, l) => x + l.debit - l.credit, 0)) > EPS);
  checks.push({
    id: "entries", title: "Каждая проводка: дебет = кредит",
    status: unbalanced.length ? "error" : "ok",
    detail: unbalanced.length ? `Несбалансированных проводок: ${unbalanced.length}` : `Проверено проводок: ${all.length}`,
  });

  const codes = [...new Set(all.flatMap((e) => e.lines.map((l) => l.account)))];
  const unknown = codes.filter((c) => !getAccount(c));
  const headers = codes.filter((c) => getAccount(c) && !isPostable(c));
  if (unknown.length || headers.length) {
    checks.push({
      id: "accounts", title: "Счета соответствуют плану счетов", status: "error",
      detail: [
        unknown.length ? `нет в плане счетов: ${unknown.join(", ")}` : "",
        headers.length ? `проводки на групповые счета: ${headers.join(", ")}` : "",
      ].filter(Boolean).join("; "),
    });
  }

  const t = s.trialBalance.totals;
  checks.push({
    id: "tb", title: "ОСВ: обороты и сальдо сходятся",
    status: eq(t.turnoverDr, t.turnoverCr) && eq(t.closingDr, t.closingCr) ? "ok" : "error",
    detail: "Σ оборотов Дт = Σ оборотов Кт, Σ сальдо Дт = Σ сальдо Кт",
    left: { label: "Обороты Дт", value: t.turnoverDr }, right: { label: "Обороты Кт", value: t.turnoverCr },
  });

  const bs = s.balanceSheet.closing;
  checks.push({
    id: "bs", title: "Баланс: актив = пассив",
    status: eq(bs[299] ?? 0, bs[599] ?? 0) ? "ok" : "error",
    detail: "Стр. 299 = стр. 599 (МСФО (IAS) 1)",
    left: { label: "Актив (299)", value: bs[299] ?? 0 }, right: { label: "Пассив (599)", value: bs[599] ?? 0 },
  });

  const cashBs = round2((bs[110] ?? 0) + (bs[120] ?? 0));
  checks.push({
    id: "cf-bs", title: "ОДДС ↔ Баланс: остаток денег",
    status: eq(s.cashFlow.values[710] ?? 0, cashBs) ? "ok" : "error",
    detail: "ОДДС стр. 710 = Баланс стр. 110 + 120 на конец периода",
    left: { label: "ОДДС 710", value: s.cashFlow.values[710] ?? 0 }, right: { label: "Баланс 110+120", value: cashBs },
  });

  const eqClose = s.equity.values[equityKey(120, 3)] ?? 0;
  checks.push({
    id: "eq-bs", title: "Капитал ↔ Баланс",
    status: eq(eqClose, bs[541] ?? 0) ? "ok" : "error",
    detail: "Ф.4 стр. 120 «Итого» = Баланс стр. 541",
    left: { label: "Ф.4 стр. 120", value: eqClose }, right: { label: "Баланс 541", value: bs[541] ?? 0 },
  });

  const eqNp = s.equity.values[equityKey(80, 2)] ?? 0;
  checks.push({
    id: "eq-is", title: "Капитал ↔ ОПиУ: чистая прибыль",
    status: eq(eqNp, s.incomeStatement.netProfit) ? "ok" : "error",
    detail: "Ф.4 стр. 080 = чистая прибыль ОПиУ",
    left: { label: "Ф.4 стр. 080", value: eqNp }, right: { label: "ОПиУ", value: s.incomeStatement.netProfit },
  });

  const tx = s.taxes;
  if (tx.computed) {
    const due = tx.computed.total;
    let status: CheckStatus = "ok";
    let detail = `Начислено ${money(tx.posted)} сом — совпадает с расчётом по режиму`;
    if (due > EPS && tx.postedEntryIds.length === 0) {
      status = "warn"; detail = `Налоги за период не начислены. Расчёт: ${money(due)} сом`;
    } else if (!eq(tx.posted, due, 1)) {
      status = "warn"; detail = `Начислено ${money(tx.posted)}, а расчёт по текущим данным — ${money(due)}. Пересчитайте`;
    }
    checks.push({
      id: "tax", title: "Налоги начислены по режиму", status, detail,
      left: { label: "Начислено", value: tx.posted }, right: { label: "Расчёт", value: due },
    });
  } else {
    checks.push({ id: "tax", title: "Налоги начислены по режиму", status: "warn", detail: "Не выбран налоговый режим компании" });
  }

  const suspense = SUSPENSE_ACCOUNTS.map((c) => Math.abs(closing.get(c) ?? 0)).reduce((a, b) => a + b, 0);
  if (suspense > EPS) {
    checks.push({
      id: "suspense", title: "Невыясненные суммы", status: "warn",
      detail: `На субсчетах 1590.01 / 3600.01 — ${money(round2(suspense))} сом. Уточните категорию операций в выписке`,
    });
  }

  if (opts.unpostedBankTx && opts.unpostedBankTx > 0) {
    checks.push({
      id: "bank", title: "Все операции выписки проведены", status: "warn",
      detail: `Не проведено в журнал: ${opts.unpostedBankTx} операций`,
    });
  }

  const negativeCash = CASH_ACCOUNTS.filter((c) => (closing.get(c) ?? 0) < -EPS);
  if (negativeCash.length) {
    checks.push({
      id: "cash-negative", title: "Остаток денег не отрицательный", status: "warn",
      detail: `Отрицательный остаток: ${negativeCash.map((c) => `${c} ${accountName(c)}`).join(", ")} — не хватает поступлений или начальных остатков`,
    });
  }

  return checks;
}

// ── закрытие периода (реформация) ──────────────────────────────────────────

/**
 * Lines of the closing entry for the period: every P&L account is closed to
 * 5999 «Свод доходов и расходов», and 5999 to 5300 «Нераспределённая прибыль».
 * Built from P&L turnover of the period (closing entries excluded), so it can
 * be regenerated after late postings.
 */
export function closingEntryLines(entries: LedgerEntry[], period: Period): LedgerLine[] {
  const net = new Map<string, number>();
  for (const e of entries) {
    if (e.source === "closing" || !isInPeriod(e, period)) continue;
    for (const l of e.lines) if (isPl(l.account)) net.set(l.account, (net.get(l.account) ?? 0) + l.debit - l.credit);
  }
  const lines: LedgerLine[] = [];
  let result = 0; // credit − debit of P&L = profit
  for (const code of [...net.keys()].sort((a, b) => (ORDER.get(a) ?? 0) - (ORDER.get(b) ?? 0))) {
    const n = round2(net.get(code)!);
    if (Math.abs(n) < EPS) continue;
    lines.push(n > 0 ? { account: code, debit: 0, credit: n } : { account: code, debit: -n, credit: 0 });
    result -= n;
  }
  result = round2(result);
  if (lines.length === 0) return [];
  // close P&L into 5999 and 5999 into 5300 in one balanced entry
  lines.push(result >= 0 ? { account: "5999", debit: 0, credit: result } : { account: "5999", debit: -result, credit: 0 });
  lines.push(result >= 0 ? { account: "5999", debit: result, credit: 0 } : { account: "5999", debit: 0, credit: -result });
  lines.push(result >= 0 ? { account: "5300", debit: 0, credit: result } : { account: "5300", debit: -result, credit: 0 });
  return lines.filter((l) => l.debit > EPS || l.credit > EPS);
}

// ── drill-down helper ──────────────────────────────────────────────────────

/** Entries in the period that touch any of the given accounts (opening entries included when asked). */
export function entriesForAccounts(entries: LedgerEntry[], accounts: string[], period: Period, includeOpening = false): LedgerEntry[] {
  const set = new Set(accounts);
  return entries
    .filter((e) => (isInPeriod(e, period) || (includeOpening && isBefore(e, period))) && e.lines.some((l) => set.has(l.account)))
    .sort((a, b) => a.date.localeCompare(b.date));
}
