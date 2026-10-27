// ════════════════════════════════════════════════════════════════════════
// lib/ledger/analytics.ts — управленческие показатели из готовой отчётности:
// коэффициенты ликвидности и устойчивости, рентабельность, оборачиваемость,
// структура затрат по характеру, точка безубыточности.
// Всё считается из Statements, т.е. из того же журнала — без ручного ввода.
// ════════════════════════════════════════════════════════════════════════

import { NATURE_LABEL, type Nature } from "./accounts";
import type { Statements } from "./engine";
import { round2 } from "./types";

export interface Ratio {
  key: string;
  label: string;
  value: number | null; // null = не определён (деление на ноль)
  unit: "x" | "%" | "дн." | "сом";
  hint: string;
  /** ориентир: [нижняя граница нормы, верхняя] — для подсветки; null = без нормы */
  norm: [number | null, number | null] | null;
  group: "liquidity" | "stability" | "profitability" | "turnover";
}

export function periodDays(from: string, to: string): number {
  const a = Date.UTC(+from.slice(0, 4), +from.slice(5, 7) - 1, +from.slice(8, 10));
  const b = Date.UTC(+to.slice(0, 4), +to.slice(5, 7) - 1, +to.slice(8, 10));
  return Math.round((b - a) / 86_400_000) + 1;
}

const div = (a: number, b: number) => (Math.abs(b) < 0.005 ? null : a / b);
const avg = (a: number, b: number) => (a + b) / 2;

export function ratios(s: Statements): Ratio[] {
  const o = s.balanceSheet.opening, c = s.balanceSheet.closing, is = s.incomeStatement;
  const g = (v: Record<number, number>, k: number) => v[k] ?? 0;
  const days = periodDays(s.period.from, s.period.to);
  const pct = (x: number | null) => (x === null ? null : round2(x * 100));
  const r2 = (x: number | null) => (x === null ? null : round2(x));
  const interest = is.byNature.interest ?? 0;

  return [
    { key: "current", group: "liquidity", label: "Текущая ликвидность", unit: "x", norm: [1.5, null],
      value: r2(div(g(c, 191), g(c, 371))), hint: "Оборотные активы / краткосрочные обязательства (стр. 191 / 371)" },
    { key: "quick", group: "liquidity", label: "Быстрая ликвидность", unit: "x", norm: [0.8, null],
      value: r2(div(g(c, 191) - g(c, 160) - g(c, 180), g(c, 371))), hint: "(Оборотные активы − запасы − авансы) / краткосрочные обязательства" },
    { key: "cash", group: "liquidity", label: "Абсолютная ликвидность", unit: "x", norm: [0.2, null],
      value: r2(div(g(c, 110) + g(c, 120), g(c, 371))), hint: "Денежные средства / краткосрочные обязательства" },
    { key: "autonomy", group: "stability", label: "Коэффициент автономии", unit: "x", norm: [0.5, null],
      value: r2(div(g(c, 541), g(c, 599))), hint: "Собственный капитал / валюта баланса" },
    { key: "de", group: "stability", label: "Долг к капиталу", unit: "x", norm: [null, 1],
      value: r2(div(g(c, 499), g(c, 541))), hint: "Обязательства / собственный капитал" },
    { key: "coverage", group: "stability", label: "Покрытие процентов", unit: "x", norm: [3, null],
      value: r2(div(is.operatingProfit, interest)), hint: "Операционная прибыль / расходы на проценты" },
    { key: "gross", group: "profitability", label: "Валовая маржа", unit: "%", norm: null,
      value: pct(div(is.grossProfit, is.netRevenue)), hint: "Валовая прибыль / чистая выручка" },
    { key: "operating", group: "profitability", label: "Операционная маржа", unit: "%", norm: null,
      value: pct(div(is.operatingProfit, is.netRevenue)), hint: "Прибыль от операционной деятельности / чистая выручка" },
    { key: "ros", group: "profitability", label: "Рентабельность продаж (ROS)", unit: "%", norm: [5, null],
      value: pct(div(is.netProfit, is.netRevenue)), hint: "Чистая прибыль / чистая выручка" },
    { key: "roa", group: "profitability", label: "Рентабельность активов (ROA), за период", unit: "%", norm: null,
      value: pct(div(is.netProfit, avg(g(o, 299), g(c, 299)))), hint: "Чистая прибыль / средние активы" },
    { key: "roe", group: "profitability", label: "Рентабельность капитала (ROE), за период", unit: "%", norm: null,
      value: pct(div(is.netProfit, avg(g(o, 541), g(c, 541)))), hint: "Чистая прибыль / средний собственный капитал" },
    { key: "dso", group: "turnover", label: "Оборачиваемость дебиторской задолженности", unit: "дн.", norm: null,
      value: r2(div(avg(g(o, 140), g(c, 140)) * days, is.netRevenue)), hint: "Средние счета к получению × дни периода / выручка" },
    { key: "dio", group: "turnover", label: "Оборачиваемость запасов", unit: "дн.", norm: null,
      value: r2(div(avg(g(o, 160), g(c, 160)) * days, is.byLine.cogs)), hint: "Средние запасы × дни периода / себестоимость" },
    { key: "dpo", group: "turnover", label: "Оборачиваемость кредиторской задолженности", unit: "дн.", norm: null,
      value: r2(div(avg(g(o, 310), g(c, 310)) * days, is.byLine.cogs)), hint: "Средние счета к оплате × дни периода / себестоимость" },
  ];
}

