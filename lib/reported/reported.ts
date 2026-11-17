// ════════════════════════════════════════════════════════════════════════
// lib/reported/reported.ts — отчётность предприятий, загружаемая из Excel.
//
// Министерству или фонду не нужно вести бухгалтерию подведомственных
// предприятий: они присылают баланс, доходы и расходы и просроченную
// задолженность за квартал по шаблону FinLite (не официальная форма).
// Из этих цифр строится та же диагностика, что и по журналу проводок,
// и балл риска в портфеле.
//
// Строки шаблона опознаются по коду в первой колонке (Б1…Б16, Д1…Д7,
// П1…П6, С1), периоды — по датам в строке «Код». Доходы и расходы
// принимаются за квартал или нарастающим итогом с начала года
// (пересчитываются в квартальные). Чистые функции: разбор, проверка,
// диагностика.
// ════════════════════════════════════════════════════════════════════════

import { assess, altmanZ, CREDITOR_KIND, type BalanceGroups, type CreditorKind, type Debt, type Diagnosis, type MonthRow } from "@/lib/insolvency/diagnose";

export type LineKey =
  | "cash" | "investments" | "receivables" | "inventory" | "otherCurrent" | "currentTotal" | "nonCurrent" | "assetsTotal"
  | "currentLiabilities" | "payStaff" | "payBudget" | "paySuppliers" | "loansShort" | "longLiabilities" | "equity" | "retained"
  | "revenue" | "cogs" | "opex" | "operatingProfit" | "otherNet" | "incomeTax" | "netProfit"
  | "odStaff" | "odBudget" | "odSuppliers" | "odSuppliers90" | "odLenders" | "odOther"
  | "headcount";

export interface LineDef { code: string; key: LineKey; label: string; section: 1 | 2 | 3 | 4; indent?: boolean; control?: boolean; flow?: boolean }

/** Строки шаблона. control — итоговые строки для самопроверки, считаются формулой. */
export const LINES: LineDef[] = [
  { code: "Б1", key: "cash", label: "Денежные средства", section: 1 },
  { code: "Б2", key: "investments", label: "Краткосрочные финансовые вложения", section: 1 },
  { code: "Б3", key: "receivables", label: "Дебиторская задолженность", section: 1 },
  { code: "Б4", key: "inventory", label: "Запасы", section: 1 },
  { code: "Б5", key: "otherCurrent", label: "Прочие оборотные активы (авансы выданные, НДС к зачёту и др.)", section: 1 },
  { code: "Б6", key: "currentTotal", label: "Итого оборотные активы", section: 1, control: true },
  { code: "Б7", key: "nonCurrent", label: "Долгосрочные активы (основные средства, НМА, долгосрочные вложения)", section: 1 },
  { code: "Б8", key: "assetsTotal", label: "ИТОГО АКТИВЫ", section: 1, control: true },
  { code: "Б9", key: "currentLiabilities", label: "Краткосрочные обязательства — всего", section: 1 },
  { code: "Б10", key: "payStaff", label: "в т. ч. по оплате труда", section: 1, indent: true },
  { code: "Б11", key: "payBudget", label: "перед бюджетом и Социальным фондом", section: 1, indent: true },
  { code: "Б12", key: "paySuppliers", label: "поставщикам и подрядчикам", section: 1, indent: true },
  { code: "Б13", key: "loansShort", label: "краткосрочные кредиты, займы и проценты", section: 1, indent: true },
  { code: "Б14", key: "longLiabilities", label: "Долгосрочные обязательства", section: 1 },
  { code: "Б15", key: "equity", label: "Собственный капитал (активы − обязательства)", section: 1, control: true },
  { code: "Б16", key: "retained", label: "в т. ч. нераспределённая прибыль (непокрытый убыток со знаком минус)", section: 1, indent: true },
  { code: "Д1", key: "revenue", label: "Выручка", section: 2, flow: true },
  { code: "Д2", key: "cogs", label: "Себестоимость продаж", section: 2, flow: true },
  { code: "Д3", key: "opex", label: "Операционные расходы (административные, коммерческие)", section: 2, flow: true },
  { code: "Д4", key: "operatingProfit", label: "Операционная прибыль (Д1 − Д2 − Д3)", section: 2, flow: true, control: true },
  { code: "Д5", key: "otherNet", label: "Прочие доходы минус прочие расходы, включая проценты", section: 2, flow: true },
  { code: "Д6", key: "incomeTax", label: "Налог на прибыль", section: 2, flow: true },
  { code: "Д7", key: "netProfit", label: "Чистая прибыль (убыток со знаком минус)", section: 2, flow: true },
  { code: "П1", key: "odStaff", label: "по оплате труда", section: 3 },
  { code: "П2", key: "odBudget", label: "перед бюджетом и Социальным фондом", section: 3 },
  { code: "П3", key: "odSuppliers", label: "поставщикам и подрядчикам", section: 3 },
  { code: "П4", key: "odSuppliers90", label: "в т. ч. дольше 90 дней сверх срока", section: 3, indent: true },
  { code: "П5", key: "odLenders", label: "по кредитам, займам и процентам", section: 3 },
  { code: "П6", key: "odOther", label: "прочая", section: 3 },
  { code: "С1", key: "headcount", label: "Среднесписочная численность работников, чел.", section: 4 },
];

