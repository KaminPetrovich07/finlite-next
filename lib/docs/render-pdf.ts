// Official documents → PDF (pdfmake, Roboto from its own bundle: Cyrillic,
// no network). Same blocks as the Word renderer.
import PdfPrinter from "pdfmake";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import type { Align, DocBlock, OfficialDoc } from "./model";

// eslint-disable-next-line @typescript-eslint/no-require-imports
const vfs: Record<string, string> = require("pdfmake/build/vfs_fonts");
const font = (name: string) => Buffer.from(vfs[name], "base64");

const printer = new PdfPrinter({
  Roboto: {
    normal: font("Roboto-Regular.ttf"),
    bold: font("Roboto-Medium.ttf"),
    italics: font("Roboto-Italic.ttf"),
    bolditalics: font("Roboto-MediumItalic.ttf"),
  },
});

const AL: Record<Align, "left" | "center" | "right"> = { l: "left", c: "center", r: "right" };
const BASE = 10;
const SMALL = 8;

function table(b: Extract<DocBlock, { t: "table" }>): Content {
  const cols = b.head?.length ?? b.rows[0]?.length ?? 1;
  const widths = b.widths ?? Array(cols).fill(1);
  const total = widths.reduce((a, w) => a + w, 0);
  const size = b.small ? 7.5 : 8.5;
  const body: TableCell[][] = [];
  if (b.head) body.push(b.head.map((h) => ({ text: h, bold: true, fontSize: size, alignment: "center" })));
  b.rows.forEach((r, ri) => body.push(r.map((c, i) => ({
    text: c,
    fontSize: size,
    bold: !!b.total && ri === b.rows.length - 1,
    alignment: AL[b.align?.[i] ?? "l"],
  }))));
  return {
    table: { headerRows: b.head ? 1 : 0, keepWithHeaderRows: b.head ? 1 : 0, widths: widths.map((w) => `${((w / total) * 100).toFixed(2)}%`), body, dontBreakRows: true },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 2, paddingBottom: () => 2 },
    margin: [0, 2, 0, 8],
  };
}

function blocks(list: DocBlock[]): Content[] {
  const out: Content[] = [];
  for (const b of list) {
    switch (b.t) {
      case "right":
        out.push({ stack: b.lines.map((l) => ({ text: l, fontSize: b.small ? SMALL : BASE })), alignment: "right", margin: [0, 0, 0, 10] });
        break;
      case "title":
        out.push({ text: b.text.toUpperCase(), bold: true, fontSize: 13, alignment: "center", margin: [0, 6, 0, 3] });
        break;
      case "subtitle":
        out.push({ text: b.text, bold: true, alignment: "center", margin: [0, 0, 0, 10] });
        break;
      case "h":
        out.push({ text: b.text, bold: true, fontSize: (b.level ?? 1) === 1 ? 11 : BASE, alignment: (b.level ?? 1) === 1 ? "center" : "left", margin: [0, 10, 0, 5], headlineLevel: 1 } as Content);
        break;
      case "p":
        out.push({ text: b.text, bold: b.bold, italics: b.italic, fontSize: b.small ? SMALL : BASE, alignment: b.align && b.align !== "l" ? AL[b.align] : "justify", leadingIndent: b.indent ? 20 : 0, margin: [0, 0, 0, 4] } as Content);
        break;
      case "clause":
        out.push({ columns: [{ width: 34, text: b.n }, { width: "*", text: b.text, alignment: "justify" }], margin: [0, 0, 0, 4] });
        break;
      case "list":
        out.push({ ul: b.items.map((i) => ({ text: i, alignment: "justify" })), margin: [10, 0, 0, 6] } as Content);
        break;
      case "table":
        out.push(table(b));
        break;
      case "sign":
        for (const s of b.items) {
          out.push({
            columns: [
              { width: 170, text: s.role },
              { width: 110, stack: [{ text: "______________" }, { text: "(подпись)", fontSize: 7, italics: true, margin: [16, 0, 0, 0] }] },
              { width: "*", stack: [{ text: s.name || "________________________" }, { text: "(Ф.И.О.)", fontSize: 7, italics: true, margin: [16, 0, 0, 0] }] },
            ],
            margin: [0, 10, 0, 0],
          });
        }
        break;
      case "fields":
        for (const [k, v] of b.items) out.push({ text: [{ text: `${k}: ` }, { text: v || "______________________________", decoration: v ? "underline" : undefined }], margin: [0, 0, 0, 3] });
        break;
      case "note":
        out.push({ text: b.text, italics: true, fontSize: SMALL, alignment: "justify", margin: [0, 0, 0, 4] });
        break;
      case "cut":
        out.push({ canvas: [{ type: "line", x1: 0, y1: 4, x2: 515, y2: 4, lineWidth: 0.5, dash: { length: 4 } }], margin: [0, 10, 0, 0] });
        out.push({ text: b.text ?? "линия отреза", italics: true, fontSize: 7, alignment: "center", margin: [0, 0, 0, 10] });
        break;
      case "spacer":
        out.push({ text: " ", margin: [0, 4, 0, 4] });
        break;
      case "pagebreak":
        out.push({ text: "", pageBreak: "after" });
        break;
    }
  }
  return out;
}

export async function renderOfficialPdf(doc: OfficialDoc): Promise<Buffer> {
  const def: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: doc.landscape ? "landscape" : "portrait",
    pageMargins: [56, 48, 40, 48],
    info: { title: doc.title, author: "FinLite KG" },
    defaultStyle: { font: "Roboto", fontSize: BASE, lineHeight: 1.2 },
    header: doc.org ? () => ({ text: doc.org!, fontSize: 7, italics: true, color: "#555555", margin: [56, 20, 40, 0] }) : undefined,
    footer: (page, count) => ({ text: `стр. ${page} из ${count}`, fontSize: 7, color: "#555555", alignment: "right", margin: [56, 16, 40, 0] }),
    pageBreakBefore: (node, following) => !!(node as { headlineLevel?: number }).headlineLevel && following.length === 0,
    content: blocks(doc.blocks),
  };
  return new Promise((resolve, reject) => {
    const pdf = printer.createPdfKitDocument(def);
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}
