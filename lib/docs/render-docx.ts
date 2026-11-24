// Official documents → Word. Times New Roman 12, black, real tables, so the
// accountant can edit, print and sign.
import {
  AlignmentType, BorderStyle, Document, Footer, Header, PageNumber, PageOrientation, Packer, Paragraph,
  Table, TableCell, TableRow, TabStopPosition, TabStopType, TextRun, WidthType,
} from "docx";
import { placeHeads, type Align, type CashOrder, type DocBlock, type OfficialDoc } from "./model";

// подписи под строками и номера страниц на языке документа (задаются в начале отрисовки)
const LABELS = {
  ru: { sign: "(подпись)", name: "(Ф.И.О.)", docNo: "Номер документа", docDate: "Дата составления", subj: "наименование субъекта", dept: "структурное подразделение", code: "Код", okpo: "по ОКПО", from: "от", page: "стр. ", pageOf: (p: number, n: number) => `стр. ${p} из ${n}` },
  ky: { sign: "(колу)", name: "(аты-жөнү)", docNo: "Документтин номери", docDate: "Түзүлгөн күнү", subj: "субъекттин аталышы", dept: "түзүмдүк бөлүм", code: "Коду", okpo: "ОКПО боюнча", from: "·", page: "бет ", pageOf: (p: number, n: number) => `${n} беттин ${p}-бети` },
};
let L = LABELS.ru;

const FONT = "Times New Roman";
const BASE = 24; // half-points → 12 pt
const SMALL = 18;

const AL: Record<Align, (typeof AlignmentType)[keyof typeof AlignmentType]> = {
  l: AlignmentType.LEFT, c: AlignmentType.CENTER, r: AlignmentType.RIGHT,
};

/** кегль по умолчанию: 12 pt, в бланковой вёрстке (doc.compact) — 9 pt */
let SZ = BASE;
let COMPACT = false;
const run = (text: string, o: { bold?: boolean; italics?: boolean; size?: number } = {}) =>
  new TextRun({ text, font: FONT, size: o.size ?? SZ, bold: o.bold, italics: o.italics });

const thin = { style: BorderStyle.SINGLE, size: 4, color: "000000" };

function table(b: Extract<DocBlock, { t: "table" }>): Table {
  const cols = b.head?.length ?? b.rows[0]?.length ?? (b.heads ? b.heads[0].reduce((a, h) => a + (h.colSpan ?? 1), 0) : 1);
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
  if (b.heads) {
    placeHeads(b.heads, cols).forEach((row) => rows.push(new TableRow({
      tableHeader: true,
      cantSplit: true,
      children: row.map(({ cell: h, col }) => {
        const span = h.colSpan ?? 1;
        const w = widths.slice(col, col + span).reduce((a, x) => a + x, 0);
        return new TableCell({
          width: { size: Math.round((w / total) * 100), type: WidthType.PERCENTAGE },
          columnSpan: span > 1 ? span : undefined,
          rowSpan: (h.rowSpan ?? 1) > 1 ? h.rowSpan : undefined,
          borders: { top: thin, bottom: thin, left: thin, right: thin },
          margins: { top: 20, bottom: 20, left: 40, right: 40 },
          children: String(h.text).split("\n").map((line) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(line, { size: size - 2 })] })),
        });
      }),
    })));
  } else if (b.head) rows.push(new TableRow({ tableHeader: true, children: b.head.map((h, i) => cell(h, i, true)) }));
  b.rows.forEach((r, ri) => rows.push(new TableRow({
    cantSplit: true,
    children: r.map((c, i) => cell(c, i, !!b.total && ri === b.rows.length - 1)),
  })));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows });
}

// ── кассовые ордера КО-1 / КО-2 по бланку альбома: компактно, квитанция сбоку за линией отреза ──
const CS = 15; // 7,5 pt
const none = { style: BorderStyle.NONE, size: 0, color: "FFFFFF" };
const dashed = { style: BorderStyle.DASHED, size: 6, color: "000000" };
const small = (text: string, o: { bold?: boolean; italics?: boolean; size?: number; align?: (typeof AlignmentType)[keyof typeof AlignmentType] } = {}) =>
  new Paragraph({ alignment: o.align, spacing: { after: 20 }, children: [run(text, { bold: o.bold, italics: o.italics, size: o.size ?? CS })] });
