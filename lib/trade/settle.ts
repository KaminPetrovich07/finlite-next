// ════════════════════════════════════════════════════════════════════════
// lib/trade/settle.ts — оплата документов: сколько по каждой реализации
// (поступлению) в долг уже оплачено и сколько осталось.
//
// Долги контрагента на счёте расчётов (1410 у покупателей, 3110 у
// поставщиков) — это реализации, поступления, ручные проводки и начальные
// остатки; оплаты — движения в обратную сторону (банк, касса, возвраты,
// взаимозачёт). Сначала оплата закрывает документ, к которому она прямо
// привязана («Записать оплату» по документу, возврат по документу), остаток —
// самые старые долги этого контрагента (FIFO), как в акте сверки.
// Чистые функции: без базы.
// ════════════════════════════════════════════════════════════════════════

import type { LedgerEntry } from "@/lib/ledger/types";
import { nameKey } from "@/lib/consolidation/consolidate";
import { refType } from "./doc";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type DueStatus = "paid" | "partial" | "open";
export interface DocDue { entryId: string; amount: number; paid: number; due: number; status: DueStatus }

/** sourceRef проводки оплаты, записанной по документу. */
export const payRef = (docEntryId: string) => `pay:${docEntryId}`;
export const payTarget = (ref: string | null | undefined) => (ref?.startsWith("pay:") ? ref.slice(4) : null);

interface Debt { entryId: string; date: string; amount: number; left: number; doc: boolean }

/**
 * Долг по каждому документу в долг на дату `asOf`.
 * `links` — оплата (id проводки) → документ (id проводки): возвраты по документу и т. п.;
 * оплаты с sourceRef «pay:<id>» привязываются сами.
 */
export function docDues(entries: LedgerEntry[], asOf: string, links: Map<string, string> = new Map()): Map<string, DocDue> {
  // счёт расчётов + контрагент → долги и оплаты
  const groups = new Map<string, { debts: Debt[]; pays: Array<{ entryId: string; date: string; amount: number; target: string | null }> }>();
  const g = (k: string) => groups.get(k) ?? groups.set(k, { debts: [], pays: [] }).get(k)!;
  const sorted = [...entries].filter((e) => e.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || (a.source === "opening" ? -1 : b.source === "opening" ? 1 : 0));
  for (const e of sorted) {
    const t = refType(e.sourceRef);
    const isDoc = e.source === "trade" && (t === "sale" || t === "purchase");
    const target = payTarget(e.sourceRef) ?? links.get(e.id) ?? null;
    for (const l of e.lines) {
      const acc = l.account;
      if (acc !== "1410" && acc !== "3110") continue;
      const key = `${acc}|${nameKey(l.party)}`;
      // у покупателей долг растёт по дебету 1410, у поставщиков — по кредиту 3110
      const debt = acc === "1410" ? l.debit - l.credit : l.credit - l.debit;
      if (Math.abs(debt) < 0.005) continue;
      if (debt > 0) g(key).debts.push({ entryId: e.id, date: e.date, amount: r2(debt), left: r2(debt), doc: isDoc });
      else g(key).pays.push({ entryId: e.id, date: e.date, amount: r2(-debt), target });
    }
  }
  const out = new Map<string, DocDue>();
  for (const { debts, pays } of groups.values()) {
    const byId = new Map(debts.map((d) => [d.entryId, d]));
    const rest: number[] = [];
    // 1) привязанные оплаты — своему документу
    for (const p of pays) {
      let amt = p.amount;
      const d = p.target ? byId.get(p.target) : undefined;
      if (d) { const x = Math.min(d.left, amt); d.left = r2(d.left - x); amt = r2(amt - x); }
      rest.push(amt);
    }
    // 2) остальное — самым старым долгам
    let i = 0;
    for (let amt of rest) {
      while (amt > 0.004 && i < debts.length) {
        const d = debts[i];
        if (d.left <= 0.004) { i++; continue; }
        const x = Math.min(d.left, amt);
        d.left = r2(d.left - x); amt = r2(amt - x);
      }
    }
    for (const d of debts) {
      if (!d.doc) continue;
      const prev = out.get(d.entryId);
      const amount = r2((prev?.amount ?? 0) + d.amount), due = r2((prev?.due ?? 0) + Math.max(0, d.left));
      const paid = r2(amount - due);
      out.set(d.entryId, { entryId: d.entryId, amount, paid, due, status: due < 0.005 ? "paid" : paid > 0.004 ? "partial" : "open" });
    }
  }
  return out;
}
