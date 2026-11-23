// ════════════════════════════════════════════════════════════════════════
// lib/build/model.ts — раздел «Стройка»: объект, этапы, смета, документы
// по объекту и их проводки, анализ «смета — факт».
//
// Объект строительства хранит договор с заказчиком и смету из двух частей:
//   • работы — что сдаётся заказчику по КС-2 (объём × цена без НДС);
//   • ресурсы — плановые затраты: материалы (нормы расхода), труд, техника,
//     субподряд, прочее. Отсюда плановая себестоимость и маржа по этапам.
//
// Документы по объекту — проводки журнала (source «build»):
//   Списание материалов:  Дт 1630 — Кт 1620/1610 (по средней цене склада)
//   Затраты на объект:    Дт 1630 (+ Дт 1540 НДС) — Кт 3110 / 1110 / 1210,
//                         или перенос уже учтённых затрат: Дт 1630 — Кт 7120, 7130 …
//   Акт КС-2 заказчику:   Дт 1410 — Кт 6140 (+ Кт 3430 НДС 12 %) — выручка;
//                         Дт 7400 — Кт 1630 — себестоимость принятых работ:
//                         незавершённое производство объекта × доля акта
//                         в ещё не сданной сметной стоимости (последний акт
//                         или завершённый объект списывает весь остаток).
// Строки выручки 6140 несут наименование работ, объём и единицу — по ним
// же выгружается ЭСФ (акт услуг) в разделе «ЭСФ».
// ════════════════════════════════════════════════════════════════════════

import type { LedgerLine } from "@/lib/ledger/types";
import { itemKey } from "@/lib/ledger/stock";

export type CostType = "material" | "labor" | "machine" | "subcontract" | "other";
export const COST_LABEL: Record<CostType, string> = {
  material: "Материалы", labor: "Оплата труда", machine: "Машины и механизмы", subcontract: "Субподряд", other: "Прочие затраты",
};
export const COST_TYPES = Object.keys(COST_LABEL) as CostType[];

export interface Stage { id: string; name: string }
export interface EstWork { id: string; stageId: string; code?: string; name: string; unit: string; qty: number; price: number }
export interface EstResource { id: string; stageId: string; type: CostType; name: string; unit: string; qty: number; price: number }

export interface BuildObject {
  id: string;
  name: string;
  address?: string;
  /** заказчик (генподрядчик) */
  customer: string;
  customerInn?: string;
  /** инвестор, если отличается от заказчика */
  investor?: string;
  contractNo?: string;
  contractDate?: string;
  start?: string;
  end?: string;
  /** работы облагаются НДС 12 % */
  vat: boolean;
  /** гарантийное удержание заказчиком, % от суммы актов */
  retentionPct: number;
  /** аванс по договору, % */
  advancePct?: number;
  warrantyMonths?: number;
  status: "active" | "done";
  stages: Stage[];
  works: EstWork[];
  resources: EstResource[];
}

export type BDocType = "writeoff" | "cost" | "ks2";
export const BDOC_LABEL: Record<BDocType, string> = { writeoff: "Списание материалов", cost: "Затраты на объект", ks2: "Акт КС-2" };
export type CostPay = "credit" | "cash" | "bank" | "reclass";
export const COST_PAY_LABEL: Record<CostPay, string> = {
  credit: "Поставщику, субподрядчику — в долг", cash: "Из кассы", bank: "С расчётного счёта", reclass: "Перенос уже учтённых затрат",
};
/** счета, с которых переносятся на объект уже учтённые затраты (зарплата, взносы, амортизация, услуги …) */
export const RECLASS_ACCOUNTS = ["7120", "7130", "7150", "7160", "7170", "8040"];
const PAY_ACC: Record<Exclude<CostPay, "reclass">, string> = { credit: "3110", cash: "1110", bank: "1210" };

export interface BRow {
  stageId?: string;
  /** строка сметы работ (КС-2) */
  workId?: string;
  /** номер единичной расценки (КС-2) */
  code?: string;
  name: string;
  unit: string;
  qty: number;
  /** без НДС; у списания — средняя себестоимость единицы (считает сервер) */
  price: number;
  /** затраты: вид */
  costType?: CostType;
  /** затраты: НДС поставщика по строке, сом */
  vat?: number;
  /** списание: счёт запасов, откуда списан материал (считает сервер) */
  account?: string;
}

export interface BuildDoc {
  type: BDocType;
  objectId: string;
  number: string;
  date: string;
  /** КС-2: отчётный период */
  from?: string;
  to?: string;
  /** затраты: откуда */
  pay?: CostPay;
  party?: string;
  partyInn?: string;
  /** затраты, перенос: счёт, с которого переносится */
  reclass?: string;
  /** КС-2: акт последний — списать всё незавершённое производство объекта */
  final?: boolean;
  /** КС-2: себестоимость, списанная актом (считает сервер) */
  cost?: number;
  /** КС-2: та же себестоимость по этапам */
  costByStage?: Record<string, number>;
  comment?: string;
  rows: BRow[];
}

export const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;
export const newId = () => Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);

// ── смета ────────────────────────────────────────────────────────────────

export const workSum = (w: Pick<EstWork, "qty" | "price">) => r2(w.qty * w.price);
export const resSum = (r: Pick<EstResource, "qty" | "price">) => r2(r.qty * r.price);

