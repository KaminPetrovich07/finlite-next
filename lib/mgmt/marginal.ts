// ════════════════════════════════════════════════════════════════════════
// lib/mgmt/marginal.ts — маржинальный анализ (директ-костинг) по сегментам.
//
// Затраты делятся на переменные (растут вместе с объёмом продаж) и постоянные:
// у каждого счёта расходов — доля переменных затрат, %. По умолчанию:
// материалы и себестоимость проданного, производственная зарплата с
// взносами, доставка, безнадёжные долги, гарантия — переменные; амортизация,
// ремонт, реклама, аренда, административные — постоянные; коммунальные и
// прочие производственные — смешанные (50 %). Бухгалтер меняет доли под себя.
//
//   Маржинальный доход (МД) = выручка − переменные затраты
//   Коэффициент МД          = МД / выручка
//   Точка безубыточности    = (постоянные − прочие доходы) / коэффициент МД
//   Запас прочности         = (выручка − точка безубыточности) / выручка
//   Операционный рычаг      = МД / операционная прибыль
// Общие (неразмеченные) переменные и постоянные затраты распределяются по
// той же базе, что и в отчёте по сегментам.
// ════════════════════════════════════════════════════════════════════════

import { getAccount } from "@/lib/ledger/accounts";
import type { LedgerEntry } from "@/lib/ledger/types";
import { effectiveTags, r2, roleOf, type AllocBase, type DimKind, type MgmtSettings, type Tags } from "./model";

const FULL = new Set(["7000", "7110", "7120", "7130", "7180", "7190", "7200", "7210", "7220", "7230", "7290", "7300", "7400", "7540", "7550", "7560", "7590"]);
const MIXED = new Set(["7140", "7170", "7570", "7600"]);

/** Доля переменных затрат счёта по умолчанию, %. */
export function defaultVariable(code: string): number {
  const base = code.split(".")[0];
  if (FULL.has(base)) return 100;
  if (MIXED.has(base)) return 50;
  const a = getAccount(code) ?? getAccount(base);
  if (a?.pl === "cogs" && (a.nature === "materials")) return 100;
  return 0;
}
export const variableShare = (s: MgmtSettings, code: string) => {
  const v = s.behavior?.[code] ?? s.behavior?.[code.split(".")[0]];
  return v == null ? defaultVariable(code) : Math.max(0, Math.min(100, v));
};

export interface MarginalColumn {
  id: string; name: string;
  revenue: number;
  variable: number;        // переменные затраты (положительное число)
  contribution: number;    // маржинальный доход
  cmRatio: number | null;  // %
  fixed: number;           // постоянные затраты, свои + распределённые
  fixedOwn: number;
  otherIncome: number;     // прочие операционные доходы
  profit: number;          // операционная прибыль
  breakEven: number | null;
  safety: number | null;   // запас прочности, %
  safetyAmount: number | null;
  leverage: number | null; // операционный рычаг
}
export interface MarginalReport {
  kind: DimKind;
  base: AllocBase;
  columns: MarginalColumn[];
  total: MarginalColumn;
  /** счета расходов периода: сумма, доля переменных, по умолчанию ли */
  accounts: Array<{ code: string; name: string; amount: number; variablePct: number; isDefault: boolean }>;
  warnings: string[];
}

const blank = (id: string, name: string): MarginalColumn => ({ id, name, revenue: 0, variable: 0, contribution: 0, cmRatio: null, fixed: 0, fixedOwn: 0, otherIncome: 0, profit: 0, breakEven: null, safety: null, safetyAmount: null, leverage: null });

