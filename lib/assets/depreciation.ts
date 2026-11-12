// ════════════════════════════════════════════════════════════════════════
// lib/assets/depreciation.ts — расчёты по основным средствам без базы данных.
//
//   bookSchedule      помесячная бухгалтерская амортизация объекта
//   depreciationLines проводка начисления амортизации за месяц
//   disposalLines     проводка выбытия (продажа или списание)
//   taxChain          налоговая амортизация по группам НК КР по годам
// ════════════════════════════════════════════════════════════════════════

import { round2, type LedgerLine } from "@/lib/ledger/types";
import {
  ACCUMULATED, BUILDING_LATE_RATE, BUILDING_YEARS, NOT_DEPRECIATED, REPAIR_CAP, TAX_GROUPS, THRESHOLD_RP,
  type FixedAsset, type TaxGroup,
} from "./types";

// ── месяцы ──
export const monthIdx = (iso: string) => Number(iso.slice(0, 4)) * 12 + Number(iso.slice(5, 7)) - 1;
export const ymOf = (idx: number) => `${Math.floor(idx / 12)}-${String((idx % 12) + 1).padStart(2, "0")}`;
export const monthEnd = (ym: string) => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y, m, 0)).getUTCDate()).padStart(2, "0")}`;
};

export const isDepreciable = (a: FixedAsset) => !NOT_DEPRECIATED.has(a.account) && a.lifeMonths > 0 && !!ACCUMULATED[a.account];

/**
 * Monthly book depreciation from the month after commissioning up to `untilYm`
 * (inclusive), stopping after the month of disposal. Objects carried over with
 * accumulated depreciation continue from the month after `openingDate`.
 */
export function bookSchedule(a: FixedAsset, untilYm: string): Array<{ ym: string; amount: number; accumulated: number; nbv: number }> {
  if (!isDepreciable(a)) return [];
  const start = monthIdx(a.inServiceAt) + 1;
  const begin = a.openingDate ? Math.max(start, monthIdx(a.openingDate) + 1) : start;
  const stop = Math.min(monthIdx(`${untilYm}-01`), a.disposedAt ? monthIdx(a.disposedAt) : Infinity);
  const depreciable = round2(a.cost - a.residual);
  let acc = a.openingDate && monthIdx(a.openingDate) + 1 >= start ? a.openingAccumulated : 0;
  const out: Array<{ ym: string; amount: number; accumulated: number; nbv: number }> = [];
  const yearsLife = a.lifeMonths / 12;
  for (let m = begin; m <= stop; m++) {
    const remainingMonths = a.lifeMonths - (m - start);
    const left = round2(depreciable - acc);
    if (left <= 0.004 || remainingMonths <= 0) break;
    let amount: number;
    if (a.method === "declining") {
      const nbv = a.cost - acc;
      const ddb = (nbv * (2 / yearsLife)) / 12;
      const sl = left / remainingMonths;
      amount = Math.max(ddb, sl); // переход на линейный, когда он даёт больше
    } else {
      amount = left / remainingMonths;
    }
    amount = remainingMonths === 1 ? left : Math.min(round2(amount), left);
    acc = round2(acc + amount);
    out.push({ ym: ymOf(m), amount, accumulated: acc, nbv: round2(a.cost - acc) });
  }
  return out;
}

/** Accumulated depreciation at the end of month `ym`. */
export function accumulatedAt(a: FixedAsset, ym: string): number {
  if (!isDepreciable(a)) return 0;
  const s = bookSchedule(a, ym);
  if (s.length) return s[s.length - 1].accumulated;
  return a.openingDate && a.openingDate <= monthEnd(ym) ? a.openingAccumulated : 0;
}

export function depreciationFor(a: FixedAsset, ym: string): number {
  return bookSchedule(a, ym).find((r) => r.ym === ym)?.amount ?? 0;
}

const label = (a: FixedAsset) => (a.inventoryNo ? `инв. № ${a.inventoryNo}` : null);

/** One balanced entry: Dt expense / Кт accumulated depreciation, a pair of lines per object. */
export function depreciationLines(assets: FixedAsset[], ym: string): { lines: LedgerLine[]; total: number; rows: Array<{ id: string; name: string; amount: number }> } {
  const lines: LedgerLine[] = [];
  const rows: Array<{ id: string; name: string; amount: number }> = [];
  for (const a of assets) {
    const amount = depreciationFor(a, ym);
    if (amount <= 0) continue;
    rows.push({ id: a.id, name: a.name, amount });
    lines.push({ account: a.expenseAccount, debit: amount, credit: 0, item: a.name, memo: label(a) });
    lines.push({ account: ACCUMULATED[a.account], debit: 0, credit: amount, item: a.name, memo: label(a) });
  }
  return { lines, total: round2(rows.reduce((s, r) => s + r.amount, 0)), rows };
}

/** Acquisition: Dt asset account / Кт supplier (3110), bank (1210) or cash (1110). */
export function acquisitionLines(a: FixedAsset, creditAccount: string): LedgerLine[] {
  return [
    { account: a.account, debit: a.cost, credit: 0, item: a.name, memo: label(a), qty: 1, unit: "шт" },
    { account: creditAccount, debit: 0, credit: a.cost, party: creditAccount === "3110" ? a.supplier || null : null },
  ];
}

/**
 * Disposal on `a.disposedAt`: accumulated depreciation is written off against
 * cost; the carrying amount goes to other expenses (9590); sale proceeds are a
 * receivable from the buyer and other income (9190). Net gain or loss shows in
 * profit or loss as IAS 16.68 requires.
 */
export function disposalLines(a: FixedAsset, buyerAccount = "1410"): { lines: LedgerLine[]; accumulated: number; carrying: number; gain: number } {
  const ym = a.disposedAt!.slice(0, 7);
  const acc = accumulatedAt(a, ym);
  const carrying = round2(a.cost - acc);
  const lines: LedgerLine[] = [];
  if (acc > 0) lines.push({ account: ACCUMULATED[a.account], debit: acc, credit: 0, item: a.name, memo: label(a) });
  if (carrying > 0) lines.push({ account: "9590", debit: carrying, credit: 0, memo: `Остаточная стоимость выбывшего объекта${a.inventoryNo ? `, инв. № ${a.inventoryNo}` : ""}` });
  lines.push({ account: a.account, debit: 0, credit: a.cost, item: a.name, memo: label(a), qty: 1, unit: "шт" });
  if (a.disposalProceeds > 0) {
    lines.push({ account: buyerAccount, debit: a.disposalProceeds, credit: 0 });
    lines.push({ account: "9190", debit: 0, credit: a.disposalProceeds, memo: "Выручка от продажи основного средства" });
  }
  return { lines, accumulated: acc, carrying, gain: round2(a.disposalProceeds - carrying) };
}

// ── налоговая амортизация (ст. 225–229 НК КР) ───────────────────────────────

export interface TaxSettings {
  /** расчётный показатель, сом */
  rp: number;
  /** год начала расчёта; раньше этого года объекты считаются вошедшими в начальные остатки */
  startYear: number;
  /** стоимость групп 1–4, 6 на начало startYear */
  opening: Partial<Record<TaxGroup, number>>;
  /** стоимость зданий (группа 5) на начало startYear, по id объекта */
  objectOpening: Record<string, number>;
  /** расходы на ремонт за год по группам: repairs["2026"][2] = 150000 */
  repairs: Record<string, Partial<Record<TaxGroup, number>>>;
}

export interface TaxGroupRow {
  group: TaxGroup;
  /** для группы 5 — объект */
  objectId?: string;
  objectName?: string;
  rate: number;
  open: number;
  additions: number;
  disposals: number;
  repairs: number;
  repairDeductible: number;
  repairExcess: number;
  close: number;
  depreciation: number;
  /** отрицательная стоимость группы, включаемая в совокупный доход (ст. 226 п. 6) */
  incomeAdd: number;
  note: string;
}

export interface TaxYear {
  year: number;
  rows: TaxGroupRow[];
  /** объекты дешевле порога — расход в году приобретения (ст. 225 п. 5) */
  expensed: Array<{ id: string; name: string; cost: number }>;
  totalDepreciation: number;
  totalRepairs: number;
  totalExpensed: number;
  totalIncomeAdd: number;
  /** итоговый вычет из совокупного дохода */
  deduction: number;
}

const year = (iso: string | null) => (iso ? Number(iso.slice(0, 4)) : NaN);

export function defaultTaxSettings(assets: FixedAsset[], now = new Date()): TaxSettings {
  const years = assets.map((a) => year(a.acquiredAt)).filter(Number.isFinite);
  return { rp: 100, startYear: years.length ? Math.min(...years) : now.getUTCFullYear(), opening: {}, objectOpening: {}, repairs: {} };
}

/** Tax depreciation for every year from settings.startYear to `toYear`. */
export function taxChain(assets: FixedAsset[], toYear: number, st: TaxSettings): TaxYear[] {
  const threshold = THRESHOLD_RP * st.rp;
  const taxable = (a: FixedAsset) => a.taxGroup !== null && a.account !== "2110" && a.cost >= threshold;
  const pools = new Map<TaxGroup, number>();
  for (const g of [1, 2, 3, 4, 6] as TaxGroup[]) pools.set(g, Math.max(0, st.opening[g] ?? 0));
  // group 5: per object; value at the start of each year and base for the late straight-line period
  const buildings = new Map<string, { value: number; lateBase: number | null; closed: boolean }>();
  const out: TaxYear[] = [];

  for (let y = st.startYear; y <= toYear; y++) {
    const rows: TaxGroupRow[] = [];
    const repY = st.repairs[String(y)] ?? {};
    // pooled groups
    for (const g of [1, 2, 3, 4, 6] as TaxGroup[]) {
      const members = assets.filter((a) => taxable(a) && a.taxGroup === g);
      const open = round2(pools.get(g)!);
      const additions = round2(members.filter((a) => year(a.acquiredAt) === y).reduce((s, a) => s + a.cost, 0));
      const disposals = round2(members.filter((a) => year(a.disposedAt) === y).reduce((s, a) => s + a.disposalProceeds, 0));
      const repairs = round2(repY[g] ?? 0);
      const repairDeductible = round2(Math.min(repairs, open * REPAIR_CAP));
      const repairExcess = round2(repairs - repairDeductible);
      let close = round2(open + additions - disposals + repairExcess);
      let incomeAdd = 0, depreciation = 0, note = "";
      const alive = members.filter((a) => year(a.acquiredAt) <= y && !(a.disposedAt && year(a.disposedAt) <= y));
      if (close < 0) { incomeAdd = -close; close = 0; note = "Отрицательная стоимость группы включается в совокупный доход (ст. 226 п. 6)"; }
      else if (close > 0 && close < threshold) { depreciation = close; note = "Стоимость группы меньше 100 расчётных показателей — вычитается полностью (ст. 228 п. 2)"; }
      else if (close > 0 && members.length > 0 && alive.length === 0) { depreciation = close; note = "Все объекты группы выбыли — остаток вычитается (ст. 228 п. 3)"; }
      else depreciation = round2(close * TAX_GROUPS[g].rate);
      if (open || additions || disposals || repairs || close) {
        rows.push({ group: g, rate: TAX_GROUPS[g].rate, open, additions, disposals, repairs, repairDeductible, repairExcess, close, depreciation, incomeAdd, note });
      }
      pools.set(g, round2(close - depreciation));
    }
    // group 5 — each building separately
    const repairs5 = round2(repY[5] ?? 0);
    const b5 = assets.filter((a) => taxable(a) && a.taxGroup === 5);
    const open5Total = b5.reduce((s, a) => s + (buildings.get(a.id)?.value ?? (year(a.acquiredAt) < st.startYear ? st.objectOpening[a.id] ?? 0 : 0)), 0);
    for (const a of b5) {
      if (year(a.acquiredAt) > y) continue;
      let b = buildings.get(a.id);
      if (!b) {
        b = { value: year(a.acquiredAt) < st.startYear ? Math.max(0, st.objectOpening[a.id] ?? 0) : 0, lateBase: null, closed: false };
        buildings.set(a.id, b);
      }
      if (b.closed) continue;
      const open = round2(b.value);
      const additions = year(a.acquiredAt) === y ? a.cost : 0;
      const share = open5Total > 0 ? open / open5Total : 0;
      const repairs = round2(repairs5 * share);
      const repairDeductible = round2(Math.min(repairs, open * REPAIR_CAP));
      const repairExcess = round2(repairs - repairDeductible);
      let close = round2(open + additions + repairExcess);
      let depreciation = 0, incomeAdd = 0, disposals = 0, note = "";
      if (a.disposedAt && year(a.disposedAt) === y) {
        disposals = a.disposalProceeds;
        const rest = round2(close - disposals);
        if (rest >= 0) { depreciation = rest; note = "Объект выбыл — остаток стоимости вычитается"; } else { incomeAdd = -rest; note = "Выручка от продажи больше налоговой стоимости — разница в доход"; }
        close = 0; b.closed = true;
      } else {
        const inService = year(a.inServiceAt);
        if (y - inService >= BUILDING_YEARS) {
          if (b.lateBase === null) b.lateBase = close;
          depreciation = round2(Math.min(close, b.lateBase * BUILDING_LATE_RATE));
          note = "Более 20 лет эксплуатации — равномерно 20 % в год (ст. 226 п. 3)";
        } else depreciation = round2(close * TAX_GROUPS[5].rate);
      }
      rows.push({ group: 5, objectId: a.id, objectName: a.name, rate: TAX_GROUPS[5].rate, open, additions, disposals, repairs, repairDeductible, repairExcess, close, depreciation, incomeAdd, note });
      b.value = round2(close - depreciation);
    }
    const expensed = assets.filter((a) => year(a.acquiredAt) === y && a.account !== "2110" && a.taxGroup !== null && a.cost < threshold).map((a) => ({ id: a.id, name: a.name, cost: a.cost }));
    const totalDepreciation = round2(rows.reduce((s, r) => s + r.depreciation, 0));
    const totalRepairs = round2(rows.reduce((s, r) => s + r.repairDeductible, 0));
    const totalExpensed = round2(expensed.reduce((s, r) => s + r.cost, 0));
    const totalIncomeAdd = round2(rows.reduce((s, r) => s + r.incomeAdd, 0));
    out.push({ year: y, rows, expensed, totalDepreciation, totalRepairs, totalExpensed, totalIncomeAdd, deduction: round2(totalDepreciation + totalRepairs + totalExpensed) });
  }
  return out;
}
