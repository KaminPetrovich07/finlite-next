// ════════════════════════════════════════════════════════════════════════
// lib/mgmt/model.ts — управленческий учёт, этап 1: аналитики (сегменты) и
// отчёт о прибылях и убытках по сегментам с распределением общих затрат.
//
// Три вида аналитики: подразделение (центр финансовой ответственности),
// проект / объект, направление деятельности. Каждая проводка получает
// значение аналитики:
//   1) явная разметка — бухгалтер выбрал значение для проводки;
//   2) объект строительства — проводки раздела «Стройка» сами относятся
//      к своему объекту (вид «проект / объект»);
//   3) правила — счёт, контрагент, слова в описании, источник проводки;
//      первое подходящее правило задаёт значение.
// Что не размечено, остаётся «общим»: операционные затраты распределяются
// по выбранной базе (выручка, прямые затраты, поровну, проценты вручную),
// неоперационные статьи и налог на прибыль остаются на уровне компании.
// ════════════════════════════════════════════════════════════════════════

import { getAccount, type PlRole } from "@/lib/ledger/accounts";
import type { EntrySource, LedgerEntry } from "@/lib/ledger/types";

export type DimKind = "dept" | "project" | "line";
export const DIM_KINDS: DimKind[] = ["dept", "project", "line"];
export const DIM_LABEL: Record<DimKind, string> = { dept: "Подразделение (ЦФО)", project: "Проект / объект", line: "Направление" };
export const DIM_SHORT: Record<DimKind, string> = { dept: "Подразделение", project: "Проект", line: "Направление" };

export interface DimValue {
  id: string;
  kind: DimKind;
  name: string;
  code?: string;
  /** центр прибыли (есть выручка) или центр затрат */
  role?: "profit" | "cost";
  archived?: boolean;
  /** значение создано программой (объект строительства) — правится в своём разделе */
  auto?: boolean;
}
export type Tags = Partial<Record<DimKind, string>>;

export interface Rule {
  id: string;
  /** счёт или его начало: «8030», «71» */
  account?: string;
  /** контрагент содержит */
  party?: string;
  /** описание проводки или строки содержит */
  text?: string;
  source?: EntrySource;
  set: Tags;
}

export type AllocBase = "revenue" | "direct" | "equal" | "manual" | "none";
export const ALLOC_LABEL: Record<AllocBase, string> = {
  revenue: "пропорционально выручке", direct: "пропорционально прямым затратам", equal: "поровну", manual: "вручную, %", none: "не распределять",
};
export interface AllocSetting { base: AllocBase; /** id значения → % (для «вручную») */ manual?: Record<string, number> }

export interface MgmtSettings {
  dims: DimValue[];
  rules: Rule[];
  alloc: Partial<Record<DimKind, AllocSetting>>;
  /** счёт → доля переменных затрат, % (маржинальный анализ); нет — по умолчанию (lib/mgmt/marginal.ts) */
  behavior?: Record<string, number>;
}
export const emptySettings = (): MgmtSettings => ({ dims: [], rules: [], alloc: {} });

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
const low = (s: string | null | undefined) => (s ?? "").toLowerCase().replace(/ё/g, "е");

/** Значение «Проект / объект» для объекта строительства. */
export const buildValueId = (objectId: string) => `build:${objectId}`;
const BUILD_REF = /^(?:writeoff|cost|ks2):([^:]+):/;

// ── разметка ─────────────────────────────────────────────────────────────

export type TagOrigin = "manual" | "build" | "rule";
export interface EffectiveTags { tags: Tags; origin: Partial<Record<DimKind, TagOrigin>> }

export function ruleMatches(r: Rule, e: Pick<LedgerEntry, "description" | "source" | "lines">): boolean {
  if (!r.account && !r.party && !r.text && !r.source) return false;
  if (r.source && e.source !== r.source) return false;
  if (r.account && !e.lines.some((l) => l.account.startsWith(r.account!.trim()))) return false;
  if (r.party && !e.lines.some((l) => low(l.party).includes(low(r.party).trim()) || (l.partyInn && l.partyInn === r.party!.trim()))) return false;
  if (r.text) {
    const t = low(r.text).trim();
    if (!low(e.description).includes(t) && !e.lines.some((l) => low(l.memo).includes(t) || low(l.item).includes(t))) return false;
  }
  return true;
}

