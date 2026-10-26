// ════════════════════════════════════════════════════════════════════════
// lib/ledger/taxes.ts — tax accrual for a period, computed FROM the ledger.
//
// Rates and regime list come from lib/tax-engine.ts so the calculator and the
// ledger can never drift apart. What differs is the base: the calculator
// takes typed-in totals, this takes turnovers of the period, and for the
// единый налог it uses the ACTUAL cash/non-cash split of revenue (revenue
// credited against касса 1110 vs everything else) instead of a slider.
//
// The result is a balanced set of lines that /api/statements/taxes stores as
// one JournalEntry (source = "tax"), so taxes flow into ОПиУ (7710/7510),
// баланс (34xx) and — once paid from the bank — ОДДС (стр. 090 / 080).
// ════════════════════════════════════════════════════════════════════════

import { INCOME_TAX, SALES_TAX, REGIMES, UNIFIED_RATES, type RegimeKey } from "@/lib/tax-engine";
import { round2, type LedgerLine } from "./types";

export interface TaxBase {
  /** выручка + прочие операционные доходы за период */
  revenueTotal: number;
  /** часть выручки, полученная наличными (через кассу) */
  cashRevenue: number;
  /** прибыль до налогообложения (без 7710) */
  ebt: number;
  /** количество календарных месяцев в периоде (для патента) */
  months: number;
}

export interface TaxLine {
  label: string;
  base: number;
  rate: number | null; // null for fixed amounts
  amount: number;
  debit: string;
  credit: string;
}

export interface TaxAccrual {
  regime: RegimeKey;
  regimeName: string;
  lines: TaxLine[];
  total: number;
  entryLines: LedgerLine[];
}

export function isRegimeKey(k: string | null | undefined): k is RegimeKey {
  return !!k && k in REGIMES;
}

export function computeTaxAccrual(regime: RegimeKey, base: TaxBase, patentMonthly: number): TaxAccrual {
  const lines: TaxLine[] = [];

  if (regime === "general") {
    const b = Math.max(0, base.ebt);
    lines.push({
      label: "Налог на прибыль 10% — ст.240 НК КР",
      base: b, rate: INCOME_TAX, amount: round2(b * INCOME_TAX),
      debit: "7710", credit: "3410",
    });
  } else if (regime === "simplified") {
    lines.push({
      label: "Налог с продаж 2% — ст.368 НК КР",
      base: base.revenueTotal, rate: SALES_TAX, amount: round2(base.revenueTotal * SALES_TAX),
      debit: "7510", credit: "3490",
    });
  } else if (regime === "patent") {
    const amount = round2(patentMonthly * base.months);
    lines.push({
      label: `Патент — ${base.months} мес. × ${patentMonthly} сом (ст.414 НК КР)`,
      base: base.months, rate: null, amount,
      debit: "7710", credit: "3490",
    });
  } else {
    const [cashRate, nonCashRate] = UNIFIED_RATES[regime]!;
    const cash = Math.max(0, Math.min(base.cashRevenue, base.revenueTotal));
    const nonCash = Math.max(0, base.revenueTotal - cash);
    lines.push({
      label: `Единый налог, наличная выручка ${pct(cashRate)} — ст.423 НК КР`,
      base: cash, rate: cashRate, amount: round2(cash * cashRate),
      debit: "7710", credit: "3410",
    });
    lines.push({
      label: `Единый налог, безналичная выручка ${pct(nonCashRate)} — ст.423 НК КР`,
      base: nonCash, rate: nonCashRate, amount: round2(nonCash * nonCashRate),
      debit: "7710", credit: "3410",
    });
  }

  const nonZero = lines.filter((l) => l.amount > 0);
  const total = round2(nonZero.reduce((s, l) => s + l.amount, 0));

  // one debit + one credit per account pair, so the entry stays readable
  const pairs = new Map<string, number>();
  for (const l of nonZero) {
    const key = `${l.debit}>${l.credit}`;
    pairs.set(key, round2((pairs.get(key) ?? 0) + l.amount));
  }
  const entryLines: LedgerLine[] = [];
  for (const [key, amount] of pairs) {
    const [dr, cr] = key.split(">");
    entryLines.push({ account: dr, debit: amount, credit: 0 });
    entryLines.push({ account: cr, debit: 0, credit: amount });
  }

  return { regime, regimeName: REGIMES[regime], lines, total, entryLines };
}

function pct(rate: number): string {
  return `${Number((rate * 100).toPrecision(3))}%`;
}

/** Whole calendar months touched by [from, to], e.g. 2026-07-01..2026-09-30 → 3. */
export function monthsInPeriod(from: string, to: string): number {
  const [fy, fm] = from.split("-").map(Number);
  const [ty, tm] = to.split("-").map(Number);
  return Math.max(1, (ty - fy) * 12 + (tm - fm) + 1);
}

export function taxSourceRef(from: string, to: string): string {
  return `${from}..${to}`;
}
