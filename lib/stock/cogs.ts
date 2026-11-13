// ════════════════════════════════════════════════════════════════════════
// lib/stock/cogs.ts — автоматическое списание себестоимости проданного по
// формуле из учётной политики: средняя (скользящая) себестоимость или ФИФО,
// МСФО (IAS) 2, п. 25, 27. Для ФИФО каждая партия поступления хранится со
// своей ценой, и продажа списывает сначала самые ранние партии.
//
// Продажа — строка выручки (61xx) с номенклатурой и количеством. Для неё
// ищется остаток той же номенклатуры на счетах запасов (товары 1610, готовая
// продукция 1640, материалы 16xx/17xx) и предлагается проводка
//   Дт 7200 (товары) / 7000 (продукция) — Кт счёт запасов, количество и сумма
// по средней цене на дату продажи. Средняя пересчитывается после каждого
// поступления, выбытие её не меняет. Проводки помечаются sourceRef
// «<id продажи>:<номер строки>», поэтому повторный запуск ничего не задвоит.
// ════════════════════════════════════════════════════════════════════════

import { itemKey } from "@/lib/ledger/stock";
import { round2, type LedgerEntry, type LedgerLine, type Period } from "@/lib/ledger/types";

const STOCK = /^1[67]\d\d$/;
const SALE = /^61[13]\d$/; // 6110 реализация, 6130 обмен
/** Where to look for the sold item, in order of preference. */
const PREFER = ["1610", "1640", "1620", "1650", "1740", "1750"];

export interface CogsProposal {
  saleEntryId: string;
  lineIndex: number;
  date: string;
  item: string;
  unit: string;
  qty: number;
  stockAccount: string | null;
  cogsAccount: string;
  avgCost: number;
  amount: number;
  /** quantity on hand before this sale */
  onHand: number;
  problem: string | null;
  /** cost formula used: moving average or FIFO */
  method: CogsMethod;
}

/** «wavg» — средневзвешенная (скользящая), «fifo» — ФИФО. Индивидуальная идентификация считается по средней. */
export type CogsMethod = "wavg" | "fifo";
export const cogsMethodOf = (costFormula: string | null | undefined): CogsMethod => (costFormula === "fifo" ? "fifo" : "wavg");

interface Layer { qty: number; cost: number } // cost — per unit
interface Pos { qty: number; amount: number; unit: string; name: string; layers: Layer[] }

const q3 = (n: number) => Math.round(n * 1000) / 1000;

/** Cost of the first `qty` units of the FIFO layers (does not consume them). */
function fifoCost(layers: Layer[], qty: number): number {
  let left = qty, sum = 0;
  for (const l of layers) {
    if (left <= 1e-9) break;
    const take = Math.min(l.qty, left);
    sum += take * l.cost; left -= take;
  }
  return sum;
}
function consume(layers: Layer[], qty: number): void {
  let left = qty;
  while (left > 1e-9 && layers.length) {
    const l = layers[0];
    if (l.qty <= left + 1e-9) { left -= l.qty; layers.shift(); } else { l.qty = q3(l.qty - left); left = 0; }
  }
}

export const cogsRef = (entryId: string, lineIndex: number) => `${entryId}:${lineIndex}`;

/**
 * Sales in `period` that have no write-off yet, with the cost to write off.
 * `entries` — the whole journal up to the period end (earlier rows give stock).
 */
