// Выгрузка журнала в Excel в раскладке «Журнал проводок» 1С: одна строка —
// одна пара Дт–Кт, контрагент в колонке субконто. Второй лист — использованные
// счета с наименованиями, чтобы сопоставить их с планом счетов в 1С.
import ExcelJS from "exceljs";
import type { LedgerEntry } from "@/lib/ledger/types";
import { SOURCE_LABEL } from "@/lib/ledger/types";
import { ACCOUNT_NAME, toPairs } from "./map";

export async function exportJournalXlsx(company: string, from: string, to: string, entries: LedgerEntry[]): Promise<Buffer> {
  const pairs = toPairs(entries.filter((e) => e.source !== "opening" && e.date >= from && e.date <= to));
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinLite KG";
  const ws = wb.addWorksheet("Журнал проводок", { views: [{ state: "frozen", ySplit: 4 }] });
  const d = (iso: string) => iso.split("-").reverse().join(".");
  ws.addRow([`Журнал проводок за ${d(from)} - ${d(to)}`]).font = { bold: true, size: 13 };
  ws.addRow([company]);
  ws.addRow([]);
  const head = ws.addRow(["Дата", "Документ", "Содержание", "Счет Дт", "Субконто Дт", "Счет Кт", "Субконто Кт", "Сумма", "Источник"]);
  head.font = { bold: true };
  head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFEFE9DA" } }; c.border = { bottom: { style: "thin" } }; });
  for (const p of pairs) {
    const r = ws.addRow([d(p.date), p.doc, p.text, p.dr, p.drParty, p.cr, p.crParty, p.amount, SOURCE_LABEL[p.source] ?? p.source]);
    r.getCell(8).numFmt = "#,##0.00";
  }
  const total = ws.addRow(["Итого", "", "", "", "", "", "", pairs.reduce((s, p) => s + p.amount, 0), ""]);
  total.font = { bold: true };
  total.getCell(8).numFmt = "#,##0.00";
  [12, 14, 48, 9, 28, 9, 28, 16, 18].forEach((w, i) => { ws.getColumn(i + 1).width = w; });
  ws.getColumn(3).alignment = { wrapText: true, vertical: "top" };

  const acc = wb.addWorksheet("Счета");
  acc.addRow(["Счёт", "Наименование (план счетов КР, ПП № 231)"]).font = { bold: true };
  const used = [...new Set(pairs.flatMap((p) => [p.dr, p.cr]))].sort();
  for (const c of used) acc.addRow([c, ACCOUNT_NAME(c)]);
  acc.getColumn(1).width = 10; acc.getColumn(2).width = 70;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
