// ════════════════════════════════════════════════════════════════════════
// lib/primary/detect.ts — какие первичные документы подтверждают проводку.
//
// Проводка в журнале — это запись в регистре; по ПП № 231 (п. 12) она
// должна опираться на первичный документ. Здесь по корреспонденции счетов
// определяется, какой документ (форма из альбома межведомственных форм или
// ПП № 281) оформляет операцию, и даётся сквозная нумерация с начала года.
// ════════════════════════════════════════════════════════════════════════

import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

export type DocKind =
  | "ko1" | "ko2" | "ao1"
  | "m4" | "m11" | "m15"
  | "os1" | "os4"
  | "t49" | "t53"
  | "waybill" | "act" | "invoice";

export type RegisterKind = "ko3" | "ko4" | "inv15" | "inv3" | "inv1" | "sales" | "purchases" | "payrollBook" | "faBook" | "m2";

export const DOC_INFO: Record<DocKind, { code: string; title: string; area: string; basis: string }> = {
  ko1: { code: "КО-1", title: "Приходный кассовый ордер", area: "Касса", basis: "ПП № 281, прил. 1" },
  ko2: { code: "КО-2", title: "Расходный кассовый ордер", area: "Касса", basis: "ПП № 281, прил. 2" },
  ao1: { code: "АО-1", title: "Авансовый отчёт", area: "Касса", basis: "альбом форм" },
  m4: { code: "М-4", title: "Приходный ордер", area: "Запасы", basis: "альбом форм" },
  m11: { code: "М-11", title: "Требование-накладная", area: "Запасы", basis: "альбом форм" },
  m15: { code: "М-15", title: "Накладная на отпуск материалов на сторону", area: "Запасы", basis: "альбом форм" },
  os1: { code: "ОС-1", title: "Акт (накладная) приёмки-передачи основных средств", area: "Основные средства", basis: "альбом форм" },
  os4: { code: "ОС-4", title: "Акт на списание основных средств", area: "Основные средства", basis: "альбом форм" },
  t49: { code: "Т-49", title: "Расчётно-платёжная ведомость", area: "Зарплата", basis: "альбом форм" },
  t53: { code: "Т-53", title: "Платёжная ведомость", area: "Зарплата", basis: "альбом форм" },
  waybill: { code: "—", title: "Накладная на отпуск товаров (продукции)", area: "Продажи", basis: "форма организации, ПП № 231, п. 17" },
  act: { code: "—", title: "Акт выполненных работ (оказанных услуг)", area: "Продажи", basis: "форма организации, ПП № 231, п. 17" },
  invoice: { code: "—", title: "Счёт на оплату", area: "Продажи", basis: "форма организации" },
};

export const REGISTER_INFO: Record<RegisterKind, { code: string; title: string; hint: string }> = {
  ko3: { code: "КО-3", title: "Журнал регистрации приходных и расходных кассовых документов", hint: "Все ПКО и РКО периода с номерами" },
  ko4: { code: "КО-4", title: "Кассовая книга", hint: "Листы по дням: остаток, приход, расход (ПП № 281, гл. 4)" },
  inv15: { code: "ИНВ-15", title: "Акт инвентаризации наличных денежных средств", hint: "Остаток по учёту на конец периода — комиссия вписывает фактический" },
  inv3: { code: "ИНВ-3", title: "Инвентаризационная опись товарно-материальных ценностей", hint: "Учётные остатки запасов на конец периода" },
  inv1: { code: "ИНВ-1", title: "Инвентаризационная опись основных средств", hint: "Учётная стоимость ОС по группам на конец периода" },
  sales: { code: "ПП № 609", title: "Журнал продаж", hint: "Реализация за период: дата, покупатель, сумма" },
  purchases: { code: "ПП № 609", title: "Журнал закупок", hint: "Поступления от поставщиков за период" },
  payrollBook: { code: "ПП № 609", title: "Книга оплаты труда", hint: "Начислено, удержано, к выплате по месяцам" },
  faBook: { code: "ПП № 609", title: "Книга учёта основных средств и НМА", hint: "Поступления, выбытия и амортизация за период" },
  m2: { code: "М-2", title: "Доверенность", hint: "Бланк на получение ценностей" },
};

const CASH = new Set(["1110", "1120"]);
const STOCK = /^1(6[12]|7[0-9])\d$/;            // 1610, 1620, 1700–1790
const PROD = /^(163|164|7[0-4])\d{1,2}$/;        // НЗП, готовая продукция, себестоимость
const FA = /^21[1-8]\d$/;
const SALES = /^61\d\d$/;

const dr = (e: LedgerEntry, f: (a: string) => boolean) => e.lines.filter((l) => l.debit > 0 && f(l.account));
const cr = (e: LedgerEntry, f: (a: string) => boolean) => e.lines.filter((l) => l.credit > 0 && f(l.account));
const total = (ls: LedgerLine[], side: "debit" | "credit") => ls.reduce((s, l) => s + l[side], 0);