export const SECTIONS: Record<1 | 2 | 3 | 4, string> = {
  1: "Раздел 1. Баланс на конец периода",
  2: "Раздел 2. Доходы и расходы за период",
  3: "Раздел 3. Просроченная задолженность (не погашена в установленный срок) на конец периода",
  4: "Раздел 4. Справочно",
};

export const HEAD = { name: "Наименование предприятия", inn: "ИНН", segment: "Ведомство или группа (сегмент портфеля)", unit: "Единица измерения", mode: "Доходы и расходы указаны", code: "Код" } as const;
export const UNITS = ["сом", "тыс. сом"] as const;
export const MODES = ["за квартал", "нарастающим итогом с начала года"] as const;

export type Values = Partial<Record<LineKey, number>>;
export interface ReportedPeriod { date: string; values: Values }
/** Сообщение-шаблон: текст переводится через t(text, vars) */
export interface Msg { text: string; vars?: Record<string, string | number> }
const msg = (text: string, vars?: Msg["vars"]): Msg => ({ text, vars });

export interface ReportedCompany {
  name: string; inn: string; segment: string;
  unit: (typeof UNITS)[number]; mode: (typeof MODES)[number];
  periods: ReportedPeriod[];
  warnings: Msg[]; errors: Msg[];
  sheet?: string;
}

// ── разбор листа ───────────────────────────────────────────────────────────

const norm = (v: unknown) => String(v ?? "").trim().toLowerCase().replace(/\s+/g, " ").replace(/ё/g, "е");
const iso = (y: number, m: number, d: number) => (y > 1900 && m >= 1 && m <= 12 && d >= 1 && d <= 31 ? new Date(Date.UTC(y, m - 1, d)).toISOString().slice(0, 10) : null);

/** Дата из ячейки: серийное число Excel, Date, «30.09.2026», «2026-09-30», «3 кв. 2026». */
export function cellDate(v: unknown): string | null {
  if (v instanceof Date && !Number.isNaN(v.getTime())) return iso(v.getUTCFullYear(), v.getUTCMonth() + 1, v.getUTCDate());
  if (typeof v === "number" && v > 20000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + Math.round(v) * 864e5).toISOString().slice(0, 10);
  const s = norm(v);
  let m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{4})/); if (m) return iso(+m[3], +m[2], +m[1]);
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})/); if (m) return iso(+m[1], +m[2], +m[3]);
  m = s.match(/^([1-4])\s*(кв|квартал|q)\.?\s*(\d{4})/) ?? s.match(/^q([1-4])\s*(\s)?(\d{4})/);
  if (m) { const q = +m[1], y = +m[3]; return new Date(Date.UTC(y, q * 3, 0)).toISOString().slice(0, 10); }
  return null;
}

