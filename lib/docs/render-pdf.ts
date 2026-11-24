// Official documents → PDF (pdfmake, Roboto from its own bundle: Cyrillic,
// no network). Same blocks as the Word renderer.
import PdfPrinter from "pdfmake";
import type { Content, TableCell, TDocumentDefinitions } from "pdfmake/interfaces";
import { placeHeads, type Align, type CashOrder, type DocBlock, type OfficialDoc } from "./model";

// подписи под строками и номера страниц на языке документа (задаются в начале отрисовки)
const LABELS = {
  ru: { sign: "(подпись)", name: "(Ф.И.О.)", decode: "расшифровка подписи", docNo: "Номер документа", docDate: "Дата составления", subj: "наименование субъекта", dept: "структурное подразделение", code: "Код", okpo: "по ОКПО", from: "от", page: "стр. ", pageOf: (p: number, n: number) => `стр. ${p} из ${n}` },
  ky: { sign: "(колу)", name: "(аты-жөнү)", decode: "аты-жөнү", docNo: "Документтин номери", docDate: "Түзүлгөн күнү", subj: "субъекттин аталышы", dept: "түзүмдүк бөлүм", code: "Коду", okpo: "ОКПО боюнча", from: "·", page: "бет ", pageOf: (p: number, n: number) => `${n} беттин ${p}-бети` },
};
let L = LABELS.ru;
/** бланковая вёрстка (doc.compact): мелкий кегль, строки с подписями под ними, подписи по две в ряд */
let COMPACT = false;
/** ширина полосы набора, pt — для линий разреза */
let WIDTH = 520;
/** внутри колонок: поля и подписи — по одной в строке */
let NARROW = false;

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
  const cols = b.head?.length ?? b.rows[0]?.length ?? (b.heads ? b.heads[0].reduce((a, h) => a + (h.colSpan ?? 1), 0) : 1);
  const widths = b.widths ?? Array(cols).fill(1);
  const total = widths.reduce((a, w) => a + w, 0);
  const size = cols > 16 ? 6.5 : b.small ? 7.5 : 8.5;
  const body: TableCell[][] = [];
  if (b.heads) {
    const grid: TableCell[][] = b.heads.map(() => Array.from({ length: cols }, () => ({}) as TableCell));
    // pdfmake не распределяет высоту ячеек с rowSpan — вместо объединения строк
    // текст ставится в верхнюю ячейку, а у ячеек под ней убираются внутренние линии.
    placeHeads(b.heads, cols).forEach((row, r) => row.forEach(({ cell: h, col }) => {
      const rs = Math.min(h.rowSpan ?? 1, b.heads!.length - r);
      for (let k = 0; k < rs; k++) {
        const border = [true, k === 0, true, k === rs - 1];
        grid[r + k][col] = k === 0
          ? ({ text: h.text, fontSize: size - 1, alignment: "center", colSpan: h.colSpan, border } as TableCell)
          : ({ text: "", colSpan: h.colSpan, border } as TableCell);
      }
    }));
    body.push(...grid);
  } else if (b.head) body.push(b.head.map((h) => ({ text: h, bold: true, fontSize: size, alignment: "center" })));
  b.rows.forEach((r, ri) => body.push(r.map((c, i) => ({
    text: c,
    fontSize: size,
    bold: !!b.total && ri === b.rows.length - 1,
    alignment: AL[b.align?.[i] ?? "l"],
  }))));
  return {
    table: { headerRows: b.heads ? b.heads.length : b.head ? 1 : 0, keepWithHeaderRows: b.heads ? b.heads.length : b.head ? 1 : 0, widths: widths.map((w) => `${((w / total) * 100).toFixed(2)}%`), body, dontBreakRows: true },
    layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => (COMPACT ? 1 : 2), paddingBottom: () => (COMPACT ? 0.5 : 2) },
    margin: [0, 2, 0, 8],
  };
}

// ── кассовые ордера КО-1 / КО-2 по бланку альбома ───────────────────────────
const CS = 7.5; // кегль ордера

