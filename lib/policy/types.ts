// ════════════════════════════════════════════════════════════════════════
// lib/policy/types.ts — учётная политика компании: варианты и значения.
//
// Каждый вариант снабжён ссылкой на норму, из которой он следует:
//   ПП № 231 — постановление Правительства КР от 07.10.2010 № 231
//             (Положение о документообороте; Инструкция к плану счетов);
//   ПП № 609 — постановление Правительства КР от 11.11.2013 № 609
//             (Правила учёта и отчётности субъектов малого предпринимательства);
//   ПП № 281 — постановление Правительства КР от 12.06.2018 № 281
//             (Порядок ведения кассовых операций);
//   МСФО для МСП — IFRS for SMEs Accounting Standard.
// ════════════════════════════════════════════════════════════════════════

export type Framework = "sme609" | "ifrs_sme" | "ifrs";
export type OrgForm = "chief" | "accountant" | "outsourcing" | "director";
export type Activity = "trade" | "production" | "services" | "construction" | "agri";
export type DepMethod = "straight" | "declining" | "units" | "tax";
export type PpeModel = "cost" | "revaluation";
export type CostFormula = "fifo" | "wavg" | "specific";
export type CostingMethod = "actual" | "normative" | "job" | "process";
export type OverheadBase = "materials" | "labor" | "machineHours" | "output";
export type AllowanceMethod = "aging" | "specific" | "none";
export type CashCount = "monthly" | "quarterly" | "yearly";
export type CashReport = "daily" | "every3to5";

export interface Signatory { role: string; name: string; scope: string }

export interface PolicyInput {
  // реквизиты приказа
  legalForm: string;
  inn: string;
  city: string;
  director: string;
  directorTitle: string;
  chiefAccountant: string;
  orderNumber: string;
  orderDate: string;     // ГГГГ-ММ-ДД
  effectiveFrom: string; // ГГГГ-ММ-ДД

  // организация учёта
  framework: Framework;
  orgForm: OrgForm;
  activities: Activity[];
  vatPayer: boolean;

  // основные средства и НМА
  ppeThreshold: number;        // сом
  ppeModel: PpeModel;
  depMethod: DepMethod;
  lifeBuildings: number;       // лет
  lifeEquipment: number;
  lifeComputers: number;
  lifeFurniture: number;
  lifeVehicles: number;
  lifeIntangibles: number;

  // запасы
  costFormula: CostFormula;
  transportInCost: boolean;
  lowValueThreshold: number;   // МБП, сом за единицу

  // производство (если activities включает production/construction/agri)
  costingMethod: CostingMethod;
  overheadBase: OverheadBase;

  // расчёты
  allowanceMethod: AllowanceMethod;
  allowance90: number;   // % резерва по долгам старше 90 дней
  allowance180: number;
  allowance365: number;
  vacationProvision: boolean;
  materialityPct: number; // % валюты баланса

  // касса и инвентаризация
  cashBookElectronic: boolean;
  cashReport: CashReport;
  cashCount: CashCount;
  inventoryDate: string;  // «01.12» — дата ежегодной инвентаризации
  signatories: Signatory[];
}

export const FRAMEWORK: Record<Framework, { label: string; hint: string; basis: string; basisWith: string }> = {
  sme609: {
    label: "Правила для малого предпринимательства (ПП № 609)",
    hint: "Выручка не выше порога регистрации по НДС или единый налог. Упрощённый план счетов, баланс + ОПиУ + примечания.",
    basis: "Правила ведения бухгалтерского учёта и отчётности субъектов малого предпринимательства, утверждённые постановлением Правительства КР от 11.11.2013 № 609; по вопросам, не урегулированным Правилами, — МСФО для МСП (п. 65 Правил)",
    basisWith: "Правилами ведения бухгалтерского учёта и отчётности субъектов малого предпринимательства, утверждёнными постановлением Правительства КР от 11.11.2013 № 609",
  },
  ifrs_sme: {
    label: "МСФО для малых и средних предприятий",
    hint: "Компания без публичной подотчётности. Четыре формы отчётности и примечания.",
    basis: "Международные стандарты финансовой отчётности для малых и средних предприятий (МСФО для МСП), применяемые в Кыргызской Республике в соответствии с Законом КР «О бухгалтерском учёте»",
    basisWith: "Международными стандартами финансовой отчётности для малых и средних предприятий (МСФО для МСП)",
  },
  ifrs: {
    label: "Полные МСФО",
    hint: "Публичные компании, банки, страховщики и другие организации, обязанные применять полные МСФО.",
    basis: "Международные стандарты финансовой отчётности (МСФО), применяемые в Кыргызской Республике в соответствии с Законом КР «О бухгалтерском учёте»",
    basisWith: "Международными стандартами финансовой отчётности (МСФО)",
  },
};

