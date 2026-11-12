// ════════════════════════════════════════════════════════════════════════
// lib/ledger/templates.ts — типовые операции для формы проводки: пользователь
// выбирает «Продажа в долг», вводит сумму, контрагента и (если нужно) НДС —
// строки проводки заполняются сами и остаются доступными для правки.
// Счета — из плана счетов FinLite; начисление зарплаты делается отдельной
// формой («Начислить зарплату»), здесь — только её выплата.
// ════════════════════════════════════════════════════════════════════════

import { round2 } from "./types";

export type Part = "total" | "net" | "vat";
export interface TemplateLine { account: string; side: "debit" | "credit"; part: Part; want?: "party" | "item" }
export interface Template {
  key: string;
  label: string;
  group: "Продажи" | "Покупки и расходы" | "Деньги" | "Зарплата и капитал";
  /** текст операции; {party} заменяется контрагентом */
  description: string;
  /** можно выделить НДС 12 % из суммы */
  vat: boolean;
  lines: TemplateLine[];
}

export const VAT_RATE = 0.12;

export const TEMPLATES: Template[] = [
  { key: "sale-credit", label: "Продажа в долг", group: "Продажи", description: "Реализация {party}", vat: true, lines: [
    { account: "1410", side: "debit", part: "total", want: "party" }, { account: "6110", side: "credit", part: "net", want: "item" }, { account: "3430", side: "credit", part: "vat" }] },
  { key: "sale-cash", label: "Продажа за наличные", group: "Продажи", description: "Розничная продажа за наличные", vat: true, lines: [
    { account: "1110", side: "debit", part: "total" }, { account: "6110", side: "credit", part: "net", want: "item" }, { account: "3430", side: "credit", part: "vat" }] },
  { key: "customer-pays", label: "Оплата от покупателя", group: "Продажи", description: "Поступление оплаты от {party}", vat: false, lines: [
    { account: "1210", side: "debit", part: "total" }, { account: "1410", side: "credit", part: "total", want: "party" }] },
  { key: "buy-goods", label: "Покупка товаров", group: "Покупки и расходы", description: "Поступление товаров от {party}", vat: true, lines: [
    { account: "1610", side: "debit", part: "net", want: "item" }, { account: "1540", side: "debit", part: "vat" }, { account: "3110", side: "credit", part: "total", want: "party" }] },
  { key: "buy-services", label: "Услуги поставщика", group: "Покупки и расходы", description: "Услуги {party}", vat: true, lines: [
    { account: "8040", side: "debit", part: "net" }, { account: "1540", side: "debit", part: "vat" }, { account: "3110", side: "credit", part: "total", want: "party" }] },
  { key: "rent", label: "Аренда", group: "Покупки и расходы", description: "Аренда помещения, {party}", vat: true, lines: [
    { account: "8030", side: "debit", part: "net" }, { account: "1540", side: "debit", part: "vat" }, { account: "3110", side: "credit", part: "total", want: "party" }] },
  { key: "utilities", label: "Коммунальные услуги", group: "Покупки и расходы", description: "Коммунальные услуги, {party}", vat: true, lines: [
    { account: "8220", side: "debit", part: "net" }, { account: "1540", side: "debit", part: "vat" }, { account: "3110", side: "credit", part: "total", want: "party" }] },
  { key: "pay-supplier", label: "Оплата поставщику", group: "Покупки и расходы", description: "Оплата {party}", vat: false, lines: [
    { account: "3110", side: "debit", part: "total", want: "party" }, { account: "1210", side: "credit", part: "total" }] },
  { key: "cash-expense", label: "Расход наличными", group: "Покупки и расходы", description: "Канцелярские и хозяйственные расходы", vat: false, lines: [
    { account: "8060", side: "debit", part: "total" }, { account: "1110", side: "credit", part: "total" }] },
  { key: "bank-fee", label: "Комиссия банка", group: "Деньги", description: "Комиссия банка за обслуживание счёта", vat: false, lines: [
    { account: "8040", side: "debit", part: "total" }, { account: "1210", side: "credit", part: "total" }] },
  { key: "cash-in", label: "Снятие в кассу", group: "Деньги", description: "Получены наличные с расчётного счёта", vat: false, lines: [
    { account: "1110", side: "debit", part: "total" }, { account: "1210", side: "credit", part: "total" }] },
  { key: "cash-out", label: "Сдача в банк", group: "Деньги", description: "Наличные сданы на расчётный счёт", vat: false, lines: [
    { account: "1210", side: "debit", part: "total" }, { account: "1110", side: "credit", part: "total" }] },
  { key: "loan", label: "Получен кредит", group: "Деньги", description: "Получен кредит, {party}", vat: false, lines: [
    { account: "1210", side: "debit", part: "total" }, { account: "3310", side: "credit", part: "total", want: "party" }] },
  { key: "pay-salary", label: "Выплата зарплаты", group: "Зарплата и капитал", description: "Выплата заработной платы", vat: false, lines: [
    { account: "3520", side: "debit", part: "total" }, { account: "1210", side: "credit", part: "total" }] },
  { key: "capital", label: "Взнос в уставный капитал", group: "Зарплата и капитал", description: "Взнос учредителя в уставный капитал, {party}", vat: false, lines: [
    { account: "1210", side: "debit", part: "total" }, { account: "5130", side: "credit", part: "total", want: "party" }] },
];

export interface TemplateInput { total: number; vat: boolean; party?: string; item?: string; qty?: string; unit?: string }
export interface FilledLine { account: string; debit: string; credit: string; party: string; item: string; qty: string; unit: string }

/** Сумма с НДС → без НДС и НДС (НДС округляется до тыйына, остаток — в сумму без НДС). */
export function splitVat(total: number, rate = VAT_RATE): { net: number; vat: number } {
  const vat = round2((total * rate) / (1 + rate));
  return { net: round2(total - vat), vat };
}

const money = (x: number) => (x ? x.toFixed(2).replace(".", ",") : "");

/** Строки проводки по шаблону; строки НДС исчезают, когда НДС не выделяется. */
export function fillTemplate(t: Template, inp: TemplateInput): { description: string; lines: FilledLine[] } {
  const useVat = t.vat && inp.vat;
  const { net, vat } = useVat ? splitVat(inp.total) : { net: round2(inp.total), vat: 0 };
  const amount = (p: Part) => (p === "total" ? round2(inp.total) : p === "net" ? net : vat);
  const lines = t.lines
    .filter((l) => l.part !== "vat" || useVat)
    .map((l) => {
      const a = money(amount(l.part));
      return {
        account: l.account,
        debit: l.side === "debit" ? a : "",
        credit: l.side === "credit" ? a : "",
        party: l.want === "party" ? (inp.party ?? "").trim() : "",
        item: l.want === "item" ? (inp.item ?? "").trim() : "",
        qty: l.want === "item" ? inp.qty ?? "" : "",
        unit: l.want === "item" ? inp.unit ?? "" : "",
      };
    });
  const party = (inp.party ?? "").trim();
  const description = t.description.replace(/,?\s*\{party\}/, party ? (t.description.includes(", {party}") ? `, ${party}` : ` ${party}`) : "").trim();
  return { description, lines };
}

export const templateWants = (t: Template) => ({ party: t.lines.some((l) => l.want === "party"), item: t.lines.some((l) => l.want === "item") });