/** Число из ячейки: 1 234 567,89 · (1 234) · −5 · пусто → null. */
export function cellNumber(v: unknown): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = String(v ?? "").trim();
  if (!s || s === "-" || s === "—") return null;
  const neg = /^\(.*\)$/.test(s) || /^[-−–]/.test(s);
  s = s.replace(/[()\s  ]/g, "").replace(/^[-−–]/, "").replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(s)) return null;
  const n = Number(s);
  return neg ? -n : n;
}

const r0 = (n: number) => Math.round(n);

/** Разбор одного листа (массив строк, как его читает SheetJS с header:1). */
export function parseSheet(grid: unknown[][], sheet?: string): ReportedCompany {
  const out: ReportedCompany = { name: "", inn: "", segment: "", unit: "сом", mode: "за квартал", periods: [], warnings: [], errors: [], sheet };
  const label = (row: unknown[]) => norm(row[0]);
  const valueOf = (row: unknown[]) => row.slice(1).find((c) => String(c ?? "").trim() !== "");
  let codeRow = -1;
  grid.forEach((row, i) => {
    if (!Array.isArray(row)) return;
    const l = label(row);
    if (l.startsWith(norm(HEAD.name))) out.name = String(valueOf(row) ?? "").trim().slice(0, 200);
    else if (l === norm(HEAD.inn)) out.inn = String(valueOf(row) ?? "").replace(/\D/g, "").slice(0, 14);
    else if (l.startsWith("ведомство")) out.segment = String(valueOf(row) ?? "").trim().slice(0, 80);
    else if (l.startsWith("единица")) out.unit = norm(valueOf(row)).startsWith("тыс") ? "тыс. сом" : "сом";
    else if (l.startsWith("доходы и расходы указаны")) out.mode = norm(valueOf(row)).startsWith("нараст") ? "нарастающим итогом с начала года" : "за квартал";
    else if (l === "код" && codeRow < 0) codeRow = i;
  });
  if (!out.name) out.errors.push(msg("Не заполнено наименование предприятия"));
  if (codeRow < 0) { out.errors.push(msg("Не найдена строка «Код» с датами периодов — используйте шаблон FinLite")); return out; }

  // колонки периодов: даты в строке «Код», начиная с третьей колонки (код, название, периоды…)
  const head = grid[codeRow];
  const cols: Array<{ col: number; date: string }> = [];
  for (let c = 2; c < head.length; c++) { const d = cellDate(head[c]); if (d) cols.push({ col: c, date: d }); }
  if (!cols.length) { out.errors.push(msg("В строке «Код» нет дат периодов (например 30.09.2026)")); return out; }
  if (new Set(cols.map((c) => c.date)).size !== cols.length) out.errors.push(msg("Одна и та же дата периода указана дважды"));

  const byCode = new Map(LINES.map((l) => [l.code.toLowerCase(), l]));
  const k = out.unit === "тыс. сом" ? 1000 : 1;
  const periods = cols.map((c) => ({ date: c.date, values: {} as Values }));
  for (let i = codeRow + 1; i < grid.length; i++) {
    const row = grid[i];
    if (!Array.isArray(row)) continue;
    const line = byCode.get(norm(row[0]).replace(/\s/g, "").replace(/^b/, "б"));
    if (!line) continue;
    cols.forEach((c, j) => {
      const raw = row[c.col];
      const n = cellNumber(raw);
      if (n == null) {
        if (String(raw ?? "").trim()) out.warnings.push(msg("{code}, {at}: «{value}» — не число, пропущено", { code: line.code, at: fmtDate(c.date), value: String(raw).slice(0, 20) }));
        return;
      }
      periods[j].values[line.key] = line.key === "headcount" ? n : n * k;
    });
  }
  // период заполнен, если есть хоть одна вводимая строка (итоговые строки-формулы и численность не в счёт)
  const input = new Set(LINES.filter((l) => !l.control && l.key !== "headcount").map((l) => l.key));
  out.periods = periods.filter((p) => Object.keys(p.values).some((key) => input.has(key as LineKey))).sort((a, b) => a.date.localeCompare(b.date));
  if (!out.periods.length) out.errors.push(msg("Не заполнено ни одного периода"));
  if (out.mode === "нарастающим итогом с начала года") out.periods = toQuarterly(out.periods, out.warnings);
  for (const p of out.periods) out.warnings.push(...checkPeriod(p));
  if (out.inn && out.inn.length !== 14) out.warnings.push(msg("ИНН {inn}: ожидается 14 цифр", { inn: out.inn }));
  return out;
}

