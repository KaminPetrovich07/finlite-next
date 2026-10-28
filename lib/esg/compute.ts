// ════════════════════════════════════════════════════════════════════════
// lib/esg/compute.ts — расчёт всех показателей ESG-отчёта.
//
// Принципы (как в отчётах по GRI и GHG Protocol):
//   • выбросы = данные о деятельности × коэффициент; только CO₂ (CH₄ и N₂O
//     при сжигании топлива дают <1% и не учитываются — это указано в отчёте);
//   • граница — операционный контроль: 100% выбросов объектов компании;
//   • Охват 2 — по географическому методу, включая купленное тепло;
//   • Охват 3 — только категории 6 (командировки) и 7 (дорога на работу);
//   • численность для относительных показателей — среднесписочная
//     ((начало + конец) / 2), если указана численность на начало;
//   • денежные показатели — из ОПиУ по счетам, без проводок закрытия.
// Чистые функции: одинаково работают на сайте и при выгрузке.
// ════════════════════════════════════════════════════════════════════════

import type { Statements } from "@/lib/ledger/engine";
import { equityKey } from "@/lib/equity";
import { monthsInPeriod } from "@/lib/ledger/taxes";
import { DEFAULT_FACTORS, FUELS, GJ_PER_GCAL, gjPerUnit, kgCo2PerUnit } from "./factors";
import type { EsgInput } from "./input";

export type Pillar = "E" | "S" | "G" | "EC";
export const PILLAR_LABEL: Record<Pillar, string> = {
  E: "Экология",
  S: "Социальная сфера",
  G: "Управление",
  EC: "Экономика",
};

export type Source = "ledger" | "input" | "calc";
export type Quality = "primary" | "calculated" | "estimated" | "missing";
export const QUALITY_LABEL: Record<Quality, string> = {
  primary: "первичные данные",
  calculated: "расчёт",
  estimated: "оценка",
  missing: "нет данных",
};

export interface EmissionRow {
  key: string;
  scope: 1 | 2 | 3;
  group: string;
  label: string;
  activity: number;
  unit: string;
  factor: number;       // kg CO2 per unit
  factorCustom: boolean;
  t: number;            // t CO2-e
}

export interface Indicator {
  key: string;
  pillar: Pillar;
  label: string;
  value: number | string | null;
  prev: number | string | null;
  unit: string;
  gri: string;
  source: Source;
  quality: Quality;
  /** как посчитано — печатается сноской / в «Методике» */
  method: string;
  /** чем выше, тем лучше (для подсветки изменения); undefined — нейтрально */
  higherIsBetter?: boolean;
}

export interface EsgResult {
  months: number;
  workDays: number;
  revenueMln: number;
  emissions: {
    rows: EmissionRow[];
    scope1: number; scope2: number; scope3: number;
    scope12: number; total: number;
    stationary: number; mobile: number; electricity: number; heat: number; commute: number; travel: number;
    perMlnRevenue: number | null;
    perEmployee: number | null;
  };
  energy: {
    rows: Array<{ label: string; amount: number; unit: string; mwh: number }>;
    totalMwh: number; fuelMwh: number; gridMwh: number; renewableShare: number | null;
    perMlnRevenue: number | null; cost: number; costPerMwh: number | null;
  };
  water: { m3: number; perEmployee: number | null };
  waste: { total: number; recycled: number; hazardous: number; recycledShare: number | null };
  workforce: {
    end: number; start: number; avg: number; women: number; womenShare: number | null;
    managers: number; womenManagersShare: number | null;
    ageShares: { under30: number | null; age30to50: number | null; over50: number | null };
    contractors: number; hires: number; leavers: number; turnover: number | null; hireRate: number | null;
  };
  pay: { payroll: number; social: number; avgWage: number | null; toNational: number | null; payrollShareOfCosts: number | null };
  training: { hours: number; perEmployee: number | null; trainedShare: number | null; spend: number; spendPerEmployee: number | null };
  safety: { injuries: number; lostDays: number; hoursWorked: number; hoursEstimated: boolean; ltifr: number | null };
  governance: {
    boardMembers: number; independentShare: number | null; womenBoardShare: number | null;
    policies: Array<{ key: string; label: string; adopted: boolean }>;
    corruptionCases: number; discriminationCases: number; dataBreaches: number; customerComplaints: number;
    localSuppliersPct: number;
  };
  tax: {
    profitTax: number; turnoverTaxes: number; propertyTax: number; vatNotDeductible: number;
    paidToBudget: number; paidSocialFund: number; vatOutput: number;
    burdenPct: number | null; finesBudget: number; penaltiesContract: number;
  };
  economic: {
    generated: number; operatingCosts: number; employees: number; capitalProviders: number;
    government: number; community: number; retained: number;
    distributed: number;
  };
  indicators: Indicator[];
  gaps: string[];
  completeness: { filled: number; total: number };
}

