// ════════════════════════════════════════════════════════════════════════
// lib/tax-engine.ts
// 1:1 TypeScript port of the calculation engine in app.py (lines ~15-450).
// Framework-agnostic — no Next.js or Prisma imports — so it can be unit
// tested directly against known outputs from the Streamlit app, and reused
// from API routes, client components, or a future mobile client.
// ════════════════════════════════════════════════════════════════════════

export const SOCIAL_RATE = 0.1225;
export const VAT_RATE = 0.12;
export const INCOME_TAX = 0.10;
export const SALES_TAX = 0.02;

export type RegimeKey =
  | "general"
  | "simplified"
  | "unified_trade_s"
  | "unified_trade_l"
  | "unified_catering_b"
  | "unified_catering_o"
  | "unified_production"
  | "unified_services"
  | "unified_foreign"
  | "patent";

export const REGIMES: Record<RegimeKey, string> = {
  general: "Общий режим (НДС 12% + НП 10%)",
  simplified: "Упрощённый (налог с продаж 2%)",
  unified_trade_s: "Единый — торговля до 50 млн (0.5%/0.25%)",
  unified_trade_l: "Единый — торговля >50 млн (4%/2%)",
  unified_catering_b: "Единый — общепит Бишкек/Ош (6%/4%)",
  unified_catering_o: "Единый — общепит другие города (4%/2%)",
  unified_production: "Единый — производство (4%/2%)",
  unified_services: "Единый — услуги (6%/4%)",
  unified_foreign: "Единый — за рубежом (0.1%)",
  patent: "Патентная система (фикс.)",
};

export const UNIFIED_RATES: Partial<Record<RegimeKey, [number, number]>> = {
  unified_trade_s: [0.005, 0.0025],
  unified_trade_l: [0.04, 0.02],
  unified_catering_b: [0.06, 0.04],
  unified_catering_o: [0.04, 0.02],
  unified_production: [0.04, 0.02],
  unified_services: [0.06, 0.04],
  unified_foreign: [0.001, 0.001],
};

export const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export interface CalculateInput {
  regimeKey: RegimeKey;
  revenue: number;
  otherIncome: number;
  cogs: number;
  salaries: number;
  rent: number;
  sellingExp: number;
  adminExp: number;
  otherOpExp: number;
  interestExp: number;
  otherNonOp: number;
  investInc: number;
  cashPct: number; // 0-100
  patentAmount: number;
}

export interface CalculateResult {
  totalRevenue: number; revenue: number; otherIncome: number;
  cogs: number; salaries: number; social: number; fotFull: number;
  rent: number; sellingExp: number; adminExp: number;
  adminTotal: number; otherOpExp: number;
  interestExp: number; otherNonOp: number; investInc: number;
  totalOpExp: number; grossProfit: number;
  otherOpNet: number; ebit: number;
  nonOpNet: number; ebt: number;
  incomeTax: number; netProfit: number; profitability: number;
  vat: number; salesTax: number;
  totalDirect: number; totalIndirect: number;
  details: Record<string, number>;
  regimeName: string;
  vatInRev: number; revExclVat: number;
  regimeKey: RegimeKey;
}

/** Direct port of calculate() in app.py — keep in lockstep with the Python version. */
export function calculate(input: CalculateInput): CalculateResult {
  const {
    regimeKey, revenue, otherIncome, cogs, salaries, rent,
    sellingExp, adminExp, otherOpExp, interestExp, otherNonOp,
    investInc, cashPct, patentAmount,
  } = input;

  const totalRevenue = revenue + otherIncome;
  const social = salaries * SOCIAL_RATE;
  const fotFull = salaries + social;

  const adminTotal = adminExp + fotFull + rent;
  const totalOpExp = sellingExp + adminTotal;
  const grossProfit = revenue - cogs;
  const otherOpNet = otherIncome - otherOpExp;
  const ebit = grossProfit + otherOpNet - totalOpExp;
  const nonOpNet = investInc - interestExp + otherNonOp;
  const ebt = ebit + nonOpNet;

  let vat = 0;
  let salesTaxAmt = 0;
  let incomeTax = 0;
  const details: Record<string, number> = {};

  if (regimeKey !== "patent") {
    details[`Соцфонд (${(SOCIAL_RATE * 100).toFixed(2)}%) — ГСЗН КР`] = social;
  }

  if (regimeKey === "general") {
    vat = totalRevenue * VAT_RATE;
    incomeTax = Math.max(0, ebt) * INCOME_TAX;
    details[`НДС (12%) — ст.254 НК КР [косвенный]`] = vat;
    details[`Налог на прибыль (10%) — ст.240 НК КР`] = incomeTax;
  } else if (regimeKey === "simplified") {
    salesTaxAmt = totalRevenue * SALES_TAX;
    details[`Налог с продаж (2%) — ст.368 НК КР [косвенный]`] = salesTaxAmt;
  } else if (regimeKey in UNIFIED_RATES) {
    const [cr, nr] = UNIFIED_RATES[regimeKey]!;
    const cashRev = (totalRevenue * cashPct) / 100;
    const noncashRev = totalRevenue * (1 - cashPct / 100);
    const cTax = cashRev * cr;
    const nTax = noncashRev * nr;
    incomeTax = cTax + nTax;
    details[`Единый нал. (${trimPct(cr)}%) — ст.423 НК КР`] = cTax;
    details[`Единый безнал. (${trimPct(nr)}%) — ст.423 НК КР`] = nTax;
  } else if (regimeKey === "patent") {
    incomeTax = patentAmount;
    details[`Патентный сбор (фикс.) — ст.414 НК КР`] = patentAmount;
  }

  const totalDirect = incomeTax + (regimeKey !== "patent" ? social : 0);
  const totalIndirect = vat + salesTaxAmt;
  const netProfit = ebt - incomeTax;
  const profitability = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const vatInRev = regimeKey === "general" ? (totalRevenue * VAT_RATE) / (1 + VAT_RATE) : 0;
  const revExclVat = totalRevenue - vatInRev;

  return {
    totalRevenue, revenue, otherIncome, cogs, salaries, social, fotFull,
    rent, sellingExp, adminExp, adminTotal, otherOpExp,
    interestExp, otherNonOp, investInc, totalOpExp, grossProfit,
    otherOpNet, ebit, nonOpNet, ebt,
    incomeTax, netProfit, profitability,
    vat, salesTax: salesTaxAmt,
    totalDirect, totalIndirect, details,
    regimeName: REGIMES[regimeKey],
    vatInRev, revExclVat, regimeKey,
  };
}

