// ════════════════════════════════════════════════════════════════════════
// lib/esg/input.ts — нефинансовые данные, которые вводит компания.
// Денежные показатели (энергозатраты, ФОТ, налоги, штрафы…) сюда не
// входят: они берутся из журнала проводок.
// ════════════════════════════════════════════════════════════════════════

import { DEFAULT_FACTORS, type CoalType } from "./factors";

export type Industry = "trade" | "production" | "services" | "agriculture" | "catering" | "construction" | "it" | "transport";

export const INDUSTRY_LABEL: Record<Industry, string> = {
  trade: "Торговля",
  production: "Производство",
  services: "Услуги",
  agriculture: "Сельское хозяйство и переработка",
  catering: "Общественное питание и гостиницы",
  construction: "Строительство",
  it: "IT и цифровые услуги",
  transport: "Транспорт и логистика",
};

export interface EsgInput {
  // ── профиль и тексты ──
  industry: Industry;
  region: string;
  companyDescription: string;
  ceoMessage: string;
  // ── энергия ──
  electricityKwh: number;
  renewableKwh: number;         // документально подтверждённая ВИЭ (своя СЭС и т.п.)
  heatGcal: number;
  vehiclePetrolL: number;       // автопарк
  vehicleDieselL: number;
  generatorDieselL: number;     // стационарное: генераторы, котлы
  gasM3: number;
  coalT: number;
  coalType: CoalType;
  // ── вода и отходы ──
  waterM3: number;
  wasteT: number;
  wasteRecycledT: number;
  hazardousWasteT: number;
  // ── персонал ──
  employees: number;            // на конец периода
  employeesStart: number;       // на начало периода (для среднесписочной)
  women: number;
  managers: number;
  womenManagers: number;
  under30: number;
  age30to50: number;
  over50: number;
  contractors: number;          // по договорам ГПХ
  hires: number;
  leavers: number;
  trainingHours: number;
  employeesTrained: number;
  hoursWorked: number;          // отработанные человеко-часы (для коэффициента травматизма)
  injuries: number;
  lostDays: number;
  nationalAvgWage: number;      // для сравнения, сом/мес — по данным Нацстаткома
  // ── Охват 3 ──
  commuteKmOneWay: number;      // средняя дорога до работы в одну сторону, км
  commuteShareCar: number;      // %
  commuteSharePublic: number;   // %
  workDays: number;             // рабочих дней в периоде (0 — оценить)
  businessAirKm: number;        // пассажиро-км
  businessRailKm: number;
  businessCarKm: number;
  // ── управление ──
  boardMembers: number;
  independentBoard: number;
  womenBoard: number;
  antiCorruptionPolicy: boolean;
  codeOfConduct: boolean;
  dataProtectionPolicy: boolean;
  environmentalPolicy: boolean;
  hrPolicy: boolean;
  corruptionCases: number;
  discriminationCases: number;
  dataBreaches: number;
  customerComplaints: number;
  localSuppliersPct: number;    // доля закупок у поставщиков КР, %
  donations: number;            // благотворительность и социальные проекты, сом
  esgOwner: string;
  // ── цели ──
  emissionTargetPct: number;    // цель сокращения выбросов Охвата 1+2, %
  emissionTargetYear: number;
  // ── существенность: оценки 1–5, пусто = по отрасли ──
  materiality: Record<string, { impact: number; financial: number }>;
  // ── коэффициенты (кг CO₂ на единицу) ──
  gridFactor: number;
  heatFactor: number;
  dieselFactor: number;
  petrolFactor: number;
  gasFactor: number;
  coalFactor: number;           // 0 = по типу угля
  carFactor: number;
  busFactor: number;
  airFactor: number;
  railFactor: number;
}

export const EMPTY_ESG: EsgInput = {
  industry: "services", region: "", companyDescription: "", ceoMessage: "",
  electricityKwh: 0, renewableKwh: 0, heatGcal: 0, vehiclePetrolL: 0, vehicleDieselL: 0, generatorDieselL: 0,
  gasM3: 0, coalT: 0, coalType: "coalBituminous",
  waterM3: 0, wasteT: 0, wasteRecycledT: 0, hazardousWasteT: 0,
  employees: 0, employeesStart: 0, women: 0, managers: 0, womenManagers: 0, under30: 0, age30to50: 0, over50: 0,
  contractors: 0, hires: 0, leavers: 0, trainingHours: 0, employeesTrained: 0, hoursWorked: 0, injuries: 0, lostDays: 0,
  nationalAvgWage: 0,
  commuteKmOneWay: 0, commuteShareCar: 0, commuteSharePublic: 0, workDays: 0, businessAirKm: 0, businessRailKm: 0, businessCarKm: 0,
  boardMembers: 0, independentBoard: 0, womenBoard: 0,
  antiCorruptionPolicy: false, codeOfConduct: false, dataProtectionPolicy: false, environmentalPolicy: false, hrPolicy: false,
  corruptionCases: 0, discriminationCases: 0, dataBreaches: 0, customerComplaints: 0, localSuppliersPct: 0, donations: 0, esgOwner: "",
  emissionTargetPct: 0, emissionTargetYear: 0,
  materiality: {},
  ...DEFAULT_FACTORS,
  coalFactor: 0,
};

/** Old saved inputs (first ESG version) used petrolL / dieselL for all fuel. */
export function normalizeEsgInput(raw: unknown): EsgInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out: EsgInput = { ...EMPTY_ESG, ...(r as Partial<EsgInput>) };
  if (typeof r.petrolL === "number" && !r.vehiclePetrolL) out.vehiclePetrolL = r.petrolL;
  if (typeof r.dieselL === "number" && !r.vehicleDieselL) out.vehicleDieselL = r.dieselL;
  if (!out.materiality || typeof out.materiality !== "object") out.materiality = {};
  for (const k of Object.keys(DEFAULT_FACTORS) as Array<keyof typeof DEFAULT_FACTORS>) {
    if (k === "coalFactor") continue;
    if (!(Number(out[k]) > 0)) out[k] = DEFAULT_FACTORS[k];
  }
  return out;
}

export type NumericEsgKey = { [K in keyof EsgInput]-?: EsgInput[K] extends number ? K : never }[keyof EsgInput];
export type BooleanEsgKey = { [K in keyof EsgInput]-?: EsgInput[K] extends boolean ? K : never }[keyof EsgInput];
export type TextEsgKey = "region" | "companyDescription" | "ceoMessage" | "esgOwner";
