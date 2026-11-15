// ════════════════════════════════════════════════════════════════════════
// lib/import-goods/calc.ts — ввоз товара: себестоимость каждой позиции
// с доставкой, пошлиной, сборами и НДС при ввозе, и проводка.
//
// Два пути:
//  • из стран ЕАЭС — таможни нет; НДС при ввозе платится в ГНС по
//    заявлению о ввозе товаров (отчёт по косвенным налогам STI-123) не позднее
//    20-го числа месяца, следующего за отчётным. База — стоимость товара по
//    договору; для товаров из перечня ГНС «налоговая база НДС, имеющая
//    признаки риска» — не ниже базы из перечня;
//  • из третьих стран (Китай, Турция…) — через таможню: пошлина по ставке
//    ЕТТ ЕАЭС от таможенной стоимости, таможенные сборы, НДС при ввозе
//    с (таможенной стоимости + пошлины).
// С 01.11.2026 кабинет налогоплательщика проверяет в разделе 3 STI-123
// коды ТН ВЭД, единицы и количество — поэтому они обязательны в каждой строке.
//
// Проводки (план счетов Пост. № 231):
//   Дт 1610 (по позициям, с количеством) — полная себестоимость
//   Дт 1540 — НДС при ввозе к зачёту (если компания — плательщик НДС;
//             иначе НДС входит в себестоимость)
//   Кт 3110 поставщик (в валюте) — стоимость товара по курсу НБКР
//   Кт 3110 перевозчик / 1210 — доставка
//   Кт 3490 «Таможенная служба» / 1210 — пошлина, сборы, НДС на таможне
//   Кт 3490 «НДС при ввозе из ЕАЭС» — к уплате в ГНС по заявлению
// НДС при ввозе не идёт на 3430: этот счёт — НДС с реализации.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

import { VAT_RATE } from "@/lib/tax-engine";
import type { LedgerLine } from "@/lib/ledger/types";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export type Origin = "eaeu" | "third";
export const ORIGIN_LABEL: Record<Origin, string> = { eaeu: "ЕАЭС (без таможни)", third: "Третья страна (таможня)" };
export const EAEU = ["Россия", "Казахстан", "Беларусь", "Армения"];

export interface ImportRow {
  item: string;
  /** код ТН ВЭД ЕАЭС, 10 цифр */
  hs: string;
  unit: string;
  qty: number;
  /** цена за единицу в валюте контракта */
  price: number;
  /** ставка ввозной пошлины, % (только из третьих стран) */
  duty?: number;
  /** для товаров из перечня ГНС с признаками риска: минимальная база НДС за единицу, сом */
  minBase?: number;
}

export interface ImportDoc {
  number: string;
  date: string;
  origin: Origin;
  country: string;
  supplier: string;
  supplierInn?: string;
  currency: string;
  /** курс НБКР на дату (сом за 1 единицу валюты); для KGS — 1 */
  rate: number;
  rows: ImportRow[];
  /** доставка до склада, сом */
  delivery: number;
  carrier?: string;
  /** входит ли доставка (до границы) в таможенную стоимость — для ввоза из третьих стран */
  deliveryInCustomsValue: boolean;
  /** таможенные сборы за оформление, услуги брокера, сом */
  fees: number;
  /** прочие расходы на ввоз (страховка, сертификаты), сом */
  other: number;
  /** компания — плательщик НДС: НДС при ввозе к зачёту */
  vatPayer: boolean;
  /** таможенные платежи и доставка оплачены сразу с расчётного счёта */
  paidNow: boolean;
  /** ТТН / CMR, номер декларации на товары или заявления о ввозе */
  docs?: string;
}

export interface ImportRowCalc extends ImportRow {
  invoice: number;       // стоимость по контракту, сом
  delivery: number;      // доля доставки
  fees: number;          // доля сборов и прочих
  customsValue: number;  // таможенная стоимость (третьи страны) или база по договору
  dutyAmount: number;
  vatBase: number;
  vat: number;
  cost: number;          // полная себестоимость (без НДС у плательщика)
  unitCost: number;
}

