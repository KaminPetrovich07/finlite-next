// ════════════════════════════════════════════════════════════════════════
// lib/categories.ts
// Категории для классификации банковских транзакций. Набор ориентирован
// на малый/средний бизнес КР — соотносится с укрупнёнными статьями ОПУ
// (см. OPU_ROWS в app.py: себестоимость, ФОТ, аренда, адм. расходы и т.д.),
// чтобы категоризированные транзакции потом можно было агрегировать прямо
// в существующие строки отчёта.
// ════════════════════════════════════════════════════════════════════════

export const INCOME_CATEGORIES = [
  "Выручка от продаж",
  "Прочие операционные доходы",
  "Доходы от инвестиций",
  "Возврат от поставщика",
  "Прочие доходы",
] as const;

export const EXPENSE_CATEGORIES = [
  "Себестоимость / закупка товара",
  "Зарплата",
  "Аренда",
  "Коммунальные услуги",
  "Связь и интернет",
  "Транспорт и логистика",
  "Реклама и маркетинг",
  "Налоги и сборы",
  "Банковские комиссии",
  "Кредиты и проценты",
  "Канцелярия и хозрасходы",
  "Профессиональные услуги (бухгалтер, юрист)",
  "Прочие операционные расходы",
] as const;

export const ALL_CATEGORIES = [...INCOME_CATEGORIES, ...EXPENSE_CATEGORIES, "Не определено"] as const;
export type Category = (typeof ALL_CATEGORIES)[number];

/**
 * Keyword → category map for the fast, free, offline first pass.
 * Lowercased substring match against the transaction description.
 * Only the unmatched remainder goes to the LLM (see lib/categorize.ts) —
 * keeps API cost down and keeps obvious cases deterministic/auditable.
 */
export const KEYWORD_RULES: Array<{ category: Category; keywords: string[] }> = [
  { category: "Зарплата", keywords: ["зарплата", "зп ", "заработная плата", "айлык"] },
  { category: "Аренда", keywords: ["аренда", "ижара", "арендная плата"] },
  { category: "Коммунальные услуги", keywords: ["коммунал", "электроэнерг", "водоканал", "теплосеть", "газ "] },
  { category: "Связь и интернет", keywords: ["мегаком", "beeline", "билайн", "o!", "интернет", "телеком"] },
  { category: "Налоги и сборы", keywords: ["налоговая", "гнс", "социальный фонд", "соцфонд", "пошлина"] },
  { category: "Банковские комиссии", keywords: ["комиссия", "обслуживание счета", "комиссия банка"] },
  { category: "Кредиты и проценты", keywords: ["кредит", "проценты по", "погашение займа"] },
  { category: "Транспорт и логистика", keywords: ["такси", "бензин", "азс", "логист", "доставка груза", "транспортн"] },
  { category: "Реклама и маркетинг", keywords: ["реклама", "маркетинг", "instagram", "facebook ads", "таргет"] },
];

export function applyKeywordRules(description: string): Category | null {
  const lower = description.toLowerCase();
  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((kw) => lower.includes(kw))) return rule.category;
  }
  return null;
}
