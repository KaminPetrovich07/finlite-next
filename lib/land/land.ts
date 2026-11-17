// ════════════════════════════════════════════════════════════════════════
// lib/land/land.ts — реестр земельных участков компании и расчёт налога.
//
// По НК КР (2022) налог на землю входит в налог на имущество. Налоговая
// стоимость 1 м² = БНС × Ки (ст. 400): БНС — по таблице ст. 401 ч. 2
// (по области, району и виду угодий; редакция Закона № 37 от 12.02.2025,
// с 01.01.2026), Ки — коэффициент инфляции, его ежегодно утверждает
// налоговый орган. Налоговая база — площадь по правоудостоверяющему
// документу (ст. 401).
// Значения БНС, Ки и ставку бухгалтер вводит из кодекса и приказа ГНС:
// программа не подставляет их сама и показывает, откуда что взято.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

export type LandCategory = "agri" | "settlement" | "nonagri";
export type AgriType = "irrigated" | "rainfed" | "perennial" | "hay" | "pasture" | "other";
export type LandRight = "own" | "lease" | "use";

export const CATEGORY: Record<LandCategory, string> = {
  agri: "Сельскохозяйственные угодья",
  settlement: "Земли населённых пунктов",
  nonagri: "Земли несельскохозяйственного назначения",
};
export const AGRI_TYPE: Record<AgriType, string> = {
  irrigated: "орошаемая пашня", rainfed: "богарная пашня", perennial: "многолетние насаждения", hay: "сенокосы", pasture: "пастбища", other: "залежи и прочие",
};
export const RIGHT: Record<LandRight, string> = { own: "собственность", lease: "аренда", use: "бессрочное пользование" };

export interface Parcel {
  id: string;
  eni: string;               // код ЕНИ (единый номер недвижимости)
  name: string;              // как называют участок в компании
  category: LandCategory;
  agriType?: AgriType;
  region: string; district: string; address: string;
  areaM2: number;
  purpose: string;           // целевое назначение по документу
  right: LandRight;
  docKind: string; docNumber: string; docDate: string;   // госакт, договор аренды…
  leaseTo?: string;          // окончание аренды
  leaseRentYear?: number | null; // арендная плата в год, сом
  /** параметры налога, введённые из НК КР и приказа ГНС */
  bns?: number | null;       // базовая налоговая стоимость 1 м², сом
  ki?: number | null;        // коэффициент инфляции
  ratePct?: number | null;   // ставка налога, %
  taxNote?: string;          // откуда взяты значения (статья, приказ)
  exempt?: boolean;          // освобождён (ст. 410–411) — основание в taxNote
  notes?: string;
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export interface ParcelTax { taxValue: number | null; tax: number | null; missing: Array<"bns" | "ki" | "rate"> }

/** Налоговая стоимость участка = площадь × БНС × Ки; сумма налога = стоимость × ставка %. */
export function parcelTax(p: Parcel): ParcelTax {
  const missing: ParcelTax["missing"] = [];
  if (p.bns == null) missing.push("bns");
  if (p.ki == null) missing.push("ki");
  if (p.ratePct == null) missing.push("rate");
  if (p.exempt) return { taxValue: p.bns != null && p.ki != null ? r2(p.areaM2 * p.bns * p.ki) : null, tax: 0, missing: [] };
  const taxValue = p.bns != null && p.ki != null ? r2(p.areaM2 * p.bns * p.ki) : null;
  const tax = taxValue != null && p.ratePct != null ? r2((taxValue * p.ratePct) / 100) : null;
  return { taxValue, tax, missing };
}

export interface LandIssue { id: string; level: "risk" | "watch"; text: string; vars?: Record<string, string | number> }

const days = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 864e5);

/** Что проверить: аренда истекла или скоро истекает, нет документа, не заданы параметры налога, повтор кода ЕНИ. */
export function landIssues(list: Parcel[], today: string): LandIssue[] {
  const out: LandIssue[] = [];
  const seen = new Map<string, string>();
  for (const p of list) {
    if (p.right === "lease" && p.leaseTo) {
      const d = days(today, p.leaseTo);
      if (d < 0) out.push({ id: p.id, level: "risk", text: "Аренда «{name}» закончилась {date}", vars: { name: p.name, date: p.leaseTo.split("-").reverse().join(".") } });
      else if (d <= 90) out.push({ id: p.id, level: "watch", text: "Аренда «{name}» заканчивается через {n} дн. — продлите договор", vars: { name: p.name, n: d } });
    }
    if (!p.docNumber) out.push({ id: p.id, level: "watch", text: "У участка «{name}» не указан правоудостоверяющий документ", vars: { name: p.name } });
    if (!p.eni) out.push({ id: p.id, level: "watch", text: "У участка «{name}» не указан код ЕНИ", vars: { name: p.name } });
    else if (seen.has(p.eni)) out.push({ id: p.id, level: "risk", text: "Код ЕНИ {eni} повторяется: «{a}» и «{b}»", vars: { eni: p.eni, a: seen.get(p.eni)!, b: p.name } });
    else seen.set(p.eni, p.name);
    if (!p.exempt && parcelTax(p).missing.length) out.push({ id: p.id, level: "watch", text: "Для участка «{name}» не заданы параметры налога (БНС, Ки или ставка)", vars: { name: p.name } });
  }
  return out;
}

export interface LandSummary { count: number; areaHa: number; byCategory: Array<{ category: LandCategory; count: number; areaHa: number; tax: number }>; tax: number; taxKnown: boolean; leaseRentYear: number }

export function landSummary(list: Parcel[]): LandSummary {
  const ha = (m2: number) => Math.round((m2 / 10_000) * 10_000) / 10_000;
  const byCategory = (Object.keys(CATEGORY) as LandCategory[]).map((category) => {
    const ps = list.filter((p) => p.category === category);
    return { category, count: ps.length, areaHa: ha(ps.reduce((s, p) => s + p.areaM2, 0)), tax: r2(ps.reduce((s, p) => s + (parcelTax(p).tax ?? 0), 0)) };
  }).filter((x) => x.count > 0);
  return {
    count: list.length, areaHa: ha(list.reduce((s, p) => s + p.areaM2, 0)), byCategory,
    tax: r2(list.reduce((s, p) => s + (parcelTax(p).tax ?? 0), 0)), taxKnown: list.every((p) => parcelTax(p).tax != null),
    leaseRentYear: r2(list.filter((p) => p.right === "lease").reduce((s, p) => s + (p.leaseRentYear ?? 0), 0)),
  };
}

/** Тексты для перевода (кыргызский словарь). */
export const LAND_TEXTS = [
  ...Object.values(CATEGORY), ...Object.values(AGRI_TYPE), ...Object.values(RIGHT),
  "Аренда «{name}» закончилась {date}", "Аренда «{name}» заканчивается через {n} дн. — продлите договор",
  "У участка «{name}» не указан правоудостоверяющий документ", "У участка «{name}» не указан код ЕНИ",
  "Код ЕНИ {eni} повторяется: «{a}» и «{b}»", "Для участка «{name}» не заданы параметры налога (БНС, Ки или ставка)",
];
