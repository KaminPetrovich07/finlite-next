// PDF via pdfmake (server-side). Roboto from pdfmake's own bundle — it covers
// Cyrillic and needs no network at build or run time.
import PdfPrinter from "pdfmake";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { cellText, sup, type Block, type ReportDoc, type RowStyle, type TableBlock } from "./model";

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

const INK = "#12151C";
const MUTED = "#5B6170";
const LINE = "#DEE2E9";
const GOLD = "#8C6000";
const SAFFRON = "#F2B705";
const HEAD_FILL = "#EEF0F4";
const TOTAL_FILL = "#FFF4D1";
const BLUE = "#2A78D6";

const CALLOUT = {
  key: { bar: SAFFRON, fill: "#FFF8E1", title: GOLD },
  info: { bar: BLUE, fill: "#EEF4FC", title: "#1D5DAA" },
  warn: { bar: "#D97706", fill: "#FEF3E2", title: "#9A4A00" },
} as const;

/** Roboto in pdfmake has no ↔ or ✓ glyphs; swap them for plain text. */
const clean = (t: string) => t.replace(/↔/g, "–").replace(/✓/g, "");

function table(b: TableBlock): Content[] {
  const total = b.columns.reduce((a, c) => a + (c.width ?? 15), 0);
  const widths = b.columns.map((c) => `${(((c.width ?? 15) / total) * 100).toFixed(2)}%`);
  const right = (k?: string) => k === "money" || k === "num" || k === "pct";
  const head: TableCell[] = b.columns.map((c) => ({ text: c.label, bold: true, fontSize: 7.5, color: MUTED, alignment: right(c.kind) ? "right" : "left", fillColor: HEAD_FILL }));
  const body: TableCell[][] = [head];
  const styles: RowStyle[] = ["normal"];
  for (const r of b.rows) {
    const st = r.style ?? "normal";
    styles.push(st);
    body.push(b.columns.map((c, i) => ({
      text: clean(cellText(r.cells[i] ?? null, c.kind)),
      alignment: right(c.kind) ? "right" : "left",
      bold: st === "total" || st === "subtotal" || st === "section",
      color: st === "section" ? GOLD : st === "sub" ? MUTED : INK,
      fillColor: st === "total" ? TOTAL_FILL : undefined,
      margin: [st === "sub" && (i === 1 || (i === 0 && c.kind !== "code")) ? 8 : 0, 0, 0, 0],
      noWrap: c.kind === "money",
    })));
  }
  const out: Content[] = [];
  if (b.title) out.push({ text: b.title, style: "h3", margin: [0, 8, 0, 4] });
  out.push({
    table: { headerRows: 1, widths, body, dontBreakRows: true },
    layout: {
      hLineWidth: (i: number) => (i === 0 ? 0 : styles[i - 1] === "total" || styles[i] === "total" ? 0.8 : 0.4),
      vLineWidth: () => 0,
      hLineColor: (i: number) => (styles[i - 1] === "total" || styles[i] === "total" ? "#B0B6C2" : LINE),
      paddingTop: () => 3, paddingBottom: () => 3, paddingLeft: () => 4, paddingRight: () => 4,
    },
    fontSize: b.columns.length >= 7 ? 7.5 : 8,
  });
  if (b.footnotes?.length) {
    out.push({
      stack: b.footnotes.map((f, i) => ({ text: clean(`${sup(i + 1)} ${f}`), fontSize: 7, color: MUTED, margin: [0, 1, 0, 0] })),
      margin: [0, 3, 0, 6],
    });
  }
  if (b.note) out.push({ text: b.note, fontSize: 7.5, italics: true, color: MUTED, margin: [0, 3, 0, 0] });
  return out;
}

function bars(b: Extract<Block, { type: "bars" }>): Content[] {
  if (!b.items.length) return [];
  const W = 515, rowH = 20, labelW = 170, valueW = 120;
  const max = Math.max(...b.items.map((i) => i.value), 1);
  const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
  const rows = b.items.map((it, i) => {
    const y = i * rowH;
    const w = Math.max(2, ((W - labelW - valueW) * it.value) / max);
    return `<text x="${labelW - 8}" y="${y + 13}" text-anchor="end" font-size="8" fill="${INK}">${esc(it.label)}</text>
      <rect x="${labelW}" y="${y + 4}" width="${w.toFixed(1)}" height="12" rx="2" fill="${BLUE}"/>
      <text x="${labelW + w + 6}" y="${y + 13}" font-size="8" fill="${MUTED}">${esc(it.display)}</text>`;
  }).join("");
  return [
    { text: b.title, style: "h3", margin: [0, 8, 0, 4] },
    { svg: `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${b.items.length * rowH}" viewBox="0 0 ${W} ${b.items.length * rowH}">${rows}</svg>`, width: W },
  ];
}

