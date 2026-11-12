// ════════════════════════════════════════════════════════════════════════
// lib/assets/types.ts — карточка основного средства (НМА) и нормы.
//
// Бухгалтерская амортизация — по учётной политике (МСФО (IAS) 16 / 38):
// линейный метод или метод уменьшаемого остатка, с месяца, следующего за
// вводом в эксплуатацию. Налоговая — по ст. 225–229 НК КР от 18.01.2022 № 3:
// шесть групп, метод уменьшаемого остатка по стоимости группы на конец года.
// ════════════════════════════════════════════════════════════════════════

export type BookMethod = "straight" | "declining";
export type TaxGroup = 1 | 2 | 3 | 4 | 5 | 6;

export interface FixedAsset {
  id: string;
  name: string;
  inventoryNo: string;
  /** счёт учёта: 2130 здания, 2140 оборудование … 29xx НМА */
  account: string;
  /** счёт расходов на амортизацию: 7150 производство, 7580 продажи, 8470 администрация, 8480 НМА */
  expenseAccount: string;
  /** налоговая группа по ст. 226 НК КР; null — не амортизируется (земля) или ниже порога */
  taxGroup: TaxGroup | null;
  acquiredAt: string;   // YYYY-MM-DD
  inServiceAt: string;  // YYYY-MM-DD
  cost: number;         // первоначальная стоимость, сом
  residual: number;     // ликвидационная стоимость, сом
  lifeMonths: number;   // срок полезного использования
  method: BookMethod;
  /** амортизация, накопленная до начала учёта в программе, и на какую дату (для перенесённых объектов) */
  openingAccumulated: number;
  openingDate: string | null;
  location: string;
  responsible: string;
  supplier: string;
  disposedAt: string | null;
  /** выручка от продажи (0 — списание без продажи) */
  disposalProceeds: number;
  disposalReason: string;
  note: string;
}

/** Счёт накопленной амортизации для счёта учёта (контрсчёт по Пост. № 231). */
export const ACCUMULATED: Record<string, string> = {
  "2130": "2193", "2140": "2194", "2150": "2195", "2160": "2196", "2170": "2197", "2180": "2198", "2190": "2199",
  "2910": "2991", "2930": "2993", "2940": "2994", "2950": "2995", "2960": "2996", "2970": "2997", "2980": "2998",
};

/** Объекты, которые не амортизируются: земля, незавершённое строительство, гудвил (тестируется на обесценение). */
export const NOT_DEPRECIATED = new Set(["2110", "2120", "2920", "2990"]);

export const ASSET_ACCOUNTS: Array<{ code: string; title: string; group: TaxGroup | null; life: number; expense: string }> = [
  { code: "2130", title: "Здания и сооружения", group: 5, life: 600, expense: "8470" },
  { code: "2140", title: "Машины и оборудование", group: 2, life: 120, expense: "7150" },
  { code: "2150", title: "Компьютеры и оргтехника", group: 1, life: 48, expense: "8470" },
  { code: "2160", title: "Мебель и инвентарь", group: 2, life: 84, expense: "8470" },
  { code: "2170", title: "Транспортные средства", group: 1, life: 84, expense: "8470" },
  { code: "2180", title: "Улучшения арендованного имущества", group: 3, life: 60, expense: "8470" },
  { code: "2190", title: "Благоустройство участков", group: 3, life: 180, expense: "8470" },
  { code: "2110", title: "Земля (не амортизируется)", group: null, life: 0, expense: "8470" },
  { code: "2960", title: "Программное обеспечение (НМА)", group: 2, life: 36, expense: "8480" },
  { code: "2970", title: "Лицензии (НМА)", group: 2, life: 60, expense: "8480" },
  { code: "2930", title: "Патенты (НМА)", group: 2, life: 120, expense: "8480" },
  { code: "2940", title: "Товарные знаки (НМА)", group: 2, life: 120, expense: "8480" },
  { code: "2950", title: "Авторские права (НМА)", group: 2, life: 120, expense: "8480" },
  { code: "2910", title: "Франшизы (НМА)", group: 2, life: 60, expense: "8480" },
  { code: "2980", title: "Прочие НМА", group: 2, life: 60, expense: "8480" },
];

export const EXPENSE_ACCOUNTS: Array<{ code: string; title: string }> = [
  { code: "7150", title: "Производство (в себестоимость)" },
  { code: "7580", title: "Продажи (коммерческие расходы)" },
  { code: "8470", title: "Администрация (основные средства)" },
  { code: "8480", title: "Администрация (нематериальные активы)" },
];

