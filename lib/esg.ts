// ════════════════════════════════════════════════════════════════════════
// lib/esg.ts — ESG-отчёт: то, что считается из журнала, + немного данных,
// которых нет в деньгах (кВт·ч, люди, политики).
//
// Показатели привязаны к стандартам GRI, чтобы отчёт можно было сопоставить
// с отчётами других компаний. Коэффициенты выбросов — редактируемые
// параметры, а не константы: у разных поставщиков энергии и в разных
// методиках они различаются.
//   • электросеть КР: 0,153 кг CO₂/кВт·ч — Ember / Our World in Data, 2025
//     (через Power Atlas, inzonex.co.uk/poweratlas/kyrgyzstan);
//   • топливо: ориентировочные коэффициенты на основе IPCC 2006
//     (дизель 2,68 кг/л, бензин 2,31 кг/л, природный газ 1,9 кг/м³,
//     уголь 2 420 кг/т). Уточняйте по паспорту топлива.
// ════════════════════════════════════════════════════════════════════════

import type { Statements } from "@/lib/ledger/engine";
import { monthsInPeriod } from "@/lib/ledger/taxes";
import { round2 } from "@/lib/ledger/types";

export interface EsgInput {
  // Environment
  electricityKwh: number;
  heatGcal: number;
  dieselL: number;
  petrolL: number;
  gasM3: number;
  coalT: number;
  waterM3: number;
  wasteT: number;
  wasteRecycledT: number;
  // Social
  employees: number;
  women: number;
  managers: number;
  womenManagers: number;
  hires: number;
  leavers: number;
  trainingHours: number;
  injuries: number;
  // Governance
  boardMembers: number;
  independentBoard: number;
  womenBoard: number;
  antiCorruptionPolicy: boolean;
  codeOfConduct: boolean;
  dataProtectionPolicy: boolean;
  esgOwner: string;
  // Factors
  gridFactor?: number;   // kg CO2 / kWh
  dieselFactor?: number; // kg CO2 / l
  petrolFactor?: number; // kg CO2 / l
  gasFactor?: number;    // kg CO2 / m3
  coalFactor?: number;   // kg CO2 / t
}

export const DEFAULT_FACTORS = {
  gridFactor: 0.153,
  dieselFactor: 2.68,
  petrolFactor: 2.31,
  gasFactor: 1.9,
  coalFactor: 2420,
};

export const EMPTY_ESG: EsgInput = {
  electricityKwh: 0, heatGcal: 0, dieselL: 0, petrolL: 0, gasM3: 0, coalT: 0, waterM3: 0, wasteT: 0, wasteRecycledT: 0,
  employees: 0, women: 0, managers: 0, womenManagers: 0, hires: 0, leavers: 0, trainingHours: 0, injuries: 0,
  boardMembers: 0, independentBoard: 0, womenBoard: 0,
  antiCorruptionPolicy: false, codeOfConduct: false, dataProtectionPolicy: false, esgOwner: "",
  ...DEFAULT_FACTORS,
};

export type Pillar = "E" | "S" | "G";

export interface EsgMetric {
  key: string;
  pillar: Pillar;
  label: string;
  value: number | string | null;
  unit: string;
  gri: string;
  /** "ledger" — посчитано из проводок; "input" — введено вручную; "calc" — из того и другого */
  source: "ledger" | "input" | "calc";
  note?: string;
}

export interface EconomicValue {
  generated: number;
  operatingCosts: number;
  employees: number;
  capitalProviders: number;
  government: number;
  community: number;
  retained: number;
}

export interface EsgReport {
  metrics: EsgMetric[];
  economic: EconomicValue;
  emissions: { scope1: number; scope2: number; total: number; intensity: number | null };
  completeness: { filled: number; total: number };
}

const per = (a: number, b: number) => (b > 0 ? a / b : null);
const r = (n: number | null, d = 2) => (n === null ? null : Math.round(n * 10 ** d) / 10 ** d);