export interface EstimateTotals { works: number; cost: number; byType: Record<CostType, number>; margin: number; marginPct: number | null }
export function estimateTotals(o: Pick<BuildObject, "works" | "resources">, stageId?: string): EstimateTotals {
  const works = r2(o.works.filter((w) => !stageId || w.stageId === stageId).reduce((s, w) => s + workSum(w), 0));
  const byType = Object.fromEntries(COST_TYPES.map((t) => [t, 0])) as Record<CostType, number>;
  for (const r of o.resources) if (!stageId || r.stageId === stageId) byType[r.type] = r2(byType[r.type] + resSum(r));
  const cost = r2(COST_TYPES.reduce((s, t) => s + byType[t], 0));
  return { works, cost, byType, margin: r2(works - cost), marginPct: works > 0 ? r2(((works - cost) / works) * 100) : null };
}

/** Проблемы, мешающие сохранить объект. */
export function validateObject(o: BuildObject): string[] {
  const p: string[] = [];
  if (!o.name.trim()) p.push("Укажите наименование объекта");
  if (!o.stages.length) p.push("Добавьте хотя бы один этап");
  const ids = new Set(o.stages.map((s) => s.id));
  o.stages.forEach((s, i) => { if (!s.name.trim()) p.push(`Этап ${i + 1}: укажите название`); });
  o.works.forEach((w, i) => {
    if (!w.name.trim()) p.push(`Работа ${i + 1}: укажите наименование`);
    if (!ids.has(w.stageId)) p.push(`Работа ${i + 1}: выберите этап`);
    if (!(w.qty >= 0) || !(w.price >= 0)) p.push(`Работа ${i + 1}: объём и цена не могут быть отрицательными`);
  });
  o.resources.forEach((r, i) => {
    if (!r.name.trim()) p.push(`Ресурс ${i + 1}: укажите наименование`);
    if (!ids.has(r.stageId)) p.push(`Ресурс ${i + 1}: выберите этап`);
    if (!(r.qty >= 0) || !(r.price >= 0)) p.push(`Ресурс ${i + 1}: количество и цена не могут быть отрицательными`);
  });
  if (!(o.retentionPct >= 0 && o.retentionPct <= 50)) p.push("Гарантийное удержание — от 0 до 50 %");
  return p;
}

/**
 * Строки, вставленные из Excel (через табуляцию или «;»): наименование, ед., количество, цена.
 * Номер расценки в начале строки («1.1», «ФЕР-…», «ЕНиР …») уходит в `code`.
 */
export function parsePasted(text: string): Array<{ code?: string; name: string; unit: string; qty: number; price: number }> {
  const num = (s: string | undefined) => { const n = Number(String(s ?? "").replace(/\s| /g, "").replace(",", ".")); return Number.isFinite(n) ? n : NaN; };
  const out: Array<{ code?: string; name: string; unit: string; qty: number; price: number }> = [];
  for (const raw of text.split(/\r?\n/)) {
    let cells = raw.split(raw.includes("\t") ? "\t" : ";").map((c) => c.trim());
    while (cells.length && !cells[cells.length - 1]) cells.pop();
    if (cells.length < 2) continue;
    // № п/п в первой колонке
    if (/^\d{1,4}\.?$/.test(cells[0]) && cells.length > 4) cells = cells.slice(1);
    let code: string | undefined;
    // шифр расценки: без пробелов, оканчивается цифрами («1.2», «ФЕР06-01-001-01»), за ним — наименование
    if (cells.length >= 5 && /^\S{0,12}\d[\d.\-]*$/.test(cells[0]) && /[a-zа-яё]{2}/i.test(cells[1]) && !Number.isFinite(num(cells[1]))) { code = cells[0]; cells = cells.slice(1); }
    const name = cells[0];
    if (!name || /^(итого|всего|наименование)/i.test(name)) continue;
    const nums = cells.slice(1).map(num);
    const unit = Number.isFinite(nums[0]) ? "" : cells[1];
    const rest = Number.isFinite(nums[0]) ? nums : nums.slice(1);
    const qty = rest[0], price = rest[1];
    if (!Number.isFinite(qty)) continue;
    out.push({ ...(code ? { code } : {}), name, unit: unit || "шт", qty: r3(qty), price: Number.isFinite(price) ? r2(price) : 0 });
  }
  return out;
}

// ── документы ────────────────────────────────────────────────────────────

export const rowAmount = (r: Pick<BRow, "qty" | "price">) => r2(r.qty * r.price);

export interface BDocTotals { net: number; vat: number; gross: number }
export function bdocTotals(d: BuildDoc, o?: Pick<BuildObject, "vat">): BDocTotals {
  const net = r2(d.rows.reduce((s, r) => s + rowAmount(r), 0));
  const vat = d.type === "ks2" ? (o?.vat ? r2(net * 0.12) : 0) : d.type === "cost" && d.pay !== "reclass" ? r2(d.rows.reduce((s, r) => s + (r.vat ?? 0), 0)) : 0;
  return { net, vat, gross: r2(net + vat) };
}