/** значение на подчёркнутой строке шириной в колонку (таблица с нижней границей — по ширине колонки) */
function under(value: string, caption?: string, size = CS): { stack: Content[] } {
  return {
    stack: [
      { table: { widths: ["*"], body: [[{ text: value || " ", fontSize: size, border: [false, false, false, true] }]] }, layout: { hLineWidth: () => 0.4, vLineWidth: () => 0, paddingLeft: () => 1, paddingRight: () => 0, paddingTop: () => 0, paddingBottom: () => 0 } },
      ...(caption ? [{ text: caption, fontSize: 5.5, italics: true, alignment: "center" } as Content] : []),
    ],
  };
}
/** «Подпись: значение» с подчёркиванием и подписью под строкой. */
function line(label: string, value: string, caption?: string, labelWidth = 58): Content {
  return { columns: [{ width: labelWidth, text: label, fontSize: CS }, { width: "*", ...under(value, caption) }], columnGap: 2, margin: [0, 1, 0, 0] } as Content;
}
/** подписант: роль ______ (подпись)  расшифровка */
function signer(role: string, name: string, roleWidth = 70): Content {
  return {
    columns: [
      { width: roleWidth, text: role, fontSize: CS, bold: true, margin: [0, 1, 0, 0] },
      { width: 52, ...under("", L.sign.replace(/[()]/g, "")) },
      { width: "*", ...under(name, L.decode) },
    ],
    columnGap: 4,
    margin: [0, 2, 0, 0],
  } as Content;
}
/** подчёркнутое значение с подписью под ним («организация») */
const captioned = (value: string, caption: string): Content => ({ ...under(value, caption), margin: [0, 0, 0, 1] } as Content);
const box = (rows: string[][], widths: Array<number | string>, firstPlain = false): Content => ({
  table: { widths, body: rows.map((r) => r.map((c, i) => ({ text: c, fontSize: 6.5, alignment: firstPlain && i === 0 ? "right" : "center", border: firstPlain && i === 0 ? [false, false, false, false] : [true, true, true, true] }))) },
  layout: { hLineWidth: () => 0.5, vLineWidth: () => 0.5, paddingTop: () => 1, paddingBottom: () => 1, paddingLeft: () => 2, paddingRight: () => 2 },
});