function finish(c: MarginalColumn) {
  c.contribution = r2(c.revenue - c.variable);
  c.profit = r2(c.contribution - c.fixed + c.otherIncome);
  c.cmRatio = c.revenue > 0 ? r2((c.contribution / c.revenue) * 100) : null;
  const ratio = c.revenue > 0 ? c.contribution / c.revenue : 0;
  const need = c.fixed - c.otherIncome;
  c.breakEven = ratio > 0 ? r2(Math.max(0, need) / ratio) : null;
  c.safetyAmount = c.breakEven != null ? r2(c.revenue - c.breakEven) : null;
  c.safety = c.breakEven != null && c.revenue > 0 ? r2(((c.revenue - c.breakEven) / c.revenue) * 100) : null;
  c.leverage = c.profit > 0 ? r2(c.contribution / c.profit) : null;
}

/** Маржинальный отчёт по значениям аналитики `kind` за период; без значений аналитик — по компании целиком. */
export function marginalReport(entries: LedgerEntry[], from: string, to: string, kind: DimKind, s: MgmtSettings, manual: Map<string, Tags>): MarginalReport {
  const dims = s.dims.filter((d) => d.kind === kind);
  const valid = new Set(s.dims.map((d) => d.id));
  const cols = new Map(dims.map((d) => [d.id, blank(d.id, d.name)]));
  const common = blank("", "Общее (не распределено)");
  const touched = new Set<string>();
  const accounts = new Map<string, number>();
  for (const e of entries) {
    if (e.date < from || e.date > to || e.source === "closing") continue;
    const pl = e.lines.filter((l) => roleOf(l.account));
    if (!pl.length) continue;
    const id = effectiveTags(e, manual.get(e.id), s, valid).tags[kind] ?? "";
    const c = (id && cols.get(id)) || common;
    touched.add(c.id);
    for (const l of pl) {
      const role = roleOf(l.account)!;
      if (role === "revenue") c.revenue = r2(c.revenue + l.credit - l.debit);
      else if (role === "otherOpIncome") c.otherIncome = r2(c.otherIncome + l.credit - l.debit);
      else if (role === "cogs" || role === "selling" || role === "admin" || role === "otherOpExpense") {
        const amount = l.debit - l.credit;
        const v = (amount * variableShare(s, l.account)) / 100;
        c.variable = r2(c.variable + v);
        c.fixed = r2(c.fixed + amount - v);
        accounts.set(l.account, r2((accounts.get(l.account) ?? 0) + amount));
      }
    }
  }
  const segs = [...cols.values()].filter((c) => touched.has(c.id));
  for (const c of segs) c.fixedOwn = c.fixed;
  common.fixedOwn = common.fixed;
  // общие переменные и постоянные — по базе распределения
  const base: AllocBase = segs.length ? (s.alloc[kind]?.base ?? "revenue") : "none";
  const w = new Map<string, number>();
  if (base === "revenue") segs.forEach((c) => w.set(c.id, Math.max(0, c.revenue)));
  else if (base === "direct") segs.forEach((c) => w.set(c.id, Math.max(0, c.variable + c.fixed)));
  else if (base === "equal") segs.forEach((c) => w.set(c.id, 1));
  else if (base === "manual") segs.forEach((c) => w.set(c.id, Math.max(0, s.alloc[kind]?.manual?.[c.id] ?? 0)));
  let wsum = [...w.values()].reduce((a, b) => a + b, 0);
  if (base !== "none" && wsum <= 0) { segs.forEach((c) => w.set(c.id, 1)); wsum = segs.length; }
  if (base !== "none" && wsum > 0 && (common.variable > 0 || common.fixed > 0)) {
    let lv = common.variable, lf = common.fixed;
    const order = segs.filter((c) => (w.get(c.id) ?? 0) > 0);
    order.forEach((c, i) => {
      const k = (w.get(c.id) ?? 0) / wsum, last = i === order.length - 1;
      const dv = last ? r2(lv) : r2(common.variable * k), df = last ? r2(lf) : r2(common.fixed * k);
      c.variable = r2(c.variable + dv); c.fixed = r2(c.fixed + df); lv = r2(lv - dv); lf = r2(lf - df);
    });
    common.variable = 0; common.fixed = 0;
  }
  const total = blank("total", "Итого");
  for (const c of [...segs, common]) { total.revenue += c.revenue; total.variable += c.variable; total.fixed += c.fixed; total.fixedOwn += c.fixedOwn; total.otherIncome += c.otherIncome; }
  for (const k of ["revenue", "variable", "fixed", "fixedOwn", "otherIncome"] as const) total[k] = r2(total[k]);
  for (const c of [...segs, common, total]) finish(c);

  const warnings: string[] = [];
  if (total.cmRatio != null && total.cmRatio <= 0) warnings.push("Маржинальный доход отрицательный: переменные затраты больше выручки — каждая продажа увеличивает убыток.");
  for (const c of segs) {
    if (c.revenue > 0 && c.contribution < 0) warnings.push(`«${c.name}»: отрицательный маржинальный доход — продажи сегмента не покрывают даже переменные затраты.`);
    else if (c.safety != null && c.safety < 0 && c.breakEven != null) warnings.push(`«${c.name}»: выручка ниже точки безубыточности на ${Math.round(c.breakEven - c.revenue).toLocaleString("ru-RU")} сом — сегмент работает в убыток.`);
    else if (c.safety != null && c.safety < 10 && c.revenue > 0) warnings.push(`«${c.name}»: запас прочности ${String(c.safety).replace(".", ",")} % — падение выручки на ${String(c.safety).replace(".", ",")} % приведёт к убытку.`);
  }
  const accList = [...accounts.entries()].filter(([, a]) => Math.abs(a) > 0.004).map(([code, amount]) => ({
    code, name: getAccount(code)?.name ?? getAccount(code.split(".")[0])?.name ?? code, amount,
    variablePct: variableShare(s, code), isDefault: s.behavior?.[code] == null,
  })).sort((a, b) => b.amount - a.amount);
  const hasCommon = common.revenue !== 0 || common.variable !== 0 || common.fixed !== 0 || common.otherIncome !== 0;
  return { kind, base, columns: [...segs, ...(hasCommon ? [common] : [])], total, accounts: accList, warnings };
}