export function validateBuildDoc(d: BuildDoc, o: BuildObject | null): string[] {
  const p: string[] = [];
  if (!o) return ["Объект не найден"];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) p.push("Укажите дату документа");
  if (!d.number.trim()) p.push("Укажите номер документа");
  if (!d.rows.length) p.push("Добавьте хотя бы одну строку");
  d.rows.forEach((r, i) => {
    if (!r.name.trim()) p.push(`Строка ${i + 1}: укажите наименование`);
    if (!(r.qty > 0)) p.push(`Строка ${i + 1}: количество должно быть больше нуля`);
    if (d.type !== "writeoff" && !(r.price >= 0)) p.push(`Строка ${i + 1}: цена не может быть отрицательной`);
    if (r.stageId && !o.stages.some((s) => s.id === r.stageId)) p.push(`Строка ${i + 1}: этап не найден в смете`);
    if (r.vat != null && r.vat < 0) p.push(`Строка ${i + 1}: НДС не может быть отрицательным`);
  });
  if (d.type === "cost") {
    if (!d.pay) p.push("Укажите, откуда затраты");
    if (d.pay === "credit" && !d.party?.trim()) p.push("Укажите поставщика или субподрядчика");
    if (d.pay === "reclass" && !RECLASS_ACCOUNTS.includes(d.reclass ?? "")) p.push("Выберите счёт, с которого переносятся затраты");
    if (d.rows.some((r) => r.costType === "material")) p.push("Материалы списываются документом «Списание материалов» — со склада, с количеством");
  }
  if (d.type === "ks2") {
    if (d.from && d.to && d.from > d.to) p.push("Отчётный период: начало позже конца");
    if (!o.customer.trim()) p.push("В карточке объекта не указан заказчик");
  }
  if (!p.length && d.type !== "writeoff" && !(bdocTotals(d, o).gross > 0)) p.push("Сумма документа — ноль");
  return p;
}

export const bdocRef = (d: Pick<BuildDoc, "type" | "objectId" | "number">) => `${d.type}:${d.objectId}:${d.number.trim()}`;
export function parseRef(ref: string | null | undefined): { type: BDocType; objectId: string; number: string } | null {
  const m = /^(writeoff|cost|ks2):([^:]+):(.+)$/.exec(ref ?? "");
  return m ? { type: m[1] as BDocType, objectId: m[2], number: m[3] } : null;
}

export function bdocDescription(d: BuildDoc, o: Pick<BuildObject, "name" | "customer">): string {
  if (d.type === "ks2") return `Акт КС-2 № ${d.number}: ${o.customer || "заказчик"} — объект «${o.name}»`;
  if (d.type === "writeoff") return `Списание материалов № ${d.number} на объект «${o.name}»`;
  return `Затраты № ${d.number} на объект «${o.name}»${d.party?.trim() ? `: ${d.party.trim()}` : ""}`;
}

const stageName = (o: BuildObject, id?: string) => o.stages.find((s) => s.id === id)?.name;
const wipMemo = (o: BuildObject, r: BRow, extra?: string) => [`Объект «${o.name}»`, stageName(o, r.stageId), extra, r.name.trim()].filter(Boolean).join(" · ");

/** Проводка документа. Для списания цены и счета запасов уже проставлены сервером; для КС-2 — `cost`. */
export function bdocLines(d: BuildDoc, o: BuildObject): LedgerLine[] {
  const lines: LedgerLine[] = [];
  const party = d.party?.trim() || null, partyInn = d.partyInn?.replace(/\D/g, "") || null;
  if (d.type === "writeoff") {
    for (const r of d.rows) {
      const a = rowAmount(r);
      lines.push({ account: "1630", debit: a, credit: 0, memo: wipMemo(o, r, "материалы") });
      lines.push({ account: r.account || "1620", debit: 0, credit: a, item: r.name.trim(), qty: r3(r.qty), unit: r.unit });
    }
  } else if (d.type === "cost") {
    const t = bdocTotals(d, o);
    for (const r of d.rows) lines.push({ account: "1630", debit: rowAmount(r), credit: 0, memo: wipMemo(o, r, COST_LABEL[r.costType ?? "other"].toLowerCase()) });
    if (d.pay === "reclass") lines.push({ account: d.reclass!, debit: 0, credit: t.net, memo: `Перенос на объект «${o.name}»` });
    else {
      if (t.vat > 0) lines.push({ account: "1540", debit: t.vat, credit: 0 });
      lines.push({ account: PAY_ACC[d.pay ?? "credit"], debit: 0, credit: t.gross, party, partyInn });
    }
  } else {
    const t = bdocTotals(d, o);
    lines.push({ account: "1410", debit: t.gross, credit: 0, party: o.customer.trim() || null, partyInn: o.customerInn?.replace(/\D/g, "") || null, memo: `Объект «${o.name}», акт КС-2 № ${d.number}` });
    for (const r of d.rows) lines.push({ account: "6140", debit: 0, credit: rowAmount(r), item: r.name.trim(), qty: r3(r.qty), unit: r.unit });
    if (t.vat > 0) lines.push({ account: "3430", debit: 0, credit: t.vat });
    const parts = d.costByStage && Object.keys(d.costByStage).length ? Object.entries(d.costByStage) : [["", d.cost ?? 0] as [string, number]];
    for (const [sid, c] of parts) {
      if (!(c > 0)) continue;
      const st = stageName(o, sid);
      lines.push({ account: "7400", debit: c, credit: 0, memo: `Себестоимость работ по акту КС-2 № ${d.number}, объект «${o.name}»${st ? ` · ${st}` : ""}` });
      lines.push({ account: "1630", debit: 0, credit: c, memo: [`Объект «${o.name}»`, st, `списание по акту КС-2 № ${d.number}`].filter(Boolean).join(" · ") });
    }
  }
  return lines.filter((l) => l.debit > 0 || l.credit > 0);
}

