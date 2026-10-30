// Карточка-калькуляция фактической себестоимости и производственно-
// калькуляционный отчёт (неунифицированные формы альбома, ПП № 231, п. 17).
import { dateShort, sum, type DocBlock, type OfficialDoc } from "@/lib/docs/model";
import { COSTING_METHOD, OVERHEAD_BASE } from "@/lib/policy/types";
import { OVERHEAD_LABEL, type CostingResult } from "./calc";

export function buildCostingDoc(company: string, from: string, to: string, r: CostingResult, people: { director: string; chief: string }, only?: string): OfficialDoc {
  const b: DocBlock[] = [];
  const period = `с ${dateShort(from)} по ${dateShort(to)}`;
  const list = only ? r.products.filter((p) => p.id === only) : r.products;

  if (!only) {
    b.push(
      { t: "right", lines: ["Неунифицированная форма (ПП № 231, п. 17)"], small: true },
      { t: "p", text: company, bold: true },
      { t: "title", text: "Производственно-калькуляционный отчёт" },
      { t: "p", text: `за период ${period}`, align: "c" },
      { t: "p", text: `Метод калькуляции: ${COSTING_METHOD[r.method]}. Общепроизводственные расходы распределены ${OVERHEAD_BASE[r.base]}.`, small: true },
      { t: "h", text: "Затраты на производство за период (по данным журнала проводок)", level: 2 },
      { t: "table", head: ["Статья затрат", "Счёт", "Сумма, сом"], widths: [5, 2, 2], align: ["l", "c", "r"], total: true, rows: [
        ["Сырьё и материалы", "1620, 17xx, 7110", sum(r.pools.materials)],
        ["Оплата труда производственных рабочих", "7120", sum(r.pools.labor)],
        ["Отчисления в Социальный фонд", "7130", sum(r.pools.social)],
        ...Object.entries(r.pools.overheadBy).map(([k, v]) => [`Общепроизводственные: ${OVERHEAD_LABEL[k] ?? k}`, k === "other" ? "" : k, sum(v)]),
        ["Итого затрат", "", sum(r.pools.materials + r.pools.labor + r.pools.social + r.pools.overhead)],
      ] },
      { t: "h", text: "Распределение затрат по изделиям", level: 2 },
      { t: "table", head: ["Изделие", "Выпуск", "Материалы", "Оплата труда", "Взносы СФ", "ОПР", "Всего", "На единицу"], widths: [4, 1.4, 2, 2, 1.6, 1.8, 2, 1.8], align: ["l", "r", "r", "r", "r", "r", "r", "r"], small: true, total: true,
        rows: [...r.products.map((p) => [p.name, `${p.qty} ${p.unit}`, sum(p.materials), sum(p.labor), sum(p.social), sum(p.overhead), sum(p.total), sum(p.unit_.total)]),
          ["Итого", "", sum(r.totals.materials), sum(r.totals.labor), sum(r.totals.social), sum(r.totals.overhead), sum(r.totals.total), ""]] },
      { t: "sign", items: [{ role: "Главный бухгалтер", name: people.chief }, { role: "Руководитель", name: people.director }] },
    );
  }

  for (const p of list) {
    if (b.length) b.push({ t: "pagebreak" });
    b.push(
      { t: "right", lines: ["Неунифицированная форма (альбом форм, ПП № 231, п. 17)"], small: true },
      { t: "p", text: company, bold: true },
      { t: "title", text: "Карточка-калькуляция фактической себестоимости" },
      { t: "p", text: `${p.name} · выпуск ${p.qty} ${p.unit} · период ${period}`, align: "c" },
      { t: "table", head: ["Статья калькуляции", "Норма на единицу, сом", "Факт на единицу, сом", "Отклонение, сом", "Отклонение, %", "На весь выпуск, сом"], widths: [4, 2, 2, 2, 1.6, 2.2], align: ["l", "r", "r", "r", "r", "r"], total: true,
        rows: [
          ["1. Сырьё и материалы", sum(p.norm.materials), sum(p.unit_.materials), sum(p.variance.materials), p.variance.materialsPct === null ? "" : p.variance.materialsPct.toFixed(1).replace(".", ","), sum(p.materials)],
          ["2. Оплата труда производственных рабочих", sum(p.norm.labor), sum(p.unit_.labor), sum(p.variance.labor), p.variance.laborPct === null ? "" : p.variance.laborPct.toFixed(1).replace(".", ","), sum(p.labor)],
          ["3. Отчисления в Социальный фонд", "", sum(p.unit_.social), "", "", sum(p.social)],
          ["4. Общепроизводственные расходы", "", sum(p.unit_.overhead), "", "", sum(p.overhead)],
          ["Производственная себестоимость", "", sum(p.unit_.total), "", "", sum(p.total)],
        ] },
      { t: "table", head: ["Показатель", "На единицу, сом"], widths: [5, 2], align: ["l", "r"], rows: [
        ["Цена продажи", p.price ? sum(p.price) : "не указана"],
        ["Маржинальный доход (цена − прямые затраты)", p.contribution === null ? "" : sum(p.contribution)],
        ["Прибыль на единицу (цена − себестоимость)", p.price ? sum(p.price - p.unit_.total) : ""],
        ["Рентабельность продаж, %", p.margin === null ? "" : p.margin.toFixed(1).replace(".", ",")],
      ] },
      { t: "note", text: "Административные расходы и расходы на продажу в производственную себестоимость не включаются и признаются расходами периода (учётная политика, раздел о калькуляции)." },
      { t: "sign", items: [{ role: "Составил (бухгалтер)", name: people.chief }, { role: "Утвердил (руководитель)", name: people.director }] },
    );
  }
  const title = only && list[0] ? `Калькуляция — ${list[0].name}` : "Калькуляция себестоимости";
  return { title: `${title} — ${company}`, fileName: `${title} — ${company} — ${from}…${to}`, org: company, blocks: b };
}
