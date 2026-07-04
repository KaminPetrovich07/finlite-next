// ════════════════════════════════════════════════════════════════════════
// lib/executive.ts — risk flags + recommendations, ported from the
// "Big 4 Executive Report" tab (app.py ~lines 1095-1152).
// ════════════════════════════════════════════════════════════════════════

import type { CalculateResult } from "@/lib/tax-engine";

export type RiskLevel = "🔴" | "🟡" | "🟢";

export interface Risk {
  level: RiskLevel;
  title: string;
  detail: string;
}

export function computeRisks(fr: CalculateResult, safetyMarginPct: number): Risk[] {
  const risks: Risk[] = [];
  if (fr.profitability < 5) {
    risks.push({ level: "🔴", title: "Низкая рентабельность", detail: `Чистая маржа ${fr.profitability.toFixed(1)}% — критически низко` });
  }
  if (fr.netProfit < 0) {
    risks.push({ level: "🔴", title: "Убыток", detail: "Компания работает в убыток. Срочный пересмотр расходов" });
  }
  if (fr.salaries + fr.social > fr.revenue * 0.5) {
    risks.push({ level: "🟡", title: "Высокий ФОТ", detail: "Расходы на персонал превышают 50% выручки" });
  }
  if (fr.cogs > fr.revenue * 0.7) {
    risks.push({ level: "🟡", title: "Высокая себестоимость", detail: "Себестоимость >70% выручки" });
  }
  if (safetyMarginPct < 20) {
    risks.push({ level: "🟡", title: "Малый запас прочности", detail: `Запас ${safetyMarginPct.toFixed(1)}% — риск убытка при снижении продаж` });
  }
  if (risks.length === 0) {
    risks.push({ level: "🟢", title: "Финансово устойчива", detail: "Явных рисков не выявлено. Контролируйте ключевые метрики" });
  }
  return risks;
}

export interface Recommendation {
  priority: "🔴 Высокий" | "🟡 Средний" | "🟢 Низкий";
  title: string;
  detail: string;
}

export function computeRecommendations(
  fr: CalculateResult,
  bestRegimeName: string,
  bestRegimeTax: number
): Recommendation[] {
  const recs: Recommendation[] = [];
  if (fr.totalDirect - bestRegimeTax > 1) {
    recs.push({
      priority: "🔴 Высокий",
      title: "Оптимизация налогового режима",
      detail: `Перейдите на «${bestRegimeName}» — экономия ${Math.round(fr.totalDirect - bestRegimeTax).toLocaleString("ru-RU")} сом`,
    });
  }
  if (fr.sellingExp > fr.revenue * 0.1) {
    recs.push({ priority: "🟡 Средний", title: "Контроль коммерческих расходов", detail: "Расходы >10% выручки. Аудит маркетинга" });
  }
  if (fr.profitability > 15) {
    recs.push({ priority: "🟢 Низкий", title: "Реинвестирование", detail: "Высокая рентабельность — направьте прибыль в развитие" });
  }
  if (recs.length === 0) {
    recs.push({ priority: "🟢 Низкий", title: "Сохранять модель", detail: "Показатели в норме" });
  }
  return recs;
}

/** Waterfall chart data: revenue → costs (negative steps) → net profit (total). */
export function waterfallSteps(fr: CalculateResult): Array<{ label: string; value: number; isTotal: boolean }> {
  return [
    { label: "Выручка", value: fr.revenue, isTotal: true },
    { label: "− Себестоимость", value: -fr.cogs, isTotal: false },
    { label: "− ФОТ", value: -fr.fotFull, isTotal: false },
    { label: "− Аренда", value: -fr.rent, isTotal: false },
    { label: "− Коммерч.", value: -fr.sellingExp, isTotal: false },
    { label: "− Адм.", value: -fr.adminExp, isTotal: false },
    { label: "− Налоги", value: -fr.incomeTax, isTotal: false },
    { label: "= Прибыль", value: fr.netProfit, isTotal: true },
  ];
}

export interface WaterfallBar {
  label: string;
  base: number; // invisible stacking base
  bar: number; // visible bar height
  value: number; // actual signed value, for the tooltip/label
  color: "green" | "red" | "gold";
}

/** Converts waterfallSteps() into stacked-bar-chart-ready data (invisible base + visible delta). */
export function waterfallChartData(steps: ReturnType<typeof waterfallSteps>): WaterfallBar[] {
  const bars: WaterfallBar[] = [];
  let cumulative = 0;
  steps.forEach((step, i) => {
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;
    if (step.isTotal && (isFirst || isLast)) {
      bars.push({ label: step.label, base: 0, bar: step.value, value: step.value, color: "gold" });
      cumulative = isFirst ? step.value : cumulative;
    } else {
      const next = cumulative + step.value;
      if (step.value < 0) {
        bars.push({ label: step.label, base: next, bar: -step.value, value: step.value, color: "red" });
      } else {
        bars.push({ label: step.label, base: cumulative, bar: step.value, value: step.value, color: "green" });
      }
      cumulative = next;
    }
  });
  return bars;
}
export function accountingStandard(totalRevenue: number): string {
  if (totalRevenue > 300_000_000) return "Полные МСФО";
  if (totalRevenue > 30_000_000) return "МСФО для МСП";
  return "Упрощённые правила КР";
}

export function continuityNote(netProfit: number): string {
  return netProfit > 0
    ? "✅ Компания финансово устойчива. Признаков прекращения деятельности нет."
    : "⚠️ Убыток периода требует анализа допущения о непрерывности деятельности.";
}

/** CVP line: profit as a function of revenue, 0 to 1.5x current revenue, ~20 points. */
export function cvpCurve(fr: CalculateResult): Array<{ revenue: number; profit: number }> {
  if (fr.revenue <= 0) return [];
  const steps = 20;
  const maxRev = fr.revenue * 1.5;
  const stepSize = maxRev / steps;
  const varRate = (fr.cogs + fr.sellingExp) / fr.revenue;
  const fixedCosts = fr.adminTotal + fr.totalDirect;
  const points: Array<{ revenue: number; profit: number }> = [];
  for (let r = 0; r <= maxRev; r += stepSize) {
    points.push({ revenue: r, profit: r * (1 - varRate) - fixedCosts });
  }
  return points;
}