export interface CostSlice { nature: Nature; label: string; amount: number; share: number }

export function costStructure(s: Statements): CostSlice[] {
  const entries = Object.entries(s.incomeStatement.byNature) as Array<[Nature, number]>;
  const costs = entries.filter(([, v]) => v > 0);
  const total = costs.reduce((x, [, v]) => x + v, 0);
  return costs
    .map(([nature, amount]) => ({ nature, label: NATURE_LABEL[nature], amount, share: total > 0 ? round2((amount / total) * 100) : 0 }))
    .sort((a, b) => b.amount - a.amount);
}

export interface BreakEven {
  variableCosts: number;
  fixedCosts: number;
  contributionMargin: number;
  cmRatio: number | null;
  breakEvenRevenue: number | null;
  safetyMarginPct: number | null;
}

/**
 * Упрощённое деление: переменные = себестоимость + коммерческие расходы,
 * постоянные = административные + проценты. Для точного анализа затраты
 * размечаются вручную — это ориентир для руководителя, не норматив.
 */
export function breakEven(s: Statements): BreakEven {
  const is = s.incomeStatement;
  const revenue = is.netRevenue + is.byLine.otherOpIncome;
  const variableCosts = round2(is.byLine.cogs + is.byLine.selling);
  const fixedCosts = round2(is.byLine.admin + (is.byNature.interest ?? 0));
  const contributionMargin = round2(revenue - variableCosts);
  const cmRatio = revenue > 0 ? contributionMargin / revenue : null;
  const breakEvenRevenue = cmRatio && cmRatio > 0 ? round2(fixedCosts / cmRatio) : null;
  const safetyMarginPct = breakEvenRevenue !== null && revenue > 0 ? round2(((revenue - breakEvenRevenue) / revenue) * 100) : null;
  return { variableCosts, fixedCosts, contributionMargin, cmRatio: cmRatio === null ? null : round2(cmRatio * 100), breakEvenRevenue, safetyMarginPct };
}

export type RatioStatus = "good" | "watch" | "neutral";

export function ratioStatus(r: Ratio): RatioStatus {
  if (r.value === null || !r.norm) return "neutral";
  const [lo, hi] = r.norm;
  if (lo !== null && r.value < lo) return "watch";
  if (hi !== null && r.value > hi) return "watch";
  return "good";
}
