// ════════════════════════════════════════════════════════════════════════
// lib/portfolio/score.ts — портфель компаний: одна строка на компанию и
// прозрачный балл риска 0–100.
//
// Для кого: министерство или фонд, которому подчинены госпредприятия;
// бухгалтер или аудитор с десятками клиентов. Балл складывается из
// понятных пунктов (каждый виден в строке), а не из «чёрного ящика»:
//   недостаточность активов ........................ 35
//   просроченного больше, чем ликвидных активов .... 30
//   задержка зарплаты .............................. 15
//   просрочка перед бюджетом ....................... 10
//   просрочка поставщикам (дольше 30 дней) ......... 10
//   поставщикам не платят больше 120 дней .......... 10
//   текущая ликвидность ниже 1 ..................... 15
//   ликвидность падает 3 месяца подряд .............. 5
//   убыток 3 месяца подряд .......................... 5
//   денег меньше чем на месяц ....................... 5
//   высокие налоговые риски (каждый, до 3) .......... 3
// Сумма ограничена 100. 0–19 — устойчиво, 20–49 — внимание, 50+ — высокий риск;
// оценка не бывает мягче вывода финансовой диагностики той же компании.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

import type { Diagnosis } from "@/lib/insolvency/diagnose";
import type { TaxRiskReport } from "@/lib/taxrisk/check";

export type Band = "ok" | "watch" | "risk";
export interface ScorePart { key: string; label: string; points: number }

export interface PortfolioRow {
  companyId: string;
  name: string;
  segment: string;
  score: number;
  band: Band;
  parts: ScorePart[];
  verdict: Diagnosis["verdict"]["level"];
  current: number | null;
  coverage: number | null;
  equityShare: number | null;
  liquid: number;
  debts: number;
  overdue: number;
  overdueStaff: number;
  overdueBudget: number;
  overdueSuppliers: number;
  revenue3: number;
  profit3: number;
  totalAssets: number;
  /** текущая ликвидность по месяцам — для спарклайна */
  trend: Array<number | null>;
  months: string[];
  taxHigh: number;
  taxTitles: Array<{ title: string; vars?: Record<string, string | number> }>;
  topSignal: { title: string; detail: string; vars?: Record<string, string | number> } | null;
  empty: boolean;
}

export const SCORE_TEXTS = [
  "Недостаточность активов", "Просроченного больше, чем ликвидных активов", "Задержка зарплаты", "Просрочка перед бюджетом",
  "Просрочка поставщикам", "Поставщикам не платят больше 120 дней", "Текущая ликвидность ниже 1", "Ликвидность падает 3 месяца подряд", "Убыток 3 месяца подряд",
  "Денег меньше чем на месяц", "Высокие налоговые риски",
];

export const bandOf = (score: number): Band => (score >= 50 ? "risk" : score >= 20 ? "watch" : "ok");

export function scoreCompany(d: Diagnosis, tax: Pick<TaxRiskReport, "risks"> | null): { score: number; band: Band; parts: ScorePart[] } {
  const parts: ScorePart[] = [];
  const add = (key: string, label: string, points: number, on: boolean) => { if (on) parts.push({ key, label, points }); };
  const kind = (k: string) => d.totals.byKind.find((x) => x.kind === k);
  const b = d.balance;
  // существенность: копеечные остатки после округлений не делают компанию проблемной
  const material = Math.max(5_000, b.totalAssets * 0.001);
  add("equity", "Недостаточность активов", 35, b.equity < 0);
  add("coverage", "Просроченного больше, чем ликвидных активов", 30, d.totals.overdue > 0.01 && b.liquid < d.totals.overdue);
  add("staff", "Задержка зарплаты", 15, (kind("staff")?.overdue ?? 0) >= material);
  add("budget", "Просрочка перед бюджетом", 10, (kind("budget")?.overdue ?? 0) >= material);
  add("suppliers", "Просрочка поставщикам", 10, (kind("suppliers")?.overdue ?? 0) >= material);
  add("suppliers90", "Поставщикам не платят больше 120 дней", 10, d.debts.filter((x) => x.kind === "suppliers").reduce((a, x) => a + x.overdue90, 0) >= material);
  const cur = d.indicators.find((i) => i.key === "current")?.value ?? null;
  add("current", "Текущая ликвидность ниже 1", 15, cur != null && cur < 1);
  const tr = d.months.map((m) => m.current).filter((x): x is number => x != null).slice(-4);
  add("falling", "Ликвидность падает 3 месяца подряд", 5, tr.length === 4 && tr.every((v, i) => i === 0 || v < tr[i - 1]));
  const last3 = d.months.slice(-3).map((m) => m.netProfit);
  add("loss", "Убыток 3 месяца подряд", 5, last3.length === 3 && last3.every((n) => n < 0));
  add("runway", "Денег меньше чем на месяц", 5, d.runway != null && d.runway < 1);
  const high = tax?.risks.filter((r) => r.severity === "high").length ?? 0;
  add("tax", "Высокие налоговые риски", Math.min(3, high) * 3, high > 0);
  const score = Math.min(100, parts.reduce((s, p) => s + p.points, 0));
  return { score, band: bandOf(score), parts };
}