/** Затраты документа на объект (без НДС) — для незавершённого производства и анализа. */
export const docCost = (d: BuildDoc) => (d.type === "ks2" ? 0 : r2(d.rows.reduce((s, r) => s + rowAmount(r), 0)));

/** Этап строки: указанный, этап работы по смете или первый этап объекта. */
export function rowStage(o: Pick<BuildObject, "stages" | "works">, r: BRow): string {
  return r.stageId || (r.workId && o.works.find((w) => w.id === r.workId)?.stageId) || o.stages[0]?.id || "";
}

/** Себестоимость, списанная актом, по этапам (у старых актов без разбивки — пропорционально сумме по этапам). */
export function actCostByStage(act: BuildDoc, o: BuildObject): Record<string, number> {
  if (act.costByStage && Object.keys(act.costByStage).length) return act.costByStage;
  const cost = act.cost ?? 0;
  if (!cost) return {};
  const net = new Map<string, number>();
  for (const r of act.rows) net.set(rowStage(o, r), (net.get(rowStage(o, r)) ?? 0) + rowAmount(r));
  const total = [...net.values()].reduce((s, x) => s + x, 0) || 1;
  return Object.fromEntries([...net].map(([s, x]) => [s, r2((cost * x) / total)]));
}

/**
 * Себестоимость, которую списывает акт КС-2, — по каждому этапу отдельно: незавершённое производство
 * этапа на дату акта (без самого акта) × доля акта в ещё не сданной сметной стоимости работ этапа.
 * Этап сдан полностью (или объём сверх сметы), акт отмечен «последний» или объект завершён — списывается
 * весь остаток этапа; у последнего акта — всех этапов объекта.
 */
export function ks2CostByStage(act: BuildDoc, o: BuildObject, others: BuildDoc[]): Record<string, number> {
  const before = others.filter((d) => d !== act && d.objectId === o.id && (d.date < act.date || (d.date === act.date && d.type !== "ks2")));
  const all = act.final || o.status === "done";
  const out: Record<string, number> = {};
  for (const s of o.stages) {
    const cost = before.filter((d) => d.type !== "ks2").reduce((a, d) => a + d.rows.filter((r) => rowStage(o, r) === s.id).reduce((b, r) => b + rowAmount(r), 0), 0);
    const written = before.filter((d) => d.type === "ks2").reduce((a, d) => a + (actCostByStage(d, o)[s.id] ?? 0), 0);
    const wip = r2(cost - written);
    if (wip <= 0) continue;
    const net = r2(act.rows.filter((r) => rowStage(o, r) === s.id).reduce((a, r) => a + rowAmount(r), 0));
    if (net <= 0 && !all) continue;
    const accepted = r2(before.filter((d) => d.type === "ks2").reduce((a, d) => a + d.rows.filter((r) => rowStage(o, r) === s.id).reduce((b, r) => b + rowAmount(r), 0), 0));
    const remaining = r2(estimateTotals(o, s.id).works - accepted);
    const share = all || remaining <= 0 || net >= remaining - 0.005 ? 1 : net / remaining;
    const c = r2(wip * share);
    if (c > 0) out[s.id] = c;
  }
  return out;
}

export function ks2Cost(act: BuildDoc, o: BuildObject, others: BuildDoc[]): number {
  return r2(Object.values(ks2CostByStage(act, o, others)).reduce((s, x) => s + x, 0));
}

/** Следующий номер документа данного вида по объекту. */
export function nextNumber(docs: Array<Pick<BuildDoc, "type" | "objectId" | "number">>, type: BDocType, objectId: string): string {
  let max = 0;
  for (const d of docs) if (d.type === type && d.objectId === objectId) { const n = Number(d.number); if (Number.isInteger(n) && n > max) max = n; }
  return String(max + 1);
}

// ── анализ «смета — факт» ───────────────────────────────────────────────

export interface StageFact {
  stageId: string; name: string;
  planWorks: number; planCost: number; planByType: Record<CostType, number>;
  factCost: number; factByType: Record<CostType, number>;
  accepted: number;
  /** себестоимость, списанная актами по этапу, и прибыль этапа */
  writtenOff: number;
  profit: number;
  /** доля сданных работ этапа, % */
  progress: number | null;
  /** перерасход (+) / экономия (−) затрат против плана на сданный объём */
  costVariance: number | null;
}
export interface MaterialFact {
  key: string; name: string; unit: string;
  planQty: number; planAmount: number; planPrice: number | null;
  factQty: number; factAmount: number; factPrice: number | null;
  /** перерасход количества (+) / экономия (−) */
  qtyVariance: number;
  qtyVariancePct: number | null;
  /** сколько ещё нужно по смете */
  needQty: number;
  onHand: number;
  /** докупить: потребность сверх остатка на складе */
  toBuy: number;
  /** все этапы, где материал заложен, сданы — отклонение окончательное */
  done: boolean;
  byStage: Array<{ stageId: string; planQty: number; factQty: number; factAmount: number }>;
}
export interface ObjectAnalysis {
  plan: EstimateTotals;
  accepted: number; acceptedVat: number; acceptedGross: number;
  progress: number | null;
  factCost: number; factByType: Record<CostType, number>;
  /** себестоимость, уже списанная актами */
  writtenOff: number;
  /** незавершённое производство */
  wip: number;
  /** прибыль по сданным актам */
  grossProfit: number;
  marginPct: number | null;
  /** прогноз затрат на весь объект: по смете и по текущему темпу */
  forecastBySmeta: number;
  forecastByPace: number | null;
  forecastMargin: number | null;
  retention: number;
  stages: StageFact[];
  materials: MaterialFact[];
  /** месяц → затраты и сдано */
  months: Array<{ month: string; cost: number; accepted: number }>;
  /** отклонения от сметы: цена и количество (материалы), ставка и выработка (труд, техника) */
  variances: VarianceReport;
  warnings: string[];
}

