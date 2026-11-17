// ════════════════════════════════════════════════════════════════════════
// lib/reported/demo.ts — пример отчётности четырёх вымышленных
// госпредприятий (демо) за 6 кварталов: заполненный шаблон, чтобы показать
// загрузку отчётности в портфель. Названия, ИНН и цифры вымышлены.
// Одно предприятие сдаёт в тыс. сом — чтобы был виден пересчёт единиц.
// Итоги внутри каждого периода сходятся.
// ════════════════════════════════════════════════════════════════════════

import type { ReportedCompany, ReportedPeriod, Values } from "./reported";

export const DEMO_DATES = ["2025-06-30", "2025-09-30", "2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"];
export const DEMO_SEGMENT = "Подведомственные предприятия (демо)";

type Six = [number, number, number, number, number, number];
interface Spec {
  name: string; inn: string; unit: "сом" | "тыс. сом"; mode: "за квартал" | "нарастающим итогом с начала года";
  revenue: Six; cogs: number; opex: number; otherNet: Six;
  cash: Six; receivables: Six; inventory: Six; otherCurrent: Six; nonCurrent: Six;
  payStaff: Six; payBudget: Six; paySuppliers: Six; loansShort: Six; otherCL: Six; longLiabilities: Six;
  odStaff?: Six; odBudget?: Six; odSuppliers?: Six; odSuppliers90?: Six; odLenders?: Six;
  headcount: number; charter: number;
}

const M = 1_000_000;
const six = (...a: number[]) => a.map((x) => x * M) as Six;
const flat = (x: number) => six(x, x, x, x, x, x);
const zero = flat(0);

const SPECS: Spec[] = [
  {
    name: "ГП «Жер Карта» (демо)", inn: "00000000000101", unit: "сом", mode: "за квартал",
    revenue: six(6.1, 6.8, 7.4, 5.9, 7.2, 7.9), cogs: 0.55, opex: 0.25, otherNet: flat(-0.04),
    cash: six(1.8, 2.1, 2.6, 2.2, 2.7, 3.1), receivables: six(2.0, 2.2, 2.4, 2.1, 2.3, 2.5), inventory: six(0.6, 0.6, 0.7, 0.6, 0.7, 0.7), otherCurrent: flat(0.3),
    nonCurrent: six(9.5, 9.4, 9.3, 9.2, 9.1, 9.0),
    payStaff: flat(0.9), payBudget: six(0.6, 0.65, 0.7, 0.55, 0.65, 0.7), paySuppliers: six(1.2, 1.3, 1.4, 1.1, 1.3, 1.4), loansShort: zero, otherCL: flat(0.2), longLiabilities: flat(1.5),
    headcount: 85, charter: 8 * M,
  },
  {
    name: "ГП «Ысык-Көл Суу Курулуш» (демо)", inn: "00000000000102", unit: "сом", mode: "за квартал",
    revenue: six(12.5, 13.1, 11.8, 10.2, 11.0, 10.4), cogs: 0.68, opex: 0.24, otherNet: six(-0.2, -0.2, -0.25, -0.25, -0.3, -0.3),
    cash: six(2.5, 2.0, 1.8, 1.2, 0.9, 0.7), receivables: six(5.0, 5.6, 6.2, 6.8, 7.1, 7.4), inventory: six(3.0, 3.2, 3.4, 3.6, 3.7, 3.9), otherCurrent: flat(0.8),
    nonCurrent: six(22.4, 22.2, 22.0, 21.8, 21.6, 21.4),
    payStaff: flat(1.6), payBudget: six(1.1, 1.2, 1.2, 1.3, 1.3, 1.4), paySuppliers: six(5.0, 5.8, 6.6, 7.8, 8.9, 9.8), loansShort: six(3, 3, 4, 4, 5, 5), otherCL: flat(0.6), longLiabilities: flat(8),
    odSuppliers: six(0, 0, 0.3, 0.9, 1.4, 2.1), odSuppliers90: six(0, 0, 0, 0, 0.2, 0.6),
    headcount: 210, charter: 15 * M,
  },
  {
    name: "ГП «Нарын Агро Сервис» (демо)", inn: "00000000000103", unit: "сом", mode: "за квартал",
    revenue: six(3.4, 3.1, 2.7, 2.2, 2.4, 2.0), cogs: 0.78, opex: 0.35, otherNet: six(-0.08, -0.09, -0.1, -0.11, -0.12, -0.13),
    cash: six(0.4, 0.3, 0.2, 0.1, 0.08, 0.05), receivables: six(1.1, 1.2, 1.25, 1.3, 1.35, 1.4), inventory: six(0.9, 0.9, 0.85, 0.85, 0.8, 0.8), otherCurrent: flat(0.2),
    nonCurrent: six(6.0, 5.9, 5.8, 5.7, 5.6, 5.5),
    payStaff: six(0.5, 0.8, 1.2, 1.6, 2.0, 2.5), payBudget: six(0.4, 0.6, 0.9, 1.3, 1.6, 2.0), paySuppliers: six(1.5, 1.8, 2.1, 2.5, 2.8, 3.2), loansShort: six(1.0, 1.2, 1.5, 1.8, 2.0, 2.3), otherCL: flat(0.3), longLiabilities: flat(3),
    odStaff: six(0, 0.2, 0.5, 0.9, 1.3, 1.7), odBudget: six(0, 0.1, 0.4, 0.7, 1.0, 1.4), odSuppliers: six(0.2, 0.5, 0.8, 1.2, 1.5, 1.9), odSuppliers90: six(0, 0, 0.2, 0.5, 0.8, 1.1), odLenders: six(0, 0, 0, 0.1, 0.2, 0.3),
    headcount: 64, charter: 5 * M,
  },
  {
    name: "ГП «Ош Басмакана» (демо)", inn: "00000000000104", unit: "тыс. сом", mode: "за квартал",
    revenue: six(4.2, 4.5, 5.1, 3.8, 4.4, 4.9), cogs: 0.6, opex: 0.28, otherNet: zero,
    cash: six(1.6, 1.7, 1.9, 1.5, 1.7, 1.8), receivables: flat(1.3), inventory: flat(0.7), otherCurrent: flat(0.15),
    nonCurrent: six(4.5, 4.45, 4.4, 4.35, 4.3, 4.25),
    payStaff: flat(0.45), payBudget: flat(0.3), paySuppliers: six(0.9, 0.95, 1.0, 0.85, 0.9, 0.95), loansShort: flat(0.5), otherCL: flat(0.1), longLiabilities: zero,
    headcount: 47, charter: 4 * M,
  },
];

