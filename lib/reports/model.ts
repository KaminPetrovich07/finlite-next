// ════════════════════════════════════════════════════════════════════════
// lib/reports/model.ts — format-neutral report document.
//
// Packages (lib/reports/packages.ts) describe WHAT is in a report as blocks;
// renderers (render-pdf / render-docx / render-xlsx) decide HOW it looks in
// each format. So PDF, Word and Excel always carry the same numbers.
// ════════════════════════════════════════════════════════════════════════

export type Cell = string | number | null;

export interface Column {
  label: string;
  /** money/num/pct are right-aligned and formatted per format */
  kind?: "text" | "code" | "money" | "num" | "pct";
  /** relative width for PDF/Word */
  width?: number;
}

export type RowStyle = "normal" | "sub" | "subtotal" | "total" | "section";

export interface TableBlock {
  type: "table";
  title?: string;
  columns: Column[];
  rows: Array<{ cells: Cell[]; style?: RowStyle }>;
  note?: string;
  /** numbered notes printed under the table; rows reference them with ¹ ² … */
  footnotes?: string[];
}

export type Block =
  | { type: "h2"; text: string }
  | { type: "h3"; text: string }
  | { type: "list"; items: string[] }
  | { type: "callout"; title?: string; text: string; tone?: "key" | "info" | "warn" }
  | { type: "p"; text: string }
  | { type: "note"; text: string }
  | { type: "kpis"; items: Array<{ label: string; value: string; note?: string }> }
  | TableBlock
  | { type: "bars"; title: string; items: Array<{ label: string; value: number; display: string }> }
  | { type: "checks"; items: Array<{ title: string; status: "ok" | "warn" | "error"; detail: string }> }
  | { type: "pagebreak" };

export interface Section {
  title: string;
  /** Excel sheet name, ≤ 31 chars */
  sheet: string;
  blocks: Block[];
}

export type PackageKey = "full" | "executive" | "audit" | "management" | "esg";
export type FormatKey = "pdf" | "docx" | "xlsx";

export interface ReportDoc {
  package: PackageKey;
  title: string;
  subtitle?: string;
  /** print a table of contents after the cover (long reports) */
  toc?: boolean;
  company: string;
  regime: string;
  period: string;
  generatedAt: string;
  disclaimer?: string;
  sections: Section[];
}

// Money in exports uses a regular no-break space (U+00A0): every PDF/Word
// font has it, unlike the narrow one used on screen.
const NBSP = " ";

export function money(n: number | null | undefined, decimals = 0): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.005) return "—";
  const fixed = Math.abs(n).toFixed(decimals);
  const [i, d] = fixed.split(".");
  const grouped = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  const s = d ? `${grouped},${d}` : grouped;
  return n < 0 ? `(${s})` : s;
}

export function pct(n: number | null | undefined, decimals = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${n.toLocaleString("ru-RU", { maximumFractionDigits: decimals, minimumFractionDigits: 0 }).replace(/ /g, NBSP)}%`;
}

export function num(n: number | null | undefined, decimals = 2): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: decimals }).replace(/ /g, NBSP);
}

/** Display a cell for PDF/Word. */
export function cellText(c: Cell, kind: Column["kind"]): string {
  if (c === null || c === undefined) return "";
  if (typeof c === "string") return c;
  if (kind === "money") return money(c);
  if (kind === "pct") return pct(c);
  if (kind === "num") return num(c);
  return String(c);
}

export const PACKAGE_INFO: Record<PackageKey, { title: string; short: string; description: string; contents: string[] }> = {
  full: {
    title: "Финансовая отчётность",
    short: "Полный комплект",
    description: "Четыре формы по МСФО для МСП и примечания — для банка, учредителей, налоговой проверки.",
    contents: ["Отчёт о финансовом положении (Ф.1)", "Отчёт о прибылях и убытках (Ф.2)", "Отчёт о движении денежных средств (Ф.3)", "Отчёт об изменениях в капитале (Ф.4)", "Примечания: учётная политика, налоги, сверки"],
  },
  executive: {
    title: "Отчёт для руководителя",
    short: "Для руководителя",
    description: "Главные цифры периода на нескольких страницах: что выросло, что упало, где риск и что сделать.",
    contents: ["Ключевые показатели и сравнение с прошлым периодом", "Динамика по месяцам", "Структура расходов", "Коэффициенты", "Риски и рекомендации, сравнение налоговых режимов"],
  },
  audit: {
    title: "Пакет для аудитора",
    short: "Аудиторский пакет",
    description: "Рабочие документы для внешнего или внутреннего аудита. Не является аудиторским заключением.",
    contents: ["Существенность по МСА 320", "Сверки между формами", "Оборотно-сальдовая ведомость", "Аналитические процедуры (МСА 520)", "Тесты журнала проводок (МСА 240)", "Журнал проводок за период"],
  },
  management: {
    title: "Управленческий отчёт",
    short: "Управленческий учёт",
    description: "Расходы по элементам затрат, маржинальный доход, точка безубыточности, оборотный капитал.",
    contents: ["Расходы по элементам затрат", "Маржинальный доход и точка безубыточности", "Помесячная динамика", "Оборотный капитал и оборачиваемость", "Денежный поток по видам деятельности", "Налоговая нагрузка"],
  },
  esg: {
    title: "Отчёт об устойчивом развитии",
    short: "ESG",
    description: "Полный ESG-отчёт по GRI 2021 и IFRS S1/S2: анализ, методика каждого показателя, рекомендации, приложения.",
    contents: ["Резюме, обращение руководителя, профиль компании", "Выбросы Охватов 1–3 (GHG Protocol), энергия, вода, отходы, климатические риски", "Персонал, оплата, обучение, охрана труда; управление, политики, налоги", "Существенные темы, GRI 201-1, рекомендации с расчётом эффекта", "Методика и коэффициенты, указатель GRI, соответствие IFRS S1/S2"],
  },
};

const SUP = ["⁰", "¹", "²", "³", "⁴", "⁵", "⁶", "⁷", "⁸", "⁹"];
/** 12 → "¹²" — footnote marker that survives every format as plain text. */
export function sup(n: number): string {
  return String(n).split("").map((d) => SUP[Number(d)]).join("");
}