export const ORG_FORM: Record<OrgForm, string> = {
  chief: "бухгалтерской службой во главе с главным бухгалтером",
  accountant: "штатным бухгалтером",
  outsourcing: "специализированной организацией (бухгалтером-специалистом) по договору",
  director: "лично руководителем",
};

export const ACTIVITY: Record<Activity, string> = {
  trade: "торговля",
  production: "производство",
  services: "услуги",
  construction: "строительство",
  agri: "сельское хозяйство",
};

export const DEP_METHOD: Record<DepMethod, string> = {
  straight: "равномерный (линейный) метод",
  declining: "метод уменьшаемого остатка",
  units: "метод единиц производства (пропорционально объёму продукции)",
  tax: "по нормам налогового законодательства КР",
};

export const COST_FORMULA: Record<CostFormula, string> = {
  fifo: "по методу ФИФО («первая партия на приход — первая в расход»)",
  wavg: "по средневзвешенной себестоимости",
  specific: "по себестоимости каждой единицы (индивидуальная идентификация)",
};

export const COSTING_METHOD: Record<CostingMethod, string> = {
  actual: "по фактической себестоимости",
  normative: "нормативным методом (по нормам с учётом отклонений)",
  job: "позаказным методом",
  process: "попередельным (попроцессным) методом",
};

export const OVERHEAD_BASE: Record<OverheadBase, string> = {
  materials: "пропорционально стоимости прямых материалов",
  labor: "пропорционально оплате труда производственных рабочих",
  machineHours: "пропорционально машино-часам работы оборудования",
  output: "пропорционально объёму выпуска в натуральном выражении",
};

export const CASH_COUNT: Record<CashCount, string> = { monthly: "ежемесячно", quarterly: "ежеквартально", yearly: "не реже одного раза в год" };

export function defaultPolicy(c: { name: string; inn?: string | null; regime?: string | null; activity?: string | null }): PolicyInput {
  const today = new Date();
  const iso = today.toISOString().slice(0, 10);
  const nextYear = `${today.getFullYear() + 1}-01-01`;
  const legal = /^ИП\b/i.test(c.name) ? "ИП" : /^ОАО\b/i.test(c.name) ? "ОАО" : /^ЗАО\b/i.test(c.name) ? "ЗАО" : "ОсОО";
  const act = (c.activity ?? "").toLowerCase();
  const activities: Activity[] = [];
  if (/произв|цех|мебел|пошив|швей/.test(act) || c.regime === "unified_production") activities.push("production");
  if (/торг|магазин|оптов|рознич/.test(act) || (c.regime ?? "").startsWith("unified_trade")) activities.push("trade");
  if (/строит/.test(act)) activities.push("construction");
  if (/сельхоз|ферм|агро/.test(act)) activities.push("agri");
  if (activities.length === 0) activities.push("services");
  const general = c.regime === "general";
  return {
    legalForm: legal,
    inn: c.inn ?? "",
    city: "г. Бишкек",
    director: "",
    directorTitle: legal === "ИП" ? "Индивидуальный предприниматель" : "Директор",
    chiefAccountant: "",
    orderNumber: "1",
    orderDate: iso,
    effectiveFrom: nextYear,
    framework: general ? "ifrs_sme" : "sme609",
    orgForm: legal === "ИП" ? "director" : "accountant",
    activities,
    vatPayer: general,
    ppeThreshold: 20000,
    ppeModel: "cost",
    depMethod: "straight",
    lifeBuildings: 30,
    lifeEquipment: 7,
    lifeComputers: 3,
    lifeFurniture: 7,
    lifeVehicles: 5,
    lifeIntangibles: 3,
    costFormula: activities.includes("trade") ? "wavg" : "fifo",
    transportInCost: true,
    lowValueThreshold: 5000,
    costingMethod: "actual",
    overheadBase: "labor",
    allowanceMethod: "aging",
    allowance90: 25,
    allowance180: 50,
    allowance365: 100,
    vacationProvision: false,
    materialityPct: 2,
    cashBookElectronic: true,
    cashReport: "daily",
    cashCount: "quarterly",
    inventoryDate: "01.12",
    signatories: [
      { role: legal === "ИП" ? "Индивидуальный предприниматель" : "Директор", name: "", scope: "все первичные документы, договоры, денежные и расчётные документы" },
      { role: "Главный бухгалтер (бухгалтер)", name: "", scope: "денежные и расчётные документы, кассовые ордера, платёжные ведомости, акты сверки" },
      { role: "Кассир", name: "", scope: "приходные и расходные кассовые ордера, кассовая книга" },
      { role: "Заведующий складом", name: "", scope: "приходные ордера, накладные на отпуск материалов, акты приёмки" },
    ],
  };
}

