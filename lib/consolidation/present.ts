// Сводные таблицы для страницы и выгрузки: статьи МСФО, по столбцу на каждого участника,
// столбец исключений и итог по группе; неконтролирующая доля — отдельными строками.
import { buildIfrs, SFP_LABEL, SFP_SECTIONS, type IfrsRow } from "@/lib/ledger/ifrs";
import { round2 } from "@/lib/ledger/types";
import type { ConsolidationResult, Elimination, NciInfo } from "./consolidate";
import type { Block, ReportDoc, Section } from "@/lib/reports/model";

export interface GroupRow {
  key: string;
  label: string;
  kind: IfrsRow["kind"] | "nci";
  members: number[];
  elim: number;
  group: number;
  previous: number;
}

export interface GroupTables {
  columns: Array<{ companyId: string; name: string }>;
  sfp: GroupRow[];
  pl: GroupRow[];
  cf: IfrsRow[];
  nci: { open: number; close: number; profit: number; items: NciInfo[] };
  eliminations: Elimination[];
  warnings: string[];
  checks: Array<{ title: string; ok: boolean; detail: string }>;
  totals: { assets: number; equity: number; netProfit: number; revenue: number };
}

const SFP_ORDER: string[] = (() => {
  const o: string[] = [];
  for (const s of SFP_SECTIONS) {
    if (s.key === "nca") o.push("h-assets");
    if (s.side === "equity") o.push("h-eqliab");
    o.push(...s.lines, `t-${s.key}`);
    if (s.key === "ca") o.push("t-assets");
  }
  o.push("t-liab", "t-eqliab");
  return o;
})();
const PL_ORDER = ["pl-revenue", "pl-cogs", "gross", "pl-otherIncome", "pl-selling", "pl-admin", "pl-otherExpense", "operating", "pl-financeIncome", "pl-financeCosts", "pl-shareOfAssoc", "ebt", "pl-incomeTax", "net", "oci", "tci"];

function merge(order: string[], group: IfrsRow[], members: IfrsRow[][]): GroupRow[] {
  const byKey = (rows: IfrsRow[]) => new Map(rows.map((r) => [r.key, r]));
  const g = byKey(group), ms = members.map(byKey);
  const keys = order.filter((k) => g.has(k) || ms.some((m) => m.has(k)));
  return keys.map((k) => {
    const any = g.get(k) ?? ms.map((m) => m.get(k)).find(Boolean)!;
    const mv = ms.map((m) => round2(m.get(k)?.current ?? 0));
    const gv = round2(g.get(k)?.current ?? 0);
    return {
      key: k, label: any.label ?? SFP_LABEL[k as keyof typeof SFP_LABEL] ?? k, kind: any.kind,
      members: mv, elim: round2(gv - mv.reduce((s, v) => s + v, 0)), group: gv, previous: round2(g.get(k)?.previous ?? 0),
    };
  });
}

export function groupTables(r: ConsolidationResult): GroupTables {
  const cur = r.current, prev = r.previous;
  const gIfrs = buildIfrs(cur.statements, prev.statements, cur.entries);
  const mIfrs = cur.members.map((m) => buildIfrs(m.statements, null));
  const sfp = merge(SFP_ORDER, gIfrs.sfp, mIfrs.map((x) => x.sfp));
  const pl = merge(PL_ORDER, gIfrs.pl, mIfrs.map((x) => x.pl));

  const nciClose = round2(cur.nci.reduce((s, x) => s + x.nciClose, 0));
  const nciOpen = round2(cur.nci.reduce((s, x) => s + x.nciOpen, 0));
  const nciProfit = round2(cur.nci.reduce((s, x) => s + x.nciProfit, 0));
  const blank = cur.members.map(() => 0);
  if (cur.nci.length) {
    const eqIdx = sfp.findIndex((x) => x.key === "t-eq");
    const eq = sfp[eqIdx];
    if (eq) {
      sfp.splice(eqIdx + 1, 0,
        { key: "eq-owners", label: "в том числе: собственникам материнской компании", kind: "nci", members: blank, elim: 0, group: round2(eq.group - nciClose), previous: round2(eq.previous - nciOpen) },
        { key: "eq-nci", label: "неконтролирующая доля", kind: "nci", members: blank, elim: 0, group: nciClose, previous: nciOpen });
    }
    const netIdx = pl.findIndex((x) => x.key === "net");
    const net = pl[netIdx];
    if (net) {
      const prevNci = round2(prev.nci.reduce((s, x) => s + x.nciProfit, 0));
      pl.splice(netIdx + 1, 0,
        { key: "net-owners", label: "приходящаяся на собственников материнской компании", kind: "nci", members: blank, elim: 0, group: round2(net.group - nciProfit), previous: round2(net.previous - prevNci) },
        { key: "net-nci", label: "приходящаяся на неконтролирующую долю", kind: "nci", members: blank, elim: 0, group: nciProfit, previous: prevNci });
    }
  }

  const engineChecks = cur.statements.checks.filter((c) => c.status !== "warn" || /баланс|сходит|ОДДС|капитал/i.test(c.title))
    .map((c) => ({ title: c.title, ok: c.status === "ok", detail: c.detail }));
  const val = (rows: GroupRow[], k: string) => rows.find((x) => x.key === k)?.group ?? 0;
  return {
    columns: cur.members.map((m) => ({ companyId: m.companyId, name: m.name })),
    sfp, pl, cf: gIfrs.cf,
    nci: { open: nciOpen, close: nciClose, profit: nciProfit, items: cur.nci },
    eliminations: cur.eliminations,
    warnings: r.warnings,
    checks: [...gIfrs.checks, ...engineChecks],
    totals: { assets: val(sfp, "t-assets"), equity: val(sfp, "t-eq"), netProfit: val(pl, "net"), revenue: val(pl, "pl-revenue") },
  };
}

