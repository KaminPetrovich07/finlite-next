// Расчёт для заполнения налогового отчёта в Кабинете налогоплательщика.
import { dateShort, sum, type DocBlock, type OfficialDoc } from "@/lib/docs/model";
import type { People } from "@/lib/primary/build";
import type { BudgetRow, RLine, TaxReport } from "./build";

const pct = (r: number | null | undefined) => (r === null || r === undefined ? "" : `${String(Math.round(r * 10000) / 100).replace(".", ",")}%`);
const table = (lines: RLine[]): DocBlock => ({
  t: "table", head: ["Код", "Показатель", "База, сом", "Ставка", "Сумма, сом"], widths: [1, 7, 2.2, 1.2, 2.2], align: ["c", "l", "r", "c", "r"],
  rows: lines.map((l) => (l.sub ? ["", l.label, "", "", ""] : [l.code ?? "", l.label, l.base === undefined ? "" : sum(l.base), pct(l.rate), l.amount === undefined ? "" : sum(l.amount)])),
});

export function buildTaxReportDoc(org: { name: string; inn: string; people: People }, reports: TaxReport[], budget: BudgetRow[], regimeName: string): OfficialDoc {
  const b: DocBlock[] = [];
  reports.forEach((r, i) => {
    if (i) b.push({ t: "pagebreak" });
    b.push(
      { t: "right", lines: [`FORM ${r.form}`, "Расчёт для заполнения в Кабинете налогоплательщика"], small: true },
      { t: "p", text: `${org.name}${org.inn ? `, ИНН ${org.inn}` : ""}`, bold: true },
      { t: "title", text: r.title },
      { t: "p", text: `за ${r.periodLabel} (${dateShort(r.period.from)} – ${dateShort(r.period.to)}) · срок представления — до ${dateShort(r.deadline)}`, align: "c" },
      { t: "p", text: `Налоговый режим: ${regimeName}. Основание: ${r.source}.`, small: true },
      table(r.lines),
    );
    for (const m of r.months ?? []) b.push({ t: "h", text: `Приложение STI-091-001 — ${m.label}`, level: 2 }, table(m.lines));
    if (r.posted !== null) b.push({ t: "p", small: true, text: `Начислено в журнале за период: ${sum(r.posted)} сом${Math.abs(r.posted - r.computed) > 0.5 ? ` — расхождение с расчётом ${sum(r.computed - r.posted)} сом, пересчитайте начисление` : " — совпадает с расчётом"}.` });
    for (const n of r.notes) b.push({ t: "note", text: n });
  });
  if (budget.length) {
    b.push({ t: "pagebreak" }, { t: "title", text: "Расчёты с бюджетом" }, {
      t: "table", head: ["Счёт", "Налог", "На начало", "Начислено", "Уплачено", "На конец"], widths: [1, 5, 2, 2, 2, 2], align: ["c", "l", "r", "r", "r", "r"], total: true,
      rows: [...budget.map((x) => [x.account, x.name, sum(x.opening), sum(x.accrued), sum(x.paid), sum(x.closing)]), ["", "Итого", "", "", "", sum(budget.reduce((a, x) => a + x.closing, 0))]],
    }, { t: "note", text: "Положительный остаток — задолженность перед бюджетом, отрицательный — переплата или аванс." });
  }
  b.push({ t: "sign", items: [{ role: org.people.directorTitle || "Руководитель", name: org.people.director }, { role: "Главный бухгалтер", name: org.people.chief }] });
  const one = reports.length === 1 ? reports[0] : null;
  const title = one ? `${one.form} ${one.periodLabel}` : "Налоговые отчёты";
  return { title: `${title} — ${org.name}`, fileName: `${title} — ${org.name}`, org: org.name, blocks: b };
}
