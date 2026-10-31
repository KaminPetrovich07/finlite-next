// ════════════════════════════════════════════════════════════════════════
// lib/costing/calc.ts — калькуляция фактической себестоимости продукции.
//
//   журнал проводок ─► затраты периода по статьям:
//      материалы        Кт 1620/17xx в производство (1630/1640/71xx), Дт 7110
//      оплата труда     Дт 7120 (и Дт 1630/1640 Кт 3520)
//      взносы в СФ      Дт 7130 (и Дт 1630/1640 Кт 3530)
//      ОПР              Дт 7140–7170 (коммунальные, амортизация, ремонт, прочие)
//   нормы по изделиям ─► распределение:
//      материалы  — пропорционально нормативной стоимости материалов;
//      труд       — пропорционально нормативной зарплате на выпуск;
//      взносы     — пропорционально распределённому труду;
//      ОПР        — по базе из учётной политики (ПП № 609, п. 23).
// Административные расходы и расходы на продажу в себестоимость не входят.
// Чистые функции, без базы данных.
// ════════════════════════════════════════════════════════════════════════

import type { LedgerEntry } from "@/lib/ledger/types";
import { itemKey } from "@/lib/ledger/stock";
import type { CostingMethod, OverheadBase } from "@/lib/policy/types";

export interface MaterialNorm { name: string; unit: string; qty: number; price: number }

export interface Product {
  id: string;
  name: string;
  unit: string;
  price: number;           // цена продажи за единицу, сом
  laborPerUnit: number;    // нормативная зарплата производственных рабочих на единицу, сом
  machineHours: number;    // машино-часы на единицу
  materials: MaterialNorm[];
}

export interface Pools {
  materials: number;
  labor: number;
  social: number;
  overhead: number;
  overheadBy: Record<string, number>;
  /** оприходовано готовой продукции в журнале (Дт 1640) — для сверки */
  outputPosted: number;
  /** списано в производство по номенклатуре (если в журнале есть наименование и количество) */
  usage?: Record<string, { name: string; unit: string; qty: number; amount: number }>;
}

/** Расход материала в натуре: факт против нормы на фактический выпуск, отклонение по количеству и по цене. */
export interface MaterialUse {
  name: string;
  unit: string;
  normQty: number;
  actualQty: number;
  normPrice: number;
  actualPrice: number | null;
  normAmount: number;
  actualAmount: number;
  qtyPct: number | null;
  /** влияние количества: (Qф − Qн) × Цн */
  qtyEffect: number;
  /** влияние цены: (Цф − Цн) × Qф */
  priceEffect: number;
}

export interface ProductCost {
  id: string;
  name: string;
  unit: string;
  qty: number;
  materials: number;
  labor: number;
  social: number;
  overhead: number;
  total: number;
  unit_: { materials: number; labor: number; social: number; overhead: number; total: number };
  norm: { materials: number; labor: number; direct: number };
  variance: { materials: number; labor: number; materialsPct: number | null; laborPct: number | null };
  price: number;
  margin: number | null;      // (цена − себестоимость) / цена, %
  contribution: number | null; // маржинальный доход на единицу: цена − прямые затраты
}

export interface CostingResult {
  pools: Pools;
  base: OverheadBase;
  method: CostingMethod;
  products: ProductCost[];
  totals: { materials: number; labor: number; social: number; overhead: number; total: number };
  unallocated: number;
  /** расход материалов в натуре — пусто, если в журнале не ведётся количество */
  usage: MaterialUse[];
  advice: Array<{ level: "error" | "warn" | "tip"; title: string; detail: string }>;
}

const STOCK = /^1(62|7[0-9])\d$/;
const PROD_DR = /^(163|164)\d$|^71[0-9]\d$|^7400$/;
const OH = new Set(["7140", "7150", "7160", "7170"]);
const r2 = (n: number) => Math.round(n * 100) / 100;