/** «Подпись: значение» с подчёркнутым значением */
const lineP = (label: string, value: string, size = CS) => new Paragraph({
  spacing: { after: 30 },
  children: [run(`${label} `, { size }), new TextRun({ text: value || "                                        ", font: FONT, size, underline: {} })],
});
const signP = (role: string, name: string, tabs: [number, number] = [1900, 3300], size = CS) => new Paragraph({
  spacing: { before: 60, after: 20 },
  tabStops: [{ type: TabStopType.LEFT, position: tabs[0] }, { type: TabStopType.LEFT, position: tabs[1] }],
  children: [run(role, { size, bold: true }), run("\t__________", { size }), run(`\t${name || "____________________"}`, { size })],
});
function cashOrderDocx(o: CashOrder): Table {
  const ko1 = o.kind === "ko1";
  const head = [
    ...(ko1 ? ["Унифицированная форма КО-1", "Утверждена постановлением Нацстаткомитета Кыргызской Республики от 07.04.03 № 4"] : ["Унифицированная форма № КО-2", "Утверждено постановлением Нацстаткомитета Кыргызской Республики от 07.04.2003 г. № 4"])
      .map((t) => small(t, { size: 12, align: AlignmentType.RIGHT })),
    small(`Форма по ГКУД ${ko1 ? "0310001" : "0310002"} · по ОКПО ${o.okpo || "________"}`, { size: 12, align: AlignmentType.RIGHT }),
    lineP(ko1 ? "Организация:" : "Наименование субъекта:", o.org),
    lineP(ko1 ? "Подразделение:" : "Структурное подразделение:", o.dept ?? ""),
    new Paragraph({ spacing: { before: 60, after: 40 }, children: [run(ko1 ? "ПРИХОДНЫЙ КАССОВЫЙ ОРДЕР" : "РАСХОДНЫЙ КАССОВЫЙ ОРДЕР", { bold: true, size: 18 }), run(`    № ${o.number}   от ${o.date}`, { size: CS })] }),
  ];
  const grid = table(ko1
    ? { t: "table", small: true, heads: [[{ text: "Дебет", rowSpan: 2 }, { text: "Кредит", colSpan: 4 }, { text: "Сумма, KGS", rowSpan: 2 }, { text: "Код целевого назначения", rowSpan: 2 }], [{ text: "" }, { text: "код структурного подразделения" }, { text: "корреспондирующий счёт, субсчёт" }, { text: "код аналитического учёта" }]],
        rows: [[o.debit, "", "", o.credit, "", o.amount, ""]], widths: [1.1, 0.5, 1.4, 1.5, 1.2, 1.5, 1.3], align: ["c", "c", "c", "c", "c", "r", "c"] }
    : { t: "table", small: true, heads: [[{ text: "Дебет", colSpan: 4 }, { text: "Кредит", rowSpan: 2 }, { text: "Сумма (сом, тый.)", rowSpan: 2 }, { text: "Код целевого назначения", rowSpan: 2 }], [{ text: "" }, { text: "код структурного подразделения" }, { text: "корреспондирующий счёт" }, { text: "код аналитического учёта" }]],
        rows: [["", "", o.debit, "", o.credit, o.amount, ""]], widths: [0.5, 1.4, 1.4, 1.3, 1.1, 1.6, 1.4], align: ["c", "c", "c", "c", "c", "r", "c"] });
  const left = ko1
    ? [...head, grid, lineP("Принято от:", o.party), lineP("Основание:", o.basis), lineP("Сумма:", o.words), lineP("В том числе:", o.including ?? ""), lineP("Приложение:", o.attachment ?? ""),
       signP("Главный бухгалтер", o.chief), signP("Получил кассир", o.cashier)]
    : [...head, grid, lineP("Выдать:", o.party), lineP("Основание:", o.basis), lineP("Сумма (прописью):", o.words), lineP("Приложение:", o.attachment ?? ""),
       signP("Руководитель", o.director ?? ""), signP("Главный бухгалтер", o.chief),
       lineP("Получил:", ""), small("«___» ______________ 20__ г.            Подпись ____________________"),
       lineP("По:", o.idDoc ?? ""), small("наименование, номер, дата и место выдачи документа, удостоверяющего личность получателя", { size: 11, italics: true }),
       signP("Выдал кассир", o.cashier)];
  const cells = [new TableCell({ width: { size: ko1 ? 70 : 100, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: ko1 ? dashed : none }, margins: { right: 140 }, children: left })];
  if (ko1) cells.push(new TableCell({
    width: { size: 30, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: dashed, right: none }, margins: { left: 140 },
    children: [
      small("линия отреза", { size: 11, italics: true, align: AlignmentType.LEFT }),
      lineP("Организация:", o.org),
      small("КВИТАНЦИЯ", { bold: true, size: 18, align: AlignmentType.CENTER }),
      lineP("к ПКО №", o.number), lineP("от", o.date), lineP("Принято от", o.party), lineP("Основание", o.basis),
      lineP("Сумма KGS", o.amount), small(o.words, { size: 13 }),
      small("М.П. (штамп)", { bold: true }), signP("Гл. бухгалтер", o.chief, [1150, 2000]), signP("Кассир", o.cashier, [1150, 2000]),
    ],
  }));
  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ cantSplit: true, children: cells })] });
}

