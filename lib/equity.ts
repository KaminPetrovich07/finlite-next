// ════════════════════════════════════════════════════════════════════════
// lib/equity.ts — port of EQUITY_ROWS in app.py (ФОСАМК Ф.№4)
// ════════════════════════════════════════════════════════════════════════

export interface EquityRow {
  code: number;
  label: string;
  isTotal: boolean;
}

export const EQUITY_ROWS: EquityRow[] = [
  { code: 10, label: "Сальдо на начало", isTotal: true },
  { code: 20, label: "Изм. учётной политики / исправление ошибок", isTotal: false },
  { code: 30, label: "Пересчитанное сальдо", isTotal: true },
  { code: 50, label: "— прирост от переоценки имущества", isTotal: false },
  { code: 60, label: "— прирост от переоценки инвестиций", isTotal: false },
  { code: 70, label: "— курсовые разницы", isTotal: false },
  { code: 80, label: "Чистая прибыль (убытки) за отчётный период", isTotal: false },
  { code: 90, label: "Дивиденды", isTotal: false },
  { code: 100, label: "Эмиссия акций", isTotal: false },
  { code: 110, label: "Ограничение прибыли к распределению", isTotal: false },
  { code: 120, label: "Сальдо на конец", isTotal: true },
];

export const EQUITY_COLUMNS = ["Уставный капитал", "Прочий капитал", "Нераспред. прибыль", "Итого"] as const;
export type EquityColumn = (typeof EQUITY_COLUMNS)[number];

/** key is `${code}:${columnIndex}` */
export type EquityValues = Record<string, number>;

export function equityKey(code: number, colIndex: number): string {
  return `${code}:${colIndex}`;
}

/** Default seed: net profit auto-fills row 80 in "Нераспред. прибыль" and "Итого" columns, same as app.py. */
export function defaultEquityValues(netProfit: number): EquityValues {
  return {
    [equityKey(80, 2)]: netProfit, // Нераспред. прибыль
    [equityKey(80, 3)]: netProfit, // Итого
  };
}
