// ════════════════════════════════════════════════════════════════════════
// lib/trade/import1c.ts — документы «Реализация» и «Поступление» из 1С (Excel/CSV).
//
// Таблица строк товаров: колонки ищутся по заголовкам, порядок любой.
//   • номер и дата — отдельными колонками («Дата», «Номер») или одной
//     колонкой «Документ» / «Регистратор» / «Ссылка» вида
//     «Реализация товаров и услуг 0000-000123 от 12.11.2026 10:00:00»
//     (из неё же берётся вид документа);
//   • «Контрагент» (или «Покупатель», «Поставщик»), «ИНН»;
//   • «Номенклатура» (или «Наименование», «Товар»), «Единица», «Количество»,
//     «Цена», «Сумма», «Сумма НДС» / «НДС», «Ставка НДС», «Всего».
// Строки с одинаковыми видом, номером, датой и контрагентом собираются в один
// документ. В отчётах 1С с группировкой номер и контрагент стоят в строке-
// группе над товарами — они переносятся на строки ниже.
// Где взять в 1С: «Отчёты → Универсальный отчёт» (Документ → Реализация или
// Поступление → таблица «Товары») → Сохранить как Excel; для одного документа —
// вкладка «Товары» → «Ещё» → «Вывести список». Подойдёт любая таблица с такими
// колонками (шаблон — на странице «Продажи и закупки»).
// Чистые функции: на входе — строки листа (массив массивов).
// ════════════════════════════════════════════════════════════════════════

import { isoDate, num, type Cell } from "@/lib/import1c/parse";
import { itemKey } from "@/lib/ledger/stock";
import { normUnit, type CatalogItem, type ItemKind, type VatRate } from "./catalog";
import type { DocType, TradeDoc } from "./doc";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const r3 = (n: number) => Math.round((n + Number.EPSILON) * 1000) / 1000;
const s = (v: Cell): string => (v === null || v === undefined ? "" : v instanceof Date ? isoDate(v) : String(v)).replace(/ /g, " ").trim();
const low = (v: Cell) => s(v).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