export function computeEsg(s: Statements, input: EsgInput): EsgReport {
  const f = { ...DEFAULT_FACTORS, ...Object.fromEntries(Object.entries(input).filter(([k, v]) => k.endsWith("Factor") && typeof v === "number" && v > 0)) };
  const is = s.incomeStatement;
  const n = is.byNature;
  const months = monthsInPeriod(s.period.from, s.period.to);
  const revenueMln = is.revenueTotal / 1e6;

  // ── E ──
  const scope1 = round2((input.dieselL * f.dieselFactor + input.petrolL * f.petrolFactor + input.gasM3 * f.gasFactor + input.coalT * f.coalFactor) / 1000);
  const scope2 = round2((input.electricityKwh * f.gridFactor) / 1000);
  const total = round2(scope1 + scope2);
  const energyGj = input.electricityKwh * 0.0036 + input.heatGcal * 4.1868 + input.dieselL * 0.0358 + input.petrolL * 0.0342 + input.gasM3 * 0.0343 + input.coalT * 25.8;
  const energyCost = n.utilities ?? 0;

  // ── S ──
  const payroll = n.payroll ?? 0;
  const social = n.social ?? 0;
  const training = n.training ?? 0;

  // ── G ──
  const fines = n.fines ?? 0;
  const auditFees = s.trialBalance.rows.find((x) => x.account === "8140")?.turnoverDr ?? 0;
  const cf = s.cashFlow.values;
  const taxesPaid = taxPayments(s);
  const policies = [input.antiCorruptionPolicy, input.codeOfConduct, input.dataProtectionPolicy].filter(Boolean).length;

  const metrics: EsgMetric[] = [
    // Environment
    { key: "energy", pillar: "E", label: "Потребление энергии", value: r(energyGj, 1), unit: "ГДж", gri: "GRI 302-1", source: "input", note: "электроэнергия, тепло и топливо в пересчёте на ГДж" },
    { key: "electricity", pillar: "E", label: "Электроэнергия", value: input.electricityKwh, unit: "кВт·ч", gri: "GRI 302-1", source: "input" },
    { key: "energyCost", pillar: "E", label: "Расходы на энергию и коммунальные услуги", value: round2(energyCost), unit: "сом", gri: "GRI 302-1", source: "ledger", note: "счета 7140, 8220" },
    { key: "energyIntensity", pillar: "E", label: "Энергоёмкость выручки", value: r(per(energyGj, revenueMln)), unit: "ГДж / млн сом", gri: "GRI 302-3", source: "calc" },
    { key: "scope1", pillar: "E", label: "Прямые выбросы (Scope 1)", value: scope1, unit: "т CO₂", gri: "GRI 305-1", source: "calc", note: "сжигание топлива" },
    { key: "scope2", pillar: "E", label: "Косвенные выбросы от электроэнергии (Scope 2)", value: scope2, unit: "т CO₂", gri: "GRI 305-2", source: "calc", note: `коэффициент сети ${f.gridFactor} кг/кВт·ч` },
    { key: "carbonIntensity", pillar: "E", label: "Углеродоёмкость выручки", value: r(per(total, revenueMln), 3), unit: "т CO₂ / млн сом", gri: "GRI 305-4", source: "calc" },
    { key: "water", pillar: "E", label: "Водопотребление", value: input.waterM3, unit: "м³", gri: "GRI 303-5", source: "input" },
    { key: "waste", pillar: "E", label: "Образовано отходов", value: input.wasteT, unit: "т", gri: "GRI 306-3", source: "input" },
    { key: "recycling", pillar: "E", label: "Доля отходов на переработку", value: r(per(input.wasteRecycledT * 100, input.wasteT), 1), unit: "%", gri: "GRI 306-4", source: "calc" },
    // Social
    { key: "employees", pillar: "S", label: "Численность персонала", value: input.employees, unit: "чел.", gri: "GRI 2-7", source: "input" },
    { key: "women", pillar: "S", label: "Доля женщин в персонале", value: r(per(input.women * 100, input.employees), 1), unit: "%", gri: "GRI 405-1", source: "calc" },
    { key: "womenManagers", pillar: "S", label: "Доля женщин среди руководителей", value: r(per(input.womenManagers * 100, input.managers), 1), unit: "%", gri: "GRI 405-1", source: "calc" },
    { key: "payroll", pillar: "S", label: "Фонд оплаты труда", value: round2(payroll), unit: "сом", gri: "GRI 201-1", source: "ledger", note: "счета 7120, 7520, 8010" },
    { key: "avgWage", pillar: "S", label: "Средняя начисленная зарплата в месяц", value: r(per(payroll, input.employees * months), 0), unit: "сом", gri: "GRI 202-1", source: "calc" },
    { key: "social", pillar: "S", label: "Страховые взносы работодателя", value: round2(social), unit: "сом", gri: "GRI 201-3", source: "ledger", note: "счета 7130, 7530, 8020" },
    { key: "turnover", pillar: "S", label: "Текучесть кадров", value: r(per(input.leavers * 100, input.employees), 1), unit: "%", gri: "GRI 401-1", source: "calc" },
    { key: "hires", pillar: "S", label: "Принято сотрудников", value: input.hires, unit: "чел.", gri: "GRI 401-1", source: "input" },
    { key: "trainingHours", pillar: "S", label: "Часы обучения на сотрудника", value: r(per(input.trainingHours, input.employees), 1), unit: "ч", gri: "GRI 404-1", source: "calc" },
    { key: "training", pillar: "S", label: "Расходы на обучение", value: round2(training), unit: "сом", gri: "GRI 404-2", source: "ledger", note: "счёт 8160" },
    { key: "injuries", pillar: "S", label: "Несчастные случаи на производстве", value: input.injuries, unit: "случ.", gri: "GRI 403-9", source: "input" },
    // Governance
    { key: "board", pillar: "G", label: "Состав органа управления", value: input.boardMembers, unit: "чел.", gri: "GRI 2-9", source: "input" },
    { key: "independent", pillar: "G", label: "Доля независимых членов", value: r(per(input.independentBoard * 100, input.boardMembers), 1), unit: "%", gri: "GRI 2-9", source: "calc" },
    { key: "womenBoard", pillar: "G", label: "Доля женщин в органе управления", value: r(per(input.womenBoard * 100, input.boardMembers), 1), unit: "%", gri: "GRI 405-1", source: "calc" },
    { key: "policies", pillar: "G", label: "Утверждённые политики (антикоррупция, этика, данные)", value: `${policies} из 3`, unit: "", gri: "GRI 2-23, 205-2", source: "input" },
    { key: "taxesPaid", pillar: "G", label: "Уплачено налогов и взносов", value: round2(taxesPaid), unit: "сом", gri: "GRI 207-4", source: "ledger", note: "платежи в бюджет и Соцфонд по банку и кассе (счета 3400, 3530)" },
    { key: "taxesAccrued", pillar: "G", label: "Начислено налогов на прибыль / единого налога", value: round2(is.incomeTax), unit: "сом", gri: "GRI 207-4", source: "ledger", note: "счёт 9910" },
    { key: "fines", pillar: "G", label: "Штрафы и пени", value: round2(fines), unit: "сом", gri: "GRI 2-27", source: "ledger", note: "счета 8230, 8240" },
    { key: "audit", pillar: "G", label: "Вознаграждение аудиторам", value: round2(auditFees), unit: "сом", gri: "GRI 2-5", source: "ledger", note: "счёт 8140" },
    { key: "reconciled", pillar: "G", label: "Сверки отчётности пройдены", value: `${s.checks.filter((c) => c.status === "ok").length} из ${s.checks.length}`, unit: "", gri: "—", source: "ledger" },
    { key: "esgOwner", pillar: "G", label: "Ответственный за ESG", value: input.esgOwner || null, unit: "", gri: "GRI 2-13", source: "input" },
  ];

  // GRI 201-1: direct economic value generated and distributed
  const generated = round2(is.revenueTotal + is.byLine.nonOpIncome + Math.max(0, is.extraordinary));
  const employeesVal = round2(payroll + social);
  const capitalProviders = round2((n.interest ?? 0) + (cf[470] ?? 0));
  const government = round2(is.incomeTax + (n.taxes ?? 0) + fines);
  const operatingCosts = round2(
    is.byLine.cogs + is.byLine.selling + is.byLine.admin + is.byLine.otherOpExpense
    - payroll - social - (n.taxes ?? 0) - fines - (n.depreciation ?? 0)
  );
  const community = 0;
  const retained = round2(generated - operatingCosts - employeesVal - capitalProviders - government - community);

  const inputKeys: Array<keyof EsgInput> = ["electricityKwh", "waterM3", "wasteT", "employees", "women", "managers", "trainingHours", "boardMembers", "esgOwner"];
  const filled = inputKeys.filter((k) => { const v = input[k]; return typeof v === "string" ? v.trim() !== "" : Number(v) > 0; }).length;

  return {
    metrics,
    economic: { generated, operatingCosts, employees: employeesVal, capitalProviders, government, community, retained },
    emissions: { scope1, scope2, total, intensity: r(per(total, revenueMln), 3) },
    completeness: { filled, total: inputKeys.length },
  };
}

/** Cash paid to the budget and the Social Fund: outflows against 34xx and 3530. */
function taxPayments(s: Statements): number {
  return Object.entries(s.cashFlow.byAccount)
    .filter(([code]) => code.startsWith("34") || code === "3530")
    .reduce((sum, [, v]) => sum + Math.max(0, -v), 0);
}

export const PILLAR_LABEL: Record<Pillar, string> = {
  E: "Экология",
  S: "Социальная сфера",
  G: "Управление",
};