/** «Что если»: прибыль и точка безубыточности при изменении объёма, цены, переменных затрат на единицу и постоянных, %. */
export function whatIf(c: Pick<MarginalColumn, "revenue" | "variable" | "fixed" | "otherIncome">, d: { volume: number; price: number; unitCost: number; fixed: number }) {
  const revenue = c.revenue * (1 + d.volume / 100) * (1 + d.price / 100);
  const variable = c.variable * (1 + d.volume / 100) * (1 + d.unitCost / 100);
  const fixed = c.fixed * (1 + d.fixed / 100);
  const col = { ...blank("x", "x"), revenue: r2(revenue), variable: r2(variable), fixed: r2(fixed), otherIncome: c.otherIncome };
  finish(col);
  return col;
}

/** Строки маржинального отчёта: поле, подпись, формат. */
export const MARGINAL_ROWS: Array<[keyof MarginalColumn, string, "money" | "pct" | "x"]> = [
  ["revenue", "Выручка", "money"], ["variable", "Переменные затраты", "money"], ["contribution", "МАРЖИНАЛЬНЫЙ ДОХОД", "money"], ["cmRatio", "Коэффициент маржинального дохода", "pct"],
  ["fixed", "Постоянные затраты (свои и распределённые)", "money"], ["fixedOwn", "  в т. ч. свои постоянные", "money"], ["otherIncome", "Прочие операционные доходы", "money"],
  ["profit", "ОПЕРАЦИОННАЯ ПРИБЫЛЬ", "money"], ["breakEven", "Точка безубыточности (выручка)", "money"], ["safetyAmount", "Запас прочности, сом", "money"],
  ["safety", "Запас прочности, %", "pct"], ["leverage", "Операционный рычаг", "x"],
];