const money = (n: number) => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const dec = (n: number) => String(n).replace(".", ",");
const zero = () => Object.fromEntries(COST_TYPES.map((t) => [t, 0])) as Record<CostType, number>;

/**
 * Анализ объекта по смете и документам. `stock` — остатки материалов на складе
 * (наименование → количество), чтобы посчитать, сколько докупить.
 */
export function analyze(o: BuildObject, docs: BuildDoc[], stock: Map<string, number> = new Map(), to?: string): ObjectAnalysis {
  const ds = docs.filter((d) => d.objectId === o.id && (!to || d.date <= to));
  const plan = estimateTotals(o);
  const stageOfWork = new Map(o.works.map((w) => [w.id, w.stageId]));
  const firstStage = o.stages[0]?.id ?? "";
  const stageOf = (r: BRow) => r.stageId || (r.workId && stageOfWork.get(r.workId)) || firstStage;

  const st = new Map<string, StageFact>(o.stages.map((s) => {
    const e = estimateTotals(o, s.id);
    return [s.id, { stageId: s.id, name: s.name, planWorks: e.works, planCost: e.cost, planByType: e.byType, factCost: 0, factByType: zero(), accepted: 0, writtenOff: 0, profit: 0, progress: null, costVariance: null }];
  }));
  const factByType = zero();
  let accepted = 0, acceptedVat = 0, writtenOff = 0;
  const months = new Map<string, { cost: number; accepted: number }>();
  const month = (d: string) => { const m = months.get(d.slice(0, 7)) ?? { cost: 0, accepted: 0 }; months.set(d.slice(0, 7), m); return m; };

  const mats = new Map<string, MaterialFact>();
  const mat = (name: string, unit: string) => {
    const k = itemKey(name);
    const m = mats.get(k) ?? { key: k, name: name.trim(), unit, planQty: 0, planAmount: 0, planPrice: null, factQty: 0, factAmount: 0, factPrice: null, qtyVariance: 0, qtyVariancePct: null, needQty: 0, onHand: 0, toBuy: 0, done: false, byStage: [] };
    if (!m.unit && unit) m.unit = unit;
    mats.set(k, m);
    return m;
  };
  const matStage = (m: MaterialFact, stageId: string) => { let x = m.byStage.find((b) => b.stageId === stageId); if (!x) { x = { stageId, planQty: 0, factQty: 0, factAmount: 0 }; m.byStage.push(x); } return x; };
  for (const r of o.resources.filter((x) => x.type === "material")) {
    const m = mat(r.name, r.unit);
    m.planQty = r3(m.planQty + r.qty); m.planAmount = r2(m.planAmount + resSum(r));
    const b = matStage(m, r.stageId); b.planQty = r3(b.planQty + r.qty);
  }

  for (const d of ds) {
    if (d.type === "ks2") {
      const t = bdocTotals(d, o);
      accepted = r2(accepted + t.net); acceptedVat = r2(acceptedVat + t.vat); writtenOff = r2(writtenOff + (d.cost ?? 0));
      month(d.date).accepted = r2(month(d.date).accepted + t.net);
      for (const r of d.rows) { const s = st.get(stageOf(r)); if (s) s.accepted = r2(s.accepted + rowAmount(r)); }
      for (const [sid, c] of Object.entries(actCostByStage(d, o))) { const s = st.get(sid); if (s) s.writtenOff = r2(s.writtenOff + c); }
      continue;
    }
    for (const r of d.rows) {
      const a = rowAmount(r);
      const type: CostType = d.type === "writeoff" ? "material" : r.costType ?? "other";
      factByType[type] = r2(factByType[type] + a);
      const s = st.get(stageOf(r));
      if (s) { s.factCost = r2(s.factCost + a); s.factByType[type] = r2(s.factByType[type] + a); }
      month(d.date).cost = r2(month(d.date).cost + a);
      if (d.type === "writeoff") {
        const m = mat(r.name, r.unit);
        m.factQty = r3(m.factQty + r.qty); m.factAmount = r2(m.factAmount + a);
        const b = matStage(m, stageOf(r)); b.factQty = r3(b.factQty + r.qty); b.factAmount = r2(b.factAmount + a);
      }
    }
  }

  const factCost = r2(COST_TYPES.reduce((s, t) => s + factByType[t], 0));
  for (const s of st.values()) {
    s.progress = s.planWorks > 0 ? r2((s.accepted / s.planWorks) * 100) : null;
    s.profit = r2(s.accepted - s.writtenOff);
    // плановые затраты на сданный объём этапа против фактических
    s.costVariance = s.planWorks > 0 && s.accepted > 0 ? r2(s.factCost - s.planCost * Math.min(1, s.accepted / s.planWorks)) : null;
  }
  for (const m of mats.values()) {
    m.planPrice = m.planQty > 0 ? r2(m.planAmount / m.planQty) : null;
    m.factPrice = m.factQty > 0 ? r2(m.factAmount / m.factQty) : null;
    m.qtyVariance = r3(m.factQty - m.planQty);
    m.qtyVariancePct = m.planQty > 0 ? r2((m.factQty / m.planQty - 1) * 100) : null;
    m.needQty = r3(Math.max(0, m.planQty - m.factQty));
    m.onHand = r3(stock.get(m.key) ?? 0);
    m.toBuy = r3(Math.max(0, m.needQty - Math.max(0, m.onHand)));
    const planned = m.byStage.filter((b) => b.planQty > 0);
    m.done = planned.length > 0 && planned.every((b) => (st.get(b.stageId)?.progress ?? 0) >= 100);
  }

  const progress = plan.works > 0 ? r2((accepted / plan.works) * 100) : null;
  const forecastBySmeta = r2(Math.max(factCost, plan.cost));
  const share = plan.works > 0 ? accepted / plan.works : 0;
  // темп: затраты на сданное + НЗП относятся к сданному объёму и объёму в работе — грубая оценка по доле сданного
  const forecastByPace = share >= 0.1 ? r2((writtenOff / share)) : null;
  const forecastMargin = plan.works > 0 ? r2(plan.works - (forecastByPace ?? forecastBySmeta)) : null;

  const warnings: string[] = [];
  if (!o.works.length) warnings.push("В смете нет работ — доля сданного и себестоимость актов считаются без сметы: акт списывает всё незавершённое производство.");
  if (!o.resources.some((r) => r.type === "material")) warnings.push("В смете нет материалов — сравнение расхода с нормами недоступно.");
  for (const m of mats.values()) {
    if (m.planQty > 0 && m.qtyVariancePct != null && m.qtyVariancePct > 5 && m.factQty > m.planQty) warnings.push(`Перерасход «${m.name}»: ${dec(m.factQty)} ${m.unit} при норме ${dec(m.planQty)} (+${dec(m.qtyVariancePct)} %).`);
    if (m.planQty === 0 && m.factQty > 0) warnings.push(`«${m.name}» списан на объект, но в смете его нет.`);
  }
  if (accepted > plan.works + 0.005 && plan.works > 0) warnings.push("По актам сдано больше сметной стоимости работ — проверьте смету или оформите дополнительное соглашение.");
  if (factCost > plan.cost + 0.005 && plan.cost > 0) warnings.push(`Фактические затраты (${money(factCost)} сом) уже больше плановых по смете (${money(plan.cost)} сом).`);

  return {
    plan, accepted, acceptedVat, acceptedGross: r2(accepted + acceptedVat), progress,
    factCost, factByType, writtenOff, wip: r2(factCost - writtenOff),
    grossProfit: r2(accepted - writtenOff), marginPct: accepted > 0 ? r2(((accepted - writtenOff) / accepted) * 100) : null,
    forecastBySmeta, forecastByPace, forecastMargin,
    retention: r2((accepted + acceptedVat) * (o.retentionPct / 100)),
    stages: [...st.values()],
    materials: [...mats.values()].sort((a, b) => b.factAmount - a.factAmount || b.planAmount - a.planAmount),
    months: [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => ({ month: m, ...v })),
    variances: costVariances(o, ds, new Map([...st.values()].map((s) => [s.stageId, s.progress ?? 0]))),
    warnings,
  };
}