// ── бланки альбома: шапка, заголовок, клетки, документ-блок ─────────────────
const capP = (value: string, caption: string) => [
  new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: "000000", space: 1 } }, children: [run(value || " ")] }),
  new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 40 }, children: [run(caption, { size: 12, italics: true })] }),
];
function boxTable(rows: string[][], firstPlain = false, width = 2400): Table {
  const n = rows[0].length;
  return new Table({
    alignment: AlignmentType.RIGHT,
    width: { size: width, type: WidthType.DXA },
    rows: rows.map((r) => new TableRow({ children: r.map((c, i) => new TableCell({
      width: { size: Math.round(width / n), type: WidthType.DXA },
      borders: firstPlain && i === 0 ? { top: none, bottom: none, left: none, right: thin } : { top: thin, bottom: thin, left: thin, right: thin },
      margins: { left: 40, right: 40 },
      children: [new Paragraph({ alignment: firstPlain && i === 0 ? AlignmentType.RIGHT : AlignmentType.CENTER, children: [run(c || " ", { size: 14 })] })],
    })) })),
  });
}
function formHeadDocx(b: Extract<DocBlock, { t: "formHead" }>): Table {
  const codes = boxTable([["", L.code], ...(b.gkud ? [["Форма по ГКУД", b.gkud]] : []), [L.okpo, b.okpo ?? ""], ...(b.codes ?? [])], true, b.codes?.length ? 3800 : 2400);
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows: [new TableRow({ children: [
      new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none }, margins: { right: 200 },
        children: [new Paragraph({ children: [] }), ...capP(b.org ?? "", L.subj), ...capP(b.dept ?? "", L.dept)] }),
      new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none },
        children: [...b.corner.map((t) => new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(t, { size: 14, bold: /^Форма/.test(t) })] })), codes, new Paragraph({ children: [] })] }),
    ] })],
  });
}
function formTitleDocx(b: Extract<DocBlock, { t: "formTitle" }>): Array<Paragraph | Table> {
  if (b.boxed && b.no !== undefined && b.date !== undefined) {
    const m = b.text.match(/^(Приказ)\s+(\(распоряжение\))\s+(.*)$/i);
    const lines = m ? [m[1].toUpperCase(), m[2], m[3]] : [b.text];
    return [new Table({
      width: { size: 100, type: WidthType.PERCENTAGE },
      rows: [new TableRow({ children: [
        new TableCell({ width: { size: 70, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none },
          children: [...lines.map((l, i) => new Paragraph({ alignment: AlignmentType.CENTER, children: [run(l, { bold: i !== 1 || !m, size: i === 0 ? 22 : 19 })] })), ...(b.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, children: [run(b.sub, { size: 17 })] })] : [])] }),
        new TableCell({ width: { size: 30, type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none },
          children: [boxTable([[L.docNo, L.docDate], [b.no || " ", b.date || " "]], false, 3000), new Paragraph({ children: [] })] }),
      ] })],
    }), new Paragraph({ spacing: { after: 60 }, children: [] })];
  }
  const kids: TextRun[] = [run(b.text, { bold: true, size: 22 })];
  if (b.no !== undefined) kids.push(run(" № ", { bold: true, size: 22 }), b.no ? new TextRun({ text: ` ${b.no} `, font: FONT, size: 22, bold: true, underline: {} }) : run("________", { size: 22 }));
  if (b.date !== undefined) kids.push(run(`  ${L.from} `, { size: 20 }), b.date ? new TextRun({ text: b.date, font: FONT, size: 20, underline: {} }) : run("«___» ____________ 20__ г.", { size: 20 }));
  return [
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 60, after: b.sub ? 0 : 100 }, children: kids }),
    ...(b.sub ? [new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 100 }, children: [run(b.sub, { size: 17 })] })] : []),
  ];
}

