// ════════════════════════════════════════════════════════════════════════
// lib/esf/registry.ts — загрузка реестра ЭСФ (выгрузка журнала полученных
// или выданных счетов-фактур в Excel/CSV) и превращение его в проводки.
//
// Колонки находятся по заголовкам («Номер», «Дата», «ИНН», «Поставщик»,
// «Сумма без НДС», «НДС», «Всего»), пользователь может поправить
// сопоставление. Каждый документ — одна проводка с контрагентом и ИНН:
//   полученные: Дт выбранный счёт (товары, материалы, услуги, ОС)
//               Дт 1540 НДС к зачёту (если плательщик НДС) — Кт 3110
//   выданные:   Дт 1410 — Кт 6110 (без НДС), Кт 3430 НДС
// Повторная загрузка не задваивает: sourceRef = esf:<in|out>:<ИНН>:<номер>.
// ════════════════════════════════════════════════════════════════════════

import { round2, type LedgerLine } from "@/lib/ledger/types";

export type Field = "number" | "date" | "inn" | "party" | "item" | "qty" | "unit" | "net" | "vat" | "total";
export const FIELD_LABEL: Record<Field, string> = {
  number: "Номер ЭСФ", date: "Дата", inn: "ИНН контрагента", party: "Контрагент", item: "Наименование товара, услуги",
  qty: "Количество", unit: "Единица измерения",
  net: "Сумма без НДС", vat: "Сумма НДС", total: "Всего с НДС",
};

const PATTERNS: Record<Field, RegExp[]> = {
  number: [/номер|№|серия/i],
  date: [/дата\s*(выписки|поставки|документа|сф|эсф)?$/i, /дата/i],
  inn: [/инн|пин|идентификац/i],
  party: [/поставщик|покупател|получател|контрагент|наименование\s*(организации|контрагента|поставщика|покупателя)/i],
  item: [/товар|услуг|наименование\s*(товара|работ)|описание/i],
  qty: [/кол-?во|количество/i],
  unit: [/ед\.?\s*изм|единиц/i],
  net: [/без\s*ндс|стоимость\s*без|облагаем|сумма\s*без/i],
  vat: [/^ндс$|сумма\s*ндс|ндс,?\s*сом|^ндс\s/i],
  total: [/всего|итого|с\s*ндс|к\s*оплате/i],
};

/** Guess which column holds which field from the header row. */
export function detectColumns(headers: string[]): Partial<Record<Field, number>> {
  const out: Partial<Record<Field, number>> = {};
  const taken = new Set<number>();
  // more specific fields first, so «Сумма без НДС» is not taken by «НДС»
  for (const f of ["net", "total", "vat", "inn", "number", "date", "qty", "unit", "party", "item"] as Field[]) {
    for (const re of PATTERNS[f]) {
      const i = headers.findIndex((h, k) => !taken.has(k) && re.test(String(h ?? "").trim()));
      if (i >= 0) { out[f] = i; taken.add(i); break; }
    }
  }
  return out;
}

/** «12 345,67», «12345.67», 12345.67 → number */
export function num(v: unknown): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const s = String(v ?? "").replace(/\s| /g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, "");
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

/** «05.11.2026», «2026-11-05», Excel serial 46331 → «2026-11-05» */
export function isoDate(v: unknown): string | null {
  if (typeof v === "number" && v > 30000 && v < 80000) return new Date(Date.UTC(1899, 11, 30) + v * 864e5).toISOString().slice(0, 10);
  const s = String(v ?? "").trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = s.match(/^(\d{1,2})[./](\d{1,2})[./](\d{2,4})/);
  if (m) { const y = m[3].length === 2 ? `20${m[3]}` : m[3]; return `${y}-${m[2].padStart(2, "0")}-${m[1].padStart(2, "0")}`; }
  return null;
}

export interface InvoiceItem { name: string; qty: number | null; unit: string; net: number }

export interface Invoice {
  number: string;
  date: string;
  inn: string;
  party: string;
  item: string;
  /** goods of the invoice — one debit line each, so stock gets quantities */
  items: InvoiceItem[];
  net: number;
  vat: number;
  total: number;
  problem: string | null;
}