// ── отклонения от сметы ─────────────────────────────────────────────────

export interface VarianceRow {
  type: CostType;
  stageId: string;
  name: string;
  unit: string;
  planQty: number; planPrice: number | null; planAmount: number;
  factQty: number; factPrice: number | null; factAmount: number;
  /** отклонение по цене (ставке): (цена факт − цена сметы) × количество факт; + перерасход */
  priceVar: number | null;
  /** отклонение по количеству (выработке): (количество факт − норма) × цена сметы — только у сданных этапов */
  usageVar: number | null;
  /** затраты, которых нет в смете */
  outside: number;
  done: boolean;
}
export interface VarianceReport {
  rows: VarianceRow[];
  price: number;
  usage: number;
  outside: number;
  /** итог по сданным этапам: факт − смета */
  doneTotal: number;
  summary: string | null;
}

/**
 * Разложение отклонений факта от сметы. Материалы — по каждому материалу на этапе; труд, техника,
 * субподряд, прочее — по виду затрат на этапе. Цена считается по всему списанному; количество —
 * только по сданным этапам (у этапа в работе норма ещё не израсходована). Если у плана и факта
 * разные единицы, разложение невозможно — показывается только общее отклонение сданного этапа.
 */
export function costVariances(o: BuildObject, docs: BuildDoc[], progress: Map<string, number>): VarianceReport {
  const key = (type: CostType, stageId: string, name: string) => (type === "material" ? `m|${stageId}|${itemKey(name)}` : `${type}|${stageId}`);
  const rows = new Map<string, VarianceRow & { units: Set<string>; planUnits: Set<string> }>();
  const get = (type: CostType, stageId: string, name: string, unit: string) => {
    const k = key(type, stageId, name);
    let r = rows.get(k);
    if (!r) {
      r = { type, stageId, name: type === "material" ? name.trim() : COST_LABEL[type], unit, planQty: 0, planPrice: null, planAmount: 0, factQty: 0, factPrice: null, factAmount: 0, priceVar: null, usageVar: null, outside: 0, done: (progress.get(stageId) ?? 0) >= 100, units: new Set(), planUnits: new Set() };
      rows.set(k, r);
    }
    return r;
  };
  for (const res of o.resources) {
    const r = get(res.type, res.stageId, res.name, res.unit);
    r.planQty = r3(r.planQty + res.qty); r.planAmount = r2(r.planAmount + resSum(res)); r.planUnits.add(res.unit.toLowerCase());
  }
  const first = o.stages[0]?.id ?? "";
  for (const d of docs) {
    if (d.objectId !== o.id || d.type === "ks2") continue;
    for (const row of d.rows) {
      const type: CostType = d.type === "writeoff" ? "material" : row.costType ?? "other";
      const r = get(type, rowStage(o, row) || first, row.name, row.unit);
      r.factQty = r3(r.factQty + row.qty); r.factAmount = r2(r.factAmount + rowAmount(row)); r.units.add(row.unit.toLowerCase());
    }
  }
  let price = 0, usage = 0, outside = 0, doneTotal = 0;
  for (const r of rows.values()) {
    r.planPrice = r.planQty > 0 ? r2(r.planAmount / r.planQty) : null;
    r.factPrice = r.factQty > 0 ? r2(r.factAmount / r.factQty) : null;
    if (r.done) doneTotal = r2(doneTotal + r.factAmount - r.planAmount);
    if (!r.planAmount) { r.outside = r.factAmount; outside = r2(outside + r.outside); continue; }
    const sameUnits = r.units.size <= 1 && r.planUnits.size === 1 && (!r.units.size || [...r.units][0] === [...r.planUnits][0]);
    if (sameUnits && r.planPrice != null && r.factQty > 0) {
      r.priceVar = r2(r.factAmount - r.planPrice * r.factQty);
      if (r.done) r.usageVar = r2((r.factQty - r.planQty) * r.planPrice);
    } else if (r.done) r.usageVar = r2(r.factAmount - r.planAmount); // разные единицы — только общее отклонение
    price = r2(price + (r.priceVar ?? 0)); usage = r2(usage + (r.usageVar ?? 0));
  }
  const list = [...rows.values()].map(({ units: _u, planUnits: _p, ...r }) => r)
    .filter((r) => r.factAmount || r.planAmount)
    .sort((a, b) => Math.abs((b.priceVar ?? 0) + (b.usageVar ?? 0) + b.outside) - Math.abs((a.priceVar ?? 0) + (a.usageVar ?? 0) + a.outside));
  const money = (n: number) => `${n > 0 ? "+" : n < 0 ? "−" : ""}${Math.round(Math.abs(n)).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ")}`;
  const summary = list.some((r) => r.factAmount)
    ? `Отклонение от сметы: из-за цен ${money(price)} сом, из-за количества (по сданным этапам) ${money(usage)} сом, затраты вне сметы ${money(outside)} сом.`
    : null;
  return { rows: list, price, usage, outside, doneTotal, summary };
}