/** Ст. 226 п. 1 НК КР: предельные нормы амортизации по группам. */
export const TAX_GROUPS: Record<TaxGroup, { rate: number; title: string }> = {
  1: { rate: 0.30, title: "Легковые автомобили, компьютеры, оргтехника, инструменты" },
  2: { rate: 0.25, title: "Грузовые и прочие автотранспортные средства, машины и оборудование, мебель, нематериальные активы" },
  3: { rate: 0.20, title: "Прочие основные средства" },
  4: { rate: 0.15, title: "Воздушный, железнодорожный, водный и прочий неавтомобильный транспорт" },
  5: { rate: 0.10, title: "Здания, сооружения, помещения (по каждому объекту)" },
  6: { rate: 0.50, title: "Затраты и активы, связанные с недропользованием" },
};

/** Ст. 225 п. 1, 5 НК КР: амортизируемое имущество — от 100 расчётных показателей. */
export const THRESHOLD_RP = 100;
/** Расчётный показатель, сом — можно изменить на странице, если его пересмотрят. */
export const DEFAULT_RP_SOM = 100;
/** Ст. 229 п. 2: расходы на ремонт — не более 15 % стоимости группы на начало года. */
export const REPAIR_CAP = 0.15;
/** Ст. 226 п. 3: здания после 20 лет эксплуатации — равномерно по 20 % в год. */
export const BUILDING_YEARS = 20;
export const BUILDING_LATE_RATE = 0.2;

export const BOOK_METHOD: Record<BookMethod, string> = {
  straight: "линейный",
  declining: "уменьшаемого остатка (удвоенная норма)",
};

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n = (v: unknown, d = 0) => { const x = Number(v); return Number.isFinite(x) ? x : d; };
const s = (v: unknown, max = 300) => (typeof v === "string" ? v.trim().slice(0, max) : "");
const date = (v: unknown) => (typeof v === "string" && ISO.test(v) ? v : null);

/** Accept anything from the client; return a valid card or a list of problems. */
export function normalizeAsset(raw: any, id: string): { asset: FixedAsset | null; errors: string[] } {
  const errors: string[] = [];
  const account = s(raw?.account, 10);
  const meta = ASSET_ACCOUNTS.find((a) => a.code === account);
  if (!meta) errors.push("Выберите вид объекта");
  const name = s(raw?.name, 200);
  if (!name) errors.push("Укажите наименование");
  const acquiredAt = date(raw?.acquiredAt);
  const inServiceAt = date(raw?.inServiceAt) ?? acquiredAt;
  if (!acquiredAt) errors.push("Укажите дату приобретения");
  const cost = Math.round(n(raw?.cost) * 100) / 100;
  if (!(cost > 0)) errors.push("Первоначальная стоимость должна быть больше нуля");
  const residual = Math.max(0, Math.round(n(raw?.residual) * 100) / 100);
  if (residual >= cost && cost > 0) errors.push("Ликвидационная стоимость должна быть меньше первоначальной");
  const depreciable = meta && !NOT_DEPRECIATED.has(account);
  const lifeMonths = depreciable ? Math.round(n(raw?.lifeMonths, meta!.life)) : 0;
  if (depreciable && !(lifeMonths >= 1 && lifeMonths <= 1200)) errors.push("Срок полезного использования — от 1 до 1200 месяцев");
  const openingAccumulated = Math.max(0, Math.round(n(raw?.openingAccumulated) * 100) / 100);
  const openingDate = date(raw?.openingDate);
  if (openingAccumulated > 0 && !openingDate) errors.push("Укажите, на какую дату известна накопленная амортизация");
  if (openingAccumulated > cost - residual + 0.005) errors.push("Накопленная амортизация больше амортизируемой стоимости");
  const disposedAt = date(raw?.disposedAt);
  if (disposedAt && inServiceAt && disposedAt < inServiceAt) errors.push("Дата выбытия раньше ввода в эксплуатацию");
  const tg = n(raw?.taxGroup, NaN);
  const taxGroup = (raw?.taxGroup === null || raw?.taxGroup === "" ) ? null : ([1, 2, 3, 4, 5, 6].includes(tg) ? (tg as TaxGroup) : meta?.group ?? null);
  const expense = s(raw?.expenseAccount, 10);
  if (errors.length) return { asset: null, errors };
  return {
    errors,
    asset: {
      id, name, account, inventoryNo: s(raw?.inventoryNo, 40),
      expenseAccount: EXPENSE_ACCOUNTS.some((e) => e.code === expense) ? expense : meta!.expense,
      taxGroup: account === "2110" ? null : taxGroup,
      acquiredAt: acquiredAt!, inServiceAt: inServiceAt!, cost, residual, lifeMonths,
      method: raw?.method === "declining" ? "declining" : "straight",
      openingAccumulated, openingDate: openingAccumulated > 0 ? openingDate : null,
      location: s(raw?.location), responsible: s(raw?.responsible), supplier: s(raw?.supplier),
      disposedAt, disposalProceeds: Math.max(0, Math.round(n(raw?.disposalProceeds) * 100) / 100),
      disposalReason: s(raw?.disposalReason), note: s(raw?.note, 1000),
    },
  };
}