export const OVERHEAD_LABEL: Record<string, string> = {
  "7140": "Коммунальные услуги", "7150": "Амортизация производственных ОС", "7160": "Ремонт и обслуживание ОС", "7170": "Прочие производственные затраты", other: "Прочие затраты, отнесённые на производство",
};

/** Production cost pools of the period from the journal. */
export function costPools(entries: LedgerEntry[], from: string, to: string): Pools {
  const p: Pools = { materials: 0, labor: 0, social: 0, overhead: 0, overheadBy: {}, outputPosted: 0 };
  const oh = (k: string, v: number) => { p.overhead += v; p.overheadBy[k] = (p.overheadBy[k] ?? 0) + v; };
  for (const e of entries) {
    if (e.source === "opening" || e.source === "closing" || e.date < from || e.date > to) continue;
    const prodDebit = e.lines.some((l) => l.debit > 0 && PROD_DR.test(l.account));
    for (const l of e.lines) {
      if (l.credit > 0 && STOCK.test(l.account) && prodDebit) {
        p.materials += l.credit;
        if (l.item) {
          const k = itemKey(l.item);
          const u = (p.usage ??= {})[k] ?? { name: l.item.trim(), unit: l.unit ?? "", qty: 0, amount: 0 };
          u.qty = Math.round((u.qty + Number(l.qty ?? 0)) * 1000) / 1000;
          u.amount = r2(u.amount + l.credit);
          if (!u.unit && l.unit) u.unit = l.unit;
          p.usage![k] = u;
        }
      }
      if (l.debit > 0) {
        if (l.account === "7110") p.materials += l.debit;
        else if (l.account === "7120") p.labor += l.debit;
        else if (l.account === "7130") p.social += l.debit;
        else if (OH.has(l.account)) oh(l.account, l.debit);
        else if (/^16[34]\d$/.test(l.account)) {
          // затраты, отнесённые прямо на НЗП / готовую продукцию
          const credits = e.lines.filter((x) => x.credit > 0);
          for (const c of credits) {
            const share = l.debit * (c.credit / credits.reduce((s, x) => s + x.credit, 0));
            if (STOCK.test(c.account) || /^16[34]\d$/.test(c.account)) continue; // материалы учтены выше; перенос НЗП → ГП не затрата
            if (c.account === "3520") p.labor += share;
            else if (c.account === "3530") p.social += share;
            else oh("other", share);
          }
          if (l.account === "1640") p.outputPosted += l.debit;
        }
      }
    }
  }
  for (const k of ["materials", "labor", "social", "overhead", "outputPosted"] as const) p[k] = r2(p[k]);
  return p;
}

function share(weights: number[], amount: number): number[] {
  const sum = weights.reduce((a, b) => a + b, 0);
  if (sum <= 0) return weights.map(() => 0);
  const raw = weights.map((w) => (amount * w) / sum);
  const rounded = raw.map(r2);
  // разница округления — на самую крупную позицию, чтобы итог сошёлся до тыйына
  const diff = r2(amount - rounded.reduce((a, b) => a + b, 0));
  if (Math.abs(diff) > 0) { const i = raw.indexOf(Math.max(...raw)); rounded[i] = r2(rounded[i] + diff); }
  return rounded;
}

export const normMaterials = (p: Product) => p.materials.reduce((s, m) => s + m.qty * m.price, 0);