/** КС-3: стоимость работ по этапам — с начала работ, с начала года, за отчётный период (без НДС). */
export interface Ks3Row { stageId: string; name: string; fromStart: number; fromYear: number; period: number }
export function ks3Rows(o: BuildObject, docs: BuildDoc[], act: BuildDoc): Ks3Row[] {
  const acts = docs.filter((d) => d.type === "ks2" && d.objectId === o.id && (d.date < act.date || (d.date === act.date && Number(d.number) <= Number(act.number)) || d === act));
  const stageOfWork = new Map(o.works.map((w) => [w.id, w.stageId]));
  const y = act.date.slice(0, 4);
  const rows = new Map<string, Ks3Row>(o.stages.map((s) => [s.id, { stageId: s.id, name: s.name, fromStart: 0, fromYear: 0, period: 0 }]));
  for (const d of acts) for (const r of d.rows) {
    const sid = r.stageId || (r.workId && stageOfWork.get(r.workId)) || o.stages[0]?.id || "";
    const row = rows.get(sid) ?? rows.set(sid, { stageId: sid, name: "Прочие работы", fromStart: 0, fromYear: 0, period: 0 }).get(sid)!;
    const a = rowAmount(r);
    row.fromStart = r2(row.fromStart + a);
    if (d.date.startsWith(y)) row.fromYear = r2(row.fromYear + a);
    if (d === act || (d.number === act.number && d.date === act.date)) row.period = r2(row.period + a);
  }
  return [...rows.values()].filter((r) => r.fromStart !== 0);
}

// ── пример объекта ──────────────────────────────────────────────────────