// matches Python's f"{v*100:.3g}" formatting closely enough for label text
function trimPct(rate: number): string {
  const pct = rate * 100;
  return Number(pct.toPrecision(3)).toString();
}

export function compareRegimes(
  base: Omit<CalculateInput, "regimeKey" | "otherOpExp" | "interestExp" | "otherNonOp" | "investInc" | "cashPct" | "patentAmount">
): Array<{ key: RegimeKey; name: string; net: number; tax: number; pct: number }> {
  const results: Array<{ key: RegimeKey; name: string; net: number; tax: number; pct: number }> = [];
  for (const rk of Object.keys(REGIMES) as RegimeKey[]) {
    try {
      const fr = calculate({
        ...base,
        regimeKey: rk,
        otherOpExp: 0, interestExp: 0, otherNonOp: 0, investInc: 0,
        cashPct: 70, patentAmount: 3000,
      });
      results.push({ key: rk, name: REGIMES[rk], net: fr.netProfit, tax: fr.totalDirect, pct: fr.profitability });
    } catch {
      // skip regime on calc error, mirrors the bare except in app.py
    }
  }
  return results.sort((a, b) => b.net - a.net);
}

export function breakEven(fr: CalculateResult): number {
  const variable = fr.cogs + fr.sellingExp;
  const fixed = fr.adminTotal + fr.totalDirect;
  const cm = fr.revenue > 0 ? (fr.revenue - variable) / fr.revenue : 0;
  return cm > 0 ? fixed / cm : 0;
}

export function safetyMargin(fr: CalculateResult): number {
  const be = breakEven(fr);
  return fr.revenue > 0 ? ((fr.revenue - be) / fr.revenue) * 100 : 0;
}

export function grossMargin(fr: CalculateResult): number {
  return fr.revenue > 0 ? (fr.grossProfit / fr.revenue) * 100 : 0;
}

export function taxBurden(fr: CalculateResult): number {
  return fr.totalRevenue > 0 ? (fr.totalDirect / fr.totalRevenue) * 100 : 0;
}

export interface ForecastResult {
  revenue: number; cogs: number; opex: number; ebt: number; tax: number; net: number; pct: number;
}

export function doForecast(fr: CalculateResult, growthPct = 4.0): ForecastResult {
  const g = 1 + growthPct / 100;
  const revF = fr.revenue * g;
  const cogsF = fr.cogs * g;
  const opexF = fr.totalOpExp * 1.02;
  const ebtF = revF - cogsF - opexF;
  const taxF = fr.regimeKey === "general" ? ebtF * INCOME_TAX : fr.totalDirect * g;
  const netF = ebtF - taxF;
  return { revenue: revF, cogs: cogsF, opex: opexF, ebt: ebtF, tax: taxF, net: netF, pct: revF > 0 ? (netF / revF) * 100 : 0 };
}

export function validateInputs(revenue: number, cogs: number, salaries: number): string[] {
  const warns: string[] = [];
  if (revenue < 0) warns.push("❌ Выручка не может быть отрицательной");
  if (cogs < 0) warns.push("❌ Себестоимость не может быть отрицательной");
  if (salaries < 0) warns.push("❌ Зарплата не может быть отрицательной");
  if (cogs > revenue * 1.5 && revenue > 0) {
    warns.push("⚠️ Себестоимость более чем в 1.5 раза превышает выручку");
  }
  return warns;
}

export function calcPeriodLabel(
  ptype: "Месяц" | "Квартал" | "Год" | string,
  year: number,
  monthSel: string,
  quarterSel: number
): string {
  if (ptype === "Месяц") return `${monthSel} ${year}`;
  if (ptype === "Квартал") return `Q${quarterSel} ${year}`;
  if (ptype === "Год") return String(year);
  return String(year);
}