export function calculate(products: Product[], outputs: Record<string, number>, pools: Pools, base: OverheadBase, method: CostingMethod): CostingResult {
  const items = products.filter((p) => (outputs[p.id] ?? 0) > 0);
  const q = items.map((p) => outputs[p.id]);
  const nm = items.map((p, i) => normMaterials(p) * q[i]);
  const nl = items.map((p, i) => p.laborPerUnit * q[i]);
  const mat = share(nm.some((x) => x > 0) ? nm : q, pools.materials);
  const lab = share(nl.some((x) => x > 0) ? nl : q, pools.labor);
  const soc = share(lab.some((x) => x > 0) ? lab : q, pools.social);
  const baseW = base === "materials" ? mat : base === "labor" ? lab : base === "machineHours" ? items.map((p, i) => p.machineHours * q[i]) : q;
  const oh = share(baseW.some((x) => x > 0) ? baseW : q, pools.overhead);

  const out: ProductCost[] = items.map((p, i) => {
    const total = r2(mat[i] + lab[i] + soc[i] + oh[i]);
    const per = (v: number) => r2(v / q[i]);
    const unitTotal = per(total);
    const normMat = r2(normMaterials(p)), normLab = r2(p.laborPerUnit);
    const vm = r2(per(mat[i]) - normMat), vl = r2(per(lab[i]) - normLab);
    return {
      id: p.id, name: p.name, unit: p.unit, qty: q[i],
      materials: mat[i], labor: lab[i], social: soc[i], overhead: oh[i], total,
      unit_: { materials: per(mat[i]), labor: per(lab[i]), social: per(soc[i]), overhead: per(oh[i]), total: unitTotal },
      norm: { materials: normMat, labor: normLab, direct: r2(normMat + normLab) },
      variance: { materials: vm, labor: vl, materialsPct: normMat > 0 ? r2((vm / normMat) * 100) : null, laborPct: normLab > 0 ? r2((vl / normLab) * 100) : null },
      price: p.price,
      margin: p.price > 0 ? r2(((p.price - unitTotal) / p.price) * 100) : null,
      contribution: p.price > 0 ? r2(p.price - per(mat[i] + lab[i] + soc[i])) : null,
    };
  });

  const totals = {
    materials: r2(out.reduce((s, x) => s + x.materials, 0)),
    labor: r2(out.reduce((s, x) => s + x.labor, 0)),
    social: r2(out.reduce((s, x) => s + x.social, 0)),
    overhead: r2(out.reduce((s, x) => s + x.overhead, 0)),
    total: r2(out.reduce((s, x) => s + x.total, 0)),
  };
  const poolTotal = r2(pools.materials + pools.labor + pools.social + pools.overhead);
  const unallocated = r2(poolTotal - totals.total);
  const usage = materialUsage(items, outputs, pools);
  const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
  const extra: CostingResult["advice"] = [];
  for (const u of usage) {
    if (u.qtyPct !== null && u.qtyPct > 5 && u.qtyEffect > 0) extra.push({ level: "warn", title: `${u.name}: перерасход ${u.qtyPct.toFixed(1).replace(".", ",")}% в натуре`, detail: `Списано ${qn(u.actualQty)} ${u.unit} при норме ${qn(u.normQty)} ${u.unit} на фактический выпуск. Перерасход по количеству стоит ${money(u.qtyEffect)} сом — ищите причину в раскрое, браке или неточных нормах.` });
    if (u.actualPrice !== null && u.normPrice > 0 && u.priceEffect > 0 && (u.actualPrice / u.normPrice - 1) * 100 > 5) extra.push({ level: "tip", title: `${u.name}: цена выше нормативной`, detail: `Средняя цена списания ${money(u.actualPrice)} сом за ${u.unit} против ${money(u.normPrice)} в норме: +${money(u.priceEffect)} сом к себестоимости. Обновите норму цены или сравните поставщиков.` });
  }
  const rank = { error: 0, warn: 1, tip: 2 } as const;
  // с данными в натуре видно, какой материал перерасходован; одинаковый % по каждому изделию — следствие распределения, его не повторяем
  const base0 = advise(out, pools, totals, unallocated, method).filter((a) => !(usage.length && /перерасход материалов|материалов ушло меньше нормы/.test(a.title)));
  const advice = [...base0.filter((a) => !(extra.length && a.title === "Калькуляция сходится")), ...extra]
    .map((a, k) => [a, k] as const).sort((x, y) => rank[x[0].level] - rank[y[0].level] || x[1] - y[1]).map(([a]) => a);
  return { pools, base, method, products: out, totals, unallocated, usage, advice };
}