const ru = (iso: string) => iso.split("-").reverse().join(".");

/** The same tables as a report document — PDF, Word and Excel through lib/reports renderers. */
export function groupReport(t: GroupTables, groupName: string, period: { from: string; to: string }): ReportDoc {
  const cols = (first: string) => [
    { label: first, kind: "text" as const, width: 3 },
    ...t.columns.map((c) => ({ label: c.name, kind: "money" as const, width: 1.3 })),
    { label: "Исключения", kind: "money" as const, width: 1.3 },
    { label: "Группа", kind: "money" as const, width: 1.4 },
    { label: "Группа, начало / пред. период", kind: "money" as const, width: 1.4 },
  ];
  const style = (k: GroupRow["kind"]) => (k === "total" ? "total" : k === "subtotal" ? "subtotal" : k === "heading" ? "section" : k === "nci" ? "sub" : "normal") as "total" | "subtotal" | "section" | "sub" | "normal";
  const rows = (rs: GroupRow[]) => rs.map((x) => ({
    style: style(x.kind),
    cells: x.kind === "heading" ? [x.label, ...t.columns.map(() => null), null, null, null] : [x.label, ...x.members.map((v) => (x.kind === "nci" ? null : v)), x.kind === "nci" ? null : x.elim, x.group, x.previous],
  }));
  const sections: Section[] = [
    { title: "Консолидированный отчёт о финансовом положении", sheet: "Баланс", blocks: [{ type: "table", columns: cols("Статья"), rows: rows(t.sfp), note: `На ${ru(period.to)}; последний столбец — на начало периода.` }] },
    { title: "Консолидированный отчёт о прибыли или убытке", sheet: "Прибыль", blocks: [{ type: "table", columns: cols("Статья"), rows: rows(t.pl), note: "Последний столбец — предыдущий период такой же длины." }] },
    { title: "Консолидированный отчёт о движении денежных средств", sheet: "ОДДС", blocks: [{ type: "table", columns: [{ label: "Статья", kind: "text", width: 3 }, { label: "Период", kind: "money" }, { label: "Пред. период", kind: "money" }], rows: t.cf.map((x) => ({ style: style(x.kind), cells: x.kind === "heading" ? [x.label, null, null] : [x.label, x.current, x.previous] })) }] },
    {
      title: "Исключения и корректировки", sheet: "Исключения",
      blocks: [
        ...(t.eliminations.length
          ? t.eliminations.map((e): Block => ({ type: "callout", title: e.title, text: e.detail, tone: "info" }))
          : [{ type: "p", text: "Операций между участниками группы за период не найдено." } as Block]),
        ...(t.nci.items.length ? [{
          type: "table", title: "Неконтролирующая доля", columns: [{ label: "Компания", kind: "text", width: 3 }, { label: "Доля группы", kind: "pct" }, { label: "Капитал на конец", kind: "money" }, { label: "Неконтр. доля", kind: "money" }, { label: "Прибыль за период", kind: "money" }, { label: "Доля в прибыли", kind: "money" }],
          rows: t.nci.items.map((n) => ({ cells: [n.name, n.share * 100, n.equityClose, n.nciClose, n.profit, n.nciProfit] })),
        } as Block] : []),
        ...(t.warnings.length ? [{ type: "list", items: t.warnings } as Block] : []),
        { type: "checks", items: t.checks.map((c) => ({ title: c.title, status: c.ok ? "ok" : "error", detail: c.detail })) },
      ],
    },
  ];
  return {
    package: "consolidation", title: "Консолидированная финансовая отчётность", subtitle: groupName,
    company: groupName, regime: "МСФО (IFRS) 10 — упрощённая консолидация", period: `${ru(period.from)} — ${ru(period.to)}`,
    generatedAt: new Date().toLocaleDateString("ru-RU"),
    disclaimer: "Отчётность сформирована FinLite KG по журналам участников с автоматическими исключениями внутригрупповых операций. Нереализованная прибыль в остатках, переоценка до справедливой стоимости при приобретении и сделки с ассоциированными компаниями учитываются корректировками вручную.",
    sections,
  };
}
