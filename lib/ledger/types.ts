// ════════════════════════════════════════════════════════════════════════
// lib/ledger/types.ts — plain data shapes shared by the engine, API and UI.
// No Prisma types here: the engine must stay testable without a database.
// ════════════════════════════════════════════════════════════════════════

export type EntrySource = "opening" | "manual" | "bank" | "tax" | "closing" | "payroll" | "demo";

export const SOURCE_LABEL: Record<EntrySource, string> = {
  opening: "Начальные остатки",
  manual: "Ручная проводка",
  bank: "Банковская выписка",
  tax: "Начисление налогов",
  closing: "Закрытие периода",
  payroll: "Начисление зарплаты",
  demo: "Демо",
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