function blocks(list: DocBlock[]): Array<Paragraph | Table> {
  const out: Array<Paragraph | Table> = [];
  for (const [bi, b] of list.entries()) {
    switch (b.t) {
      case "cashOrder":
        out.push(cashOrderDocx(b.order));
        out.push(list[bi + 1]?.t === "cashOrder"
          ? new Paragraph({ spacing: { before: 120, after: 160 }, border: { bottom: { style: BorderStyle.DASHED, size: 4, color: "000000", space: 1 } }, children: [] })
          : new Paragraph({ children: [] }));
        break;
      case "formHead":
        out.push(formHeadDocx(b));
        break;
      case "formTitle":
        out.push(...formTitleDocx(b));
        break;
      case "box":
        out.push(boxTable([b.heads, b.values], false, Math.min(1500 * b.heads.length, 7000)), new Paragraph({ spacing: { after: 60 }, children: [] }));
        break;
      case "cols": {
        const total = (b.widths ?? b.cols.map(() => 1)).reduce((a, w) => a + w, 0);
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ children: b.cols.map((c, i) => new TableCell({
          width: { size: Math.round(((b.widths?.[i] ?? 1) / total) * 100), type: WidthType.PERCENTAGE }, borders: { top: none, bottom: none, left: none, right: none }, margins: { right: 120 },
          children: [...blocks(c), new Paragraph({ children: [] })],
        })) })] }), new Paragraph({ children: [] }));
        break;
      }
      case "frame":
        out.push(new Table({ width: { size: 90, type: WidthType.PERCENTAGE }, alignment: AlignmentType.CENTER, rows: [new TableRow({ cantSplit: true, children: [new TableCell({
          borders: { top: thin, bottom: thin, left: thin, right: thin }, margins: { top: 100, bottom: 100, left: 140, right: 140 }, children: [...blocks(b.blocks), new Paragraph({ children: [] })],
        })] })] }));
        if (b.caption) out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 200 }, children: [run(b.caption, { bold: true })] }));
        break;
      case "unit":
        // документ целиком в одной строке таблицы без рамок: Word не разрывает его между листами
        out.push(new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: [new TableRow({ cantSplit: true, children: [new TableCell({ borders: { top: none, bottom: none, left: none, right: none }, children: [...blocks(b.blocks), new Paragraph({ children: [] })] })] })] }));
        out.push(list[bi + 1]?.t === "unit"
          ? new Paragraph({ spacing: { before: 80, after: 120 }, border: { bottom: { style: BorderStyle.DASHED, size: 4, color: "000000", space: 1 } }, children: [] })
          : new Paragraph({ children: [] }));
        break;
      case "right":
        b.lines.forEach((l) => out.push(new Paragraph({ alignment: AlignmentType.RIGHT, children: [run(l, { size: b.small ? SMALL : SZ })] })));
        out.push(new Paragraph({ children: [] }));
        break;
      case "title":
        out.push(new Paragraph({ alignment: AlignmentType.CENTER, spacing: { before: 120, after: 60 }, children: [run(b.text.toUpperCase(), { bold: true, size: COMPACT ? 22 : 28 })] }));
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
          children: [run(b.text, { bold: b.bold, italics: b.italic, size: b.small ? SMALL : SZ })],
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
        if (COMPACT) { for (const s of b.items) out.push(signP(s.role, s.name ?? "", [3000, 4800], SZ)); break; }
        for (const s of b.items) {
          out.push(new Paragraph({
            spacing: { before: 200 },
            tabStops: [{ type: TabStopType.LEFT, position: 3800 }, { type: TabStopType.LEFT, position: 6400 }],
            children: [run(s.role), run("\t______________"), run(`\t${s.name || "______________________"}`)],
          }));
          out.push(new Paragraph({
            tabStops: [{ type: TabStopType.LEFT, position: 4100 }, { type: TabStopType.LEFT, position: 6800 }],
            children: [run(`\t${L.sign}`, { size: 16, italics: true }), run(`\t${L.name}`, { size: 16, italics: true })],
          }));
        }
        break;
      case "fields":
        if (COMPACT) { for (const [k, v] of b.items) out.push(lineP(k, v, SZ)); break; }
        for (const [k, v] of b.items) {
          out.push(new Paragraph({ spacing: { after: 60 }, children: [run(`${k}: `), v ? new TextRun({ text: v, font: FONT, size: BASE, underline: {} }) : run("______________________________")] }));
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
  L = LABELS[doc.lang ?? "ru"];
  COMPACT = !!doc.compact;
  SZ = doc.compact ? 18 : BASE;
  const d = new Document({
    creator: "FinLite KG",
    title: doc.title,
    styles: { default: { document: { run: { font: FONT, size: SZ } } } },
    sections: [{
      properties: {
        page: {
          size: { orientation: doc.landscape ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: doc.compact ? { top: 567, bottom: 567, left: 680, right: 567 } : { top: 1134, bottom: 1134, left: 1418, right: 850 },
        },
      },
      headers: doc.org && !doc.compact ? { default: new Header({ children: [new Paragraph({ alignment: AlignmentType.LEFT, children: [run(doc.org, { size: 16, italics: true })] })] }) } : undefined,
      footers: {
        default: new Footer({
          children: [new Paragraph({
            alignment: AlignmentType.RIGHT,
            tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
            children: [new TextRun({ font: FONT, size: 16, children: [L.page, PageNumber.CURRENT] })],
          })],
        }),
      },
      children: blocks(doc.blocks),
    }],
  });
  return Buffer.from(await Packer.toBuffer(d));
}
