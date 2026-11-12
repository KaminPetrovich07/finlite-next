// ════════════════════════════════════════════════════════════════════════
// lib/industry/public.ts — госсектор: исполнение бюджета (сопоставление
// бюджетных и фактических сумм, МСФОГС (IPSAS) 24) и показатели учреждения.
// Строки — коды экономической классификации, план (утверждённый и
// уточнённый) и факт. Загружаются из Excel/CSV или вводятся вручную.
// ════════════════════════════════════════════════════════════════════════
import { pct, type Metric } from "./common";

export interface BudgetLine { code: string; name: string; kind: "revenue" | "expense"; original: number; final: number; actual: number; own?: boolean }

export function execution(lines: BudgetLine[]) {
  const sum = (k: BudgetLine["kind"], f: "original" | "final" | "actual") => lines.filter((l) => l.kind === k).reduce((s, l) => s + (l[f] || 0), 0);
  const rows = lines.map((l) => ({ ...l, diff: l.actual - l.final, pct: pct(l.actual, l.final), change: l.final - l.original }));
  const rev = { original: sum("revenue", "original"), final: sum("revenue", "final"), actual: sum("revenue", "actual") };
  const exp = { original: sum("expense", "original"), final: sum("expense", "final"), actual: sum("expense", "actual") };
  return { rows, rev, exp, balance: { final: rev.final - exp.final, actual: rev.actual - exp.actual } };
}

export interface PublicExtra { payables: number; overduePayables: number; receivables: number; staffCost: number }

export function publicMetrics(lines: BudgetLine[], x: PublicExtra): Metric[] {
  const e = execution(lines);
  const own = lines.filter((l) => l.kind === "revenue" && l.own).reduce((s, l) => s + l.actual, 0);
  return [
    { key: "rev", title: "Исполнение доходов к уточнённому плану", value: pct(e.rev.actual, e.rev.final), unit: "%", rule: { op: ">=", min: 95 }, source: "ориентир: ниже 95 % — недобор доходов" },
    { key: "exp", title: "Исполнение расходов к уточнённому плану", value: pct(e.exp.actual, e.exp.final), unit: "%", rule: { op: "between", min: 90, max: 100 }, source: "ориентир: ниже 90 % — неосвоение, выше 100 % — перерасход" },
    { key: "change", title: "Изменение плана расходов за год", value: pct(e.exp.final - e.exp.original, e.exp.original), unit: "%" },
    { key: "own", title: "Доля собственных (специальных) доходов", value: pct(own, e.rev.actual), unit: "%" },
    { key: "staff", title: "Расходы на оплату труда в расходах", value: pct(x.staffCost, e.exp.actual), unit: "%" },
    { key: "pay", title: "Кредиторская задолженность к расходам", value: pct(x.payables, e.exp.actual), unit: "%" },
    { key: "overdue", title: "Просроченная кредиторская задолженность", value: x.overduePayables, unit: "сом", rule: { op: "<=", max: 0 }, source: "просроченной задолженности быть не должно" },
    { key: "rec", title: "Дебиторская задолженность к доходам", value: pct(x.receivables, e.rev.actual), unit: "%" },
  ];
}
