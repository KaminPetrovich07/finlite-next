// ════════════════════════════════════════════════════════════════════════
// lib/ledger/types.ts — plain data shapes shared by the engine, API and UI.
// No Prisma types here: the engine must stay testable without a database.
// ════════════════════════════════════════════════════════════════════════

export type EntrySource = "opening" | "manual" | "bank" | "tax" | "closing" | "payroll" | "demo" | "import1c" | "depreciation" | "asset" | "cogs" | "fx" | "esf";

export const SOURCE_LABEL: Record<EntrySource, string> = {
  opening: "Начальные остатки",
  manual: "Ручная проводка",
  bank: "Банковская выписка",
  tax: "Начисление налогов",
  closing: "Закрытие периода",
  payroll: "Начисление зарплаты",
  demo: "Демо",
  import1c: "Импорт из 1С",
  depreciation: "Амортизация",
  asset: "Основные средства",
  cogs: "Списание себестоимости",
  fx: "Курсовые разницы",
  esf: "ЭСФ",
};

export interface LedgerLine {
  account: string;
  debit: number;
  credit: number;
  memo?: string | null;
  /** контрагент по строке (субконто): наименование */
  party?: string | null;
  /** ИНН контрагента */
  partyInn?: string | null;
  /** номенклатура (материал, товар, продукция, объект ОС) */
  item?: string | null;
  /** количество в единицах `unit`; цена = сумма / количество */
  qty?: number | null;
  unit?: string | null;
  /** валюта и сумма в валюте (для валютных счетов и расчётов) */
  currency?: string | null;
  amountCur?: number | null;
}

export interface LedgerEntry {
  id: string;
  /** ISO date, YYYY-MM-DD */
  date: string;
  description: string;
  source: EntrySource;
  sourceRef?: string | null;
  bankTransactionId?: string | null;
  lines: LedgerLine[];
  /** who entered and who last changed the entry (from the database; absent in the demo) */
  createdByName?: string | null;
  createdAt?: string | null;
  updatedByName?: string | null;
  updatedAt?: string | null;
  /** how many scanned documents are attached (journal page only) */
  attachments?: number;
}

export interface Period {
  /** inclusive, YYYY-MM-DD */
  from: string;
  /** inclusive, YYYY-MM-DD */
  to: string;
}

export const EPS = 0.005;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}
