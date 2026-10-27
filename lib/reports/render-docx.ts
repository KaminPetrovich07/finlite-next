// Word via the `docx` package: editable text and real Word tables, so the
// user can add comments or a cover letter before sending.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, HeadingLevel, PageNumber, PageOrientation, Packer, Paragraph,
  ShadingType, Table, TableCell, TableRow, TextRun, WidthType,
} from "docx";
import { cellText, type Block, type ReportDoc, type RowStyle, type TableBlock } from "./model";

const FONT = "Arial";
const INK = "12151C";
const MUTED = "5B6170";
const GOLD = "8C6000";
const LINE = "DEE2E9";

const p = (text: string, opts: { bold?: boolean; size?: number; color?: string; italics?: boolean; after?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({
    alignment: opts.align,
    spacing: { after: opts.after ?? 80 },
    children: [new TextRun({ text, bold: opts.bold, size: opts.size ?? 18, color: opts.color ?? INK, italics: opts.italics, font: FONT })],
  });

const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const hair = { style: BorderStyle.SINGLE, size: 2, color: LINE };

function table(b: TableBlock): Array<Paragraph | Table> {
  const total = b.columns.reduce((a, c) => a + (c.width ?? 15), 0);
  const right = (k?: string) => k === "money" || k === "num" || k === "pct";
  const cell = (text: string, i: number, st: RowStyle | "head") => {
    const c = b.columns[i];
    return new TableCell({
      width: { size: Math.round(((c.width ?? 15) / total) * 100), type: WidthType.PERCENTAGE },
      shading: st === "head" ? { type: ShadingType.CLEAR, color: "auto", fill: "EEF0F4" } : st === "total" ? { type: ShadingType.CLEAR, color: "auto", fill: "FFF4D1" } : undefined,
      borders: { top: st === "total" ? { style: BorderStyle.SINGLE, size: 4, color: "B0B6C2" } : none, bottom: hair, left: none, right: none },
      margins: { top: 40, bottom: 40, left: 60, right: 60 },
      children: [new Paragraph({
        alignment: right(c.kind) ? AlignmentType.RIGHT : AlignmentType.LEFT,
        indent: st === "sub" && (i === 1 || (i === 0 && c.kind !== "code")) ? { left: 200 } : undefined,
        children: [new TextRun({
          text, font: FONT, size: st === "head" ? 15 : 16,
          bold: st === "head" || st === "total" || st === "subtotal" || st === "section",
          color: st === "head" || st === "sub" ? MUTED : st === "section" ? GOLD : INK,
        })],
      })],
    });
  };
  const rows = [
    new TableRow({ tableHeader: true, children: b.columns.map((c, i) => cell(c.label, i, "head")) }),
    ...b.rows.map((r) => new TableRow({ cantSplit: true, children: b.columns.map((c, i) => cell(cellText(r.cells[i] ?? null, c.kind), i, r.style ?? "normal")) })),
  ];
  const out: Array<Paragraph | Table> = [];
  if (b.title) out.push(p(b.title, { bold: true, size: 19, after: 60 }));
  out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows }));
  out.push(p(b.note ?? "", { italics: true, size: 15, color: MUTED, after: 160 }));
  return out;
}

function block(b: Block): Array<Paragraph | Table> {
  switch (b.type) {
    case "h2": return [new Paragraph({ heading: HeadingLevel.HEADING_2, spacing: { before: 200, after: 80 }, children: [new TextRun({ text: b.text, font: FONT, bold: true, size: 22, color: INK })] })];
    case "p": return [p(b.text, { after: 100 })];
    case "note": return [new Paragraph({
      shading: { type: ShadingType.CLEAR, color: "auto", fill: "FFF8E1" },
      border: { left: { style: BorderStyle.SINGLE, size: 18, color: "F2B705", space: 6 } },
      spacing: { after: 160 },
      children: [new TextRun({ text: b.text, font: FONT, size: 17, color: "7A3E00" })],
    })];
    case "pagebreak": return [new Paragraph({ pageBreakBefore: true, children: [] })];
    case "kpis": return table({
      type: "table",
      columns: [{ label: "Показатель", width: 40 }, { label: "Значение", width: 30 }, { label: "", width: 30 }],
      rows: b.items.map((i) => ({ cells: [i.label, i.value, i.note ?? ""], style: "subtotal" as const })),
    });
    case "bars": return table({
      type: "table", title: b.title,
      columns: [{ label: "Статья", width: 45 }, { label: "Значение", width: 25 }, { label: "", width: 30 }],
      rows: (() => { const max = Math.max(1, ...b.items.map((i) => i.value)); return b.items.map((i) => ({ cells: [i.label, i.display, "▇".repeat(Math.max(1, Math.round((i.value / max) * 18)))] })); })(),
    });
    case "checks": return table({
      type: "table",
      columns: [{ label: "Статус", width: 16 }, { label: "Сверка", width: 38 }, { label: "Детали", width: 46 }],
      rows: b.items.map((c) => ({ cells: [c.status === "ok" ? "сходится" : c.status === "warn" ? "внимание" : "не сходится", c.title, c.detail] })),
    });
    case "table": return table(b);
  }
}

export async function renderDocx(doc: ReportDoc): Promise<Buffer> {
  const wide = doc.sections.some((s) => s.blocks.some((b) => b.type === "table" && b.columns.length >= 7));
  const footer = new Footer({
    children: [new Paragraph({
      alignment: AlignmentType.RIGHT,
      children: [
        new TextRun({ text: `${doc.company} · ${doc.title} · ${doc.period} · стр. `, font: FONT, size: 14, color: MUTED }),
        new TextRun({ children: [PageNumber.CURRENT], font: FONT, size: 14, color: MUTED }),
      ],
    })],
  });
  const sections = doc.sections.map((s, i) => ({
    properties: {
      page: {
        size: { orientation: wide ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
        margin: { top: 900, bottom: 900, left: 900, right: 900 },
      },
    },
    headers: { default: new Header({ children: [] }) },
    footers: { default: footer },
    children: [
      ...(i === 0 ? [
        p(doc.title, { bold: true, size: 40, after: 60 }),
        p(doc.company, { size: 24, after: 40 }),
        p(`${doc.period} · ${doc.regime}`, { size: 18, color: MUTED, after: 40 }),
        p(`Сформировано в FinLite KG ${doc.generatedAt} по данным журнала проводок`, { size: 16, color: MUTED, after: 240 }),
        ...(doc.disclaimer ? block({ type: "note", text: doc.disclaimer }) : []),
      ] : []),
      new Paragraph({ heading: HeadingLevel.HEADING_1, spacing: { before: 120, after: 160 }, children: [new TextRun({ text: s.title, font: FONT, bold: true, size: 30, color: INK })] }),
      ...s.blocks.flatMap(block),
    ],
  }));
  const document = new Document({
    creator: "FinLite KG",
    title: `${doc.title} — ${doc.company}`,
    styles: { default: { document: { run: { font: FONT, size: 18 } } } },
    sections,
  });
  return Packer.toBuffer(document);
}