export interface ImportCalc {
  rows: ImportRowCalc[];
  totals: { invoiceCur: number; invoice: number; delivery: number; fees: number; duty: number; vat: number; cost: number; payable: number };
  lines: LedgerLine[];
  /** срок уплаты НДС и подачи отчёта по ЕАЭС */
  vatDue: string | null;
  problems: string[];
}

/** 20-е число месяца, следующего за месяцем принятия товара на учёт. */
export function eaeuDue(date: string): string {
  const [y, m] = date.split("-").map(Number);
  return new Date(Date.UTC(y, m, 20)).toISOString().slice(0, 10);
}

/** Распределить сумму по весам с точностью до тыйына: остаток округления — на самую крупную строку. */
export function allocate(total: number, weights: number[]): number[] {
  const sumW = weights.reduce((s, w) => s + w, 0);
  if (sumW <= 0 || total === 0) return weights.map(() => 0);
  const parts = weights.map((w) => r2((total * w) / sumW));
  const diff = r2(total - parts.reduce((s, p) => s + p, 0));
  if (diff) { const i = weights.indexOf(Math.max(...weights)); parts[i] = r2(parts[i] + diff); }
  return parts;
}

/** Подстановка {…} без перевода — по умолчанию; интерфейс передаёт свой t() для кыргызского. */
export type Tr = (text: string, vars?: Record<string, string | number>) => string;
const plain: Tr = (text, vars) => (vars ? text.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m)) : text);

export const IMPORT_TEXTS = [
  "Укажите номер документа", "Укажите дату", "Укажите поставщика", "Укажите курс валюты", "Добавьте хотя бы одну позицию",
  "Строка {n}: наименование", "Строка {n}: код ТН ВЭД — 10 цифр (его проверяет ГНС в отчёте по ЕАЭС)", "Строка {n}: единица измерения",
  "Строка {n}: количество больше нуля", "Строка {n}: цена больше нуля", "Строка {n}: ставка пошлины не может быть отрицательной",
  "Расходы не могут быть отрицательными",
];

export function validateImport(d: ImportDoc, tr: Tr = plain): string[] {
  const p: string[] = [];
  if (!d.number.trim()) p.push(tr("Укажите номер документа"));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.date)) p.push(tr("Укажите дату"));
  if (!d.supplier.trim()) p.push(tr("Укажите поставщика"));
  if (!(d.rate > 0)) p.push(tr("Укажите курс валюты"));
  if (!d.rows.length) p.push(tr("Добавьте хотя бы одну позицию"));
  d.rows.forEach((r, i) => {
    const v = { n: i + 1 };
    if (!r.item.trim()) p.push(tr("Строка {n}: наименование", v));
    if (!/^\d{10}$/.test(r.hs.replace(/\s/g, ""))) p.push(tr("Строка {n}: код ТН ВЭД — 10 цифр (его проверяет ГНС в отчёте по ЕАЭС)", v));
    if (!r.unit.trim()) p.push(tr("Строка {n}: единица измерения", v));
    if (!(r.qty > 0)) p.push(tr("Строка {n}: количество больше нуля", v));
    if (!(r.price > 0)) p.push(tr("Строка {n}: цена больше нуля", v));
    if (d.origin === "third" && (r.duty ?? 0) < 0) p.push(tr("Строка {n}: ставка пошлины не может быть отрицательной", v));
  });
  if (d.delivery < 0 || d.fees < 0 || d.other < 0) p.push(tr("Расходы не могут быть отрицательными"));
  return p;
}

