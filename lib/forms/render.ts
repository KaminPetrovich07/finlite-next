// Бланк (описание + введённые значения) → документ для Word/PDF.
import { sum, type Align, type DocBlock, type HeadCell, type OfficialDoc } from "@/lib/docs/model";
import type { ColDef, FillValues, FormDef, FormValues, Part } from "./types";

/** Ключ поля в FormValues.f */
export const fieldKey = (part: number, item: number) => `${part}.${item}`;

const BLANK = "_______________";

/** реквизиты инвентаризационных бланков, которые в альбоме стоят в колонке кодов справа от шапки */
const HEAD_CODE_RE = /^(вид деятельности|основание для проведения инвентаризации.*|дата начала инвентаризации|дата окончания инвентаризации|вид операции)$/i;

/** реквизиты, которые в бланках альбома стоят в клетках */
const BOX_RE = /^(номер документа|дата составления|код вида операции|код лица, ответственного за сохранность.*|отч[её]тный период с|дата|номер)$/i;

/** Многоуровневая шапка из путей «Группа|Подграфа». */
export function headRows(cols: ColDef[]): HeadCell[][] {
  const paths = cols.map((c) => c.h.split("|").map((s) => s.trim()));
  const depth = Math.max(...paths.map((p) => p.length));
  const rows: HeadCell[][] = [];
  for (let level = 0; level < depth; level++) {
    const row: HeadCell[] = [];
    for (let i = 0; i < paths.length; ) {
      const p = paths[i];
      if (p.length <= level) { i++; continue; } // занято ячейкой сверху
      if (level === p.length - 1) { row.push({ text: p[level], rowSpan: depth - level > 1 ? depth - level : undefined }); i++; continue; }
      const prefix = p.slice(0, level + 1).join("|");
      let j = i + 1;
      while (j < paths.length && paths[j].length > level + 1 && paths[j].slice(0, level + 1).join("|") === prefix) j++;
      row.push({ text: p[level], colSpan: j - i > 1 ? j - i : undefined });
      i = j;
    }
    rows.push(row);
  }
  return rows;
}

/** Ширина графы: наименования шире, номера и коды уже. */
function colWidth(c: ColDef): number {
  if (c.w) return c.w;
  const leaf = c.h.split("|").pop()!.toLowerCase();
  if (/наименование|фамилия|ф\.\s?и\.\s?о|содержание|описание|причин|характеристик|основание|объяснени|примечани/.test(leaf)) return 2.4;
  if (c.sum) return 1.3; // суммы не должны переноситься
  if (/^(№|номер|n|код|шифр)\b|по порядку|^№ п\/п|^единица|сорт/.test(leaf) || leaf.length <= 6) return 0.8;
  return 1.2;
}

const num = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function tableBlock(p: Extract<Part, { t: "table" }>, data: string[][] | undefined, blank: boolean, landscape: boolean, pad = true): DocBlock[] {
  const n = p.cols.length;
  const heads = headRows(p.cols);
  if (Array.isArray(p.nums)) heads.push(p.cols.map((_, i) => ({ text: p.nums && Array.isArray(p.nums) ? p.nums[i] ?? "" : "" })));
  else if (p.nums) {
    const from = typeof p.nums === "number" ? p.nums : 1;
    heads.push(p.cols.map((_, i) => ({ text: String(from + i) })));
  }
  const filled = (data ?? []).filter((r) => r.some((c) => c && c.trim()));
  const rows: string[][] = [...(p.fixed ?? []).map((r) => [...r, ...Array(Math.max(0, n - r.length)).fill("")])];
  for (const r of filled) rows.push(Array.from({ length: n }, (_, i) => r[i] ?? ""));
  const empty = blank || !filled.length ? (p.rows ?? 6) : pad ? Math.max(0, 2 - filled.length) : 0;
  for (let i = 0; i < empty; i++) rows.push(Array(n).fill(""));
  for (const label of p.totals ?? []) {
    rows.push(p.cols.map((c, i) => {
      if (i === 0) return label;
      if (c.sum && filled.length) return sum(filled.reduce((a, r) => a + num(r[i] ?? ""), 0));
      return c.sum ? "" : "Х";
    }));
  }
  const align: Align[] = p.cols.map((c) => c.a ?? (c.sum ? "r" : "l"));
  const out: DocBlock[] = [];
  if (p.title) out.push({ t: "p", text: p.title, bold: true, small: true });
  out.push({ t: "table", heads, rows, widths: p.cols.map(colWidth), align, small: n > 8 || !landscape, total: !!p.totals?.length && filled.length > 0 });
  return out;
}