/** Documents that back one journal entry (opening balances and closing entries need none). */
export function detect(e: LedgerEntry, services = false): DocKind[] {
  if (e.source === "opening" || e.source === "closing" || e.source === "tax") return [];
  const out: DocKind[] = [];
  if (dr(e, (a) => CASH.has(a)).length) out.push("ko1");
  if (cr(e, (a) => CASH.has(a)).length) {
    out.push("ko2");
    // зарплата из кассы: платёжная ведомость + один РКО на общую сумму (ПП № 281, п. 14)
    if (dr(e, (a) => a === "3520").length) out.push("t53");
  }
  if (cr(e, (a) => a === "1520").length && dr(e, (a) => !CASH.has(a)).length) out.push("ao1");
  if (dr(e, (a) => STOCK.test(a)).length && !cr(e, (a) => STOCK.test(a) || PROD.test(a)).length) out.push("m4");
  if (cr(e, (a) => STOCK.test(a)).length && dr(e, (a) => PROD.test(a)).length) out.push("m11");
  if (cr(e, (a) => STOCK.test(a)).length && dr(e, (a) => a === "1410" || a === "1590" || a === "1520").length) out.push("m15");
  if (dr(e, (a) => FA.test(a)).length) out.push("os1");
  if (cr(e, (a) => FA.test(a)).length) out.push("os4");
  if (e.source === "payroll" && cr(e, (a) => a === "3520").length) out.push("t49");
  if (cr(e, (a) => SALES.test(a)).length && dr(e, (a) => a === "1410").length) {
    out.push(services ? "act" : "waybill", "invoice");
  }
  return Array.from(new Set(out));
}

export interface Numbered { kind: DocKind; number: number }

/** Through numbering per document kind from the start of each calendar year (ПП № 281, прил. 3, п. 3). */
export function numberDocs(entries: LedgerEntry[], services = false): Map<string, Numbered[]> {
  const seq = new Map<string, number>();
  const out = new Map<string, Numbered[]>();
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  for (const e of sorted) {
    const kinds = detect(e, services);
    if (!kinds.length) continue;
    const year = e.date.slice(0, 4);
    out.set(e.id, kinds.map((kind) => {
      const k = `${year}:${kind}`;
      const n = (seq.get(k) ?? 0) + 1;
      seq.set(k, n);
      return { kind, number: n };
    }));
  }
  return out;
}

/** The amount a document of this kind carries for the entry. */
export function docAmount(e: LedgerEntry, kind: DocKind): number {
  switch (kind) {
    case "ko1": return total(dr(e, (a) => CASH.has(a)), "debit");
    case "ko2": case "t53": return total(cr(e, (a) => CASH.has(a)), "credit");
    case "ao1": return total(cr(e, (a) => a === "1520"), "credit");
    case "m4": return total(dr(e, (a) => STOCK.test(a)), "debit");
    case "m11": case "m15": return total(cr(e, (a) => STOCK.test(a)), "credit");
    case "os1": return total(dr(e, (a) => FA.test(a)), "debit");
    case "os4": return total(cr(e, (a) => FA.test(a)), "credit");
    case "t49": return total(cr(e, (a) => a === "3520"), "credit");
    case "waybill": case "act": case "invoice": return total(cr(e, (a) => SALES.test(a)), "credit");
  }
}

/** Corresponding account for a cash document: the other side of the cash line. */
export function corrAccount(e: LedgerEntry, kind: DocKind): string {
  const other = kind === "ko1" ? cr(e, () => true) : dr(e, () => true);
  const main = other.filter((l) => !CASH.has(l.account)).sort((a, b) => (b.debit + b.credit) - (a.debit + a.credit))[0];
  return main?.account ?? "";
}

/** «ОсОО «ТехноМебель»» from «Закупка ЛДСП у ОсОО «ТехноМебель», июль». */
export function counterpartyOf(e: LedgerEntry): string {
  const text = [e.description, ...e.lines.map((l) => l.memo ?? "")].join(" ");
  const m = text.match(/(?:ОсОО|ООО|ОАО|ЗАО|ИП|АО|ОФ)\s*«[^»]+»|(?:ИП)\s+[А-ЯЁ][а-яё]+(?:\s+[А-ЯЁ]\.\s?[А-ЯЁ]\.)?|(?:ИП)\s+[А-ЯЁ][а-яё]+/);
  if (m) return m[0];
  const bank = text.match(/(Бакай Банк|МБанк|Оптима Банк|Айыл Банк|Демир Банк|Kicb|РСК Банк|Банк Азии|Эльдик Банк|Халык Банк)/i);
  return bank ? bank[0] : "";
}

export const FA_RE = FA;
export const STOCK_RE = STOCK;
