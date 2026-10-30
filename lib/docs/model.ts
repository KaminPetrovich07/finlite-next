// ════════════════════════════════════════════════════════════════════════
// lib/docs/model.ts — official documents (приказы, учётная политика,
// первичные документы по унифицированным формам).
//
// Unlike lib/reports (analytic reports with KPIs and charts), these look
// like paper documents: black on white, serif-free, signature lines, form
// codes in the corner. One model, two renderers (Word and PDF), so both
// files always carry the same text.
// ════════════════════════════════════════════════════════════════════════

export type Align = "l" | "c" | "r";

export type DocBlock =
  /** right-aligned block, e.g. «УТВЕРЖДЕНО приказом …» or the form code */
  | { t: "right"; lines: string[]; small?: boolean }
  | { t: "title"; text: string }
  | { t: "subtitle"; text: string }
  /** section heading; level 1 = «1. Общие положения», 2 = smaller */
  | { t: "h"; text: string; level?: 1 | 2 }
  | { t: "p"; text: string; bold?: boolean; italic?: boolean; align?: Align; small?: boolean; indent?: boolean }
  /** numbered clause: «2.3. Текст» with a hanging number */
  | { t: "clause"; n: string; text: string }
  | { t: "list"; items: string[] }
  | {
      t: "table";
      head?: string[];
      /** a second header row (e.g. «дебет / кредит» under «Сумма») */
      rows: string[][];
      widths?: number[];
      align?: Align[];
      /** bold last row */
      total?: boolean;
      small?: boolean;
    }
  /** «Подпись ____________ Ф.И.О.» lines */
  | { t: "sign"; items: Array<{ role: string; name?: string }> }
  /** label: value pairs printed as form fields */
  | { t: "fields"; items: Array<[string, string]> }
  | { t: "note"; text: string }
  /** dashed «линия отреза» between a document and its tear-off slip */
  | { t: "cut"; text?: string }
  | { t: "spacer" }
  | { t: "pagebreak" };

export interface OfficialDoc {
  title: string;
  /** file name without extension */
  fileName: string;
  /** organisation printed at the top of every page */
  org?: string;
  landscape?: boolean;
  blocks: DocBlock[];
}

/** «12 345,67» — money in documents (always two decimals). */
export function sum(n: number): string {
  const neg = n < 0;
  const [i, d] = Math.abs(n).toFixed(2).split(".");
  return `${neg ? "-" : ""}${i.replace(/\B(?=(\d{3})+(?!\d))/g, " ")},${d}`;
}

const ONES_M = ["", "один", "два", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const ONES_F = ["", "одна", "две", "три", "четыре", "пять", "шесть", "семь", "восемь", "девять"];
const TEENS = ["десять", "одиннадцать", "двенадцать", "тринадцать", "четырнадцать", "пятнадцать", "шестнадцать", "семнадцать", "восемнадцать", "девятнадцать"];
const TENS = ["", "", "двадцать", "тридцать", "сорок", "пятьдесят", "шестьдесят", "семьдесят", "восемьдесят", "девяносто"];
const HUNDREDS = ["", "сто", "двести", "триста", "четыреста", "пятьсот", "шестьсот", "семьсот", "восемьсот", "девятьсот"];

function plural(n: number, one: string, few: string, many: string): string {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
  return many;
}

function triad(n: number, female: boolean): string[] {
  const out: string[] = [];
  out.push(HUNDREDS[Math.floor(n / 100)]);
  const r = n % 100;
  if (r >= 10 && r < 20) out.push(TEENS[r - 10]);
  else {
    out.push(TENS[Math.floor(r / 10)]);
    out.push((female ? ONES_F : ONES_M)[r % 10]);
  }
  return out.filter(Boolean);
}

/** Amount in words for cash documents: «Сто двадцать три сома 45 тыйынов». */
export function sumInWords(n: number): string {
  const total = Math.round(Math.abs(n) * 100);
  let som = Math.floor(total / 100);
  const tyiyn = total % 100;
  if (som === 0) return `Ноль сомов ${String(tyiyn).padStart(2, "0")} тыйынов`;
  const words: string[] = [];
  const scales: Array<[number, [string, string, string], boolean]> = [
    [1_000_000_000, ["миллиард", "миллиарда", "миллиардов"], false],
    [1_000_000, ["миллион", "миллиона", "миллионов"], false],
    [1_000, ["тысяча", "тысячи", "тысяч"], true],
  ];
  for (const [base, forms, female] of scales) {
    const k = Math.floor(som / base);
    if (k > 0) { words.push(...triad(k, female), plural(k, ...forms)); som %= base; }
  }
  const rest = som;
  words.push(...triad(rest, false));
  const somWord = plural(Math.floor(total / 100), "сом", "сома", "сомов");
  const s = `${words.join(" ")} ${somWord} ${String(tyiyn).padStart(2, "0")} ${plural(tyiyn, "тыйын", "тыйына", "тыйынов")}`;
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** «31 декабря 2026 г.» */
export function dateLong(iso: string): string {
  const M = ["января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря"];
  const [y, m, d] = iso.split("-").map(Number);
  return `${d} ${M[m - 1]} ${y} г.`;
}

/** «31.12.2026» */
export function dateShort(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
