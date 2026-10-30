// Official documents → Word. Times New Roman 12, black, real tables, so the
// accountant can edit, print and sign.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, PageOrientation, Packer, Paragraph,
  Table, TableCell, TableRow, TabStopPosition, TabStopType, TextRun, WidthType,
} from "docx";
import type { Align, DocBlock, OfficialDoc } from "./model";

const FONT = "Times New Roman";
const BASE = 24; // half-points → 12 pt
const SMALL = 18;

const AL: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  l: AlignmentType.LEFT, c: AlignmentType.CENTER, r: AlignmentType.RIGHT,
};

const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? BASE, bold: o.bold, italics: o.italics });

const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };

function table(b: Extract<DocBlock, { t: "table" }>): Table {
  const cols = b.head?.length ?? b.rows[0]?.length ?? 1;
  const widths = b.widths ?? Array(cols).fill(1);
  const total = widths.reduce((a, w) => a + w, 0);
  const size = b.small ? SMALL : 20;
  const cell = (text: string, i: number, bold: boolean) =>
    new TableCell({
      width: { size: Math.round((widths[i] / total) * 100), type: WidthType.PERCENTAGE },
      borders: { top: thin, bottom: thin, left: thin, right: thin },
      margins: { top: 30, bottom: 30, left: 60, right: 60 },
      children: String(text).split("\n").map((line) => new Paragraph({
        alignment: bold && !b.align ? AlignmentType.CENTER : AL[b.align?.[i] ?? "l"],
        children: [run(line, { bold, size })],
      })),
    });
  const rows: TableRow[] = [];
  if (b.head) rows.push(new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, i, true)) }));
  b.rows.forEach((r, ri) => rows.push(new TableRow({
    cantSplit: true,
    children: r.map((c, i) => cell(c, i, !!b.total && ri === b.rows.length - 1)),
  })));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

function blocks(list: DocBlock[]): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const b of list) {
    switch (b.t) {
      case "right":
        b.lines.forEach((l) => out.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(l, { size: b.small ? SMALL : BASE })] })));
        out.push(new Paragraph({ children: [] }));
        break;
      case "title":
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [run(b.text.toUpperCase(), { bold: true, size: 28 })] }));
        break;
      case "subtitle":
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(b.text, { bold: true })] }));
        break;
      case "h":
        out.push(new Paragraph({
          alignment: (b.level ?? 1) === 1 ? AlignmentType.CENTER : AlignmentType.LEFT,
          keepNext: true,
          spacing: { before: 240, after: 120 },
          children: [run(b.text, { bold: true })],
        }));
        break;
      case "p":
        out.push(new Paragraph({
          alignment: AL[b.align ?? "l"] === AlignmentType.LEFT ? AlignmentType.JUSTIFIED : AL[b.align ?? "l"],
          indent: b.indent ? { firstLine: 709 } : undefined,
          spacing: { after: 80 },
          children: [run(b.text, { bold: b.bold, italics: b.italic, size: b.small ? SMALL : BASE })],
        }));
        break;
      case "clause":
        out.push(new Paragraph({
          alignment: AlignmentType.JUSTIFIED,
          indent: { left: 567, hanging: 567 },
          spacing: { after: 80 },
          children: [run(`${b.n}\t`), run(b.text)],
          tabStops: [{ type: TabStopType.LEFT, position: 567 }],
        }));
        break;
      case "list":
        b.items.forEach((i) => out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, indent: { left: 567, hanging: 283 }, spacing: { after: 40 }, children: [run(`–\t${i}`)], tabStops: [{ type: TabStopType.LEFT, position: 567 }] })));
        break;
      case "table":
        out.push(table(b), new Paragraph({ children: [] }));
        break;
      case "sign":
        for (const s of b.items) {
          out.push(new Paragraph({
            spacing: { before: 200 },
            tabStops: [{ type: TabStopType.LEFT, position: 3800 }, { type: TabStopType.LEFT, position: 6400 }],
            children: [run(s.role), run("\t______________"), run(`\t${s.name || "______________________"}`)],
          }));
          out.push(new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 4100 }, { type: TabStopType.LEFT, position: 6800 }],
            children: [run("\t(подпись)", { size: 16, italics: true }), run("\t(Ф.И.О.)", { size: 16, italics: true })],
          }));
        }
        break;
      case "fields":
        for (const [k, v] of b.items) {
          out.push(new Paragraph({ spacing: { after: 60 }, children: [run(`${k}: `), new TextRun({ text: v || "                              ", font: FONT, size: BASE, underline: {} })] }));
        }
        break;
      case "note":
        out.push(new Paragraph({ alignment: AlignmentType.JUSTIFIED, spacing: { after: 80 }, children: [run(b.text, { italics: true, size: SMALL })] }));
        break;
      case "cut":
        out.push(new Paragraph({
          alignment: AlignmentType.CENTER,
          spacing: { before: 200, after: 200 },
          border: { bottom: { style: BorderStyle.DASHED, size: 6, color: "000000", space: 1 } },
          children: [run(b.text ?? "линия отреза", { size: 16, italics: true })],
        }));
        break;
      case "spacer":
        out.push(new Paragraph({ children: [] }));
        break;
      case "pagebreak":
        out.push(new Paragraph({ pageBreakBefore: true, children: [] }));
        break;
    }
  }
  return out;
}

export async function renderOfficialDocx(doc: OfficialDoc): Promise<Buffer> {
  const d = new Document({
    creator: "FinLite KG",
    title: doc.title,
    styles: { default: { document: { run: { font: FONT, size: BASE } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: doc.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: 1134, bottom: 1134, left: 1418, right: 850 },
        },
      },
      headers: doc.org ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(doc.org, { size: 16, italics: true })] })] }) } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [new TextRun({ font: FONT, size: 16, children: ["стр. ", PageNumber.CURRENT] })],
          })],
        }),
      },
      children: blocks(doc.blocks),
    }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}