/** Значения аналитик проводки: явная разметка → объект строительства → первое подходящее правило (по каждому виду). */
export function effectiveTags(e: Pick<LedgerEntry, "id" | "description" | "source" | "sourceRef" | "lines">, manual: Tags | undefined, s: MgmtSettings, valid?: Set<string>): EffectiveTags {
  const tags: Tags = {}, origin: EffectiveTags["origin"] = {};
  const ok = (id: string | undefined) => !!id && (!valid || valid.has(id));
  for (const k of DIM_KINDS) if (ok(manual?.[k])) { tags[k] = manual![k]; origin[k] = "manual"; }
  if (!tags.project && e.source === "build") {
    const m = BUILD_REF.exec(e.sourceRef ?? "");
    if (m && ok(buildValueId(m[1]))) { tags.project = buildValueId(m[1]); origin.project = "build"; }
  }
  for (const r of s.rules) {
    if (DIM_KINDS.every((k) => tags[k] || !r.set[k])) continue;
    if (!ruleMatches(r, e)) continue;
    for (const k of DIM_KINDS) if (!tags[k] && ok(r.set[k])) { tags[k] = r.set[k]; origin[k] = "rule"; }
  }
  return { tags, origin };
}

// ── отчёт по сегментам ───────────────────────────────────────────────────

export type SegRow = "revenue" | "cogs" | "gross" | "selling" | "admin" | "otherOp" | "direct" | "allocated" | "operating" | "nonOp" | "tax" | "net";
export const SEG_ROWS: SegRow[] = ["revenue", "cogs", "gross", "selling", "admin", "otherOp", "direct", "allocated", "operating", "nonOp", "tax", "net"];
export const SEG_ROW_LABEL: Record<SegRow, string> = {
  revenue: "Выручка",
  cogs: "Себестоимость продаж",
  gross: "Валовая прибыль",
  selling: "Расходы по реализации",
  admin: "Административные расходы",
  otherOp: "Прочие операционные доходы и расходы",
  direct: "Прибыль сегмента до распределения (вклад)",
  allocated: "Распределённые общие затраты",
  operating: "Операционная прибыль после распределения",
  nonOp: "Неоперационные доходы и расходы",
  tax: "Налог на прибыль (единый налог)",
  net: "Чистая прибыль",
};
/** знак: доходы +, расходы − */
const ROLE_ROW: Record<PlRole, SegRow> = {
  revenue: "revenue", otherOpIncome: "otherOp", cogs: "cogs", selling: "selling", otherOpExpense: "otherOp", admin: "admin",
  nonOpIncome: "nonOp", nonOpExpense: "nonOp", extraordinaryIncome: "nonOp", extraordinaryExpense: "nonOp", incomeTax: "tax",
};

export interface SegColumn {
  id: string;                 // id значения; "" — не распределено
  name: string;
  role?: "profit" | "cost";
  revenue: number; cogs: number; gross: number; selling: number; admin: number; otherOp: number;
  direct: number;             // вклад сегмента: выручка − прямые затраты (без распределения)
  allocated: number;          // доля общих затрат (−)
  operating: number;
  nonOp: number; tax: number; net: number;
  grossPct: number | null;    // валовая маржа, %
  operatingPct: number | null;
  share: number | null;       // доля в выручке, %
  allocShare: number | null;  // доля в распределении, %
  entries: number;
}
export interface SegReport {
  kind: DimKind;
  base: AllocBase;
  columns: SegColumn[];       // сегменты + «не распределено»
  total: SegColumn;
  /** общие операционные затраты, которые распределены */
  pool: number;
  untagged: number;           // проводок с P&L без значения этого вида
  warnings: string[];
}

const blank = (id: string, name: string, role?: "profit" | "cost"): SegColumn => ({
  id, name, role, revenue: 0, cogs: 0, gross: 0, selling: 0, admin: 0, otherOp: 0, direct: 0, allocated: 0, operating: 0, nonOp: 0, tax: 0, net: 0,
  grossPct: null, operatingPct: null, share: null, allocShare: null, entries: 0,
});

export function roleOf(code: string): PlRole | undefined {
  const a = getAccount(code) ?? getAccount(code.split(".")[0]);
  if (!a || (a.type !== "income" && a.type !== "expense")) return undefined;
  return a.pl;
}

/**
 * Отчёт о прибылях и убытках по значениям аналитики `kind` за период [from, to].
 * Общие (неразмеченные) операционные затраты — себестоимость, реализация, административные, прочие —
 * распределяются по базе; неоперационные статьи и налог остаются в колонке «Общее».
 */