export function calcImport(d: ImportDoc, tr: Tr = plain): ImportCalc {
  const problems = validateImport(d, tr);
  const third = d.origin === "third";
  const invoices = d.rows.map((r) => r2(r.qty * r.price * d.rate));
  const deliv = allocate(r2(d.delivery), invoices);
  const extra = allocate(r2(d.fees + d.other), invoices);
  const rows: ImportRowCalc[] = d.rows.map((r, i) => {
    const invoice = invoices[i];
    const customsValue = r2(invoice + (third && d.deliveryInCustomsValue ? deliv[i] : 0));
    const dutyAmount = third ? r2((customsValue * (r.duty ?? 0)) / 100) : 0;
    const base = third ? r2(customsValue + dutyAmount) : invoice;
    const vatBase = r2(Math.max(base, (r.minBase ?? 0) * r.qty));
    const vat = r2(vatBase * VAT_RATE);
    const cost = r2(invoice + deliv[i] + extra[i] + dutyAmount + (d.vatPayer ? 0 : vat));
    return { ...r, hs: r.hs.replace(/\s/g, ""), invoice, delivery: deliv[i], fees: extra[i], customsValue, dutyAmount, vatBase, vat, cost, unitCost: r.qty > 0 ? Math.round((cost / r.qty) * 10000) / 10000 : 0 };
  });
  const t = {
    invoiceCur: r2(d.rows.reduce((s, r) => s + r.qty * r.price, 0)),
    invoice: r2(invoices.reduce((s, x) => s + x, 0)),
    delivery: r2(d.delivery), fees: r2(d.fees + d.other),
    duty: r2(rows.reduce((s, r) => s + r.dutyAmount, 0)),
    vat: r2(rows.reduce((s, r) => s + r.vat, 0)),
    cost: r2(rows.reduce((s, r) => s + r.cost, 0)),
    payable: 0,
  };

  const party = d.supplier.trim(), inn = d.supplierInn?.trim() || null;
  const customs = "Таможенная служба КР";
  const lines: LedgerLine[] = rows.map((r) => ({ account: "1610", debit: r.cost, credit: 0, item: r.item.trim(), qty: r.qty, unit: r.unit.trim(), memo: `ТН ВЭД ${r.hs}` }));
  if (d.vatPayer && t.vat > 0) lines.push({ account: "1540", debit: t.vat, credit: 0, memo: third ? "НДС при ввозе, уплачен на таможне" : "НДС при ввозе из ЕАЭС" });
  lines.push({ account: "3110", debit: 0, credit: t.invoice, party, partyInn: inn, ...(d.currency !== "KGS" ? { currency: d.currency, amountCur: t.invoiceCur } : {}), memo: `Контракт: ${t.invoiceCur.toLocaleString("ru-RU")} ${d.currency} по курсу ${d.rate}` });
  if (t.delivery > 0) lines.push(d.paidNow ? { account: "1210", debit: 0, credit: t.delivery, memo: "Доставка" } : { account: "3110", debit: 0, credit: t.delivery, party: d.carrier?.trim() || "Перевозчик", memo: "Доставка" });
  if (t.fees > 0) lines.push(d.paidNow ? { account: "1210", debit: 0, credit: t.fees, memo: "Таможенные сборы и расходы на ввоз" } : { account: "3490", debit: 0, credit: t.fees, party: customs, memo: "Таможенные сборы и расходы на ввоз" });
  if (t.duty > 0) lines.push(d.paidNow ? { account: "1210", debit: 0, credit: t.duty, memo: "Ввозная таможенная пошлина" } : { account: "3490", debit: 0, credit: t.duty, party: customs, memo: "Ввозная таможенная пошлина" });
  if (t.vat > 0) {
    if (third) lines.push(d.paidNow ? { account: "1210", debit: 0, credit: t.vat, memo: "НДС при ввозе, уплачен на таможне" } : { account: "3490", debit: 0, credit: t.vat, party: customs, memo: "НДС при ввозе" });
    else lines.push({ account: "3490", debit: 0, credit: t.vat, party: "НДС при ввозе из ЕАЭС", memo: `Заявление о ввозе: уплатить до ${eaeuDue(d.date).split("-").reverse().join(".")}` });
  }
  t.payable = r2(lines.filter((l) => l.account === "3490" || l.account === "3110").reduce((s, l) => s + l.credit, 0));
  return { rows, totals: t, lines, vatDue: !third && t.vat > 0 ? eaeuDue(d.date) : null, problems };
}

export const importRef = (d: Pick<ImportDoc, "number">) => `import:${d.number.trim()}`;
export const importDescription = (d: ImportDoc) => `Ввоз товара № ${d.number.trim()} от ${d.supplier.trim()} (${d.origin === "eaeu" ? `ЕАЭС, ${d.country}` : `${d.country}, через таможню`})`;