function block(b: Block): Content[] {
  switch (b.type) {
    case "h2": return [{ text: b.text, style: "h2" }];
    case "h3": return [{ text: b.text, style: "h3", margin: [0, 8, 0, 3] }];
    case "list": return [{ ul: b.items.map((t) => ({ text: clean(t), margin: [0, 0, 0, 2] })), fontSize: 9, margin: [6, 0, 0, 6] }];
    case "callout": {
      const tone = CALLOUT[b.tone ?? "info"];
      return [{
        table: { widths: ["*"], body: [[{
          stack: [
            ...(b.title ? [{ text: b.title, bold: true, fontSize: 9.5, color: tone.title, margin: [0, 0, 0, 2] as [number, number, number, number] }] : []),
            { text: clean(b.text), fontSize: 9, color: INK },
          ],
          margin: [8, 6, 8, 6],
        }]] },
        layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 3 : 0), vLineColor: () => tone.bar, fillColor: () => tone.fill },
        margin: [0, 2, 0, 8],
      }];
    }
    case "p": return [{ text: clean(b.text), style: "p" }];
    case "note": return [{
      table: { widths: ["*"], body: [[{ text: b.text, fontSize: 8.5, color: "#7A3E00", margin: [6, 5, 6, 5] }]] },
      layout: { hLineWidth: () => 0, vLineWidth: (i: number) => (i === 0 ? 2 : 0), vLineColor: () => SAFFRON, fillColor: () => "#FFF8E1" },
      margin: [0, 2, 0, 8],
    }];
    case "pagebreak": return [{ text: "", pageBreak: "after" }];
    case "kpis": return [{
      columns: b.items.map((i) => ({
        stack: [
          { text: i.label, fontSize: 8, color: MUTED },
          { text: i.value, fontSize: 14, bold: true, color: INK, margin: [0, 2, 0, 1] },
          ...(i.note ? [{ text: i.note, fontSize: 7.5, color: MUTED }] : []),
        ],
      })),
      columnGap: 12,
      margin: [0, 4, 0, 10],
    }];
    case "bars": return bars(b);
    case "checks": return [{
      table: {
        widths: [62, "*", "*"],
        body: b.items.map((c) => [
          { text: c.status === "ok" ? "сходится" : c.status === "warn" ? "внимание" : "не сходится", bold: true, fontSize: 8, color: c.status === "ok" ? "#15803D" : c.status === "warn" ? "#B45309" : "#C42026" },
          { text: clean(c.title), fontSize: 8.5 },
          { text: c.detail, fontSize: 8, color: MUTED },
        ]),
      },
      layout: { hLineWidth: (i: number) => (i === 0 ? 0 : 0.4), vLineWidth: () => 0, hLineColor: () => LINE, paddingTop: () => 3, paddingBottom: () => 3 },
      margin: [0, 2, 0, 8],
    }];
    case "table": return table(b);
  }
}

export async function renderPdf(doc: ReportDoc): Promise<Buffer> {
  // Long narrative reports (toc) stay portrait; wide tables get a smaller font.
  const wide = !doc.toc && doc.sections.some((s) => s.blocks.some((b) => b.type === "table" && b.columns.length >= 7));
  const content: Content[] = [];
  if (doc.toc) {
    content.push(
      { canvas: [{ type: "rect", x: 0, y: 0, w: 515, h: 6, color: SAFFRON }], margin: [0, 120, 0, 24] },
      { text: doc.company, fontSize: 13, color: MUTED },
      { text: doc.title, fontSize: 30, bold: true, color: INK, margin: [0, 6, 0, 4] },
      ...(doc.subtitle ? [{ text: doc.subtitle, fontSize: 14, color: GOLD, margin: [0, 0, 0, 30] as [number, number, number, number] }] : []),
      { text: `Налоговый режим: ${doc.regime}`, fontSize: 9, color: MUTED },
      { text: `Сформировано в FinLite KG ${doc.generatedAt}`, fontSize: 9, color: MUTED, margin: [0, 2, 0, 20] },
    );
    if (doc.disclaimer) content.push(...block({ type: "note", text: doc.disclaimer }));
    content.push(
      { text: "Содержание", style: "h1", pageBreak: "before" },
      { toc: { numberStyle: { fontSize: 9.5, color: MUTED }, textStyle: { fontSize: 10 } } } as Content,
    );
  } else {
    content.push(
      { canvas: [{ type: "rect", x: 0, y: 0, w: 28, h: 4, color: SAFFRON }], margin: [0, 0, 0, 8] },
      { text: doc.title, style: "title" },
      { text: doc.company, fontSize: 12, color: INK, margin: [0, 2, 0, 0] },
      { text: `${doc.period} · ${doc.regime}`, fontSize: 9, color: MUTED, margin: [0, 2, 0, 0] },
      { text: `Сформировано в FinLite KG ${doc.generatedAt} по данным журнала проводок`, fontSize: 8, color: MUTED, margin: [0, 2, 0, 10] },
    );
    if (doc.disclaimer) content.push(...block({ type: "note", text: doc.disclaimer }));
  }
  doc.sections.forEach((s, i) => {
    content.push({ text: s.title, style: "h1", pageBreak: i > 0 || doc.toc ? "before" : undefined, tocItem: !!doc.toc } as Content);
    for (const b of s.blocks) content.push(...block(b));
  });

  const def: TDocumentDefinitions = {
    content,
    pageSize: "A4",
    pageOrientation: wide ? "landscape" : "portrait",
    pageMargins: [40, 44, 40, 48],
    defaultStyle: { font: "Roboto", fontSize: 9, color: INK, lineHeight: 1.25 },
    styles: {
      title: { fontSize: 22, bold: true, color: INK },
      h1: { fontSize: 15, bold: true, margin: [0, 6, 0, 8] },
      h2: { fontSize: 11, bold: true, margin: [0, 10, 0, 4] },
      h3: { fontSize: 9.5, bold: true },
      p: { fontSize: 9, margin: [0, 0, 0, 5], alignment: "justify" },
    },
    info: { title: `${doc.title} — ${doc.company}`, author: "FinLite KG", subject: doc.period },
    footer: (page: number, pages: number) => ({
      columns: [
        { text: `${doc.company} · ${doc.title} · ${doc.period}`, fontSize: 7, color: MUTED },
        { text: `${page} / ${pages}`, alignment: "right", fontSize: 7, color: MUTED },
      ],
      margin: [40, 16, 40, 0],
    }),
  };
  const pdf = printer.createPdfKitDocument(def);
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    pdf.on("data", (c: Buffer) => chunks.push(c));
    pdf.on("end", () => resolve(Buffer.concat(chunks)));
    pdf.on("error", reject);
    pdf.end();
  });
}