export function pendingCogs(entries: LedgerEntry[], period: Period, method: CogsMethod = "wavg"): CogsProposal[] {
  const done = new Set(entries.filter((e) => e.source === "cogs" && e.sourceRef).map((e) => e.sourceRef!));
  const pos = new Map<string, Pos>(); // account|item
  const out: CogsProposal[] = [];
  const sorted = [...entries].filter((e) => e.date <= period.to).sort((a, b) => a.date.localeCompare(b.date));

  const apply = (l: LedgerLine) => {
    if (!STOCK.test(l.account) || !l.item) return;
    const k = `${l.account}|${itemKey(l.item)}`;
    const p = pos.get(k) ?? { qty: 0, amount: 0, unit: l.unit ?? "", name: l.item.trim(), layers: [] };
    const q = Number(l.qty ?? 0);
    if (l.debit > 0) {
      p.qty += q; p.amount += l.debit;
      if (q > 0) p.layers.push({ qty: q, cost: l.debit / q });
      else if (p.layers.length) { const last = p.layers[p.layers.length - 1]; last.cost += l.debit / last.qty; } // доплата к последней партии
    } else {
      p.qty -= q; p.amount -= l.credit;
      if (q > 0) consume(p.layers, q);
      else if (p.qty > 0) { const k2 = 1 - l.credit / (p.amount + l.credit || 1); for (const x of p.layers) x.cost *= k2; } // уценка без количества
    }
    p.qty = Math.round(p.qty * 1000) / 1000;
    p.amount = round2(p.amount);
    if (!p.unit && l.unit) p.unit = l.unit;
    pos.set(k, p);
  };

  for (const e of sorted) {
    // inflows first within the entry, so a purchase and a sale on the same entry still work
    e.lines.forEach((l) => { if (l.debit > 0) apply(l); });
    e.lines.forEach((l) => { if (l.credit > 0) apply(l); });
    if (e.source === "opening" || e.source === "cogs") continue;
    e.lines.forEach((l, i) => {
      if (!SALE.test(l.account) || l.credit <= 0 || !l.item || !(Number(l.qty) > 0)) return;
      const ref = cogsRef(e.id, i);
      if (done.has(ref)) return;
      const key = itemKey(l.item);
      const qty = Number(l.qty);
      const candidates = PREFER.map((acc) => ({ acc, p: pos.get(`${acc}|${key}`) })).filter((c) => c.p && c.p.qty > 0);
      const inPeriod = e.date >= period.from;
      const pick = candidates.find((c) => c.p!.qty >= qty - 1e-9) ?? candidates[0];
      if (!pick) {
        if (inPeriod) out.push({ saleEntryId: e.id, lineIndex: i, date: e.date, item: l.item.trim(), unit: l.unit ?? "", qty, stockAccount: null, cogsAccount: "7200", avgCost: 0, amount: 0, onHand: 0, problem: "Нет остатка этой номенклатуры на счетах запасов — сначала проведите поступление с количеством", method });
        return;
      }
      const p = pick.p!;
      const avg = p.amount / p.qty;
      const enough = p.qty >= qty - 1e-9;
      const layered = p.layers.reduce((s2, x) => s2 + x.qty, 0) >= qty - 1e-9;
      const amount = enough && Math.abs(p.qty - qty) < 1e-9 ? round2(p.amount)
        : method === "fifo" && layered ? round2(fifoCost(p.layers, qty)) : round2(avg * qty);
      const proposal: CogsProposal = {
        saleEntryId: e.id, lineIndex: i, date: e.date, item: p.name, unit: p.unit || l.unit || "", qty,
        stockAccount: pick.acc, cogsAccount: pick.acc === "1610" ? "7200" : "7000",
        avgCost: method === "fifo" && layered && qty > 0 ? round2(amount / qty) : round2(avg), amount, onHand: p.qty,
        problem: enough ? null : `Продано ${qty}, на остатке ${p.qty} — проверьте поступления или количество в продаже`,
        method,
      };
      if (inPeriod) out.push(proposal);
      // the write-off happens (or will happen) — keep the running stock right for later sales
      if (enough) apply({ account: pick.acc, debit: 0, credit: amount, item: l.item, qty });
    });
  }
  return out;
}

export function cogsLines(p: CogsProposal): LedgerLine[] {
  return [
    { account: p.cogsAccount, debit: p.amount, credit: 0, item: p.item, qty: p.qty, unit: p.unit || null, memo: p.method === "fifo" ? `по ФИФО, ${p.avgCost.toLocaleString("ru-RU")} за ед.` : `по средней ${p.avgCost.toLocaleString("ru-RU")} за ед.` },
    { account: p.stockAccount!, debit: 0, credit: p.amount, item: p.item, qty: p.qty, unit: p.unit || null },
  ];
}

/** Stock on hand with moving-average cost at `to`. */
export function stockWithAverage(entries: LedgerEntry[], to: string): Array<{ account: string; item: string; unit: string; qty: number; amount: number; avg: number }> {
  const m = new Map<string, Pos & { account: string }>();
  for (const e of [...entries].filter((x) => x.date <= to).sort((a, b) => a.date.localeCompare(b.date))) {
    for (const l of e.lines) {
      if (!STOCK.test(l.account) || !l.item) continue;
      const k = `${l.account}|${itemKey(l.item)}`;
      const p = m.get(k) ?? { account: l.account, qty: 0, amount: 0, unit: l.unit ?? "", name: l.item.trim(), layers: [] };
      const q = Number(l.qty ?? 0);
      p.qty = Math.round((p.qty + (l.debit > 0 ? q : -q)) * 1000) / 1000;
      p.amount = round2(p.amount + l.debit - l.credit);
      if (!p.unit && l.unit) p.unit = l.unit;
      m.set(k, p);
    }
  }
  return [...m.values()]
    .filter((p) => Math.abs(p.qty) > 0.0004 || Math.abs(p.amount) > 0.004)
    .map((p) => ({ account: p.account, item: p.name, unit: p.unit, qty: p.qty, amount: p.amount, avg: p.qty > 0 ? round2(p.amount / p.qty) : 0 }))
    .sort((a, b) => a.account.localeCompare(b.account) || a.item.localeCompare(b.item, "ru"));
}