const FLOW = LINES.filter((l) => l.flow).map((l) => l.key);

/** Нарастающий итог → за квартал: из каждого периода вычитается предыдущий того же года. */
export function toQuarterly(periods: ReportedPeriod[], warnings: Msg[] = []): ReportedPeriod[] {
  return periods.map((p, i) => {
    const prev = periods[i - 1];
    const sameYear = prev && prev.date.slice(0, 4) === p.date.slice(0, 4);
    const firstOfYear = Number(p.date.slice(5, 7)) <= 3;
    if (!sameYear && !firstOfYear) warnings.push(msg("{at}: нет предыдущего периода того же года — доходы и расходы взяты нарастающим итогом", { at: fmtDate(p.date) }));
    if (!sameYear) return p;
    const values: Values = { ...p.values };
    for (const key of FLOW) if (p.values[key] != null) values[key] = (p.values[key] ?? 0) - (prev.values[key] ?? 0);
    return { date: p.date, values };
  });
}

export const fmtDate = (d: string) => d.split("-").reverse().join(".");
const money = (n: number) => r0(n).toLocaleString("ru-RU");

/** Самопроверка периода: сходятся ли итоги и не больше ли части, чем целое. */
export function checkPeriod(p: ReportedPeriod): Msg[] {
  const v = p.values, w: Msg[] = [], at = fmtDate(p.date);
  const g = (k: LineKey) => v[k] ?? 0;
  const tol = (a: number, b: number) => Math.abs(a - b) > Math.max(1, Math.abs(b) * 0.005);
  const current = g("cash") + g("investments") + g("receivables") + g("inventory") + g("otherCurrent");
  const assets = current + g("nonCurrent");
  if (v.currentTotal != null && tol(v.currentTotal, current)) w.push(msg("{at}: итого оборотные активы {a}, сумма строк Б1–Б5 — {b}", { at, a: money(v.currentTotal), b: money(current) }));
  if (v.assetsTotal != null && tol(v.assetsTotal, assets)) w.push(msg("{at}: итого активы {a}, по строкам — {b}", { at, a: money(v.assetsTotal), b: money(assets) }));
  const equity = assets - g("currentLiabilities") - g("longLiabilities");
  if (v.equity != null && tol(v.equity, equity)) w.push(msg("{at}: капитал {a}, а активы минус обязательства — {b}", { at, a: money(v.equity), b: money(equity) }));
  const parts = g("payStaff") + g("payBudget") + g("paySuppliers") + g("loansShort");
  if (parts > g("currentLiabilities") + 1) w.push(msg("{at}: строки Б10–Б13 ({a}) больше краткосрочных обязательств ({b})", { at, a: money(parts), b: money(g("currentLiabilities")) }));
  const pairs: Array<[LineKey, LineKey, string]> = [["odStaff", "payStaff", "П1"], ["odBudget", "payBudget", "П2"], ["odSuppliers", "paySuppliers", "П3"], ["odLenders", "loansShort", "П5"]];
  for (const [od, total, code] of pairs) if (g(od) > g(total) + 1) w.push(msg("{at}: просрочено по строке {code} {a} — больше, чем весь долг {b}", { at, code, a: money(g(od)), b: money(g(total)) }));
  if (g("odSuppliers90") > g("odSuppliers") + 1) w.push(msg("{at}: просрочка поставщикам дольше 90 дней больше всей просрочки поставщикам", { at }));
  if (v.netProfit == null && v.revenue != null) w.push(msg("{at}: не указана чистая прибыль (Д7)", { at }));
  const op = g("revenue") - g("cogs") - g("opex");
  if (v.operatingProfit != null && tol(v.operatingProfit, op)) w.push(msg("{at}: операционная прибыль {a}, а Д1 − Д2 − Д3 = {b}", { at, a: money(v.operatingProfit), b: money(op) }));
  if (v.netProfit != null && (v.revenue != null || v.otherNet != null) && tol(v.netProfit, op + g("otherNet") - g("incomeTax"))) {
    w.push(msg("{at}: чистая прибыль {a}, по строкам Д4 + Д5 − Д6 — {b}", { at, a: money(v.netProfit), b: money(op + g("otherNet") - g("incomeTax")) }));
  }
  for (const l of LINES) if (!l.control && l.key !== "retained" && l.key !== "netProfit" && l.key !== "otherNet" && l.key !== "operatingProfit" && (v[l.key] ?? 0) < 0) w.push(msg("{at}: {code} отрицательное ({a})", { at, code: l.code, a: money(v[l.key]!) }));
  return w;
}