const NUM = { min: 0, max: 1e12 };

/** Keeps only known fields with the right types; unknown or broken values fall back to `base`. */
export function normalizePolicy(raw: unknown, base: PolicyInput): PolicyInput {
  const r = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const out = { ...base } as Record<string, unknown>;
  for (const [k, def] of Object.entries(base)) {
    const v = r[k];
    if (v === undefined) continue;
    if (typeof def === "number") {
      const n = Number(v);
      if (Number.isFinite(n) && n >= NUM.min && n <= NUM.max) out[k] = n;
    } else if (typeof def === "boolean") out[k] = Boolean(v);
    else if (typeof def === "string") out[k] = String(v).slice(0, 300);
    else if (k === "activities" && Array.isArray(v)) {
      const a = v.filter((x): x is Activity => typeof x === "string" && x in ACTIVITY);
      if (a.length) out[k] = Array.from(new Set(a));
    } else if (k === "signatories" && Array.isArray(v)) {
      out[k] = v.slice(0, 12).map((s) => ({
        role: String((s as Signatory)?.role ?? "").slice(0, 120),
        name: String((s as Signatory)?.name ?? "").slice(0, 120),
        scope: String((s as Signatory)?.scope ?? "").slice(0, 300),
      })).filter((s) => s.role);
    }
  }
  const p = out as unknown as PolicyInput;
  const enumOk = <T extends string>(v: string, rec: Record<T, unknown>, d: T): T => (v in rec ? (v as T) : d);
  p.framework = enumOk(p.framework, FRAMEWORK, base.framework);
  p.orgForm = enumOk(p.orgForm, ORG_FORM, base.orgForm);
  p.depMethod = enumOk(p.depMethod, DEP_METHOD, base.depMethod);
  p.costFormula = enumOk(p.costFormula, COST_FORMULA, base.costFormula);
  p.costingMethod = enumOk(p.costingMethod, COSTING_METHOD, base.costingMethod);
  p.overheadBase = enumOk(p.overheadBase, OVERHEAD_BASE, base.overheadBase);
  p.cashCount = enumOk(p.cashCount, CASH_COUNT, base.cashCount);
  if (!["cost", "revaluation"].includes(p.ppeModel)) p.ppeModel = base.ppeModel;
  if (!["aging", "specific", "none"].includes(p.allowanceMethod)) p.allowanceMethod = base.allowanceMethod;
  if (!["daily", "every3to5"].includes(p.cashReport)) p.cashReport = base.cashReport;
  for (const k of ["allowance90", "allowance180", "allowance365", "materialityPct"] as const) p[k] = Math.min(100, p[k]);
  for (const k of ["orderDate", "effectiveFrom"] as const) if (!/^\d{4}-\d{2}-\d{2}$/.test(p[k])) p[k] = base[k];
  if (!/^\d{2}\.\d{2}$/.test(p.inventoryDate)) p.inventoryDate = base.inventoryDate;
  return p;
}

export const hasProduction = (p: PolicyInput) => p.activities.some((a) => a === "production" || a === "construction" || a === "agri");
