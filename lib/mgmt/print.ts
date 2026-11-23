// Печатная форма: управленческий отчёт о прибылях и убытках по сегментам (PDF и Word).
import { dateShort, sum, type DocBlock } from "@/lib/docs/model";
import { ALLOC_LABEL, DIM_LABEL, SEG_ROW_LABEL, SEG_ROWS, type SegColumn, type SegReport, type SegRow } from "./model";
import { MARGINAL_ROWS, type MarginalReport } from "./marginal";

const pct = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const val = (c: SegColumn, r: SegRow) => (c as unknown as Record<string, number>)[r];

export function printSegments(company: string, from: string, to: string, rep: SegReport): DocBlock[] {
  const cols = [...rep.columns, rep.total];
  const bold = new Set<SegRow>(["gross", "direct", "operating", "net"]);
  const rows: string[][] = SEG_ROWS.map((r) => [bold.has(r) ? SEG_ROW_LABEL[r].toUpperCase() : SEG_ROW_LABEL[r], ...cols.map((c) => {
    const v = r === "allocated" && c.id === "total" ? 0 : val(c, r);
    return v ? sum(v) : "—";
  })]);
  rows.push(["Валовая маржа", ...cols.map((c) => pct(c.grossPct))]);
  rows.push(["Рентабельность после распределения", ...cols.map((c) => pct(c.operatingPct))]);
  rows.push(["Доля в выручке", ...cols.map((c) => pct(c.share))]);
  const w = Math.max(1.4, Math.min(2.4, 16 / cols.length));
  return [
    { t: "title", text: "УПРАВЛЕНЧЕСКИЙ ОТЧЁТ О ПРИБЫЛЯХ И УБЫТКАХ ПО СЕГМЕНТАМ" },
    { t: "subtitle", text: `${company} · с ${dateShort(from)} по ${dateShort(to)}` },
    { t: "fields", items: [["Аналитика", DIM_LABEL[rep.kind]], ["Общие затраты", rep.base === "none" ? "не распределяются" : `${sum(rep.pool)} сом распределены ${ALLOC_LABEL[rep.base]}`], ["Единица", "сом; доходы — плюс, расходы — минус"]] },
    { t: "table", small: true, head: ["Показатель", ...cols.map((c) => c.name)], widths: [4.2, ...cols.map(() => w)], align: ["l", ...cols.map(() => "r" as const)], rows },
    ...(rep.warnings.length ? [{ t: "h", text: "На что обратить внимание", level: 2 } as DocBlock, { t: "list", items: rep.warnings } as DocBlock] : []),
    { t: "note", text: "Вклад сегмента — выручка минус затраты, прямо отнесённые к сегменту. Общие операционные затраты распределены по выбранной базе; неоперационные статьи и налог остаются на уровне компании." },
    { t: "sign", items: [{ role: "Руководитель", name: "" }, { role: "Главный бухгалтер", name: "" }] },
  ];
}

export function printMarginal(company: string, from: string, to: string, rep: MarginalReport): DocBlock[] {
  const cols = [...rep.columns, rep.total];
  const f = (v: number | null, t: "money" | "pct" | "x") => (v == null ? "—" : t === "money" ? (v ? sum(v) : "—") : t === "pct" ? pct(v) : String(v).replace(".", ","));
  const w = Math.max(1.4, Math.min(2.4, 16 / cols.length));
  return [
    { t: "title", text: "МАРЖИНАЛЬНЫЙ АНАЛИЗ" },
    { t: "subtitle", text: `${company} · с ${dateShort(from)} по ${dateShort(to)} · ${DIM_LABEL[rep.kind].toLowerCase()}` },
    { t: "table", small: true, head: ["Показатель", ...cols.map((c) => c.name)], widths: [4.4, ...cols.map(() => w)], align: ["l", ...cols.map(() => "r" as const)], rows: MARGINAL_ROWS.map(([k, label, t]) => [label, ...cols.map((c) => f(c[k] as number | null, t))]) },
    { t: "h", text: "Деление затрат на переменные и постоянные", level: 2 },
    { t: "table", small: true, head: ["Счёт", "Наименование", "Сумма, сом", "Переменные, %"], widths: [1, 7, 2, 1.6], align: ["c", "l", "r", "r"], rows: rep.accounts.map((a) => [a.code, a.name, sum(a.amount), `${a.variablePct} %${a.isDefault ? "" : " *"}`]) },
    { t: "note", text: "* доля задана бухгалтером; без звёздочки — по умолчанию. Точка безубыточности — выручка, при которой маржинальный доход покрывает постоянные затраты; запас прочности — на сколько может упасть выручка до убытка; операционный рычаг — во сколько раз быстрее выручки меняется прибыль." },
    ...(rep.warnings.length ? [{ t: "list", items: rep.warnings } as DocBlock] : []),
  ];
}