function approveBlock(p: Extract<Part, { t: "approve" }>, fills: FillValues, blank: boolean): DocBlock {
  return {
    t: "right",
    lines: [
      "УТВЕРЖДАЮ",
      (!blank && fills.directorTitle) || p.who || "Руководитель",
      `${BLANK} ${(!blank && fills.director) || "________________"}`,
      "(подпись)          (расшифровка подписи)",
      "«___» ______________ 20__ г.",
    ],
  };
}

// ── бланки со своей раскладкой (как в альбоме) ──────────────────────────────
interface SpecialCtx { f: Record<string, string>; t?: Record<string, string[][]>; fills: FillValues; blank: boolean; val: (pi: number, ii: number, fill?: keyof FillValues) => string }
type Special = (def: FormDef, part: (p: Part, pi: number) => DocBlock[], c: SpecialCtx) => DocBlock[] | null;

/** значение поля бланка по подписи */
function byLabel(def: FormDef, c: SpecialCtx, re: RegExp): string {
  for (const [pi, p] of def.parts.entries()) {
    if (p.t !== "fields") continue;
    for (const [ii, it] of p.items.entries()) if (re.test(it.label.toLowerCase())) return c.val(pi, ii, it.fill);
  }
  return "";
}
const titleIdx = (def: FormDef) => def.parts.findIndex((p) => p.t === "title");