const qn = (n: number) => String(Math.round(n * 10) / 10).replace(".", ",");

/** Норма расхода на фактический выпуск против списанного по журналу, по наименованиям материалов. */
export function materialUsage(items: Product[], outputs: Record<string, number>, pools: Pools): MaterialUse[] {
  if (!pools.usage || !Object.keys(pools.usage).length) return [];
  const norm = new Map<string, { name: string; unit: string; qty: number; amount: number }>();
  for (const p of items) {
    const q = outputs[p.id] ?? 0;
    for (const m of p.materials) {
      const k = itemKey(m.name);
      const n = norm.get(k) ?? { name: m.name, unit: m.unit, qty: 0, amount: 0 };
      n.qty += m.qty * q; n.amount += m.qty * q * m.price;
      norm.set(k, n);
    }
  }
  const keys = new Set([...norm.keys(), ...Object.keys(pools.usage)]);
  const out: MaterialUse[] = [];
  for (const k of keys) {
    const n = norm.get(k), a = pools.usage[k];
    const normQty = n?.qty ?? 0, actualQty = a?.qty ?? 0;
    const normPrice = n && n.qty > 0 ? n.amount / n.qty : 0;
    const actualPrice = a && a.qty > 0 ? a.amount / a.qty : null;
    out.push({
      name: n?.name ?? a!.name, unit: n?.unit || a?.unit || "",
      normQty: Math.round(normQty * 1000) / 1000, actualQty,
      normPrice: r2(normPrice), actualPrice: actualPrice === null ? null : r2(actualPrice),
      normAmount: r2(n?.amount ?? 0), actualAmount: r2(a?.amount ?? 0),
      qtyPct: normQty > 0 && a && a.qty > 0 ? r2((actualQty / normQty - 1) * 100) : null,
      qtyEffect: normPrice > 0 ? r2((actualQty - normQty) * normPrice) : 0,
      priceEffect: actualPrice !== null && normPrice > 0 ? r2((actualPrice - normPrice) * actualQty) : 0,
    });
  }
  return out.sort((x, y) => Math.abs(y.qtyEffect) + Math.abs(y.priceEffect) - (Math.abs(x.qtyEffect) + Math.abs(x.priceEffect)));
}

