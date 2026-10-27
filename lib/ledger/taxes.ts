// ════════════════════════════════════════════════════════════════════════
// lib/ledger/taxes.ts — начисление налогов за период ИЗ журнала.
//
// Ставки и перечень режимов — из lib/tax-engine.ts (REGIME_INFO), поэтому
// калькулятор и журнал не могут разойтись. Отличается только база: здесь —
// обороты периода, а для единого налога — ФАКТИЧЕСКОЕ деление выручки на
// наличную (поступила в кассу 1110/1120) и безналичную, без ползунка.
//
// Проводки (учётная политика, см. lib/ledger/accounts.ts):
//   налог на прибыль, единый налог, патент, e-commerce  Дт 9910  Кт 3410 / 3490
//   налог с продаж (общий режим)                         Дт 8190  Кт 3490
// НДС не начисляется здесь: он выделяется в момент проведения выручки (3430).
// ════════════════════════════════════════════════════════════════════════

import { INCOME_TAX, REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import { round2, type LedgerLine } from "./types";

export { isRegimeKey } from "@/lib/tax-engine";

export interface TaxBase {
  /** чистая выручка + прочие операционные доходы за период */
  revenueTotal: number;
  /** часть выручки, полученная наличными (через кассу) */
  cashRevenue: number;
  /** прибыль до налогообложения без начисления налогов этого периода */
  ebtBeforeTaxEntry: number;
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
  article: string;
  lines: TaxLine[];
  total: number;
  entryLines: LedgerLine[];
}

const pct = (rate: number) => `${Number((rate * 100).toPrecision(3)).toString().replace(".", ",")}%`;

export function computeTaxAccrual(regime: RegimeKey, base: TaxBase, patentMonthly: number): TaxAccrual {
  const info = REGIME_INFO[regime];
  const lines: TaxLine[] = [];

  if (info.kind === "general") {
    const st = info.salesTax ?? 0;
    const salesTax = round2(base.revenueTotal * st);
    lines.push({
      label: `Налог с продаж ${pct(st)} — ст. 368 НК КР`,
      base: base.revenueTotal, rate: st, amount: salesTax, debit: "8190", credit: "3490",
    });
    const profitBase = Math.max(0, round2(base.ebtBeforeTaxEntry - salesTax));
    lines.push({
      label: `Налог на прибыль ${pct(INCOME_TAX)} — ст. 240 НК КР`,
      base: profitBase, rate: INCOME_TAX, amount: round2(profitBase * INCOME_TAX), debit: "9910", credit: "3410",
    });
  } else if (info.kind === "patent") {
    const amount = round2(patentMonthly * base.months);
    lines.push({
      label: `Патент: ${base.months} мес. × ${patentMonthly.toLocaleString("ru-RU")} сом — ${info.article}`,
      base: base.months, rate: null, amount, debit: "9910", credit: "3490",
    });
  } else {
    const [cashRate, nonCashRate] = info.rates!;
    const title = info.kind === "ecommerce" ? "Налог на электронную торговлю" : "Единый налог";
    if (cashRate === nonCashRate) {
      lines.push({
        label: `${title} ${pct(cashRate)} — ${info.article}`,
        base: base.revenueTotal, rate: cashRate, amount: round2(base.revenueTotal * cashRate),
        debit: "9910", credit: info.kind === "ecommerce" ? "3490" : "3410",
      });
    } else {
      const cash = Math.max(0, Math.min(base.cashRevenue, base.revenueTotal));
      const nonCash = Math.max(0, base.revenueTotal - cash);
      lines.push({
        label: `${title}, наличная выручка ${pct(cashRate)} — ${info.article}`,
        base: round2(cash), rate: cashRate, amount: round2(cash * cashRate), debit: "9910", credit: "3410",
      });
      lines.push({
        label: `${title}, безналичная выручка ${pct(nonCashRate)} — ${info.article}`,
        base: round2(nonCash), rate: nonCashRate, amount: round2(nonCash * nonCashRate), debit: "9910", credit: "3410",
      });
    }
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

  return { regime, regimeName: info.name, article: info.article, lines, total, entryLines };
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