const div = (a: number, b: number) => (Math.abs(b) > 1e-9 ? a / b : null);
const r = (n: number | null, d = 2) => (n === null || !Number.isFinite(n) ? null : Math.round(n * 10 ** d) / 10 ** d);
const r2 = (n: number) => Math.round(n * 100) / 100;

export function computeEsg(s: Statements, input: EsgInput, prevStatements?: Statements | null, prevInput?: EsgInput | null): EsgResult {
  const cur = computeCore(s, input);
  const prev = prevStatements && prevInput ? computeCore(prevStatements, prevInput) : prevStatements ? computeCore(prevStatements, null) : null;
  cur.indicators = indicators(cur, input, prev);
  return cur;
}

function factor(input: EsgInput | null, key: keyof typeof DEFAULT_FACTORS): { value: number; custom: boolean } {
  const v = input ? Number(input[key]) : 0;
  const d = DEFAULT_FACTORS[key];
  if (key === "coalFactor") {
    const typeDefault = r2(kgCo2PerUnit(FUELS[input?.coalType ?? "coalBituminous"]));
    return v > 0 ? { value: v, custom: Math.abs(v - typeDefault) > 1e-6 } : { value: typeDefault, custom: false };
  }
  return v > 0 ? { value: v, custom: Math.abs(v - d) > 1e-6 } : { value: d, custom: false };
}

