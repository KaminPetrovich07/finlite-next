// ════════════════════════════════════════════════════════════════════════
// lib/tax-engine.ts
// Tax calculator. Started as a port of calculate() in app.py; rates and the
// regime list were re-checked against the current Tax Code (see REGIME_INFO).
// Framework-agnostic — no Next.js or Prisma imports — so it can be unit
// tested directly against known outputs from the Streamlit app, and reused
// from API routes, client components, or a future mobile client.
// ════════════════════════════════════════════════════════════════════════

// ── Ставки ───────────────────────────────────────────────────────────────
// Налоговый кодекс КР от 18.01.2022 № 3 в ред. Закона от 06.08.2026 № 145.
export const VAT_RATE = 0.12;   // ст. 254
export const INCOME_TAX = 0.10; // ст. 240 (налог на прибыль)
export const PIT_RATE = 0.10;   // ст. 197 (подоходный налог, удерживается с работника)
// Страховые взносы — Закон о тарифах страховых взносов (ред. 2024):
// 12,25% = 2,25% работодатель + 10% работник. Для банков, недропользователей,
// операторов связи и ряда других категорий действуют прежние тарифы.
export const SOCIAL_EMPLOYER = 0.0225;
export const SOCIAL_EMPLOYEE = 0.10;
/** @deprecated kept for old saved reports; use SOCIAL_EMPLOYER */
export const SOCIAL_RATE = SOCIAL_EMPLOYER;
export const SALES_TAX = 0.01;

export type RegimeKey =
  | "general"
  | "general_services"
  | "unified_trade_s"
  | "unified_trade_l"
  | "unified_production"
  | "unified_services"
  | "unified_catering_b"
  | "unified_catering_o"
  | "unified_textile"
  | "unified_foreign"
  | "unified_ip_zero"
  | "ecommerce"
  | "patent";

export type Activity = "trade" | "production" | "services" | "catering" | "textile" | "foreign" | "ip" | "ecommerce";

export interface RegimeInfo {
  /** виды деятельности, для которых режим доступен; пусто = любой (патент) */
  activities: Activity[];
  name: string;
  short: string;
  kind: "general" | "unified" | "ecommerce" | "patent";
  /** единый налог: [наличная, безналичная]; e-commerce: [ставка, ставка] */
  rates?: [number, number];
  /** налог с продаж для общего режима, ст. 368 ч.1 п.1 */
  salesTax?: number;
  article: string;
  note?: string;
}

export const REGIME_INFO: Record<RegimeKey, RegimeInfo> = {
  general: {
    activities: ["trade", "production", "textile"],
    name: "Общий режим — торговля, производство (НДС 12% + НП 10% + НсП 1%)", short: "Общий, торговля/производство",
    kind: "general", salesTax: 0.01, article: "ст. 240, 254, 368 НК КР",
  },
  general_services: {
    activities: ["services", "catering"],
    name: "Общий режим — услуги и прочее (НДС 12% + НП 10% + НсП 2%)", short: "Общий, услуги",
    kind: "general", salesTax: 0.02, article: "ст. 240, 254, 368 НК КР",
  },
  unified_trade_s: {
    activities: ["trade"],
    name: "Единый налог — торговля, выручка до 50 млн (0,5%)", short: "Единый 0,5%",
    kind: "unified", rates: [0.005, 0.005], article: "ст. 423 ч.1 п.1 «а» НК КР",
    note: "Не для импортёров, экспортёров, дистрибьюторов, аптек, ГСМ",
  },
  unified_trade_l: {
    activities: ["trade"],
    name: "Единый налог — прочая торговля (4% нал. / 2% безнал.)", short: "Единый 4/2%, торговля",
    kind: "unified", rates: [0.04, 0.02], article: "ст. 423 ч.1 п.1 «б» НК КР",
  },
  unified_production: {
    activities: ["production"],
    name: "Единый налог — производство, переработка с/х, IT, туризм (4% / 2%)", short: "Единый 4/2%, производство",
    kind: "unified", rates: [0.04, 0.02], article: "ст. 423 ч.1 п.2 НК КР",
  },
  unified_services: {
    activities: ["services"],
    name: "Единый налог — услуги и прочие виды (6% / 4%)", short: "Единый 6/4%",
    kind: "unified", rates: [0.06, 0.04], article: "ст. 423 ч.1 п.3 НК КР",
  },
  unified_catering_b: {
    activities: ["catering"],
    name: "Единый налог — общепит в Бишкеке и Оше (5%)", short: "Единый 5%, общепит",
    kind: "unified", rates: [0.05, 0.05], article: "ст. 423 ч.5 НК КР",
  },
  unified_catering_o: {
    activities: ["catering"],
    name: "Единый налог — общепит в остальных регионах (3%)", short: "Единый 3%, общепит",
    kind: "unified", rates: [0.03, 0.03], article: "ст. 423 ч.5 НК КР",
  },
  unified_textile: {
    activities: ["textile"],
    name: "Единый налог — швейное, текстильное, ювелирное производство (0,25%)", short: "Единый 0,25%",
    kind: "unified", rates: [0.0025, 0.0025], article: "ст. 423 ч.3 НК КР",
  },
  unified_foreign: {
    activities: ["foreign"],
    name: "Единый налог — деятельность за пределами КР (0,1%)", short: "Единый 0,1%",
    kind: "unified", rates: [0.001, 0.001], article: "ст. 423 ч.6¹ НК КР",
  },
  unified_ip_zero: {
    activities: ["ip"],
    name: "Единый налог — ИП, выручка до 15 млн, с ККМ (0%)", short: "Единый 0%, ИП",
    kind: "unified", rates: [0, 0], article: "ст. 423 ч.8 НК КР",
    note: "Только ИП без наёмных работников (торговля — до двух), с ККМ, одна точка",
  },
  ecommerce: {
    activities: ["ecommerce"],
    name: "Налог на электронную торговлю (2%)", short: "Электронная торговля 2%",
    kind: "ecommerce", rates: [0.02, 0.02], article: "ст. 446 НК КР",
  },
  patent: {
    activities: [],
    name: "Патент (фиксированная сумма)", short: "Патент",
    kind: "patent", article: "гл. 56 НК КР",
    note: "Стоимость патента устанавливает Кабинет Министров — введите её по своему виду деятельности",
  },
};