function cashOrder(o: CashOrder): Content {
  const ko1 = o.kind === "ko1";
  const corner = { stack: (ko1
    ? ["Унифицированная форма КО-1", "Утверждена постановлением", "Нацстаткомитета Кыргызской", "Республики от 07.04.03 № 4"]
    : ["Унифицированная форма № КО-2", "Утверждено постановлением", "Нацстаткомитета Кыргызской Республики", "от 07.04.2003 г. № 4"]).map((t) => ({ text: t, fontSize: 6 })), alignment: "left" as const };
  const codes = box([["", "Код"], ["Форма по ГКУД", ko1 ? "0310001" : "0310002"], ["по ОКПО", o.okpo ?? ""]], [62, 60], true);
  const corner5 = { stack: corner.stack.map((x) => ({ ...x, fontSize: 5.5 })), margin: [0, 0, 0, 2] };
  const head: Content[] = [
    {
      columns: [
        { width: "*", stack: [{ text: " ", fontSize: 8 }, captioned(o.org, ko1 ? "организация" : "наименование субъекта"), captioned(o.dept ?? "", ko1 ? "подразделение" : "структурное подразделение")] },
        { width: 126, stack: [corner5 as Content, codes] },
      ],
      columnGap: 8,
    },
    {
      columns: [
        { width: "*", text: ko1 ? "ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР" : "РАСХОДНЫЙ КАССОВЫЙ ОРДЕР", bold: true, fontSize: 9, margin: [0, 7, 0, 0], alignment: "right" },
        { width: 126, stack: [box([["Номер документа", "Дата составления"], [o.number, o.date]], ["*", "*"])] },
      ],
      columnGap: 6, margin: [0, 1, 0, 2],
    },
  ];
  const t = table(ko1
    ? { t: "table", small: true, heads: [[{ text: "Дебет", rowSpan: 2 }, { text: "Кредит", colSpan: 4 }, { text: "Сумма, KGS", rowSpan: 2 }, { text: "Код целевого назначения", rowSpan: 2 }, { text: "", rowSpan: 2 }], [{ text: "" }, { text: "код структурного подразделения" }, { text: "корреспондирующий счёт, субсчёт" }, { text: "код аналитического учёта" }]],
        rows: [[o.debit, "", "", o.credit, "", o.amount, "", ""]], widths: [0.8, 0.25, 1.7, 1.7, 1.6, 1.3, 1.3, 0.25], align: ["c", "c", "c", "c", "c", "r", "c", "c"] }
    : { t: "table", small: true, heads: [[{ text: "Дебет", colSpan: 4 }, { text: "Кредит", rowSpan: 2 }, { text: "Сумма (сом, тый.)", rowSpan: 2 }, { text: "Код целевого назначения", rowSpan: 2 }, { text: "", rowSpan: 2 }], [{ text: "" }, { text: "код структурного подразделения" }, { text: "корреспондирующий счёт" }, { text: "код аналитического учёта" }]],
        rows: [["", "", o.debit, "", o.credit, o.amount, "", ""]], widths: [0.5, 1.4, 1.4, 1.3, 1.1, 1.6, 1.4, 0.4], align: ["c", "c", "c", "c", "c", "r", "c", "c"] });
  (t as { margin?: number[] }).margin = [0, 0, 0, 3];

  if (ko1) {
    const left: Content[] = [
      ...head, t,
      line("Принято от:", o.party), line("Основание:", o.basis), line("Сумма:", o.words, "прописью"),
      { columns: [line("В том числе:", o.including ?? ""), line("Приложение:", o.attachment ?? "")], columnGap: 10 },
      { columns: [signer("Главный бухгалтер", o.chief, 52), signer("Получил кассир", o.cashier, 44)], columnGap: 10 },
    ];
    const right: Content[] = [
      captioned(o.org, "организация"),
      { text: "КВИТАНЦИЯ", bold: true, fontSize: 9, alignment: "center", margin: [0, 1, 0, 2] },
      { columns: [line("к ПКО №", o.number, undefined, 32), line("от", o.date, undefined, 12)], columnGap: 6 },
      line("Принято от", o.party, undefined, 44), line("Основание", o.basis, undefined, 44),
      line("Сумма, KGS", o.amount, "цифрами", 44), under(o.words, "прописью", 6.5),
      { text: "М.П. (штамп)", bold: true, fontSize: CS, margin: [0, 2, 0, 0] },
      signer("Гл. бухгалтер", o.chief, 44), signer("Кассир", o.cashier, 44),
    ];
    return {
      table: { widths: ["*", 162], body: [[{ stack: left }, { stack: right }]], dontBreakRows: true },
      layout: {
        hLineWidth: () => 0, vLineWidth: (i: number) => (i === 1 ? 0.6 : 0),
        vLineStyle: (i: number) => (i === 1 ? { dash: { length: 3, space: 2 } } : undefined),
        paddingLeft: (i: number) => (i === 1 ? 9 : 0), paddingRight: (i: number) => (i === 0 ? 9 : 0), paddingTop: () => 0, paddingBottom: () => 0,
      },
      unbreakable: true,
    } as unknown as Content;
  }
  return {
    stack: [
      ...head, t,
      line("Выдать", o.party, "фамилия, имя, отчество", 52), line("Основание", o.basis, undefined, 52), line("Сумма", o.words, "прописью", 52),
      line("Приложение", o.attachment ?? "", undefined, 52),
      { columns: [signer("Руководитель", o.director ?? "", 56), signer("Главный бухгалтер", o.chief, 66)], columnGap: 14 },
      line("Получил", "", "сумма прописью: сомы — прописью, тыйыны — цифрами", 52),
      { columns: [{ width: 160, text: "«___» ______________ 20__ г.", fontSize: CS }, { width: 52, text: "Подпись", fontSize: CS }, { width: 140, ...under("") }], margin: [0, 3, 0, 0] } as Content,
      line("По", o.idDoc ?? "", "наименование, номер, дата и место выдачи документа, удостоверяющего личность получателя", 52),
      signer("Выдал кассир", o.cashier, 66),
    ],
    unbreakable: true,
  } as unknown as Content;
}