export function segmentReport(entries: LedgerEntry[], from: string, to: string, kind: DimKind, s: MgmtSettings, manual: Map<string, Tags>): SegReport {
  const dims = s.dims.filter((d) => d.kind === kind);
  const valid = new Set(s.dims.map((d) => d.id));
  const cols = new Map<string, SegColumn>(dims.map((d) => [d.id, blank(d.id, d.name, d.role)]));
  const common = blank("", "Общее (не распределено)");
  let untagged = 0;
  for (const e of entries) {
    if (e.date < from || e.date > to || e.source === "closing") continue;
    const pl = e.lines.filter((l) => roleOf(l.account));
    if (!pl.length) continue;
    const id = effectiveTags(e, manual.get(e.id), s, valid).tags[kind] ?? "";
    const c = (id && cols.get(id)) || common;
    if (c === common) untagged++;
    c.entries++;
    for (const l of pl) {
      const role = roleOf(l.account)!;
      const a = getAccount(l.account) ?? getAccount(l.account.split(".")[0])!;
      const v = a.type === "income" ? l.credit - l.debit : -(l.debit - l.credit); // доход +, расход −
      const row = ROLE_ROW[role];
      (c as unknown as Record<string, number>)[row] = r2((c as unknown as Record<string, number>)[row] + v);
    }
  }
  const all = [...cols.values()];
  for (const c of [...all, common]) {
    c.gross = r2(c.revenue + c.cogs);
    c.direct = r2(c.gross + c.selling + c.admin + c.otherOp);
  }
  // общие операционные затраты (отрицательные статьи «Общего») — к распределению
  const pool = r2(Math.min(0, common.cogs) + Math.min(0, common.selling) + Math.min(0, common.admin) + Math.min(0, common.otherOp));
  const setting = s.alloc[kind] ?? { base: "revenue" as AllocBase };
  const base = all.length ? setting.base : "none";
  const warnings: string[] = [];
  const weights = new Map<string, number>();
  if (base === "revenue") all.forEach((c) => weights.set(c.id, Math.max(0, c.revenue)));
  else if (base === "direct") all.forEach((c) => weights.set(c.id, Math.max(0, -(c.cogs + c.selling + c.admin + Math.min(0, c.otherOp)))));
  else if (base === "equal") all.forEach((c) => weights.set(c.id, c.entries > 0 || c.revenue ? 1 : 0));
  else if (base === "manual") all.forEach((c) => weights.set(c.id, Math.max(0, setting.manual?.[c.id] ?? 0)));
  let wsum = [...weights.values()].reduce((a, b) => a + b, 0);
  if (base === "manual" && wsum > 0 && Math.abs(wsum - 100) > 0.01) warnings.push(`Проценты распределения вручную в сумме дают ${r2(wsum)} %, а не 100 % — доли пересчитаны пропорционально.`);
  if (base !== "none" && pool < 0 && wsum <= 0) { warnings.push("База распределения у всех сегментов нулевая — общие затраты распределены поровну."); all.forEach((c) => weights.set(c.id, 1)); wsum = all.length; }
  let left = pool;
  if (base !== "none" && pool < 0 && wsum > 0) {
    const order = all.filter((c) => (weights.get(c.id) ?? 0) > 0);
    order.forEach((c, i) => {
      const part = i === order.length - 1 ? r2(left) : r2((pool * (weights.get(c.id) ?? 0)) / wsum);
      c.allocated = part; left = r2(left - part);
      c.allocShare = r2(((weights.get(c.id) ?? 0) / wsum) * 100);
    });
    common.allocated = r2(-pool);
  }
  const totalRevenue = r2(all.reduce((a, c) => a + c.revenue, 0) + common.revenue);
  for (const c of [...all, common]) {
    c.operating = r2(c.direct + c.allocated);
    // валовая маржа без своей себестоимости при общей себестоимости — не показатель
    const noOwnCogs = c !== common && c.cogs === 0 && common.cogs !== 0;
    c.net = r2(c.operating + c.nonOp + c.tax);
    c.grossPct = c.revenue > 0 && !noOwnCogs ? r2((c.gross / c.revenue) * 100) : null;
    c.operatingPct = c.revenue > 0 ? r2((c.operating / c.revenue) * 100) : null;
    c.share = totalRevenue > 0 ? r2((c.revenue / totalRevenue) * 100) : null;
  }
  const total = blank("total", "Итого");
  for (const c of [...all, common]) for (const k of ["revenue", "cogs", "gross", "selling", "admin", "otherOp", "direct", "nonOp", "tax", "net", "entries"] as const) total[k] = r2(total[k] + c[k]);
  total.operating = r2(total.direct);
  total.grossPct = total.revenue > 0 ? r2((total.gross / total.revenue) * 100) : null;
  total.operatingPct = total.revenue > 0 ? r2((total.operating / total.revenue) * 100) : null;
  total.share = total.revenue > 0 ? 100 : null;

  if (!dims.length) warnings.push(`Нет значений аналитики «${DIM_LABEL[kind]}» — добавьте их на вкладке «Аналитики».`);
  if (common.revenue > 0 && all.length) warnings.push(`Выручка ${fmt(common.revenue)} сом не отнесена ни к одному сегменту — разметьте эти проводки или добавьте правило.`);
  for (const c of all) if (c.role === "profit" && c.revenue <= 0 && c.entries > 0) warnings.push(`«${c.name}» — центр прибыли, но выручки за период нет.`);
  for (const c of all) if (c.revenue > 0 && c.operating < 0) warnings.push(`«${c.name}» убыточен после распределения общих затрат: ${fmt(c.operating)} сом (вклад до распределения ${fmt(c.direct)}).`);
  const shown = all.filter((c) => c.entries > 0 || c.revenue !== 0);
  return { kind, base, columns: [...shown, ...(common.entries > 0 ? [common] : [])], total, pool: r2(-pool), untagged, warnings };
}