/** КО-1 и КО-2: чистый бланк — тем же компактным бланком, что и ордер из журнала (квитанция сбоку). */
const cashOrderForm = (kind: "ko1" | "ko2"): Special => (def, _part, c) => {
  const ti = titleIdx(def);
  const row = c.blank ? [] : c.t?.t?.[0] ?? [];
  const ko1 = kind === "ko1";
  return [{ t: "cashOrder", order: {
    kind, org: c.blank ? "" : c.fills.org ? `${c.fills.org}${c.fills.inn ? `, ИНН ${c.fills.inn}` : ""}` : "",
    number: c.blank ? "" : c.f[`${ti}.no`] ?? "", date: c.blank ? "" : c.f[`${ti}.date`] ?? "",
    debit: (ko1 ? row[0] : row[2]) ?? "", credit: (ko1 ? row[3] : row[4]) ?? "", amount: row[5] ?? "",
    words: byLabel(def, c, /^сумма \(прописью\)/), party: byLabel(def, c, ko1 ? /^принято от/ : /^выдать/), basis: byLabel(def, c, /^основание/),
    including: ko1 ? byLabel(def, c, /^в том числе/) : undefined, attachment: byLabel(def, c, /^приложение/),
    chief: c.blank ? "" : c.fills.chief ?? "", cashier: c.blank ? "" : c.fills.cashier ?? "",
    director: c.blank ? "" : c.fills.director ?? "", idDoc: ko1 ? undefined : byLabel(def, c, /^по \(/),
  } }];
};

/** разделить поля одного блока: подходящие под `re` — во второй список */
function splitFields(blocks: DocBlock[], re: RegExp): [DocBlock[], DocBlock[]] {
  const a: DocBlock[] = [], b: DocBlock[] = [];
  for (const x of blocks) {
    if (x.t !== "fields") { a.push(x); continue; }
    const yes = x.items.filter(([k]) => re.test(k.toLowerCase())), no = x.items.filter(([k]) => !re.test(k.toLowerCase()));
    if (no.length) a.push({ ...x, items: no });
    if (yes.length) b.push({ ...x, items: yes });
  }
  return [a, b];
}

const SPECIAL: Record<string, Special> = {
  "ko-1": cashOrderForm("ko1"),
  "ko-2": cashOrderForm("ko2"),
  // АО-1: лицевая сторона в три колонки, как в альбоме — слева суммы аванса, в середине «Отчёт проверен» и подписи,
  // справа проводка «Дебет/Кредит»; на обороте — перечень документов
  "ao-1": (def, part) => {
    const at = (re: (p: Part) => boolean, from = 0) => def.parts.findIndex((p, i) => i >= from && re(p));
    const iTitle = at((p) => p.t === "title");
    const iA = at((p) => p.t === "table" && p.id === "a"), iD = at((p) => p.t === "table" && p.id === "d");
    const iBack = at((p) => p.t === "back");
    if (iTitle < 0 || iA < 0 || iD < 0 || iBack < 0) return null;
    const [who, post] = splitFields(part(def.parts[0], 0), /^проводка|^от$/);
    const mid: DocBlock[] = [], left: DocBlock[] = [];
    def.parts.forEach((p, i) => {
      if (i <= iTitle || i === iD || i >= iBack) return;
      if (i <= iA) left.push(...part(p, i)); else if (p.t !== "text") mid.push(...part(p, i));
    });
    const after = def.parts.flatMap((p, i) => (i > iA && i < iBack && p.t === "text" ? part(p, i) : []));
    return [
      { t: "cols", cols: [who, post], widths: [2.2, 1] },
      // в альбоме «АВАНСОВЫЙ ОТЧЁТ № __ от __» — одной строкой, без клеток
      ...part(def.parts[iTitle], iTitle).map((b) => (b.t === "formTitle" ? { ...b, boxed: false } : b)),
      { t: "cols", cols: [left, mid, part(def.parts[iD], iD)], widths: [1.25, 1, 1.15] },
      ...after,
      ...def.parts.flatMap((p, i) => (i >= iBack ? part(p, i) : [])),
    ];
  },
  // М-2: титульная и оборотная стороны доверенности — в рамках, на одном листе
  "m-2": (def, part) => {
    const iBack = def.parts.findIndex((p) => p.t === "back");
    if (iBack < 0) return null;
    return [
      { t: "frame", blocks: def.parts.flatMap((p, i) => (i < iBack ? part(p, i) : [])), caption: "Титульная сторона" },
      { t: "frame", blocks: def.parts.flatMap((p, i) => (i > iBack ? part(p, i) : [])), caption: "Оборотная сторона" },
    ];
  },
};

/** Документ по бланку. `blank` — чистый бланк без введённых строк (для печати от руки). */
/** `pad: false` — документ из журнала: под заполненными строками таблиц не добавлять пустые. */
export function buildForm(def: FormDef, values: FormValues = {}, fills: FillValues = {}, blank = false, opts: { pad?: boolean } = {}): OfficialDoc {
  const f = values.f ?? {};
  const val = (pi: number, ii: number, fill?: keyof FillValues) => (blank ? "" : f[fieldKey(pi, ii)] ?? (fill ? fills[fill] ?? "" : ""));
  const blocks: DocBlock[] = [];

  const corner = def.approvedBy ? [def.approvedBy] : def.unified ? [`Форма № ${def.code}`] : ["Не унифицированная форма"];
  const lead = def.parts[0]?.t === "approve" ? 1 : 0; // «Утверждаю» печатается над шапкой, как в альбоме
  const ownHead = def.id === "ko-1" || def.id === "ko-2"; // кассовые ордера — со своей шапкой
  if (def.noOrg && !ownHead) blocks.push({ t: "right", lines: corner, small: true });
  if (lead) blocks.push(approveBlock(def.parts[0] as Extract<Part, { t: "approve" }>, fills, blank));
  // реквизиты, которые в альбоме стоят в колонке кодов справа (инвентаризационные формы): вид деятельности,
  // основание (номер, дата), даты начала и окончания, вид операции
  const codes: Array<[string, string]> = [];
  const skip = new Set<string>();
  if (!def.noOrg) def.parts.forEach((p, pi) => {
    if (p.t !== "fields") return;
    p.items.forEach((it, ii) => {
      if (!HEAD_CODE_RE.test(it.label.trim())) return;
      skip.add(fieldKey(pi, ii));
      const v = val(pi, ii, it.fill);
      if (/^основание/i.test(it.label)) codes.push(["Основание: приказ, постановление, распоряжение — номер", v], ["дата", ""]);
      else codes.push([it.label, v]);
    });
  });
  if (!def.noOrg && !ownHead) {
    // как в альбоме: субъект и подразделение — на строках с подписью под ними, справа гриф и клетка «Код по ОКПО»
    blocks.push({
      t: "formHead", corner, ...(codes.length ? { codes } : {}),
      org: blank ? "" : fills.org ? `${fills.org}${fills.inn ? `, ИНН ${fills.inn}` : ""}` : "",
      dept: blank ? "" : f["org.dept"] ?? fills.dept ?? "",
      okpo: blank ? "" : f["org.okpo"] ?? fills.okpo ?? "",
    });
  }

  const partBlocks = (p: Part, pi: number): DocBlock[] => {
    const blocks: DocBlock[] = [];
    switch (p.t) {
      case "approve":
        blocks.push(approveBlock(p, fills, blank));
        break;
      case "title": {
        blocks.push({
          t: "formTitle", text: p.text, boxed: true,
          no: p.no ? (!blank && f[`${pi}.no`]) || "" : undefined,
          date: p.date ? (!blank && f[`${pi}.date`]) || "" : undefined,
          sub: p.sub ? (!blank && f[`${pi}.sub`]) || p.sub : undefined,
        });
        break;
      }
      case "fields": {
        const items = p.items.flatMap((it, ii) => {
          if (skip.has(fieldKey(pi, ii))) return [];
          const v = val(pi, ii, it.fill);
          // заполненное поле с шаблоном даты в подписи («с «___» ______ 20__ г.») — подпись без шаблона
          const label = v && /«_{2,}»/.test(it.label) ? it.label.replace(/\s*(с\s+|по\s+)?«_{2,}».*$/, "").replace(/[:\s]+$/, "") || it.label : it.label;
          return [[label, v] as [string, string]];
        });
        if (!items.length) break;
        // «Номер документа», «Дата составления», «Код вида операции», «Отчётный период с … по» — в клетках, как в альбоме
        const boxed = items.map(([k], i) => BOX_RE.test(k.trim()) || (/^по$/i.test(k.trim()) && i > 0 && /период/i.test(items[i - 1][0])));
        const box = items.filter((_, i) => boxed[i]);
        const rest = items.filter((_, i) => !boxed[i]);
        if (box.length >= 2) {
          blocks.push({ t: "box", heads: box.map(([k]) => k.replace(/^отч[её]тный период\s+/i, "Отчётный период ")), values: box.map(([, v]) => v) });
          if (rest.length) blocks.push({ t: "fields", items: rest });
        } else blocks.push({ t: "fields", items });
        break;
      }
      case "text":
        blocks.push({ t: "p", text: p.text, bold: p.bold, align: p.center ? "c" : undefined });
        break;
      case "h":
        blocks.push({ t: "h", text: p.text, level: 2 });
        break;
      case "table":
        blocks.push(...tableBlock(p, blank ? undefined : values.t?.[p.id], blank, !!def.landscape, opts.pad !== false));
        break;
      case "sign":
        blocks.push({ t: "sign", items: p.items.map((s, ii) => ({ role: s.role, name: val(pi, ii, s.fill) || undefined })) });
        break;
      case "note":
        blocks.push({ t: "note", text: p.text });
        break;
      case "back":
        blocks.push({ t: "pagebreak" }, { t: "right", lines: [`${p.text ?? "Оборотная сторона"}${def.code ? ` формы № ${def.code}` : ""}`], small: true });
        break;
    }
    return blocks;
  };
  const special = SPECIAL[def.id]?.(def, partBlocks, { f, t: values.t, fills, blank, val });
  if (special) blocks.push(...special);
  else def.parts.forEach((p, pi) => { if (pi >= lead) blocks.push(...partBlocks(p, pi)); });

  const name = def.code ? `${def.code} ${def.title}` : def.title;
  return { title: name, fileName: `${name}${fills.org && !blank ? ` — ${fills.org}` : ""}`, org: blank ? undefined : fills.org, landscape: def.landscape, blocks, compact: def.section !== "contract" };
}