function computeCore(s: Statements, input: EsgInput | null): EsgResult {
  const i = input;
  const n = (k: keyof EsgInput) => (i ? Math.max(0, Number(i[k]) || 0) : 0);
  const is = s.incomeStatement;
  const acc = (code: string) => is.byAccount[code] ?? 0;
  const months = monthsInPeriod(s.period.from, s.period.to);
  const workDays = n("workDays") > 0 ? n("workDays") : months * 21;
  const revenueMln = is.revenueTotal / 1e6;

  // ── workforce ──
  const end = n("employees"), start = n("employeesStart");
  const avg = start > 0 ? (start + end) / 2 : end;

  // ── emissions ──
  const rows: EmissionRow[] = [];
  const add = (scope: 1 | 2 | 3, group: string, key: string, label: string, activity: number, unit: string, f: { value: number; custom: boolean }) => {
    if (activity <= 0) return;
    rows.push({ key, scope, group, label, activity, unit, factor: f.value, factorCustom: f.custom, t: r2((activity * f.value) / 1000) });
  };
  const coalFuel = FUELS[i?.coalType ?? "coalBituminous"];
  add(1, "Стационарные источники", "coal", `${coalFuel.label} (котельная, печи)`, n("coalT"), "т", factor(i, "coalFactor"));
  add(1, "Стационарные источники", "gas", "Природный газ", n("gasM3"), "м³", factor(i, "gasFactor"));
  add(1, "Стационарные источники", "generator", "Дизельное топливо (генераторы, котлы)", n("generatorDieselL"), "л", factor(i, "dieselFactor"));
  add(1, "Мобильные источники", "vehPetrol", "Бензин (автопарк)", n("vehiclePetrolL"), "л", factor(i, "petrolFactor"));
  add(1, "Мобильные источники", "vehDiesel", "Дизельное топливо (автопарк)", n("vehicleDieselL"), "л", factor(i, "dieselFactor"));
  add(2, "Электроэнергия", "electricity", "Электроэнергия из сети", Math.max(0, n("electricityKwh") - n("renewableKwh")), "кВт·ч", factor(i, "gridFactor"));
  add(2, "Тепловая энергия", "heat", "Централизованное теплоснабжение", n("heatGcal"), "Гкал", factor(i, "heatFactor"));
  // Scope 3, category 7: commuting — avg headcount × days × 2 trips × km, split by mode
  const commuteKm = avg * workDays * 2 * n("commuteKmOneWay");
  add(3, "Кат. 7: дорога на работу", "commuteCar", "Личный автомобиль", (commuteKm * n("commuteShareCar")) / 100, "км", factor(i, "carFactor"));
  add(3, "Кат. 7: дорога на работу", "commuteBus", "Общественный транспорт", (commuteKm * n("commuteSharePublic")) / 100, "пасс.-км", factor(i, "busFactor"));
  add(3, "Кат. 6: деловые поездки", "air", "Авиаперелёты", n("businessAirKm"), "пасс.-км", factor(i, "airFactor"));
  add(3, "Кат. 6: деловые поездки", "rail", "Железная дорога", n("businessRailKm"), "пасс.-км", factor(i, "railFactor"));
  add(3, "Кат. 6: деловые поездки", "bizCar", "Автомобиль (такси, аренда, личный)", n("businessCarKm"), "км", factor(i, "carFactor"));

  const sum = (pred: (e: EmissionRow) => boolean) => r2(rows.filter(pred).reduce((a, e) => a + e.t, 0));
  const scope1 = sum((e) => e.scope === 1), scope2 = sum((e) => e.scope === 2), scope3 = sum((e) => e.scope === 3);
  const scope12 = r2(scope1 + scope2);

  // ── energy ──
  const fuelGj = (amount: number, f: (typeof FUELS)[keyof typeof FUELS]) => amount * gjPerUnit(f);
  const energyRows = [
    { label: "Электроэнергия из сети", amount: Math.max(0, n("electricityKwh") - n("renewableKwh")), unit: "кВт·ч", mwh: Math.max(0, n("electricityKwh") - n("renewableKwh")) / 1000 },
    { label: "Электроэнергия из ВИЭ (подтверждённая)", amount: n("renewableKwh"), unit: "кВт·ч", mwh: n("renewableKwh") / 1000 },
    { label: "Тепловая энергия", amount: n("heatGcal"), unit: "Гкал", mwh: (n("heatGcal") * GJ_PER_GCAL) / 3.6 },
    { label: "Бензин (автопарк)", amount: n("vehiclePetrolL"), unit: "л", mwh: fuelGj(n("vehiclePetrolL"), FUELS.petrol) / 3.6 },
    { label: "Дизельное топливо", amount: n("vehicleDieselL") + n("generatorDieselL"), unit: "л", mwh: fuelGj(n("vehicleDieselL") + n("generatorDieselL"), FUELS.diesel) / 3.6 },
    { label: "Природный газ", amount: n("gasM3"), unit: "м³", mwh: fuelGj(n("gasM3"), FUELS.gas) / 3.6 },
    { label: coalFuel.label, amount: n("coalT"), unit: "т", mwh: fuelGj(n("coalT"), coalFuel) / 3.6 },
  ].filter((e) => e.amount > 0).map((e) => ({ ...e, mwh: r2(e.mwh) }));
  const totalMwh = r2(energyRows.reduce((a, e) => a + e.mwh, 0));
  const gridMwh = r2(energyRows.filter((e) => e.unit === "кВт·ч" || e.unit === "Гкал").reduce((a, e) => a + e.mwh, 0));
  const energyCost = is.byNature.utilities ?? 0;

  // ── money from the ledger ──
  const payroll = is.byNature.payroll ?? 0;
  const social = is.byNature.social ?? 0;
  const training = acc("8160");
  const totalCosts = Object.values(is.byNature).reduce((a, v) => a + (v ?? 0), 0);
  const finesBudget = acc("8230");
  const penaltiesContract = acc("8240");
  const profitTax = acc("9910");
  const turnoverTaxes = acc("8190");
  const propertyTax = acc("8050");
  const vatNotDeductible = acc("8100");
  const paidToBudget = Object.entries(s.cashFlow.byAccount).filter(([c]) => c.startsWith("34")).reduce((a, [, v]) => a + Math.max(0, -v), 0);
  const paidSocialFund = Math.max(0, -(s.cashFlow.byAccount["3530"] ?? 0));
  const taxesInPl = profitTax + turnoverTaxes + propertyTax + vatNotDeductible;

  // ── GRI 201-1 (accrual basis) ──
  const interest = acc("9510");
  const dividendsDeclared = Math.max(0, -(s.equity.values[equityKey(90, 2)] ?? 0));
  const generated = r2(is.revenueTotal + is.byLine.nonOpIncome + Math.max(0, is.byLine.extraordinaryIncome));
  const employeesVal = r2(payroll + social);
  const capitalProviders = r2(interest + dividendsDeclared);
  const government = r2(taxesInPl + finesBudget);
  const community = r2(n("donations"));
  const allExpenses = is.byLine.cogs + is.byLine.selling + is.byLine.admin + is.byLine.otherOpExpense + is.byLine.nonOpExpense + is.byLine.extraordinaryExpense;
  const operatingCosts = r2(allExpenses - payroll - social - (turnoverTaxes + propertyTax + vatNotDeductible) - finesBudget - (is.byNature.depreciation ?? 0) - interest - community);
  const distributed = r2(operatingCosts + employeesVal + capitalProviders + government + community);
  const retained = r2(generated - distributed);

  // ── safety ──
  const hoursEstimated = !(n("hoursWorked") > 0);
  const hoursWorked = hoursEstimated ? avg * workDays * 8 : n("hoursWorked");

  const policies = [
    { key: "antiCorruptionPolicy", label: "Антикоррупционная политика" },
    { key: "codeOfConduct", label: "Кодекс этики (делового поведения)" },
    { key: "environmentalPolicy", label: "Экологическая политика" },
    { key: "hrPolicy", label: "Кадровая политика (равные возможности, охрана труда)" },
    { key: "dataProtectionPolicy", label: "Политика защиты персональных данных" },
  ].map((p) => ({ ...p, adopted: Boolean(i?.[p.key as keyof EsgInput]) }));

  const gaps: string[] = [];
  if (i) {
    if (!(n("electricityKwh") > 0)) gaps.push("потребление электроэнергии (кВт·ч) — без него не считается Охват 2");
    if (!(end > 0)) gaps.push("численность персонала — без неё нет относительных социальных показателей");
    if (!(start > 0) && end > 0) gaps.push("численность на начало периода — текучесть и средняя зарплата посчитаны по численности на конец");
    if (!(n("waterM3") > 0)) gaps.push("водопотребление (м³)");
    if (!(n("wasteT") > 0)) gaps.push("образование отходов (т)");
    if (!(n("hoursWorked") > 0) && end > 0) gaps.push("отработанные человеко-часы — коэффициент травматизма посчитан по оценке (8 ч × рабочие дни)");
    if (!(n("commuteKmOneWay") > 0)) gaps.push("дорога сотрудников на работу — Охват 3 кат. 7 не посчитан");
    if (!(n("boardMembers") > 0)) gaps.push("состав органа управления");
    if (!(n("nationalAvgWage") > 0)) gaps.push("средняя зарплата по стране для сравнения");
  }
  const keyInputs: Array<keyof EsgInput> = ["electricityKwh", "waterM3", "wasteT", "employees", "women", "managers", "trainingHours", "boardMembers", "esgOwner", "commuteKmOneWay", "hoursWorked", "employeesStart"];
  const filled = i ? keyInputs.filter((k) => { const v = i[k]; return typeof v === "string" ? v.trim() !== "" : Number(v) > 0; }).length : 0;

  return {
    months, workDays, revenueMln,
    emissions: {
      rows, scope1, scope2, scope3, scope12, total: r2(scope12 + scope3),
      stationary: sum((e) => e.group === "Стационарные источники"),
      mobile: sum((e) => e.group === "Мобильные источники"),
      electricity: sum((e) => e.key === "electricity"),
      heat: sum((e) => e.key === "heat"),
      commute: sum((e) => e.group.startsWith("Кат. 7")),
      travel: sum((e) => e.group.startsWith("Кат. 6")),
      perMlnRevenue: r(div(scope12, revenueMln), 3),
      perEmployee: r(div(scope12, avg), 3),
    },
    energy: {
      rows: energyRows, totalMwh, fuelMwh: r2(totalMwh - gridMwh), gridMwh,
      renewableShare: r(div(n("renewableKwh") * 100, n("electricityKwh")), 1),
      perMlnRevenue: r(div(totalMwh, revenueMln), 2),
      cost: r2(energyCost), costPerMwh: r(div(energyCost, gridMwh), 0),
    },
    water: { m3: n("waterM3"), perEmployee: r(div(n("waterM3"), avg), 2) },
    waste: { total: n("wasteT"), recycled: n("wasteRecycledT"), hazardous: n("hazardousWasteT"), recycledShare: r(div(n("wasteRecycledT") * 100, n("wasteT")), 1) },
    workforce: {
      end, start, avg: r2(avg), women: n("women"), womenShare: r(div(n("women") * 100, end), 1),
      managers: n("managers"), womenManagersShare: r(div(n("womenManagers") * 100, n("managers")), 1),
      ageShares: {
        under30: r(div(n("under30") * 100, end), 1), age30to50: r(div(n("age30to50") * 100, end), 1), over50: r(div(n("over50") * 100, end), 1),
      },
      contractors: n("contractors"), hires: n("hires"), leavers: n("leavers"),
      turnover: r(div(n("leavers") * 100, avg), 1), hireRate: r(div(n("hires") * 100, avg), 1),
    },
    pay: {
      payroll: r2(payroll), social: r2(social),
      avgWage: r(div(payroll, avg * months), 0),
      toNational: r(div((div(payroll, avg * months) ?? 0) * 100, n("nationalAvgWage")), 1),
      payrollShareOfCosts: r(div(payroll * 100, totalCosts), 1),
    },
    training: {
      hours: n("trainingHours"), perEmployee: r(div(n("trainingHours"), avg), 1),
      trainedShare: r(div(n("employeesTrained") * 100, end), 1),
      spend: r2(training), spendPerEmployee: r(div(training, avg), 0),
    },
    safety: { injuries: n("injuries"), lostDays: n("lostDays"), hoursWorked: Math.round(hoursWorked), hoursEstimated, ltifr: r(div(n("injuries") * 1e6, hoursWorked), 2) },
    governance: {
      boardMembers: n("boardMembers"), independentShare: r(div(n("independentBoard") * 100, n("boardMembers")), 1),
      womenBoardShare: r(div(n("womenBoard") * 100, n("boardMembers")), 1),
      policies,
      corruptionCases: n("corruptionCases"), discriminationCases: n("discriminationCases"),
      dataBreaches: n("dataBreaches"), customerComplaints: n("customerComplaints"), localSuppliersPct: n("localSuppliersPct"),
    },
    tax: {
      profitTax: r2(profitTax), turnoverTaxes: r2(turnoverTaxes), propertyTax: r2(propertyTax), vatNotDeductible: r2(vatNotDeductible),
      paidToBudget: r2(paidToBudget), paidSocialFund: r2(paidSocialFund), vatOutput: s.taxes.vatOutput,
      burdenPct: r(div((taxesInPl + social) * 100, is.revenueTotal), 2),
      finesBudget: r2(finesBudget), penaltiesContract: r2(penaltiesContract),
    },
    economic: { generated, operatingCosts, employees: employeesVal, capitalProviders, government, community, retained, distributed },
    indicators: [],
    gaps,
    completeness: { filled, total: keyInputs.length },
  };
}

