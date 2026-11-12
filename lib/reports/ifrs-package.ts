// Пакет «Отчётность по МСФО»: четыре отчёта без шифров счетов и строк ФОСАМК,
// с расшифровкой строк по статьям — тот же расчёт, что на странице /ifrs.

import type { CompanyPeriodData } from "@/lib/ledger/load";
import { buildIfrs, type IfrsRow } from "@/lib/ledger/ifrs";
import { formatDate, periodLabel } from "@/lib/ledger/period";
import { PACKAGE_INFO, type Block, type ReportDoc, type TableBlock } from "./model";

const style = (k: IfrsRow["kind"]) => (k === "total" ? "total" : k === "subtotal" ? "subtotal" : k === "heading" ? "section" : "normal") as "total" | "subtotal" | "section" | "normal";

function table(title: string, rows: IfrsRow[], cur: string, prev: string): TableBlock {
  return {
    type: "table",
    title,
    columns: [{ label: "Статья", kind: "text", width: 6 }, { label: cur, kind: "money", width: 2 }, { label: prev, kind: "money", width: 2 }],
    rows: rows.map((r) => ({ cells: [r.label, r.kind === "heading" ? null : r.current, r.kind === "heading" ? null : r.previous], style: style(r.kind) })),
  };
}

export function buildIfrsPackage(d: CompanyPeriodData): ReportDoc {
  const r = buildIfrs(d.statements, d.previous, d.entries);
  const p = d.period, pp = d.previous.period;
  const atEnd = `на ${formatDate(p.to)}`, atStart = `на ${formatDate(p.from)}`;
  const cur = periodLabel(p.from, p.to), prev = periodLabel(pp.from, pp.to);

  const notes: Block[] = [{ type: "h2", text: "Расшифровка строк по статьям" }];
  for (const row of r.sfp.filter((x) => x.kind === "line")) {
    const parts = r.breakdown[row.key] ?? [];
    if (parts.length < 2) continue;
    notes.push({
      type: "table", title: row.label,
      columns: [{ label: "Статья", kind: "text", width: 6 }, { label: atEnd, kind: "money", width: 2 }, { label: atStart, kind: "money", width: 2 }],
      rows: parts.map((x) => ({ cells: [x.name, x.current, x.previous] })),
    });
  }

  const now = new Date();
  return {
    package: "ifrs",
    title: PACKAGE_INFO.ifrs.title,
    company: d.company.name,
    regime: d.company.regimeName,
    period: cur,
    generatedAt: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    disclaimer: "Отчётность составлена по данным журнала проводок. Суммы в сомах; отрицательные значения — в скобках. Сравнительные данные отчёта о финансовом положении — на начало периода.",
    sections: [
      { title: "Отчёт о финансовом положении", sheet: "Фин. положение", blocks: [table(`Отчёт о финансовом положении ${atEnd}`, r.sfp, atEnd, atStart)] },
      { title: "Отчёт о прибыли или убытке", sheet: "Прибыль и убыток", blocks: [table("Отчёт о прибыли или убытке и прочем совокупном доходе", r.pl, cur, prev)] },
      { title: "Отчёт о движении денежных средств", sheet: "ДДС", blocks: [table("Отчёт о движении денежных средств (прямой метод)", r.cf, cur, prev)] },
      {
        title: "Отчёт об изменениях в капитале", sheet: "Капитал",
        blocks: [{
          type: "table", title: "Отчёт об изменениях в капитале",
          columns: [{ label: "", kind: "text", width: 4 }, ...r.equity.columns.map((c) => ({ label: c, kind: "money" as const, width: 2 })), { label: "Итого", kind: "money", width: 2 }],
          rows: r.equity.rows.map((x) => ({ cells: [x.label, ...x.values, x.total], style: x.kind === "total" ? "total" as const : "normal" as const })),
        }],
      },
      {
        title: "Примечания", sheet: "Примечания",
        blocks: [
          { type: "checks", items: r.checks.map((c) => ({ title: c.title, status: c.ok ? "ok" as const : "warn" as const, detail: c.detail })) },
          { type: "p", text: "Чрезвычайные статьи МСФО не выделяет (IAS 1, п. 87) — они включены в прочие доходы и расходы. Проценты и курсовые разницы вне основной деятельности показаны как финансовые доходы и расходы." },
          ...notes,
        ],
      },
    ],
  };
}