/** Rows of the sheet (first row — headers) → invoices; rows of one ЭСФ (several goods) are merged. */
export function parseRegistry(rows: unknown[][], cols: Partial<Record<Field, number>>, vatRate = 0.12): Invoice[] {
  const get = (r: unknown[], f: Field) => (cols[f] === undefined ? undefined : r[cols[f]!]);
  const byKey = new Map<string, Invoice>();
  for (const r of rows.slice(1)) {
    if (!r || r.every((c) => c === null || c === undefined || String(c).trim() === "")) continue;
    const number = String(get(r, "number") ?? "").trim();
    const date = isoDate(get(r, "date"));
    const inn = String(get(r, "inn") ?? "").replace(/\D/g, "");
    const party = String(get(r, "party") ?? "").trim();
    const item = String(get(r, "item") ?? "").trim();
    let net = num(get(r, "net")), vat = num(get(r, "vat")), total = num(get(r, "total"));
    if (!net && total && cols.vat !== undefined) net = round2(total - vat);
    if (!net && total && cols.vat === undefined) { net = round2(total / (1 + vatRate)); vat = round2(total - net); }
    if (!total) total = round2(net + vat);
    const q = num(get(r, "qty"));
    const line: InvoiceItem = { name: item, qty: q > 0 ? q : null, unit: String(get(r, "unit") ?? "").trim(), net: round2(net) };
    if ((!number && !date) || /^(итого|всего)/i.test(party)) continue; // итоговые и пустые строки
    const key = `${inn}|${number}|${date}`;
    const prev = byKey.get(key);
    if (prev) {
      prev.net = round2(prev.net + net); prev.vat = round2(prev.vat + vat); prev.total = round2(prev.total + total);
      if (item && !prev.item.includes(item)) prev.item = prev.item ? `${prev.item}; ${item}` : item;
      prev.items.push(line);
      continue;
    }
    const problems: string[] = [];
    if (!date) problems.push("нет даты");
    if (!number) problems.push("нет номера");
    if (!(total > 0)) problems.push("нет суммы");
    if (Math.abs(net + vat - total) > 0.05) problems.push(`без НДС + НДС ≠ всего (${round2(net + vat)} и ${total})`);
    byKey.set(key, { number, date: date ?? "", inn, party, item, items: [line], net: round2(net), vat: round2(vat), total: round2(total), problem: problems.join("; ") || null });
  }
  return [...byKey.values()].sort((a, b) => a.date.localeCompare(b.date) || a.number.localeCompare(b.number));
}

export type Direction = "in" | "out";

export const PURCHASE_ACCOUNTS: Array<{ code: string; title: string }> = [
  { code: "1610", title: "Товары (на склад)" },
  { code: "1620", title: "Сырьё и материалы" },
  { code: "1740", title: "Прочие материалы" },
  { code: "7210", title: "Закупка товаров (периодический учёт)" },
  { code: "8040", title: "Услуги сторонних организаций" },
  { code: "8220", title: "Коммунальные услуги" },
  { code: "7540", title: "Доставка и хранение" },
  { code: "2140", title: "Оборудование (основное средство)" },
];

export const esfRef = (d: Direction, inv: Pick<Invoice, "inn" | "number">) => `esf:${d}:${inv.inn || "-"}:${inv.number}`;

export function esfLines(inv: Omit<Invoice, "problem">, d: Direction, account: string, vatPayer: boolean): LedgerLine[] {
  const party = inv.party || null, partyInn = inv.inn || null;
  const memo = `ЭСФ № ${inv.number}`;
  if (d === "in") {
    const takeVat = vatPayer && inv.vat > 0;
    const base = takeVat ? inv.net : inv.total;
    // one line per item when the items add up to the invoice; otherwise one line for the whole invoice
    const items = (inv.items ?? []).filter((x) => x.net > 0);
    const itemsNet = round2(items.reduce((s, x) => s + x.net, 0));
    const lines: LedgerLine[] = [];
    if (items.length > 1 || (items.length === 1 && items[0].qty)) {
      if (Math.abs(itemsNet - inv.net) < 0.05) {
        let rest = base;
        items.forEach((x, k) => {
          const amount = k === items.length - 1 ? round2(rest) : round2((x.net / itemsNet) * base);
          rest = round2(rest - amount);
          lines.push({ account, debit: amount, credit: 0, memo, item: x.name || null, qty: x.qty, unit: x.unit || null });
        });
      }
    }
    if (!lines.length) lines.push({ account, debit: base, credit: 0, memo, item: inv.item || null });
    if (takeVat) lines.push({ account: "1540", debit: inv.vat, credit: 0, memo: `НДС по ЭСФ № ${inv.number}` });
    lines.push({ account: "3110", debit: 0, credit: inv.total, party, partyInn, memo });
    return lines;
  }
  const lines: LedgerLine[] = [{ account: "1410", debit: inv.total, credit: 0, party, partyInn, memo }, { account: "6110", debit: 0, credit: inv.net, memo, item: inv.item || null }];
  if (inv.vat > 0) lines.push({ account: "3430", debit: 0, credit: inv.vat, memo: `НДС по ЭСФ № ${inv.number}` });
  return lines;
}