// ── диагностика по отчётности ──────────────────────────────────────────────

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ratio = (a: number, b: number) => (Math.abs(b) < 0.005 ? null : Math.round((a / b) * 100) / 100);

export function balanceOf(v: Values): BalanceGroups {
  const g = (k: LineKey) => v[k] ?? 0;
  const currentAssets = g("cash") + g("investments") + g("receivables") + g("inventory") + g("otherCurrent");
  const totalAssets = currentAssets + g("nonCurrent");
  const liabilities = g("currentLiabilities") + g("longLiabilities");
  return {
    cash: r2(g("cash")), restricted: 0, investments: r2(g("investments")), receivables: r2(g("receivables")), inventory: r2(g("inventory")), advances: r2(g("otherCurrent")),
    currentAssets: r2(currentAssets), nonCurrent: r2(g("nonCurrent")), totalAssets: r2(totalAssets),
    currentLiabilities: r2(g("currentLiabilities")), longLiabilities: r2(g("longLiabilities")), liabilities: r2(liabilities),
    equity: r2(totalAssets - liabilities), liquid: r2(g("cash") + g("investments") + g("receivables")),
  };
}

const overdueOf = (v: Values) => ["odStaff", "odBudget", "odSuppliers", "odLenders", "odOther"].reduce((s, k) => s + (v[k as LineKey] ?? 0), 0);
const operating = (v: Values) => v.operatingProfit ?? (v.revenue ?? 0) - (v.cogs ?? 0) - (v.opex ?? 0);

/** Долги по видам из строк Б10–Б13 и раздела 3: возраст не известен, просрочка — как в отчёте. */
export function debtsOf(v: Values): Debt[] {
  const g = (k: LineKey) => v[k] ?? 0;
  const other = Math.max(0, g("currentLiabilities") - g("payStaff") - g("payBudget") - g("paySuppliers") - g("loansShort"));
  const rows: Array<[CreditorKind, number, number, number]> = [
    ["staff", g("payStaff"), g("odStaff"), 0], ["budget", g("payBudget"), g("odBudget"), 0],
    ["suppliers", g("paySuppliers"), g("odSuppliers"), g("odSuppliers90")], ["lenders", g("loansShort"), g("odLenders"), 0], ["other", other, g("odOther"), 0],
  ];
  return rows.filter(([, amount, od]) => amount > 0.005 || od > 0.005).map(([kind, amount, od, od90]) => ({
    key: `reported:${kind}`, creditor: CREDITOR_KIND[kind], kind, accounts: [], amount: r2(Math.max(amount, od)), oldest: "", age: 0, overdue: r2(od), overdue90: r2(od90),
  }));
}

/**
 * Диагностика на дату по последним `quarters` отчётным периодам не позже даты.
 * null — нет ни одного периода до этой даты.
 */