// ── бланки альбома: шапка, заголовок, клетки ────────────────────────────────
function formHead(b: Extract<DocBlock, { t: "formHead" }>): Content {
  return {
    columns: [
      { width: "*", stack: [captioned(b.org ?? "", L.subj), captioned(b.dept ?? "", L.dept)] },
      {
        width: b.codes?.length ? 250 : 120,
        stack: [
          { stack: b.corner.map((t) => ({ text: t, fontSize: 7, bold: /^(Форма|Не унифиц)/.test(t) })), alignment: "right", margin: [0, 0, 0, 2] },
          box([["", L.code], ...(b.gkud ? [["Форма по ГКУД", b.gkud]] : []), [L.okpo, b.okpo ?? ""], ...(b.codes ?? []).map(([k, v]) => [k, v])], [b.codes?.length ? 188 : 58, 58], true),
        ],
      },
    ],
    columnGap: 10,
    margin: [0, 0, 0, 4],
  } as Content;
}
function formTitle(b: Extract<DocBlock, { t: "formTitle" }>): Content {
  // бланк альбома: заголовок без номера, справа клетки «Номер документа | Дата составления»;
  // «Приказ (распоряжение) о …» — в три строки, как в альбоме
  if (b.boxed && b.no !== undefined && b.date !== undefined) {
    const m = b.text.match(/^(Приказ)\s+(\(распоряжение\))\s+(.*)$/i);
    const lines = m ? [m[1].toUpperCase(), m[2], m[3]] : [b.text];
    return {
      columns: [
        { width: "*", stack: [...lines.map((l, i) => ({ text: l, bold: i !== 1 || !m, fontSize: i === 0 ? 11 : 9.5 })), ...(b.sub ? [{ text: b.sub, fontSize: 8.5 }] : [])], alignment: "center", margin: [0, 2, 0, 0] },
        { width: 150, stack: [box([[L.docNo, L.docDate], [b.no || " ", b.date || " "]], ["*", "*"])], margin: [0, 2, 0, 0] },
      ],
      columnGap: 10,
      margin: [0, 2, 0, 6],
    } as Content;
  }
  const parts: Content[] = [{ text: b.text, bold: true }];
  if (b.no !== undefined) parts.push({ text: " № " , bold: true }, { text: b.no ? ` ${b.no} ` : "________", bold: true, decoration: b.no ? "underline" : undefined });
  if (b.date !== undefined) parts.push({ text: `  ${L.from} ` }, { text: b.date || "«___» ____________ 20__ г.", decoration: b.date ? "underline" : undefined });
  return {
    stack: [
      { text: parts, fontSize: 11, alignment: "center" },
      ...(b.sub ? [{ text: b.sub, fontSize: 8.5, alignment: "center" } as Content] : []),
    ],
    margin: [0, 2, 0, 5],
  } as Content;
}
function boxBlock(b: Extract<DocBlock, { t: "box" }>): Content {
  return { columns: [{ width: "*", text: "" }, { width: Math.min(84 * b.heads.length, 420), stack: [box([b.heads, b.values.map((v) => v || " ")], b.heads.map(() => "*"))] }], margin: [0, 0, 0, 5] } as Content;
}
/** поля бланка: подпись и значение на подчёркнутой строке; короткие — по два в ряд */
function compactFields(items: Array<[string, string]>): Content[] {
  const out: Content[] = [];
  const lw = (k: string) => Math.min(Math.max(k.length * 4.1 + 6, 34), 190);
  for (let i = 0; i < items.length; i++) {
    const [k, v] = items[i];
    const next = items[i + 1];
    const short = (x: [string, string]) => x[0].length <= 28 && (x[1] ?? "").length <= 34;
    if (next && !NARROW && short(items[i]) && short(next)) {
      out.push({ columns: [line(k, v, undefined, lw(k)), line(next[0], next[1], undefined, lw(next[0]))], columnGap: 14, margin: [0, 0, 0, 1] } as Content);
      i++;
    } else out.push(line(k, v, undefined, lw(k)));
  }
  return out;
}
function compactSigns(items: Array<{ role: string; name?: string }>): Content[] {
  const out: Content[] = [];
  const rw = (r: string) => Math.min(Math.max(r.length * 4.2, 50), 110);
  if (NARROW) return items.map((a) => signer(a.role, a.name ?? "", 58));
  for (let i = 0; i < items.length; i += 2) {
    const a = items[i], b = items[i + 1];
    out.push({ columns: [signer(a.role, a.name ?? "", rw(a.role)), b ? signer(b.role, b.name ?? "", rw(b.role)) : { text: "" }], columnGap: 18, margin: [0, 3, 0, 0] } as Content);
  }
  return out;
}

