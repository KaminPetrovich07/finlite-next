// Tariffs. Payment is by invoice (bank transfer in KGS); the administrator
// sets the plan and the paid-until date in the admin panel. Prices and limits
// live only here — the pricing page, the admin panel and the server-side
// guards all read this file.
//
// Older accounts may still hold "start" / "business" from the first price
// list: they are read as "pro" / "max" (see LEGACY).

export type PlanKey = "free" | "pro" | "max" | "premium" | "science" | "pilot";

/** What a plan unlocks beyond the company / entry limits. Checked on the server. */
export type Feature =
  | "bankImport"    // банковские выписки
  | "exchange1c"    // обмен с 1С
  | "exports"       // Word и Excel (PDF есть на всех тарифах)
  | "sharing"       // совместный доступ к компании
  | "esg"           // ESG-отчёт и бережливое производство
  | "packages"      // пакеты для аудитора и руководителя
  | "fixedAssets"   // основные средства и амортизация
  | "fx"            // валюта и курсовые разницы
  | "esf"           // загрузка ЭСФ
  | "budget"        // план-факт и прогноз денежных средств
  | "reminders"     // напоминания о сроках в Telegram и на почту
  | "industry"      // отраслевые расширения: банк, госсектор, страховщик
  | "talentContacts"// контакты специалистов в реестре
  | "publish"       // подача статей в «Новости и наука»
  | "priority";     // приоритетная поддержка

export interface Plan {
  key: PlanKey;
  name: string;
  priceKgs: number; // per month
  /** yearly price when paid at once (two months free) */
  priceYearKgs: number;
  tagline: string;
  companies: number; // how many companies a user may own
  entriesPerMonth: number | null; // journal entries per company per month; null — unlimited
  features: Feature[];
  /** bullet points for the pricing page */
  bullets: string[];
  public: boolean; // shown on the pricing page
  /** the plan is paid: without a paid-until date in the future it falls back to free */
  paid: boolean;
  /** who may get it — shown on the pricing page */
  audience?: string;
}

const BASE: Feature[] = ["bankImport", "exchange1c", "exports", "sharing"];
const MAX: Feature[] = [...BASE, "esg", "packages", "fixedAssets", "fx", "esf", "budget", "reminders", "talentContacts"];

export const PLANS: Record<PlanKey, Plan> = {
  free: {
    key: "free", name: "Бесплатно", priceKgs: 0, priceYearKgs: 0, paid: false, public: true,
    tagline: "Попробовать и вести одну небольшую компанию",
    companies: 1, entriesPerMonth: 150, features: [],
    bullets: ["1 компания", "До 150 проводок в месяц", "Журнал, баланс, ОПиУ, ОДДС, капитал", "Отчётность по МСФО без шифров счетов", "Налоговый калькулятор и отчёты ГНС", "Выгрузка в PDF", "Новости и наука — чтение и комментарии"],
  },
  pro: {
    key: "pro", name: "Про", priceKgs: 990, priceYearKgs: 9900, paid: true, public: true,
    tagline: "Бухгалтер или предприниматель с несколькими компаниями",
    companies: 3, entriesPerMonth: 2000, features: BASE,
    bullets: ["До 3 компаний", "До 2 000 проводок в месяц на компанию", "Банковские выписки и обмен с 1С", "Первичные документы, калькуляция, контрагенты", "Выгрузка в Word и Excel", "Совместный доступ для бухгалтера"],
  },
  max: {
    key: "max", name: "Макс", priceKgs: 2490, priceYearKgs: 24900, paid: true, public: true,
    tagline: "Аутсорс-бухгалтерия и растущий бизнес",
    companies: 10, entriesPerMonth: null, features: MAX,
    bullets: ["До 10 компаний", "Без ограничения проводок", "Всё из «Про»", "Основные средства, валюта, ЭСФ", "План-факт и прогноз денег", "Напоминания о сроках в Telegram", "ESG и пакеты для аудитора", "Контакты в реестре специалистов"],
  },
  premium: {
    key: "premium", name: "Премиум", priceKgs: 4990, priceYearKgs: 49900, paid: true, public: true,
    tagline: "Банки, страховщики, госсектор, аудиторские фирмы",
    companies: 50, entriesPerMonth: null, features: [...MAX, "industry", "priority"],
    bullets: ["До 50 компаний", "Всё из «Макс»", "Отраслевые расширения: банк, госсектор, страховщик", "Нормативы, стресс-тесты, МСФО (IFRS) 17", "Приоритетная поддержка и обучение команды"],
  },
  science: {
    key: "science", name: "Наука", priceKgs: 290, priceYearKgs: 2900, paid: true, public: true,
    tagline: "Студенты, преподаватели, исследователи",
    audience: "по подтверждению: студенческий билет, справка или почта вуза",
    companies: 3, entriesPerMonth: 500, features: [...BASE, "esg", "packages", "fixedAssets", "fx", "budget", "industry", "publish"],
    bullets: ["До 3 учебных компаний", "До 500 проводок в месяц", "Все разделы анализа, включая отраслевые", "Публикация статей в «Новости и наука»", "Данные для курсовых, дипломов и диссертаций"],
  },
  pilot: {
    key: "pilot", name: "Пилот", priceKgs: 0, priceYearKgs: 0, paid: false, public: false,
    tagline: "Участник пилота",
    companies: 5, entriesPerMonth: null, features: MAX,
    bullets: ["Все возможности тарифа «Макс» на время пилота", "Обратная связь напрямую с разработчиком"],
  },
};

/** Plan keys of the first price list. */
const LEGACY: Record<string, PlanKey> = { start: "pro", business: "max" };

export const PLAN_ORDER: PlanKey[] = ["free", "pro", "max", "premium", "science", "pilot"];

export const FEATURE_LABEL: Record<Feature, string> = {
  bankImport: "Банковские выписки", exchange1c: "Обмен с 1С", exports: "Выгрузка в Word и Excel", sharing: "Совместный доступ",
  esg: "ESG и бережливое производство", packages: "Пакеты для аудитора и руководителя", fixedAssets: "Основные средства",
  fx: "Валюта и курсовые разницы", esf: "Загрузка ЭСФ", budget: "План-факт и прогноз денег", reminders: "Напоминания о сроках",
  industry: "Отраслевые расширения", talentContacts: "Контакты специалистов", publish: "Публикация статей", priority: "Приоритетная поддержка",
};

export function planKey(key: string | null | undefined): PlanKey {
  const k = key ?? "free";
  if (k in PLANS) return k as PlanKey;
  return LEGACY[k] ?? "free";
}

export function planOf(key: string | null | undefined): Plan {
  return PLANS[planKey(key)];
}

/** A paid plan whose paid-until date has passed falls back to the free plan. */
export function effectivePlan(key: string | null | undefined, paidUntil: Date | string | null | undefined, now = new Date()): Plan {
  const p = planOf(key);
  if (p.paid && (!paidUntil || new Date(paidUntil).getTime() < now.getTime())) return PLANS.free;
  return p;
}

export function hasFeature(plan: Plan, f: Feature): boolean {
  return plan.features.includes(f);
}

/** The cheapest public plan that has the feature — for "перейдите на тариф …" messages. */
export function cheapestWith(f: Feature): Plan | null {
  return (["pro", "science", "max", "premium"] as PlanKey[]).map((k) => PLANS[k]).filter((p) => p.features.includes(f))
    .sort((a, b) => a.priceKgs - b.priceKgs)[0] ?? null;
}