/** Небольшой объект для знакомства: склад 32 м² и санузел — смета работ и норм материалов. */
export function sampleObject(today: string): BuildObject {
  const s1 = newId(), s2 = newId();
  // работы начаты в прошлом месяце: документы примера уже в прошлом
  const [y, mo] = today.split("-").map(Number);
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  const end = `${y}-${String(mo).padStart(2, "0")}-28`;
  return {
    id: newId(), name: "Пример: склад 32 м² и санузел", address: "г. Бишкек, ул. Примерная, 1",
    customer: "ОсОО «Заказчик-пример»", customerInn: "", contractNo: "1", contractDate: `${prev}-01`,
    start: `${prev}-01`, end, vat: false, retentionPct: 5, advancePct: 30, warrantyMonths: 12, status: "active",
    stages: [{ id: s1, name: "Этап 1. Склад: каркас, обшивка, утепление" }, { id: s2, name: "Этап 2. Санузел: демонтаж и плитка" }],
    works: [
      { id: newId(), stageId: s1, code: "1.1", name: "Монтаж каркаса из бруса", unit: "м2", qty: 32, price: 4500 },
      { id: newId(), stageId: s1, code: "1.2", name: "Обшивка стен, пола и потолка с утеплением 100 мм", unit: "м2", qty: 32, price: 11125 },
      { id: newId(), stageId: s2, code: "2.1", name: "Демонтаж и укладка плитки санузла", unit: "м", qty: 8, price: 7500 },
    ],
    resources: [
      { id: newId(), stageId: s1, type: "material", name: "Брус 100×100", unit: "м3", qty: 2.4, price: 22000 },
      { id: newId(), stageId: s1, type: "material", name: "Плита OSB 12 мм", unit: "лист", qty: 60, price: 1450 },
      { id: newId(), stageId: s1, type: "material", name: "Утеплитель минвата 100 мм", unit: "м2", qty: 100, price: 420 },
      { id: newId(), stageId: s1, type: "labor", name: "Бригада плотников", unit: "чел.-дн", qty: 40, price: 2500 },
      { id: newId(), stageId: s1, type: "machine", name: "Доставка и подъём материалов", unit: "рейс", qty: 4, price: 3500 },
      { id: newId(), stageId: s2, type: "material", name: "Плитка керамическая", unit: "м2", qty: 14, price: 1100 },
      { id: newId(), stageId: s2, type: "material", name: "Клей плиточный", unit: "мешок", qty: 12, price: 450 },
      { id: newId(), stageId: s2, type: "labor", name: "Плиточник", unit: "чел.-дн", qty: 6, price: 3000 },
    ],
  };
}

/** Документы демо-объекта: списания, затраты и два акта — чтобы анализ было видно без ввода данных. */
export function sampleDocs(o: BuildObject): BuildDoc[] {
  const [s1, s2] = o.stages.map((s) => s.id);
  const m = (d: number) => `${o.start!.slice(0, 8)}${String(d).padStart(2, "0")}`;
  const docs: BuildDoc[] = [
    { type: "writeoff", objectId: o.id, number: "1", date: m(3), rows: [
      { stageId: s1, name: "Брус 100×100", unit: "м3", qty: 2.6, price: 21800, account: "1620" },
      { stageId: s1, name: "Плита OSB 12 мм", unit: "лист", qty: 34, price: 1480, account: "1620" },
    ] },
    { type: "cost", objectId: o.id, number: "1", date: m(5), pay: "credit", party: "ИП «Доставка-пример»", rows: [{ stageId: s1, costType: "machine", name: "Доставка и подъём материалов", unit: "рейс", qty: 5, price: 3500 }] },
    { type: "writeoff", objectId: o.id, number: "2", date: m(10), rows: [
      { stageId: s1, name: "Плита OSB 12 мм", unit: "лист", qty: 31, price: 1480, account: "1620" },
      { stageId: s1, name: "Утеплитель минвата 100 мм", unit: "м2", qty: 96, price: 430, account: "1620" },
      { stageId: s1, name: "Саморезы по дереву", unit: "кг", qty: 6, price: 320, account: "1620" },
    ] },
    { type: "cost", objectId: o.id, number: "2", date: m(14), pay: "reclass", reclass: "7120", rows: [{ stageId: s1, costType: "labor", name: "Зарплата бригады плотников", unit: "чел.-дн", qty: 44, price: 2500 }] },
    { type: "ks2", objectId: o.id, number: "1", date: m(15), from: m(1), to: m(15), rows: o.works.filter((w) => w.stageId === s1).map((w) => ({ workId: w.id, stageId: s1, code: w.code, name: w.name, unit: w.unit, qty: w.qty, price: w.price })) },
    { type: "writeoff", objectId: o.id, number: "3", date: m(18), rows: [
      { stageId: s2, name: "Плитка керамическая", unit: "м2", qty: 9, price: 1150, account: "1620" },
      { stageId: s2, name: "Клей плиточный", unit: "мешок", qty: 7, price: 450, account: "1620" },
    ] },
    { type: "cost", objectId: o.id, number: "3", date: m(20), pay: "reclass", reclass: "7120", rows: [{ stageId: s2, costType: "labor", name: "Плиточник", unit: "чел.-дн", qty: 3, price: 3000 }] },
    { type: "ks2", objectId: o.id, number: "2", date: m(22), from: m(16), to: m(22), rows: o.works.filter((w) => w.stageId === s2).map((w) => ({ workId: w.id, stageId: s2, code: w.code, name: w.name, unit: w.unit, qty: Math.round(w.qty * 0.5 * 1000) / 1000, price: w.price })) },
  ];
  const done: BuildDoc[] = [];
  for (const d of docs) { if (d.type === "ks2") { d.costByStage = ks2CostByStage(d, o, done); d.cost = r2(Object.values(d.costByStage).reduce((s, x) => s + x, 0)); } done.push(d); }
  return docs;
}