function advise(out: ProductCost[], pools: Pools, totals: CostingResult["totals"], unallocated: number, method: CostingMethod): CostingResult["advice"] {
  const a: CostingResult["advice"] = [];
  const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
  const poolTotal = pools.materials + pools.labor + pools.social + pools.overhead;
  if (poolTotal <= 0) {
    a.push({ level: "warn", title: "В журнале нет производственных затрат за период", detail: "Калькуляции нечего распределять: проведите списание материалов в производство (Дт 1630/1640 Кт 1620), зарплату производственного персонала (7120) и общепроизводственные расходы (7140–7170)." });
    return a;
  }
  if (!out.length) {
    a.push({ level: "warn", title: "Не указан выпуск", detail: `Затраты периода — ${money(poolTotal)} сом. Укажите, сколько единиц каждого изделия выпущено, чтобы распределить их.` });
    return a;
  }
  if (Math.abs(unallocated) > 1) a.push({ level: "error", title: "Не все затраты распределены", detail: `${money(unallocated)} сом остались без изделия — проверьте выпуск и нормы.` });
  for (const p of out) {
    if (p.margin !== null && p.margin < 0) a.push({ level: "error", title: `${p.name}: продаётся ниже себестоимости`, detail: `Себестоимость ${money(p.unit_.total)} сом за ${p.unit}, цена ${money(p.price)} сом. Каждая единица приносит убыток ${money(p.unit_.total - p.price)} сом.` });
    else if (p.margin !== null && p.margin < 10) a.push({ level: "warn", title: `${p.name}: низкая рентабельность — ${p.margin.toFixed(1).replace(".", ",")}%`, detail: `Цена покрывает себестоимость с запасом меньше 10%. Пересмотрите цену или нормы расхода.` });
    if (p.variance.materialsPct !== null && p.variance.materialsPct > 5) a.push({ level: "warn", title: `${p.name}: перерасход материалов ${p.variance.materialsPct.toFixed(1).replace(".", ",")}%`, detail: `Фактически ${money(p.unit_.materials)} сом на единицу против нормы ${money(p.norm.materials)}. Проверьте отходы раскроя, брак и цены поставщиков — это потери в терминах бережливого производства.` });
    if (p.variance.materialsPct !== null && p.variance.materialsPct < -10) a.push({ level: "tip", title: `${p.name}: материалов ушло меньше нормы`, detail: "Нормы, возможно, завышены — уточните их, иначе плановая цена будет неточной." });
  }
  const ohShare = totals.total > 0 ? (totals.overhead / totals.total) * 100 : 0;
  if (ohShare > 30) a.push({ level: "tip", title: `Общепроизводственные расходы — ${ohShare.toFixed(0)}% себестоимости`, detail: "Доля высокая: от выбора базы распределения сильно зависит себестоимость каждого изделия. Сравните базы и проверьте, какие ОПР можно сократить." });
  if (pools.outputPosted > 0 && Math.abs(pools.outputPosted - totals.total) > Math.max(1, totals.total * 0.01)) {
    a.push({ level: "warn", title: "Выпуск в журнале не совпадает с калькуляцией", detail: `Готовая продукция оприходована на ${money(pools.outputPosted)} сом (Дт 1640), а фактическая себестоимость выпуска — ${money(totals.total)} сом. ${pools.outputPosted < totals.total ? "Часть затрат (зарплата, ОПР) осталась в расходах периода, а не в стоимости продукции" : "Продукция оприходована дороже фактических затрат"}: сделайте корректирующую проводку на ${money(Math.abs(totals.total - pools.outputPosted))} сом.` });
  }
  if (method === "normative" && out.some((p) => p.norm.direct === 0)) a.push({ level: "tip", title: "Нормативный метод без норм", detail: "Для части изделий не заданы нормы материалов и труда — калькуляция по ним идёт пропорционально выпуску." });
  if (!a.length) a.push({ level: "tip", title: "Калькуляция сходится", detail: "Все затраты периода распределены, отклонения от норм в пределах 5%, все изделия рентабельны." });
  return a;
}

/** Normalizes products sent by the client. */
export function normalizeProducts(raw: unknown): Product[] {
  if (!Array.isArray(raw)) return [];
  const num = (v: unknown) => { const n = Number(v); return Number.isFinite(n) && n >= 0 ? n : 0; };
  const str = (v: unknown, max = 120) => String(v ?? "").slice(0, max);
  return raw.slice(0, 100).map((p, i) => {
    const o = (p ?? {}) as Record<string, unknown>;
    return {
      id: /^[A-Za-z0-9_-]{1,40}$/.test(String(o.id)) ? String(o.id) : `p${Date.now().toString(36)}${i}`,
      name: str(o.name) || `Изделие ${i + 1}`,
      unit: str(o.unit, 20) || "шт.",
      price: num(o.price),
      laborPerUnit: num(o.laborPerUnit),
      machineHours: num(o.machineHours),
      materials: Array.isArray(o.materials) ? (o.materials as unknown[]).slice(0, 50).map((m) => {
        const x = (m ?? {}) as Record<string, unknown>;
        return { name: str(x.name), unit: str(x.unit, 20), qty: num(x.qty), price: num(x.price) };
      }).filter((m) => m.name) : [],
    };
  });
}

export function normalizeOutputs(raw: unknown, products: Product[]): Record<string, number> {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: Record<string, number> = {};
  for (const p of products) { const n = Number(o[p.id]); if (Number.isFinite(n) && n > 0) out[p.id] = n; }
  return out;
}
