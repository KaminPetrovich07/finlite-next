// Данные для раздела 3 отчёта по косвенным налогам STI-123 (импорт из стран ЕАЭС) — из документов ввоза.
// Это не сама форма ГНС, а таблица строк, которые переносятся в кабинет налогоплательщика:
// с 01.11.2026 кабинет проверяет в разделе 3 код ТН ВЭД, единицу измерения и количество.
import ExcelJS from "exceljs";
import { calcImport, eaeuDue, type ImportDoc } from "./calc";

export interface Sti123Row { n: number; date: string; supplier: string; country: string; docs: string; item: string; hs: string; unit: string; qty: number; currency: string; amountCur: number; rate: number; amount: number; vatBase: number; vat: number }

/** Строки за месяц принятия товаров на учёт. */
export function sti123Rows(docs: ImportDoc[], month: string): Sti123Row[] {
  const out: Sti123Row[] = [];
  for (const d of docs.filter((x) => x.origin === "eaeu" && x.date.slice(0, 7) === month).sort((a, b) => a.date.localeCompare(b.date))) {
    const c = calcImport(d);
    for (const r of c.rows) out.push({
      n: out.length + 1, date: d.date, supplier: d.supplier, country: d.country, docs: d.docs ?? "", item: r.item, hs: r.hs, unit: r.unit, qty: r.qty,
      currency: d.currency, amountCur: Math.round(r.qty * r.price * 100) / 100, rate: d.rate, amount: r.invoice, vatBase: r.vatBase, vat: r.vat,
    });
  }
  return out;
}

export async function sti123Xlsx(company: string, inn: string | null, month: string, rows: Sti123Row[]): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinLite KG";
  const ws = wb.addWorksheet("Раздел 3 STI-123", { views: [{ state: "frozen", ySplit: 5 }] });
  const d = (iso: string) => iso.split("-").reverse().join(".");
  const [y, m] = month.split("-");
  ws.addRow([`Данные для раздела 3 отчёта по косвенным налогам (STI-123): товары, ввезённые из государств — членов ЕАЭС, ${m}.${y}`]).font = { bold: true, size: 12 };
  ws.addRow([`${company}${inn ? `, ИНН ${inn}` : ""}`]);
  ws.addRow([`Срок подачи отчёта и уплаты НДС — не позднее ${d(eaeuDue(`${month}-01`))}. Таблица — для переноса в кабинет налогоплательщика, не официальная форма.`]).font = { italic: true, size: 9 };
  ws.addRow([]);
  const head = ws.addRow(["№", "Дата принятия на учёт", "Поставщик", "Страна", "Документы (CMR/ТТН, заявление)", "Наименование товара", "Код ТН ВЭД", "Ед. изм.", "Количество", "Валюта", "Стоимость в валюте", "Курс НБКР", "Стоимость, сом", "Налоговая база НДС, сом", "НДС 12 %, сом"]);
  head.font = { bold: true };
  head.alignment = { wrapText: true, vertical: "middle" };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE9DA" } }; c.border = { bottom: { style: "thin" } }; });
  for (const r of rows) {
    const row = ws.addRow([r.n, d(r.date), r.supplier, r.country, r.docs, r.item, r.hs, r.unit, r.qty, r.currency, r.amountCur, r.rate, r.amount, r.vatBase, r.vat]);
    row.getCell(7).numFmt = "@";
    for (const i of [11, 13, 14, 15]) row.getCell(i).numFmt = "#,##0.00";
    row.getCell(12).numFmt = "0.0000";
  }
  const total = ws.addRow(["Итого", "", "", "", "", "", "", "", "", "", "", "", rows.reduce((s, r) => s + r.amount, 0), rows.reduce((s, r) => s + r.vatBase, 0), rows.reduce((s, r) => s + r.vat, 0)]);
  total.font = { bold: true };
  for (const i of [13, 14, 15]) total.getCell(i).numFmt = "#,##0.00";
  [5, 12, 30, 12, 26, 28, 13, 8, 11, 8, 14, 10, 15, 16, 14].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  return Buffer.from(await wb.xlsx.writeBuffer());
}
