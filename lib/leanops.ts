// ════════════════════════════════════════════════════════════════════════
// lib/leanops.ts — port of the "🏭 LeanOps" tab (app.py lean_t1..lean_t4,
// ~lines 1857-2092). Three independent calculators + a combined dashboard.
// ════════════════════════════════════════════════════════════════════════

// ── 1. Учёт остатков (stock / waste / defects) ─────────────────────────────

export interface StockLossInputs {
  rawIn: number; rawPrice: number; rawUsed: number; wipQty: number;
  wasteQty: number; defectQty: number;
  prodOut: number; prodPrice: number; prodSold: number; prodStock: number;
  wastePrice: number; defectPrice: number;
}

export interface StockLossResult {
  rawRemain: number; rawCostTotal: number;
  wasteValue: number; defectValue: number; prodValue: number;
  soldRevenue: number; stockValue: number; wipValue: number;
  lossWaste: number; lossDefect: number; lossTotal: number; lossPct: number;
  wasteQty: number; defectQty: number;
}

export function computeStockLoss(i: StockLossInputs): StockLossResult {
  const rawCostTotal = i.rawIn * i.rawPrice;
  const wasteValue = i.wasteQty * i.wastePrice;
  const defectValue = i.defectQty * i.defectPrice;
  const lossWaste = i.wasteQty * i.rawPrice;
  const lossDefect = i.defectQty * i.rawPrice;
  const lossTotal = lossWaste + lossDefect;
  const lossPct = rawCostTotal > 0 ? (lossTotal / rawCostTotal) * 100 : 0;
  const prodValue = i.prodOut * i.prodPrice;
  const soldRevenue = i.prodSold * i.prodPrice;
  const stockValue = i.prodStock * i.prodPrice;
  const wipValue = i.wipQty * i.rawPrice * 0.5;
  const rawRemain = i.rawIn - i.rawUsed - i.wasteQty;
  return {
    rawRemain, rawCostTotal, wasteValue, defectValue, prodValue, soldRevenue, stockValue, wipValue,
    lossWaste, lossDefect, lossTotal, lossPct, wasteQty: i.wasteQty, defectQty: i.defectQty,
  };
}

// ── 2. Аудит потерь (7 видов муда) ──────────────────────────────────────────

export const MUDA_CATEGORIES = [
  { key: "overproduction", name: "1. Перепроизводство", desc: "Производите больше чем нужно прямо сейчас?", rec: "Внедрите канбан — производство по фактическому заказу (вытягивающая система)" },
  { key: "waiting", name: "2. Ожидание", desc: "Простои оборудования, работников, ожидание материалов?", rec: "Выравнивание загрузки (хейдзунка): равномерный план по дням и сменам" },
  { key: "transport", name: "3. Лишние перемещения", desc: "Ненужные перевозки материалов между операциями?", rec: "Перепланировка цеха по карте потока создания ценности" },
  { key: "overprocessing", name: "4. Излишняя обработка", desc: "Операции не добавляющие ценность для клиента?", rec: "Стандартизация процессов" },
  { key: "inventory", name: "5. Избыточные запасы", desc: "Сырьё, незавершённое производство или готовая продукция сверх нормы?", rec: "Поставки «точно вовремя»: закупать под план, а не впрок" },
  { key: "motion", name: "6. Лишние движения", desc: "Поиск инструментов, нерациональное расположение?", rec: "Система 5S: порядок и постоянные места для инструмента" },
  { key: "defects", name: "7. Дефекты и брак", desc: "Брак, переделки, возвраты?", rec: "Защита от ошибок (пока-ёкэ): шаблоны, упоры, чек-листы на операциях" },
] as const;

export type MudaKey = (typeof MUDA_CATEGORIES)[number]["key"];
export type MudaScores = Record<MudaKey, number>;

export function defaultMudaScores(): MudaScores {
  return Object.fromEntries(MUDA_CATEGORIES.map((c) => [c.key, 3])) as MudaScores;
}

export interface Maturity { level: "high" | "mid" | "low" | "critical"; name: string; desc: string }

