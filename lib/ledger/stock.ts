// Количественный учёт по номенклатуре: остатки и движение ценностей по
// строкам журнала, где указаны наименование и количество.
import type { LedgerEntry, LedgerLine } from "./types";

/** Счета, по которым ведётся количественный учёт: запасы (16xx, 17xx). */
export const ITEM_ACCOUNT = /^1[67]\d\d$/;
/** Строки, где количество уместно: запасы и выручка (продажа в штуках). */
export const wantsItem = (acc: string) => ITEM_ACCOUNT.test(acc) || /^61\d\d$/.test(acc);

export const itemKey = (name: string) => name.toLowerCase().replace(/ё/g, "е").replace(/[«»"']/g, "").replace(/\s+/g, " ").trim();

export interface ItemBalance { account: string; item: string; unit: string; qty: number; amount: number }

const r = (n: number, d = 2) => Math.round(n * 10 ** d) / 10 ** d;

/** Остатки по номенклатуре на дату (включительно); строки без наименования — одной строкой по счёту. */
export function stockByItem(entries: LedgerEntry[], to: string, test: (acc: string) => boolean = (a) => ITEM_ACCOUNT.test(a)): ItemBalance[] {
  const m = new Map<string, ItemBalance>();
  for (const e of entries) {
    if (e.date > to) continue;
    for (const l of e.lines) {
      if (!test(l.account)) continue;
      const k = `${l.account}|${itemKey(l.item ?? "")}`;
      const b = m.get(k) ?? { account: l.account, item: l.item?.trim() ?? "", unit: l.unit ?? "", qty: 0, amount: 0 };
      const sign = l.debit > 0 ? 1 : -1;
      b.amount = r(b.amount + l.debit - l.credit);
      if (l.qty) b.qty = r(b.qty + sign * Number(l.qty), 3);
      if (!b.unit && l.unit) b.unit = l.unit;
      m.set(k, b);
    }
  }
  return [...m.values()].filter((b) => Math.abs(b.amount) > 0.004 || Math.abs(b.qty) > 0.0004)
    .sort((a, b) => a.account.localeCompare(b.account) || (a.item ? 0 : 1) - (b.item ? 0 : 1) || a.item.localeCompare(b.item, "ru"));
}

/** Цена за единицу по строке: сумма / количество. */
export function unitPrice(l: Pick<LedgerLine, "debit" | "credit" | "qty">): number | null {
  const q = Number(l.qty ?? 0);
  return q > 0 ? r((l.debit || l.credit) / q) : null;
}

/** «12,5» — количество для документов. */
export function qtyText(q: number | null | undefined): string {
  if (q === null || q === undefined || !Number.isFinite(Number(q)) || Number(q) === 0) return "";
  return String(Math.round(Number(q) * 1000) / 1000).replace(".", ",");
}
