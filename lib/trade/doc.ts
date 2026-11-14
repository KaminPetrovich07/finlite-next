// ════════════════════════════════════════════════════════════════════════
// lib/trade/doc.ts — торговые документы «Реализация» и «Поступление» с
// табличной частью. Документ сохраняется одной проводкой журнала, поэтому
// отчёты, склад, себестоимость (автосписание), ЭСФ, акты сверки и печатные
// формы (накладная, счёт, М-4) работают с ним без доработок.
//
//   Реализация:  Дт 1410 (в долг) / 1110 (наличные) / 1210 (на счёт) — всего
//                Кт 6110 — по каждой строке без НДС, с номенклатурой и количеством
//                Кт 3430 — НДС
//   Поступление: Дт 1610 / 1620 / 1640 (запасы по виду) или 8040 (услуги) — без НДС
//                Дт 1540 — НДС к возмещению
//                Кт 3110 (в долг) / 1110 / 1210 — всего
// Налог с продаж начисляется общим расчётом налогов за период, как и раньше.
// ════════════════════════════════════════════════════════════════════════

import { KIND_ACCOUNT, type ItemKind, type VatRate } from "./catalog";
import type { LedgerLine } from "@/lib/ledger/types";

export type DocType = "sale" | "purchase";
export type Payment = "credit" | "cash" | "bank";

export interface DocRow {
  itemId?: string;
  name: string;
  unit: string;
  kind: ItemKind;
  qty: number;
  /** цена за единицу — с НДС, если в документе «цены включают НДС», иначе без него */
  price: number;
  vat: VatRate;
}

export interface TradeDoc {
  type: DocType;
  /** номер: у реализации — сквозной по году, у поступления — номер документа поставщика */
  number: string;
  date: string;
  party: string;
  partyInn?: string;
  payment: Payment;
  vatIncluded: boolean;
  basis?: string;
  comment?: string;
  rows: DocRow[];
}

export const DOC_LABEL: Record<DocType, string> = { sale: "Реализация", purchase: "Поступление" };
export const PAYMENT_LABEL: Record<DocType, Record<Payment, string>> = {
  sale: { credit: "В долг (оплата позже)", cash: "Наличными в кассу", bank: "На расчётный счёт" },
  purchase: { credit: "В долг (оплата позже)", cash: "Наличными из кассы", bank: "С расчётного счёта" },
};
const SETTLE: Record<DocType, Record<Payment, string>> = {
  sale: { credit: "1410", cash: "1110", bank: "1210" },
  purchase: { credit: "3110", cash: "1110", bank: "1210" },
};
export const SALE_REVENUE = "6110";
export const SALE_VAT = "3430";
export const PURCHASE_VAT = "1540";
export const SERVICE_EXPENSE = "8040";

const r2 = (n: number) => Math.round(n * 100) / 100;
const r3 = (n: number) => Math.round(n * 1000) / 1000;

export interface RowTotals { amount: number; net: number; vat: number; gross: number }
export interface DocTotals { rows: RowTotals[]; net: number; vat: number; gross: number }

/** Суммы по строкам: «в т. ч. НДС» — НДС = сумма × 12/112; «сверху» — НДС = сумма × 12 %. */
export function rowTotals(r: DocRow, vatIncluded: boolean): RowTotals {
  const amount = r2(r.qty * r.price);
  if (r.vat !== "12") return { amount, net: amount, vat: 0, gross: amount };
  if (vatIncluded) { const vat = r2((amount * 12) / 112); return { amount, net: r2(amount - vat), vat, gross: amount }; }
  const vat = r2(amount * 0.12);
  return { amount, net: amount, vat, gross: r2(amount + vat) };
}

export function docTotals(d: TradeDoc): DocTotals {
  const rows = d.rows.map((r) => rowTotals(r, d.vatIncluded));
  return { rows, net: r2(rows.reduce((s, x) => s + x.net, 0)), vat: r2(rows.reduce((s, x) => s + x.vat, 0)), gross: r2(rows.reduce((s, x) => s + x.gross, 0)) };
}

/** Problems that stop saving; empty — the document is fine. */
export function validateDoc(d: TradeDoc): string[] {
  const p: string[] = [];
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) p.push("Укажите дату документа");
  if (!d.number.trim()) p.push("Укажите номер документа");
  if (d.payment === "credit" && !d.party.trim()) p.push(d.type === "sale" ? "Укажите покупателя — продажа в долг без контрагента не попадёт в расчёты" : "Укажите поставщика");
  if (!d.rows.length) p.push("Добавьте хотя бы одну строку");
  d.rows.forEach((r, i) => {
    if (!r.name.trim()) p.push(`Строка ${i + 1}: укажите номенклатуру`);
    if (!(r.qty > 0)) p.push(`Строка ${i + 1}: количество должно быть больше нуля`);
    if (!(r.price >= 0)) p.push(`Строка ${i + 1}: цена не может быть отрицательной`);
  });
  if (!p.length && !(docTotals(d).gross > 0)) p.push("Сумма документа — ноль");
  return p;
}