const SPEC: Record<string, { re: RegExp; not?: RegExp }> = {
  doc: { re: /^документ|^регистратор|^ссылка/ },
  number: { re: /^номер|^№/ },
  date: { re: /^дата/ },
  party: { re: /контрагент|покупател|поставщик|^клиент|^получател/, not: /инн|договор/ },
  inn: { re: /инн/ },
  name: { re: /номенклатура|наименование|^товар|^услуг/ },
  unit: { re: /^ед|единица/ },
  qty: { re: /^кол|количество/ },
  price: { re: /^цена/ },
  vatSum: { re: /сумма ндс|^ндс$|^ндс,|^ндс \(|^в т\.? ?ч\.? ндс|ндс сом/ },
  vatRate: { re: /ставка ндс|% ндс/ },
  total: { re: /всего|сумма с ндс|^итого/ },
  amount: { re: /^сумма/, not: /ндс|всего|итого/ },
};

function header(rows: Cell[][]): { row: number; cols: Record<string, number> } | null {
  for (let i = 0; i < Math.min(rows.length, 40); i++) {
    const names = (rows[i] ?? []).map(low);
    const cols: Record<string, number> = {};
    for (const [key, { re, not }] of Object.entries(SPEC)) {
      const j = names.findIndex((n, k) => n && re.test(n) && !(not && not.test(n)) && !Object.values(cols).includes(k));
      if (j >= 0) cols[key] = j;
    }
    if ("name" in cols && "qty" in cols && ("amount" in cols || "price" in cols || "total" in cols)) return { row: i, cols };
  }
  return null;
}

const TITLE = /(реализац|поступлен|приходн|расходн|накладн|покупк|продаж)[^0-9]*?([A-Za-zА-Яа-я0-9-]*\d[A-Za-zА-Яа-я0-9/-]*)\s+от\s+(\d{1,2}\.\d{1,2}\.\d{2,4})/i;

/** «Реализация товаров и услуг 0000-000123 от 12.11.2026 10:00:00» → вид, номер, дата. */
export function docFromTitle(text: string): { type: DocType | null; number: string; date: string } | null {
  const m = text.match(TITLE);
  if (!m) return null;
  const t = m[1].toLowerCase();
  const type: DocType | null = /реализ|расходн|продаж/.test(t) ? "sale" : /поступ|приходн|покупк/.test(t) ? "purchase" : null;
  return { type, number: m[2], date: isoDate(m[3]) };
}

/** Номер 1С «0000-000123» → «123»; с буквами («БП-000045») — как есть. */
export const shortNumber = (n: string) => (/^[0\s-]*\d+$/.test(n.trim()) ? String(Number(n.replace(/\D/g, ""))) : n.trim());

function vatOf(text: string): VatRate | null {
  const t = text.toLowerCase();
  if (!t.trim()) return null;
  if (/без|не обл|освоб/.test(t)) return "none";
  if (/\b12\b|12\s*%/.test(t)) return "12";
  if (/^\s*0\s*%?\s*$|\b0\s*%/.test(t)) return "0";
  return null;
}

export interface ParsedDoc extends TradeDoc {
  /** сумма документа по файлу — для сверки в предпросмотре */
  fileTotal: number;
  /** строки файла, из которых собран документ */
  fileRows: number[];
}

export interface DocsParse { docs: ParsedDoc[]; problems: string[]; header: string[] | null }

/**
 * Документы из таблицы строк. `fallbackType` — для строк, где вид не виден из колонки «Документ».
 * `catalog` — справочник: по наименованию берутся вид номенклатуры (услуга идёт в расходы) и единица.
 */
export function parseDocSheet(rows: Cell[][], fallbackType: DocType, catalog: CatalogItem[] = []): DocsParse {
  const h = header(rows);
  if (!h) return { docs: [], problems: ["Не найдена шапка таблицы: нужны колонки «Номенклатура», «Количество» и «Сумма» (или «Цена»)."], header: null };
  const c = h.cols;
  const get = (r: Cell[], k: string): Cell => (k in c ? r[c[k]] : undefined);
  const byName = new Map(catalog.map((x) => [itemKey(x.name), x]));
  const problems: string[] = [];
  const map = new Map<string, ParsedDoc>();
  let cur = { number: "", date: "", party: "", inn: "", type: null as DocType | null };
  for (let i = h.row + 1; i < rows.length; i++) {
    const r = rows[i] ?? [];
    const docCell = s(get(r, "doc"));
    const t = docCell ? docFromTitle(docCell) : null;
    if (t) cur = { ...cur, number: t.number, date: t.date || cur.date, type: t.type ?? cur.type };
    else if (docCell) cur.type = /реализ|продаж|расход|отгруз/i.test(docCell) ? "sale" : /поступ|покуп|приход|закуп/i.test(docCell) ? "purchase" : cur.type;
    if (s(get(r, "number"))) cur.number = s(get(r, "number"));
    const dt = isoDate(get(r, "date"));
    if (dt) cur.date = dt;
    if (s(get(r, "party"))) cur.party = s(get(r, "party"));
    if (s(get(r, "inn"))) cur.inn = s(get(r, "inn")).replace(/\D/g, "");
    const name = s(get(r, "name"));
    if (!name || /^(итого|всего)/i.test(name) || name === docCell) continue;
    const qty = Math.abs(num(get(r, "qty")));
    const amount = Math.abs(num(get(r, "amount"))), total = Math.abs(num(get(r, "total"))), vatSum = Math.abs(num(get(r, "vatSum")));
    if (!qty && !amount && !total) continue; // строка-группа (документ, контрагент)
    if (!cur.number || !cur.date) { problems.push(`Строка ${i + 1}: не удалось определить номер или дату документа`); continue; }
    const type = cur.type ?? fallbackType;
    const key = `${type}|${cur.number}|${cur.date}|${cur.party.toLowerCase()}`;
    const d = map.get(key) ?? {
      type, number: shortNumber(cur.number).slice(0, 40), date: cur.date, party: cur.party.slice(0, 200), partyInn: cur.inn.slice(0, 14) || undefined,
      payment: "credit" as const, vatIncluded: true, comment: "Загружено из 1С", rows: [], fileTotal: 0, fileRows: [],
    };
    // «Сумма» без НДС и «Всего» с НДС рядом — цены в документе без НДС (НДС сверху)
    const vatOnTop = "total" in c && "amount" in c && amount > 0 && total > 0 && Math.abs(total - amount - vatSum) < 0.05 && vatSum > 0;
    if (vatOnTop) d.vatIncluded = false;
    const gross = total || amount;
    const rateText = s(get(r, "vatRate"));
    const vat: VatRate = vatOf(rateText) ?? ("vatSum" in c ? (vatSum > 0.004 ? "12" : "none") : "12");
    let price = Math.abs(num(get(r, "price")));
    if (!price && qty) price = r2((vatOnTop ? amount : gross) / qty);
    if (vatOnTop && "price" in c && qty && Math.abs(price * qty - total) < 0.05) price = r2(amount / qty); // цена в файле с НДС
    const known = byName.get(itemKey(name));
    const kind: ItemKind = known?.kind ?? (/^(услуг|доставк|перевозк|монтаж|ремонт|аренд|погрузк|разгрузк)/i.test(name) ? "service" : "goods");
    d.rows.push({ ...(known ? { itemId: known.id } : {}), name: (known?.name ?? name).slice(0, 300), unit: normUnit(s(get(r, "unit")) || known?.unit), kind, qty: r3(qty || 1), price: r2(price), vat });
    d.fileTotal = r2(d.fileTotal + (gross || price * (qty || 1)));
    d.fileRows.push(i + 1);
    map.set(key, d);
  }
  const docs = [...map.values()].map((d) => (d.rows.every((x) => x.vat === "none") ? { ...d, vatIncluded: true } : d));
  return { docs, problems: problems.slice(0, 50), header: (rows[h.row] ?? []).map(s) };
}

/** Порядок загрузки: по дате, поступления раньше реализаций того же дня — чтобы себестоимость считалась по средней. */
export const importOrder = <T extends Pick<TradeDoc, "date" | "type">>(docs: T[]): T[] =>
  [...docs].sort((a, b) => (a.date === b.date ? (a.type === b.type ? 0 : a.type === "purchase" ? -1 : 1) : a.date < b.date ? -1 : 1));

/** Шаблон таблицы для загрузки (первая строка — заголовки). */
export const DOC_TEMPLATE: Array<Array<string | number>> = [
  ["Документ", "Дата", "Номер", "Контрагент", "ИНН", "Номенклатура", "Единица", "Количество", "Цена", "Сумма", "Сумма НДС"],
  ["Реализация", "12.11.2026", "123", "ОсОО «Ак-Нур»", "02311200610123", "Мука пшеничная 1 сорт, 50 кг", "мешок", 10, 2800, 28000, 3000],
  ["Реализация", "12.11.2026", "123", "ОсОО «Ак-Нур»", "02311200610123", "Сахар-песок", "кг", 50, 85, 4250, 455.36],
  ["Поступление", "10.11.2026", "ПН-45", "ОсОО «Дан»", "01234567890123", "Сахар-песок", "кг", 500, 72, 36000, 3857.14],
];