/**
 * Квартальные значения в сомах. Входные величины округляются до точности единицы
 * отчёта (сом или 0,1 тыс. сом), итоги считаются из округлённых — как в настоящем отчёте.
 */
function build(s: Spec): ReportedPeriod[] {
  const step = s.unit === "тыс. сом" ? 100 : 1;
  const rd = (n: number) => Math.round(n / step) * step;
  return DEMO_DATES.map((date, i) => {
    const at = (a: Six | undefined) => rd(a?.[i] ?? 0);
    const revenue = at(s.revenue), cogs = rd(revenue * s.cogs), opex = rd(revenue * s.opex), otherNet = at(s.otherNet);
    const operatingProfit = revenue - cogs - opex;
    const incomeTax = rd(Math.max(0, (operatingProfit + otherNet) * 0.1));
    const v: Values = {
      cash: at(s.cash), investments: 0, receivables: at(s.receivables), inventory: at(s.inventory), otherCurrent: at(s.otherCurrent), nonCurrent: at(s.nonCurrent),
      payStaff: at(s.payStaff), payBudget: at(s.payBudget), paySuppliers: at(s.paySuppliers), loansShort: at(s.loansShort), longLiabilities: at(s.longLiabilities),
      revenue, cogs, opex, operatingProfit, otherNet, incomeTax, netProfit: operatingProfit + otherNet - incomeTax,
      odStaff: at(s.odStaff), odBudget: at(s.odBudget), odSuppliers: at(s.odSuppliers), odSuppliers90: at(s.odSuppliers90), odLenders: at(s.odLenders), odOther: 0,
      headcount: s.headcount,
    };
    v.currentLiabilities = (v.payStaff ?? 0) + (v.payBudget ?? 0) + (v.paySuppliers ?? 0) + (v.loansShort ?? 0) + at(s.otherCL);
    v.currentTotal = (v.cash ?? 0) + (v.receivables ?? 0) + (v.inventory ?? 0) + (v.otherCurrent ?? 0);
    v.assetsTotal = v.currentTotal + (v.nonCurrent ?? 0);
    v.equity = v.assetsTotal - v.currentLiabilities - (v.longLiabilities ?? 0);
    v.retained = v.equity - s.charter;
    return { date, values: v };
  });
}

export function demoCompanies(): ReportedCompany[] {
  return SPECS.map((s) => ({ name: s.name, inn: s.inn, segment: DEMO_SEGMENT, unit: s.unit, mode: s.mode, periods: build(s), warnings: [], errors: [] }));
}
