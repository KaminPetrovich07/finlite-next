// Бланк (описание + введённые значения) → документ для Word/PDF.
import { sum, type Align, type DocBlock, type HeadCell, type OfficialDoc } from "@/lib/docs/model";
import type { ColDef, FillValues, FormDef, FormValues, Part } from "./types";

/** Ключ поля в FormValues.f */
export const fieldKey = (part: number, item: number) => `${part}.${item}`;

const BLANK = "_______________";

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
  if (/^(№|номер|n|код|шифр)\b|по порядку|^№ п\/п|^единица|сорт/.test(leaf) || leaf.length <= 6) return 0.8;
  return 1.2;
}

const num = (s: string) => { const n = Number(String(s).replace(/\s/g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };

function tableBlock(p: Extract<Part, { t: "table" }>, data: string[][] | undefined, blank: boolean, landscape: boolean): DocBlock[] {
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
  const empty = blank || !filled.length ? (p.rows ?? 6) : Math.max(0, 2 - filled.length);
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

/** Документ по бланку. `blank` — чистый бланк без введённых строк (для печати от руки). */
export function buildForm(def: FormDef, values: FormValues = {}, fills: FillValues = {}, blank = false): OfficialDoc {
  const f = values.f ?? {};
  const val = (pi: number, ii: number, fill?: keyof FillValues) => (blank ? "" : f[fieldKey(pi, ii)] ?? (fill ? fills[fill] ?? "" : ""));
  const blocks: DocBlock[] = [];

  const corner = def.approvedBy ? [def.approvedBy] : def.unified ? [`Форма № ${def.code}`] : ["Неунифицированная форма"];
  blocks.push({ t: "right", lines: corner, small: true });
  const lead = def.parts[0]?.t === "approve" ? 1 : 0; // «Утверждаю» печатается над шапкой, как в альбоме
  if (lead) blocks.push(approveBlock(def.parts[0] as Extract<Part, { t: "approve" }>, fills, blank));
  if (!def.noOrg) {
    blocks.push({
      t: "fields",
      items: [
        ["Наименование субъекта", blank ? "" : fills.org ? `${fills.org}${fills.inn ? `, ИНН ${fills.inn}` : ""}` : ""],
        ["Структурное подразделение", blank ? "" : f["org.dept"] ?? fills.dept ?? ""],
        ["Код по ОКПО", blank ? "" : f["org.okpo"] ?? fills.okpo ?? ""],
      ],
    });
  }

  def.parts.forEach((p, pi) => {
    if (pi < lead) return;
    switch (p.t) {
      case "approve":
        blocks.push(approveBlock(p, fills, blank));
        break;
      case "title": {
        const no = p.no ? ` № ${(!blank && f[`${pi}.no`]) || "______"}` : "";
        blocks.push({ t: "title", text: `${p.text}${no}` });
        if (p.sub) blocks.push({ t: "subtitle", text: p.sub });
        if (p.date) blocks.push({ t: "p", text: `Дата составления: ${(!blank && f[`${pi}.date`]) || "«___» ______________ 20__ г."}`, align: "c" });
        break;
      }
      case "fields":
        blocks.push({ t: "fields", items: p.items.map((it, ii) => [it.label, val(pi, ii, it.fill)] as [string, string]) });
        break;
      case "text":
        blocks.push({ t: "p", text: p.text, bold: p.bold, align: p.center ? "c" : undefined });
        break;
      case "h":
        blocks.push({ t: "h", text: p.text, level: 2 });
        break;
      case "table":
        blocks.push(...tableBlock(p, blank ? undefined : values.t?.[p.id], blank, !!def.landscape));
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
  });

  const name = def.code ? `${def.code} ${def.title}` : def.title;
  return { title: name, fileName: `${name}${fills.org && !blank ? ` — ${fills.org}` : ""}`, org: blank ? undefined : fills.org, landscape: def.landscape, blocks };
}