export function diagnoseReported(periods: ReportedPeriod[], asOf: string, quarters = 4): (Diagnosis & { reportedAt: string; headcount: number | null }) | null {
  const upto = [...periods].filter((p) => p.date <= asOf).sort((a, b) => a.date.localeCompare(b.date));
  if (!upto.length) return null;
  const shown = upto.slice(-Math.max(2, quarters));
  const last = upto[upto.length - 1];
  const balance = balanceOf(last.values);
  const months: MonthRow[] = shown.map((p) => {
    const b = balanceOf(p.values);
    return {
      month: p.date.slice(0, 7), date: p.date,
      current: ratio(b.currentAssets, b.currentLiabilities), quick: ratio(b.liquid, b.currentLiabilities), absolute: ratio(b.cash + b.investments, b.currentLiabilities),
      autonomy: ratio(b.equity, b.totalAssets), liquid: b.liquid, currentLiabilities: b.currentLiabilities, overdue: r2(overdueOf(p.values)), equity: b.equity,
      revenue: r2(p.values.revenue ?? 0), netProfit: r2(p.values.netProfit ?? 0), cashEnd: b.cash,
    };
  });
  const debts = debtsOf(last.values);
  const byKind = debts.map((d) => ({ kind: d.kind, label: CREDITOR_KIND[d.kind], amount: d.amount, overdue: d.overdue, count: 1 }));
  const overdue = r2(debts.reduce((s, d) => s + d.overdue, 0));
  const overdue90 = r2(debts.reduce((s, d) => s + d.overdue90, 0));
  // операционная прибыль за год: последние 4 квартала (меньше — пересчёт на год)
  const year = upto.slice(-4);
  const ebit12 = year.reduce((s, p) => s + operating(p.values), 0) * (4 / year.length);
  const altman = altmanZ(balance, last.values.retained ?? 0, ebit12);
  const terms = { staff: 0, budget: 0, quarterlyTax: 0, suppliers: 0, interest: 0, other: 0 };
  const { indicators, signals, verdict } = assess({ balance, byKind, overdue, overdue90, months, runway: null, altman, terms, reported: true });
  return {
    asOf: last.date, granularity: "quarter", source: "reported", reportedAt: last.date, headcount: last.values.headcount ?? null,
    months, balance, debts, totals: { debts: r2(debts.reduce((s, d) => s + d.amount, 0)), overdue, overdue90, byKind },
    indicators, altman, signals, verdict, runway: null, terms,
  };
}

/** Все тексты модуля, которые интерфейс переводит через t() (проверка кыргызского словаря). */
export const REPORTED_TEXTS: string[] = [
  ...LINES.map((l) => l.label), ...Object.values(SECTIONS), ...Object.values(HEAD), ...UNITS, ...MODES,
  "Не заполнено наименование предприятия", "Не найдена строка «Код» с датами периодов — используйте шаблон FinLite",
  "В строке «Код» нет дат периодов (например 30.09.2026)", "Одна и та же дата периода указана дважды", "{code}, {at}: «{value}» — не число, пропущено",
  "Не заполнено ни одного периода", "ИНН {inn}: ожидается 14 цифр", "{at}: нет предыдущего периода того же года — доходы и расходы взяты нарастающим итогом",
  "{at}: итого оборотные активы {a}, сумма строк Б1–Б5 — {b}", "{at}: итого активы {a}, по строкам — {b}", "{at}: капитал {a}, а активы минус обязательства — {b}",
  "{at}: строки Б10–Б13 ({a}) больше краткосрочных обязательств ({b})", "{at}: просрочено по строке {code} {a} — больше, чем весь долг {b}",
  "{at}: просрочка поставщикам дольше 90 дней больше всей просрочки поставщикам", "{at}: не указана чистая прибыль (Д7)",
  "{at}: операционная прибыль {a}, а Д1 − Д2 − Д3 = {b}", "{at}: чистая прибыль {a}, по строкам Д4 + Д5 − Д6 — {b}", "{at}: {code} отрицательное ({a})",
];