export function maturityFor(leanIdx: number): Maturity {
  if (leanIdx >= 80) return { level: "high", name: "Зрелое производство", desc: "Процессы оптимизированы. Переходите к постоянным улучшениям (кайдзен): короткие ежедневные разборы, предложения сотрудников." };
  if (leanIdx >= 60) return { level: "mid", name: "Развивающееся", desc: "Устраните три главные потери из списка приоритетов ниже." };
  if (leanIdx >= 40) return { level: "low", name: "Начальный уровень", desc: "Начните с системы 5S и карты потока создания ценности." };
  return { level: "critical", name: "Критическое", desc: "Нужен полный аудит потерь на производстве." };
}

export interface MudaResult { leanIdx: number; avg: number; maturity: Maturity }

export function computeMudaIndex(scores: MudaScores): MudaResult {
  const values = Object.values(scores);
  const avg = values.reduce((s, v) => s + v, 0) / values.length;
  const leanIdx = Math.max(0, 100 - avg * 10);
  return { leanIdx, avg, maturity: maturityFor(leanIdx) };
}

export function top3Priorities(scores: MudaScores): Array<{ key: MudaKey; name: string; score: number; rec: string }> {
  return MUDA_CATEGORIES
    .map((c) => ({ key: c.key, name: c.name, score: scores[c.key], rec: c.rec }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 3);
}

// ── 3. Юнит-экономика ────────────────────────────────────────────────────

export const SALES_CHANNELS = {
  "Прямые продажи": 0.0,
  "Wildberries/Ozon (24%)": 0.24,
  "SATU.kg (8%)": 0.08,
  "Instagram (5%)": 0.05,
  "Оптовик (-20%)": 0.20,
  "Сайт (3%)": 0.03,
} as const;
export type SalesChannel = keyof typeof SALES_CHANNELS;

/** Short labels for the channel-comparison table (matches app.py's separate COMM_ALL dict). */
export const SALES_CHANNELS_SHORT = {
  "Прямые": 0.0, "Wildberries/Ozon": 0.24, "SATU.kg": 0.08, "Instagram": 0.05, "Оптовик": 0.20, "Сайт": 0.03,
} as const;

export interface UnitEconomicsInputs {
  raw: number; labor: number; overhead: number; wasteLoss: number;
  price: number; channel: SalesChannel; delivery: number; pack: number; qty: number;
}

export interface UnitEconomicsResult {
  cogsUnit: number; commission: number; totalCost: number;
  marginUnit: number; marginPct: number; revenueMonth: number; profitMonth: number;
  commRate: number;
}

export function computeUnitEconomics(i: UnitEconomicsInputs): UnitEconomicsResult {
  const cogsUnit = i.raw + i.labor + i.overhead + i.wasteLoss;
  const commRate = SALES_CHANNELS[i.channel];
  const commission = i.price * commRate;
  const totalCost = cogsUnit + i.delivery + i.pack + commission;
  const marginUnit = i.price - totalCost;
  const marginPct = i.price > 0 ? (marginUnit / i.price) * 100 : 0;
  return {
    cogsUnit, commission, totalCost, marginUnit, marginPct,
    revenueMonth: i.price * i.qty, profitMonth: marginUnit * i.qty, commRate,
  };
}

export function channelComparison(
  price: number, cogsUnit: number, delivery: number, pack: number
): Array<{ channel: string; commission: number; margin: number; marginPct: number }> {
  if (price <= 0) return [];
  return Object.entries(SALES_CHANNELS_SHORT).map(([channel, rate]) => {
    const commission = price * rate;
    const margin = price - cogsUnit - commission - delivery - pack;
    return { channel, commission, margin, marginPct: (margin / price) * 100 };
  });
}

/** Unit-economics waterfall: price → costs (negative) → margin (total). Mirrors the calculate-fr waterfall pattern. */
export function unitEconomicsWaterfallSteps(i: UnitEconomicsInputs, r: UnitEconomicsResult) {
  return [
    { label: "Цена", value: i.price, isTotal: true },
    { label: "− Сырьё", value: -i.raw, isTotal: false },
    { label: "− Труд", value: -i.labor, isTotal: false },
    { label: "− Накладные", value: -i.overhead, isTotal: false },
    { label: "− Отходы и брак", value: -i.wasteLoss, isTotal: false },
    { label: "− Комиссия канала", value: -r.commission, isTotal: false },
    { label: "− Доставка", value: -i.delivery, isTotal: false },
    { label: "− Упаковка", value: -i.pack, isTotal: false },
    { label: "= Маржа с единицы", value: r.marginUnit, isTotal: true },
  ];
}