const fmt = (n: number) => Math.round(n).toString().replace("-", "−").replace(/\B(?=(\d{3})+(?!\d))/g, " ");

/** Проблемы, мешающие сохранить настройки. */
export function validateSettings(s: MgmtSettings): string[] {
  const p: string[] = [];
  const names = new Set<string>();
  for (const d of s.dims) {
    if (!d.name.trim()) p.push(`${DIM_SHORT[d.kind]}: пустое название`);
    const k = `${d.kind}|${low(d.name).trim()}`;
    if (names.has(k)) p.push(`${DIM_SHORT[d.kind]} «${d.name}» уже есть`);
    names.add(k);
  }
  const ids = new Set(s.dims.map((d) => d.id));
  s.rules.forEach((r, i) => {
    if (!r.account?.trim() && !r.party?.trim() && !r.text?.trim() && !r.source) p.push(`Правило ${i + 1}: задайте хотя бы одно условие`);
    if (!DIM_KINDS.some((k) => r.set[k])) p.push(`Правило ${i + 1}: выберите, какое значение ставить`);
    for (const k of DIM_KINDS) if (r.set[k] && !ids.has(r.set[k]!) && !r.set[k]!.startsWith("build:")) p.push(`Правило ${i + 1}: значение не найдено`);
  });
  return p;
}

// ── демо ─────────────────────────────────────────────────────────────────

/** Настройки для демо-мебельщика: цех, салон, администрация; направления B2B и розница. */
export function demoSettings(): MgmtSettings {
  const d = (id: string, kind: DimKind, name: string, role?: "profit" | "cost"): DimValue => ({ id, kind, name, role });
  return {
    dims: [
      d("ws", "dept", "Производственный цех", "cost"), d("sales", "dept", "Отдел корпоративных продаж", "profit"), d("salon", "dept", "Выставочный салон", "profit"), d("office", "dept", "Администрация", "cost"),
      d("b2b", "line", "Корпоративные заказы (B2B)", "profit"), d("retail", "line", "Розница через салон", "profit"),
    ],
    rules: [
      { id: "r1", text: "Розничные продажи", set: { line: "retail", dept: "salon" } },
      { id: "r2", text: "Безналичная оплата заказов", set: { line: "b2b", dept: "sales" } },
      { id: "r3", text: "Отгрузка партии", set: { line: "b2b", dept: "sales" } },
      { id: "r4", account: "8030", set: { dept: "salon", line: "retail" } },
      { id: "r5", account: "7510", set: { dept: "salon", line: "retail" } },
      { id: "r6", account: "7540", set: { line: "b2b", dept: "sales" } },
      { id: "r7", account: "71", set: { dept: "ws" } },
      { id: "r8", account: "70", set: { dept: "ws" } },
      { id: "r9", account: "80", set: { dept: "office" } },
      { id: "r10", account: "84", set: { dept: "office" } },
    ],
    alloc: { line: { base: "revenue" }, dept: { base: "none" }, project: { base: "direct" } },
  };
}
