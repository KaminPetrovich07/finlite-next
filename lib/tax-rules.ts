// Which edition of the tax rules the program implements, and when it was last
// checked. Each change to rates or regimes in lib/tax-engine.ts gets a new
// entry here (newest first). The admin panel warns when a review is overdue.
import { INCOME_TAX, PIT_RATE, REGIME_INFO, SALES_TAX, SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER, VAT_RATE, type RegimeKey } from "@/lib/tax-engine";

export interface TaxRulesVersion {
  version: string; // YYYY-MM-DD — date of the latest law taken into account
  law: string;
  reviewed: string; // YYYY-MM — when the rates were last checked against the Code
  changes: string[];
}

export const TAX_RULES_HISTORY: TaxRulesVersion[] = [
  {
    version: "2026-08-06",
    law: "Налоговый кодекс Кыргызской Республики от 18.01.2022 № 3 в ред. Закона КР от 06.08.2026 № 145",
    reviewed: "2026-08",
    changes: [
      "Ставки единого налога по ст. 423 (торговля, производство, услуги, общепит, швейная и текстильная отрасль, иностранные лица, ИП)",
      "Налог с продаж 1 % / 2 % по ст. 368 для общего режима",
      "Налог на электронную торговлю 2 %",
      "Страховые взносы 2,25 % работодатель + 10 % работник",
      "Удалён несуществующий в Кодексе режим «упрощённый 2 %»",
    ],
  },
];

export const TAX_RULES = TAX_RULES_HISTORY[0];
export const REVIEW_EVERY_MONTHS = 3;

/** true when the last check is older than REVIEW_EVERY_MONTHS. */
export function reviewOverdue(now = new Date(), v = TAX_RULES): boolean {
  const [y, m] = v.reviewed.split("-").map(Number);
  const due = new Date(Date.UTC(y, m - 1 + REVIEW_EVERY_MONTHS, 1));
  return now.getTime() >= due.getTime();
}

export interface TaxParameter { name: string; value: string; article: string }

const pct = (x: number) => `${(x * 100).toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`;

/** Every rate the program uses, with the article it comes from — for the /tax-rules page. */
export function taxParameters(): TaxParameter[] {
  const out: TaxParameter[] = [
    { name: "НДС", value: pct(VAT_RATE), article: "ст. 254 НК КР" },
    { name: "Налог на прибыль", value: pct(INCOME_TAX), article: "ст. 240 НК КР" },
    { name: "Подоходный налог (удерживается с работника)", value: pct(PIT_RATE), article: "ст. 197 НК КР" },
    { name: "Налог с продаж (общий режим, базовая ставка)", value: pct(SALES_TAX), article: "ст. 368 НК КР" },
    { name: "Страховые взносы работодателя", value: pct(SOCIAL_EMPLOYER), article: "Закон КР о тарифах страховых взносов" },
    { name: "Страховые взносы работника", value: pct(SOCIAL_EMPLOYEE), article: "Закон КР о тарифах страховых взносов" },
  ];
  for (const k of Object.keys(REGIME_INFO) as RegimeKey[]) {
    const r = REGIME_INFO[k];
    if (r.rates) out.push({ name: r.name, value: r.rates[0] === r.rates[1] ? pct(r.rates[0]) : `${pct(r.rates[0])} наличные / ${pct(r.rates[1])} безналичные`, article: r.article });
    else if (r.kind === "patent") out.push({ name: r.name, value: "по ставке Кабинета Министров", article: r.article });
  }
  return out;
}