function blocks(list: DocBlock[]): Content[] {
  const out: Content[] = [];
  for (const [bi, b] of list.entries()) {
    switch (b.t) {
      case "cashOrder":
        out.push(cashOrder(b.order));
        // между ордерами одного листа — линия разреза листа
        if (list[bi + 1]?.t === "cashOrder") out.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.4, dash: { length: 2, space: 3 } }], margin: [0, 6, 0, 6] });
        break;
      case "formHead":
        out.push(formHead(b));
        break;
      case "formTitle":
        out.push(formTitle(b));
        break;
      case "box":
        out.push(boxBlock(b));
        break;
      case "cols":
        NARROW = true;
        out.push({ columns: b.cols.map((c, i) => ({ width: b.widths ? `${((b.widths[i] / b.widths.reduce((a, w) => a + w, 0)) * 100).toFixed(1)}%` : "*", stack: blocks(c) })), columnGap: 12 } as Content);
        NARROW = false;
        break;
      case "frame":
        out.push({
          table: { widths: ["*"], body: [[{ stack: blocks(b.blocks), margin: [6, 6, 6, 6] }]], dontBreakRows: true },
          layout: { hLineWidth: () => 0.8, vLineWidth: () => 0.8 }, margin: [30, 0, 30, 2],
        } as Content);
        if (b.caption) out.push({ text: b.caption, bold: true, alignment: "center", fontSize: 9, margin: [0, 0, 0, 10] });
        break;
      case "unit":
        out.push({ stack: blocks(b.blocks), unbreakable: true } as Content);
        // документы одного листа разделяет линия разреза
        if (list[bi + 1]?.t === "unit") out.push({ canvas: [{ type: "line", x1: 0, y1: 0, x2: WIDTH, y2: 0, lineWidth: 0.4, dash: { length: 2, space: 3 } }], margin: [0, 8, 0, 8] });
        break;
      case "right":
        out.push({ stack: b.lines.map((l) => ({ text: l, fontSize: b.small || COMPACT ? SMALL : BASE })), alignment: "right", margin: [0, 0, 0, COMPACT ? 4 : 10] });
        break;
      case "title":
        out.push({ text: b.text.toUpperCase(), bold: true, fontSize: COMPACT ? 11 : 13, alignment: "center", margin: COMPACT ? [0, 2, 0, 2] : [0, 6, 0, 3] });
        break;
      case "subtitle":
        out.push({ text: b.text, bold: true, alignment: "center", margin: [0, 0, 0, 10] });
        break;
      case "h":
        out.push({ text: b.text, bold: true, fontSize: (b.level ?? 1) === 1 ? 11 : BASE, alignment: (b.level ?? 1) === 1 ? "center" : "left", margin: [0, 10, 0, 5], headlineLevel: 1 } as Content);
        break;
      case "p":
        out.push({ text: b.text, bold: b.bold, italics: b.italic, fontSize: b.small ? SMALL : COMPACT ? 8.5 : BASE, alignment: b.align && b.align !== "l" ? AL[b.align] : "justify", leadingIndent: b.indent ? 20 : 0, margin: [0, 0, 0, 4] } as Content);
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
        if (COMPACT) { out.push(...compactSigns(b.items)); break; }
        for (const s of b.items) {
          out.push({
            columns: [
              { width: 170, text: s.role },
              { width: 110, stack: [{ text: "______________" }, { text: L.sign, fontSize: 7, italics: true, margin: [16, 0, 0, 0] }] },
              { width: "*", stack: [{ text: s.name || "________________________" }, { text: L.name, fontSize: 7, italics: true, margin: [16, 0, 0, 0] }] },
            ],
            margin: [0, 10, 0, 0],
          });
        }
        break;
      case "fields":
        if (COMPACT) { out.push(...compactFields(b.items)); break; }
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
  L = LABELS[doc.lang ?? "ru"];
  COMPACT = !!doc.compact;
  WIDTH = (doc.landscape ? 842 : 595) - (doc.compact ? 66 : 96);
  const lbl = L;
  const def: TDocumentDefinitions = {
    pageSize: "A4",
    pageOrientation: doc.landscape ? "landscape" : "portrait",
    pageMargins: doc.compact ? [36, 24, 30, 26] : [56, 48, 40, 48],
    info: { title: doc.title, author: "FinLite KG" },
    defaultStyle: { font: "Roboto", fontSize: doc.compact ? 8.5 : BASE, lineHeight: doc.compact ? 1.1 : 1.2 },
    header: doc.org && !doc.compact ? () => ({ text: doc.org!, fontSize: 7, italics: true, color: "#555555", margin: [56, 20, 40, 0] }) : undefined,
    footer: (page, count) => ({ text: lbl.pageOf(page, count), fontSize: 7, color: "#555555", alignment: "right", margin: [56, 16, 40, 0] }),
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