export function portfolioRow(company: { id: string; name: string; segment?: string | null }, d: Diagnosis, tax: TaxRiskReport | null, entriesCount: number): PortfolioRow {
  const sc = scoreCompany(d, tax);
  const { score, parts } = sc;
  // оценка в портфеле не мягче, чем вывод диагностики этой компании: экраны не должны спорить
  const rank: Record<Band, number> = { ok: 0, watch: 1, risk: 2 };
  const band = rank[d.verdict.level] > rank[sc.band] ? d.verdict.level : sc.band;
  const k = (x: string) => d.totals.byKind.find((y) => y.kind === x)?.overdue ?? 0;
  const ind = (x: string) => d.indicators.find((i) => i.key === x)?.value ?? null;
  // результат — за 3 последних закрытых месяца: незавершённый текущий месяц искажает прибыль
  const closed = d.months.filter((m) => { const [y, mo] = m.month.split("-").map(Number); return m.date === new Date(Date.UTC(y, mo, 0)).toISOString().slice(0, 10); });
  const last3 = closed.slice(-3);
  const top = d.signals.find((s) => s.level === "risk") ?? d.signals[0] ?? null;
  return {
    companyId: company.id, name: company.name, segment: company.segment ?? "",
    score, band, parts, verdict: d.verdict.level,
    current: ind("current"), coverage: ind("coverage"), equityShare: ind("autonomy"),
    liquid: d.balance.liquid, debts: d.totals.debts, overdue: d.totals.overdue,
    overdueStaff: k("staff"), overdueBudget: k("budget"), overdueSuppliers: k("suppliers"),
    revenue3: Math.round(last3.reduce((s, m) => s + m.revenue, 0)), profit3: Math.round(last3.reduce((s, m) => s + m.netProfit, 0)),
    totalAssets: d.balance.totalAssets,
    trend: d.months.map((m) => m.current), months: d.months.map((m) => m.month),
    taxHigh: tax?.risks.filter((r) => r.severity === "high").length ?? 0,
    taxTitles: (tax?.risks ?? []).filter((r) => r.severity === "high").slice(0, 3).map((r) => ({ title: r.title, vars: r.vars })),
    topSignal: top ? { title: top.title, detail: top.detail, vars: top.vars } : null,
    empty: entriesCount === 0,
  };
}

export interface PortfolioSummary {
  companies: number; ok: number; watch: number; risk: number;
  overdue: number; overdueStaff: number; overdueBudget: number; revenue3: number; profit3: number; lossMaking: number;
}

export function summarize(rows: PortfolioRow[]): PortfolioSummary {
  const live = rows.filter((r) => !r.empty);
  const s = (f: (r: PortfolioRow) => number) => Math.round(live.reduce((a, r) => a + f(r), 0));
  return {
    companies: live.length,
    ok: live.filter((r) => r.band === "ok").length, watch: live.filter((r) => r.band === "watch").length, risk: live.filter((r) => r.band === "risk").length,
    overdue: s((r) => r.overdue), overdueStaff: s((r) => r.overdueStaff), overdueBudget: s((r) => r.overdueBudget),
    revenue3: s((r) => r.revenue3), profit3: s((r) => r.profit3), lossMaking: live.filter((r) => r.profit3 < 0).length,
  };
}