export const REGIMES: Record<RegimeKey, string> = Object.fromEntries(
  (Object.keys(REGIME_INFO) as RegimeKey[]).map((k) => [k, REGIME_INFO[k].name])
) as Record<RegimeKey, string>;

export const UNIFIED_RATES: Partial<Record<RegimeKey, [number, number]>> = Object.fromEntries(
  (Object.keys(REGIME_INFO) as RegimeKey[]).filter((k) => REGIME_INFO[k].rates).map((k) => [k, REGIME_INFO[k].rates!])
);

/** Regimes a company could switch to without changing what it does. */
export function comparableRegimes(current: RegimeKey | null): RegimeKey[] {
  const all = Object.keys(REGIME_INFO) as RegimeKey[];
  if (!current) return all;
  const acts = REGIME_INFO[current].activities;
  if (!acts.length) return all;
  return all.filter((k) => k === current || REGIME_INFO[k].activities.some((a) => acts.includes(a)));
}

/** Regime keys saved before the Tax Code review; "simplified" does not exist in the Code. */
export const LEGACY_REGIMES: Record<string, RegimeKey | null> = { simplified: null };

export function isRegimeKey(k: string | null | undefined): k is RegimeKey {
  return !!k && k in REGIME_INFO;
}

export const MONTHS = [
  "Январь", "Февраль", "Март", "Апрель", "Май", "Июнь",
  "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь",
];

export interface CalculateInput {
  regimeKey: RegimeKey;
  /** выручка без НДС */
  revenue: number;
  otherIncome: number;
  cogs: number;
  /** начисленная зарплата (до удержаний) */
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
  /** удерживается из зарплаты, не расход компании */
  withheld: { socialEmployee: number; pit: number };
  totalDirect: number; totalIndirect: number;
  details: Record<string, number>;
  regimeName: string;
  vatInRev: number; revExclVat: number;
  regimeKey: RegimeKey;
}

const pctLabel = (r: number) => `${Number((r * 100).toPrecision(3)).toString().replace(".", ",")}%`;

/**
 * Налоги за период по введённым итогам. Тот же расчёт, что и начисление из
 * журнала (lib/ledger/taxes.ts), — только база берётся из полей формы.
 */