/** Где учитывается строка поступления: запасы по виду, услуги — в расходы. */
export const purchaseAccount = (k: ItemKind) => KIND_ACCOUNT[k] ?? SERVICE_EXPENSE;

/** Проводка документа: строки журнала со счетами, контрагентом, номенклатурой и количеством. */
export function docLines(d: TradeDoc): LedgerLine[] {
  const t = docTotals(d);
  const party = d.party.trim() || null, partyInn = d.partyInn?.replace(/\D/g, "") || null;
  const settle: LedgerLine = { account: SETTLE[d.type][d.payment], debit: 0, credit: 0, party, partyInn };
  const lines: LedgerLine[] = [];
  if (d.type === "sale") {
    lines.push({ ...settle, debit: t.gross });
    d.rows.forEach((r, i) => lines.push({ account: SALE_REVENUE, debit: 0, credit: t.rows[i].net, item: r.name.trim(), qty: r3(r.qty), unit: r.unit }));
    if (t.vat > 0) lines.push({ account: SALE_VAT, debit: 0, credit: t.vat });
  } else {
    d.rows.forEach((r, i) => lines.push({ account: purchaseAccount(r.kind), debit: t.rows[i].net, credit: 0, ...(r.kind === "service" ? { memo: r.name.trim() } : { item: r.name.trim(), qty: r3(r.qty), unit: r.unit }) }));
    if (t.vat > 0) lines.push({ account: PURCHASE_VAT, debit: t.vat, credit: 0 });
    lines.push({ ...settle, credit: t.gross });
  }
  return lines.filter((l) => l.debit > 0 || l.credit > 0);
}

export function docDescription(d: TradeDoc): string {
  const who = d.party.trim() || (d.type === "sale" ? "розничный покупатель" : "поставщик");
  return d.type === "sale" ? `Реализация № ${d.number}: ${who}` : `Поступление № ${d.number} от ${who}`;
}

/** sourceRef проводки: «sale:15», «purchase:<номер поставщика>» */
export const docRef = (d: Pick<TradeDoc, "type" | "number">) => `${d.type}:${d.number.trim()}`;
export const refType = (ref: string | null | undefined): DocType | null => (ref?.startsWith("sale:") ? "sale" : ref?.startsWith("purchase:") ? "purchase" : null);

/** Следующий номер реализации в году даты: максимум числовых номеров + 1. */
export function nextSaleNumber(refs: Array<{ ref: string | null; date: string }>, date: string): string {
  const y = date.slice(0, 4);
  let max = 0;
  for (const r of refs) if (r.ref?.startsWith("sale:") && r.date.startsWith(y)) { const n = Number(r.ref.slice(5)); if (Number.isInteger(n) && n > max) max = n; }
  return String(max + 1);
}

/**
 * The document back from its journal entry, when the saved copy is missing or the entry was changed by
 * hand in the journal: prices without VAT, rate 12 % on goods rows when the entry has a VAT line.
 */
export function docFromEntry(e: { date: string; description: string; sourceRef?: string | null; lines: LedgerLine[] }): TradeDoc | null {
  const type = refType(e.sourceRef);
  if (!type) return null;
  const number = e.sourceRef!.slice(type.length + 1);
  const settleAcc = Object.entries(SETTLE[type]);
  const settle = e.lines.find((l) => settleAcc.some(([, a]) => a === l.account) && (type === "sale" ? l.debit > 0 : l.credit > 0));
  const payment = (settleAcc.find(([, a]) => a === settle?.account)?.[0] ?? "credit") as Payment;
  const hasVat = e.lines.some((l) => l.account === (type === "sale" ? SALE_VAT : PURCHASE_VAT));
  const rowsSrc = type === "sale"
    ? e.lines.filter((l) => l.account === SALE_REVENUE && l.credit > 0)
    : e.lines.filter((l) => l !== settle && l.account !== PURCHASE_VAT && l.debit > 0);
  const kindByAcc = (a: string): ItemKind => (a === "1620" ? "material" : a === "1640" ? "product" : /^16/.test(a) ? "goods" : "service");
  const rows: DocRow[] = rowsSrc.map((l) => {
    const qty = Number(l.qty) || 1, amount = type === "sale" ? l.credit : l.debit;
    return { name: (l.item || l.memo || "").trim(), unit: l.unit || "шт", kind: type === "sale" ? "goods" : kindByAcc(l.account), qty, price: r2(amount / qty), vat: hasVat ? "12" : "none" };
  });
  return { type, number, date: e.date, party: settle?.party ?? "", partyInn: settle?.partyInn ?? undefined, payment, vatIncluded: false, rows };
}