// ── indicator table (every row carries its method) ─────────────────────────

function indicators(c: EsgResult, input: EsgInput, p: EsgResult | null): Indicator[] {
  const q = (has: boolean, kind: Quality = "primary"): Quality => (has ? kind : "missing");
  const nz = (v: number) => (v > 0 ? v : null);
  const e = c.emissions, pe = p?.emissions;
  const list: Indicator[] = [
    // ── Экология ──
    { key: "scope1", pillar: "E", label: "Прямые выбросы ПГ (Охват 1)", value: e.scope1, prev: pe?.scope1 ?? null, unit: "т CO₂-экв.", gri: "305-1", source: "calc", quality: q(e.scope1 > 0, "calculated"), higherIsBetter: false,
      method: "Сумма по видам топлива: расход × коэффициент выбросов (IPCC 2006). Стационарные источники — уголь, газ, дизель генераторов; мобильные — бензин и дизель автопарка." },
    { key: "scope2", pillar: "E", label: "Косвенные энергетические выбросы (Охват 2)", value: e.scope2, prev: pe?.scope2 ?? null, unit: "т CO₂-экв.", gri: "305-2", source: "calc", quality: q(e.scope2 > 0, "calculated"), higherIsBetter: false,
      method: `Электроэнергия из сети × ${String(input.gridFactor).replace(".", ",")} кг/кВт·ч (географический метод) + тепло × ${String(input.heatFactor).replace(".", ",")} кг/Гкал. Подтверждённая ВИЭ исключается.` },
    { key: "scope3", pillar: "E", label: "Прочие косвенные выбросы (Охват 3, кат. 6 и 7)", value: e.scope3, prev: pe?.scope3 ?? null, unit: "т CO₂-экв.", gri: "305-3", source: "calc", quality: q(e.scope3 > 0, "estimated"), higherIsBetter: false,
      method: "Кат. 7: среднесписочная численность × рабочие дни × 2 поездки × расстояние × доля вида транспорта × коэффициент. Кат. 6: пассажиро-км командировок × коэффициент." },
    { key: "intensityRev", pillar: "E", label: "Углеродоёмкость выручки (Охват 1+2)", value: e.perMlnRevenue, prev: pe?.perMlnRevenue ?? null, unit: "т CO₂-экв. / млн сом", gri: "305-4", source: "calc", quality: q(e.perMlnRevenue !== null && e.scope12 > 0, "calculated"), higherIsBetter: false,
      method: "(Охват 1 + Охват 2) / (чистая выручка + прочие операционные доходы, млн сом)." },
    { key: "intensityEmp", pillar: "E", label: "Углеродоёмкость на сотрудника (Охват 1+2)", value: e.perEmployee, prev: pe?.perEmployee ?? null, unit: "т CO₂-экв. / чел.", gri: "305-4", source: "calc", quality: q(e.perEmployee !== null && e.scope12 > 0, "calculated"), higherIsBetter: false,
      method: "(Охват 1 + Охват 2) / среднесписочная численность." },
    { key: "energy", pillar: "E", label: "Конечное потребление энергии", value: c.energy.totalMwh, prev: p?.energy.totalMwh ?? null, unit: "МВт·ч", gri: "302-1", source: "calc", quality: q(c.energy.totalMwh > 0, "calculated"), higherIsBetter: false,
      method: "Электроэнергия (кВт·ч / 1000) + тепло (Гкал × 1,163) + топливо (расход × теплотворная способность IPCC / 3,6)." },
    { key: "energyIntensity", pillar: "E", label: "Энергоёмкость выручки", value: c.energy.perMlnRevenue, prev: p?.energy.perMlnRevenue ?? null, unit: "МВт·ч / млн сом", gri: "302-3", source: "calc", quality: q(c.energy.perMlnRevenue !== null && c.energy.totalMwh > 0, "calculated"), higherIsBetter: false,
      method: "Конечное потребление энергии / выручка, млн сом." },
    { key: "renewable", pillar: "E", label: "Доля подтверждённой ВИЭ в электроэнергии", value: c.energy.renewableShare, prev: p?.energy.renewableShare ?? null, unit: "%", gri: "302-1", source: "calc", quality: q(c.energy.renewableShare !== null, "calculated"), higherIsBetter: true,
      method: "Только электроэнергия собственных ВИЭ или по договору с подтверждением происхождения. Гидроэнергия в общей сети сюда не входит — она учтена в коэффициенте сети." },
    { key: "energyCost", pillar: "E", label: "Расходы на энергию и коммунальные услуги", value: c.energy.cost, prev: p?.energy.cost ?? null, unit: "сом", gri: "302-1", source: "ledger", quality: "primary", higherIsBetter: false,
      method: "Обороты по счетам 7140 «Затраты на коммунальные услуги» и 8220 «Расходы по коммунальным услугам» за период." },
    { key: "water", pillar: "E", label: "Водопотребление", value: nz(c.water.m3), prev: p ? nz(p.water.m3) : null, unit: "м³", gri: "303-5", source: "input", quality: q(c.water.m3 > 0), higherIsBetter: false,
      method: "По показаниям водомеров или счетам водоканала. Водопотребление приравнено к водозабору." },
    { key: "waste", pillar: "E", label: "Образовано отходов", value: nz(c.waste.total), prev: p ? nz(p.waste.total) : null, unit: "т", gri: "306-3", source: "input", quality: q(c.waste.total > 0), higherIsBetter: false,
      method: "По актам вывоза и журналу учёта отходов." },
    { key: "recycling", pillar: "E", label: "Доля отходов, переданных на переработку", value: c.waste.recycledShare, prev: p?.waste.recycledShare ?? null, unit: "%", gri: "306-4", source: "calc", quality: q(c.waste.recycledShare !== null, "calculated"), higherIsBetter: true,
      method: "Передано на переработку / образовано всего × 100." },
    // ── Социальная сфера ──
    { key: "employees", pillar: "S", label: "Численность персонала на конец периода", value: nz(c.workforce.end), prev: p ? nz(p.workforce.end) : null, unit: "чел.", gri: "2-7", source: "input", quality: q(c.workforce.end > 0),
      method: "Списочная численность по кадровому учёту; работники по договорам ГПХ показаны отдельно." },
    { key: "womenShare", pillar: "S", label: "Доля женщин в персонале", value: c.workforce.womenShare, prev: p?.workforce.womenShare ?? null, unit: "%", gri: "405-1", source: "calc", quality: q(c.workforce.womenShare !== null, "calculated"),
      method: "Женщины / численность на конец периода × 100." },
    { key: "womenManagers", pillar: "S", label: "Доля женщин среди руководителей", value: c.workforce.womenManagersShare, prev: p?.workforce.womenManagersShare ?? null, unit: "%", gri: "405-1", source: "calc", quality: q(c.workforce.womenManagersShare !== null, "calculated"),
      method: "Женщины-руководители / все руководители × 100." },
    { key: "turnover", pillar: "S", label: "Текучесть кадров", value: c.workforce.turnover, prev: p?.workforce.turnover ?? null, unit: "%", gri: "401-1", source: "calc", quality: q(c.workforce.turnover !== null, c.workforce.start > 0 ? "calculated" : "estimated"), higherIsBetter: false,
      method: "Уволившиеся за период / среднесписочная численность × 100. Среднесписочная = (численность на начало + на конец) / 2." },
    { key: "payroll", pillar: "S", label: "Фонд оплаты труда", value: c.pay.payroll, prev: p?.pay.payroll ?? null, unit: "сом", gri: "201-1", source: "ledger", quality: "primary",
      method: "Начисленная зарплата по счетам 7120, 7520, 8010 за период (до удержаний)." },
    { key: "avgWage", pillar: "S", label: "Средняя начисленная зарплата", value: c.pay.avgWage, prev: p?.pay.avgWage ?? null, unit: "сом / мес.", gri: "202-1", source: "calc", quality: q(c.pay.avgWage !== null, "calculated"), higherIsBetter: true,
      method: "ФОТ / (среднесписочная численность × число месяцев периода)." },
    { key: "toNational", pillar: "S", label: "Средняя зарплата к средней по стране", value: c.pay.toNational, prev: p?.pay.toNational ?? null, unit: "%", gri: "202-1", source: "calc", quality: q(c.pay.toNational !== null, "calculated"), higherIsBetter: true,
      method: "Средняя начисленная зарплата компании / средняя по КР (введена компанией по данным Нацстаткома) × 100." },
    { key: "social", pillar: "S", label: "Страховые взносы работодателя", value: c.pay.social, prev: p?.pay.social ?? null, unit: "сом", gri: "201-3", source: "ledger", quality: "primary",
      method: "Обороты по счетам 7130, 7530, 8020. Взносы работника (10%) удерживаются из зарплаты и сюда не входят." },
    { key: "trainingHours", pillar: "S", label: "Часы обучения на сотрудника", value: c.training.perEmployee, prev: p?.training.perEmployee ?? null, unit: "ч", gri: "404-1", source: "calc", quality: q(c.training.perEmployee !== null && c.training.hours > 0, "calculated"), higherIsBetter: true,
      method: "Часы обучения всего / среднесписочная численность." },
    { key: "trainingSpend", pillar: "S", label: "Расходы на обучение", value: c.training.spend, prev: p?.training.spend ?? null, unit: "сом", gri: "404-2", source: "ledger", quality: "primary", higherIsBetter: true,
      method: "Обороты по счёту 8160 «Расходы по обучению»." },
    { key: "ltifr", pillar: "S", label: "Коэффициент травматизма (LTIFR)", value: c.safety.ltifr, prev: p?.safety.ltifr ?? null, unit: "на 1 млн чел.-ч", gri: "403-9", source: "calc", quality: q(c.safety.ltifr !== null, c.safety.hoursEstimated ? "estimated" : "calculated"), higherIsBetter: false,
      method: "Несчастные случаи с потерей трудоспособности × 1 000 000 / отработанные человеко-часы." + (c.safety.hoursEstimated ? " Часы оценены: среднесписочная × рабочие дни × 8." : "") },
    // ── Управление ──
    { key: "independent", pillar: "G", label: "Доля независимых членов органа управления", value: c.governance.independentShare, prev: p?.governance.independentShare ?? null, unit: "%", gri: "2-9", source: "calc", quality: q(c.governance.independentShare !== null, "calculated"), higherIsBetter: true,
      method: "Независимые члены / все члены совета директоров (наблюдательного совета, общего собрания для ОсОО) × 100." },
    { key: "policies", pillar: "G", label: "Утверждённые политики", value: `${c.governance.policies.filter((x) => x.adopted).length} из ${c.governance.policies.length}`, prev: null, unit: "", gri: "2-23", source: "input", quality: "primary",
      method: "Антикоррупционная, этики, экологическая, кадровая, защиты данных — по документам компании." },
    { key: "corruption", pillar: "G", label: "Подтверждённые случаи коррупции", value: c.governance.corruptionCases, prev: p?.governance.corruptionCases ?? null, unit: "случ.", gri: "205-3", source: "input", quality: "primary", higherIsBetter: false,
      method: "Случаи, подтверждённые внутренней проверкой или решением суда." },
    { key: "dataBreaches", pillar: "G", label: "Утечки персональных данных", value: c.governance.dataBreaches, prev: p?.governance.dataBreaches ?? null, unit: "случ.", gri: "418-1", source: "input", quality: "primary", higherIsBetter: false,
      method: "Подтверждённые случаи утечки или потери данных клиентов и сотрудников." },
    { key: "fines", pillar: "G", label: "Штрафы и пени в бюджет", value: c.tax.finesBudget, prev: p?.tax.finesBudget ?? null, unit: "сом", gri: "2-27", source: "ledger", quality: "primary", higherIsBetter: false,
      method: "Счёт 8230 «Штрафы, пени, неустойки в бюджет». Неустойки по хозяйственным договорам (счёт 8240) — нарушение договоров, а не законодательства, и сюда не входят." },
    { key: "profitTax", pillar: "G", label: "Налог на прибыль / единый налог / патент", value: c.tax.profitTax, prev: p?.tax.profitTax ?? null, unit: "сом", gri: "207-4", source: "ledger", quality: "primary",
      method: "Начислено по счёту 9910 за период." },
    { key: "taxesPaid", pillar: "G", label: "Перечислено в бюджет", value: c.tax.paidToBudget, prev: p?.tax.paidToBudget ?? null, unit: "сом", gri: "207-4", source: "ledger", quality: "primary",
      method: "Платежи с кассы и банка в погашение счетов 3400 «Налоги к оплате» (включая удержанный подоходный налог работников)." },
    { key: "taxBurden", pillar: "G", label: "Налоговая нагрузка", value: c.tax.burdenPct, prev: p?.tax.burdenPct ?? null, unit: "% выручки", gri: "207-1", source: "calc", quality: "calculated",
      method: "(Налоги в расходах 9910, 8190, 8050, 8100 + взносы работодателя) / выручка × 100. НДС не включён — его платит покупатель." },
    { key: "localSuppliers", pillar: "G", label: "Доля закупок у поставщиков КР", value: nz(c.governance.localSuppliersPct), prev: p ? nz(p.governance.localSuppliersPct) : null, unit: "%", gri: "204-1", source: "input", quality: q(c.governance.localSuppliersPct > 0, "estimated"), higherIsBetter: true,
      method: "Оценка компании по реестру поставщиков." },
    // ── Экономика ──
    { key: "generated", pillar: "EC", label: "Созданная экономическая стоимость", value: c.economic.generated, prev: p?.economic.generated ?? null, unit: "сом", gri: "201-1", source: "ledger", quality: "primary",
      method: "Чистая выручка + прочие операционные + неоперационные + чрезвычайные доходы." },
    { key: "distributed", pillar: "EC", label: "Распределённая экономическая стоимость", value: c.economic.distributed, prev: p?.economic.distributed ?? null, unit: "сом", gri: "201-1", source: "ledger", quality: "primary",
      method: "Поставщикам + работникам + кредиторам и собственникам + государству + сообществу; метод начисления." },
  ];
  return list;
}
