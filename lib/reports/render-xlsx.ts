// Excel: one sheet per section, real numbers (not text) so the user can keep
// calculating; money formatted with grouping and negatives in brackets.
import ExcelJS from "exceljs";
import type { Block, Column, ReportDoc, RowStyle } from "./model";

const MONEY = '#,##0;(#,##0);"—"';
const NUM = '#,##0.##;-#,##0.##;"—"';
const PCT = '0.0"%";-0.0"%";"—"';
const GOLD = "FF8C6000";
const LINE = "FFDEE2E9";
const HEAD_FILL = "FFEEF0F4";
const TOTAL_FILL = "FFFFF4D1";

function fmtFor(kind: Column["kind"]) {
  return kind === "money" ? MONEY : kind === "pct" ? PCT : kind === "num" ? NUM : undefined;
}

export async function renderXlsx(doc: ReportDoc): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "FinLite KG";
  wb.created = new Date();
  wb.title = `${doc.title} — ${doc.company}`;

  const used = new Set<string>();
  for (const section of doc.sections) {
    let name = section.sheet.replace(/[\\/?*[\]:]/g, " ").slice(0, 31);
    let k = 2;
    while (used.has(name)) name = `${section.sheet.slice(0, 28)} ${k++}`;
    used.add(name);
    const ws = wb.addWorksheet(name, { views: [{ showGridLines: false }], pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0, paperSize: 9 } });

    const width = Math.max(4, ...section.blocks.map((b) => (b.type === "table" ? b.columns.length : b.type === "kpis" ? 3 : b.type === "checks" ? 3 : 3)));
    // column widths from the widest table on the sheet
    const widths: number[] = Array(width).fill(14);
    for (const b of section.blocks) {
      if (b.type !== "table") continue;
      b.columns.forEach((c, i) => { widths[i] = Math.max(widths[i], Math.round((c.width ?? 15) * 1.25), c.kind === "money" ? 16 : 0); });
    }
    if (section.blocks.some((b) => b.type === "kpis" || b.type === "bars")) widths[0] = Math.max(widths[0], 30);
    widths.forEach((w, i) => { ws.getColumn(i + 1).width = Math.min(70, w); });

    const title = ws.addRow([`${doc.title}: ${section.title}`]);
    title.font = { bold: true, size: 14 };
    const meta = ws.addRow([`${doc.company} · ${doc.period} · ${doc.regime}`]);
    meta.font = { color: { argb: "FF5B6170" }, size: 10 };
    if (doc.disclaimer) ws.addRow([doc.disclaimer]).font = { italic: true, color: { argb: "FFB45309" }, size: 10 };
    ws.addRow([]);

    const text = (t: string, opts: { bold?: boolean; italic?: boolean; size?: number; color?: string } = {}) => {
      const row = ws.addRow([t]);
      ws.mergeCells(row.number, 1, row.number, width);
      row.getCell(1).alignment = { wrapText: true, vertical: "top" };
      row.getCell(1).font = { bold: opts.bold, italic: opts.italic, size: opts.size ?? 11, color: opts.color ? { argb: opts.color } : undefined };
      const chars = widths.slice(0, width).reduce((a, b) => a + b, 0);
      row.height = Math.max(16, Math.ceil(t.length / Math.max(40, chars * 1.1)) * 15);
    };

    let frozen = false;
    for (const b of section.blocks) renderBlock(b);

    function renderBlock(b: Block) {
      switch (b.type) {
        case "h2": ws.addRow([]); text(b.text, { bold: true, size: 12 }); break;
        case "p": text(b.text); break;
        case "note": text(b.text, { italic: true, color: "FFB45309" }); break;
        case "pagebreak": break;
        case "kpis":
          for (const i of b.items) {
            const r = ws.addRow([i.label, i.value, i.note ?? ""]);
            r.getCell(1).font = { color: { argb: "FF5B6170" } };
            r.getCell(2).font = { bold: true, size: 12 };
            r.getCell(3).font = { color: { argb: "FF5B6170" }, size: 10 };
          }
          ws.addRow([]);
          break;
        case "bars": {
          text(b.title, { bold: true });
          const max = Math.max(1, ...b.items.map((i) => i.value));
          for (const i of b.items) {
            const r = ws.addRow([i.label, i.value, "█".repeat(Math.max(1, Math.round((i.value / max) * 20)))]);
            r.getCell(2).numFmt = MONEY;
            r.getCell(3).font = { color: { argb: "FF2A78D6" } };
          }
          ws.addRow([]);
          break;
        }
        case "checks":
          for (const c of b.items) {
            const r = ws.addRow([c.status === "ok" ? "✓ сходится" : c.status === "warn" ? "! внимание" : "✕ не сходится", c.title, c.detail]);
            r.getCell(1).font = { bold: true, color: { argb: c.status === "ok" ? "FF15803D" : c.status === "warn" ? "FFB45309" : "FFC42026" } };
            r.getCell(3).alignment = { wrapText: true };
          }
          ws.addRow([]);
          break;
        case "table": {
          if (b.title) text(b.title, { bold: true, size: 12 });
          const head = ws.addRow(b.columns.map((c) => c.label));
          head.eachCell((cell, col) => {
            cell.font = { bold: true, size: 10, color: { argb: "FF3A4050" } };
            cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEAD_FILL } };
            cell.border = { bottom: { style: "thin", color: { argb: LINE } } };
            const kind = b.columns[col - 1]?.kind;
            cell.alignment = { horizontal: kind === "money" || kind === "num" || kind === "pct" ? "right" : "left", vertical: "middle", wrapText: true };
          });
          if (!frozen && b.rows.length > 25) { ws.views = [{ state: "frozen", ySplit: head.number, showGridLines: false }]; frozen = true; }
          for (const row of b.rows) styleRow(ws.addRow(row.cells.map((c) => (c === null ? null : c))), b.columns, row.style ?? "normal");
          if (b.note) text(b.note, { italic: true, size: 9, color: "FF5B6170" });
          ws.addRow([]);
          break;
        }
      }
    }
  }

  const buf = await wb.xlsx.writeBuffer();
  return Buffer.from(buf as ArrayBuffer);
}

function styleRow(r: ExcelJS.Row, columns: Column[], style: RowStyle) {
  columns.forEach((c, i) => {
    const cell = r.getCell(i + 1);
    const f = fmtFor(c.kind);
    if (f && typeof cell.value === "number") cell.numFmt = f;
    cell.alignment = { horizontal: c.kind === "money" || c.kind === "num" || c.kind === "pct" ? "right" : "left", vertical: "top", wrapText: c.kind !== "money", indent: style === "sub" && i === 1 ? 2 : style === "sub" && i === 0 && columns[0].kind !== "code" ? 2 : 0 };
    cell.border = { bottom: { style: "hair", color: { argb: LINE } } };
    if (style === "total") {
      cell.font = { bold: true };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TOTAL_FILL } };
      cell.border = { top: { style: "thin", color: { argb: "FFB0B6C2" } }, bottom: { style: "thin", color: { argb: "FFB0B6C2" } } };
    } else if (style === "subtotal") cell.font = { bold: true };
    else if (style === "section") cell.font = { bold: true, color: { argb: GOLD } };
    else if (style === "sub") cell.font = { color: { argb: "FF5B6170" } };
  });
}