export function calculate(input: CalculateInput): CalculateResult {
  const {
    regimeKey, revenue, otherIncome, cogs, salaries, rent,
    sellingExp, adminExp, otherOpExp, interestExp, otherNonOp,
    investInc, cashPct, patentAmount,
  } = input;
  const info = REGIME_INFO[regimeKey] ?? REGIME_INFO.general;

  const totalRevenue = revenue + otherIncome;
  const social = salaries * SOCIAL_EMPLOYER;
  const fotFull = salaries + social;
  const withheld = { socialEmployee: salaries * SOCIAL_EMPLOYEE, pit: Math.max(0, salaries - salaries * SOCIAL_EMPLOYEE) * PIT_RATE };

  let vat = 0, salesTaxAmt = 0, incomeTax = 0;
  const details: Record<string, number> = {};
  if (salaries > 0) details[`Страховые взносы работодателя ${pctLabel(SOCIAL_EMPLOYER)}`] = social;

  if (info.kind === "general") {
    salesTaxAmt = totalRevenue * (info.salesTax ?? 0);
    details[`Налог с продаж ${pctLabel(info.salesTax ?? 0)} — ст. 368`] = salesTaxAmt;
  }

  const adminTotal = adminExp + fotFull + rent + salesTaxAmt;
  const totalOpExp = sellingExp + adminTotal;
  const grossProfit = revenue - cogs;
  const otherOpNet = otherIncome - otherOpExp;
  const ebit = grossProfit + otherOpNet - totalOpExp;
  const nonOpNet = investInc - interestExp + otherNonOp;
  const ebt = ebit + nonOpNet;

  if (info.kind === "general") {
    vat = totalRevenue * VAT_RATE;
    incomeTax = Math.max(0, ebt) * INCOME_TAX;
    details[`Налог на прибыль ${pctLabel(INCOME_TAX)} — ст. 240`] = incomeTax;
    details[`НДС ${pctLabel(VAT_RATE)} с реализации — ст. 254 (косвенный)`] = vat;
  } else if (info.kind === "unified" || info.kind === "ecommerce") {
    const [cr, nr] = info.rates!;
    if (cr === nr) {
      incomeTax = totalRevenue * cr;
      details[`${info.kind === "ecommerce" ? "Налог на электронную торговлю" : "Единый налог"} ${pctLabel(cr)} — ${info.article}`] = incomeTax;
    } else {
      const cTax = (totalRevenue * cashPct) / 100 * cr;
      const nTax = totalRevenue * (1 - cashPct / 100) * nr;
      incomeTax = cTax + nTax;
      details[`Единый налог, наличные ${pctLabel(cr)} — ${info.article}`] = cTax;
      details[`Единый налог, безналичные ${pctLabel(nr)} — ${info.article}`] = nTax;
    }
  } else if (info.kind === "patent") {
    incomeTax = patentAmount;
    details[`Патент — ${info.article}`] = patentAmount;
  }

  const totalDirect = incomeTax + social + salesTaxAmt;
  const totalIndirect = vat;
  const netProfit = ebt - incomeTax;
  const profitability = totalRevenue > 0 ? (netProfit / totalRevenue) * 100 : 0;
  const vatInRev = 0; // revenue is entered without VAT
  const revExclVat = totalRevenue;

  return {
    totalRevenue, revenue, otherIncome, cogs, salaries, social, fotFull,
    rent, sellingExp, adminExp, adminTotal, otherOpExp,
    interestExp, otherNonOp, investInc, totalOpExp, grossProfit,
    otherOpNet, ebit, nonOpNet, ebt,
    incomeTax, netProfit, profitability,
    vat, salesTax: salesTaxAmt, withheld,
    totalDirect, totalIndirect, details,
    regimeName: info.name,
    vatInRev, revExclVat, regimeKey,
  };
}

export function compareRegimes(
  base: Omit<CalculateInput, "regimeKey" | "otherOpExp" | "interestExp" | "otherNonOp" | "investInc" | "cashPct" | "patentAmount">
    & Partial<Pick<CalculateInput, "cashPct" | "patentAmount" | "otherOpExp" | "interestExp" | "otherNonOp" | "investInc">>
): Array<{ key: RegimeKey; name: string; net: number; tax: number; pct: number; note?: string }> {
  return (Object.keys(REGIME_INFO) as RegimeKey[])
    .filter((rk) => rk !== "patent" || (base.patentAmount ?? 0) > 0)
    .map((rk) => {
      const fr = calculate({
        otherOpExp: 0, interestExp: 0, otherNonOp: 0, investInc: 0,
        cashPct: 70, patentAmount: 0,
        ...base, regimeKey: rk,
      });
      return { key: rk, name: REGIMES[rk], net: fr.netProfit, tax: fr.totalDirect, pct: fr.profitability, note: REGIME_INFO[rk].note };
    })
    .sort((a, b) => b.net - a.net);
}

export function breakEven(fr: CalculateResult): number {
  const variable = fr.cogs + fr.sellingExp;
  const fixed = fr.adminTotal + fr.incomeTax;
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
  const taxF = REGIME_INFO[fr.regimeKey]?.kind === "general" ? Math.max(0, ebtF) * INCOME_TAX : fr.incomeTax * g;
  const netF = ebtF - taxF;
  return { revenue: revF, cogs: cogsF, opex: opexF, ebt: ebtF, tax: taxF, net: netF, pct: revF > 0 ? (netF / revF) * 100 : 0 };
}

export function validateInputs(revenue: number, cogs: number, salaries: number): string[] {
  const warns: string[] = [];
  if (revenue < 0) warns.push("Выручка не может быть отрицательной");
  if (cogs < 0) warns.push("Себестоимость не может быть отрицательной");
  if (salaries < 0) warns.push("Зарплата не может быть отрицательной");
  if (cogs > revenue * 1.5 && revenue > 0) {
    warns.push("Себестоимость более чем в 1,5 раза превышает выручку — проверьте цифры");
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
