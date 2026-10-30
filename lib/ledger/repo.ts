// ════════════════════════════════════════════════════════════════════════
// lib/ledger/repo.ts — the only place that turns Prisma rows into engine
// data and back. API routes call these; the engine never sees Prisma.
// ════════════════════════════════════════════════════════════════════════

import type { Prisma, PrismaClient } from "@prisma/client";
import { prisma } from "@/lib/db";
import type { RegimeKey } from "@/lib/tax-engine";
import { partyFromRaw } from "@/lib/bank-parser";
import { bankTxToLines } from "./posting";
import { isRegimeKey } from "./taxes";
import type { EntrySource, LedgerEntry, LedgerLine } from "./types";

type Db = PrismaClient | Prisma.TransactionClient;

const entryInclude = { lines: true } satisfies Prisma.JournalEntryInclude;
type EntryRow = Prisma.JournalEntryGetPayload<{ include: typeof entryInclude }>;

export function toIsoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export function fromIsoDate(s: string): Date {
  return new Date(`${s}T00:00:00.000Z`);
}

export function toLedgerEntry(row: EntryRow): LedgerEntry {
  return {
    id: row.id,
    date: toIsoDate(row.date),
    description: row.description,
    source: row.source as EntrySource,
    sourceRef: row.sourceRef,
    bankTransactionId: row.bankTransactionId,
    lines: row.lines.map((l) => ({
      account: l.accountCode,
      debit: Number(l.debit),
      credit: Number(l.credit),
      memo: l.memo,
      ...(l.party ? { party: l.party } : {}),
      ...(l.partyInn ? { partyInn: l.partyInn } : {}),
    })),
  };
}

/** Everything up to `to` — earlier entries are needed for opening balances. */
export async function loadEntries(companyId: string, to?: string): Promise<LedgerEntry[]> {
  const rows = await prisma.journalEntry.findMany({
    where: { companyId, ...(to ? { date: { lte: fromIsoDate(to) } } : {}) },
    include: entryInclude,
    orderBy: [{ date: "asc" }, { createdAt: "asc" }],
  });
  return rows.map(toLedgerEntry);
}

export interface NewEntry {
  companyId: string;
  date: string;
  description: string;
  source: EntrySource;
  sourceRef?: string | null;
  bankTransactionId?: string | null;
  lines: LedgerLine[];
}

export async function createEntry(db: Db, e: NewEntry) {
  return db.journalEntry.create({
    data: {
      companyId: e.companyId,
      date: fromIsoDate(e.date),
      description: e.description,
      source: e.source,
      sourceRef: e.sourceRef ?? null,
      bankTransactionId: e.bankTransactionId ?? null,
      lines: {
        create: e.lines.map((l) => ({
          accountCode: l.account,
          debit: l.debit,
          credit: l.credit,
          memo: l.memo ?? null,
          party: l.party?.trim() || null,
          partyInn: l.partyInn?.replace(/\D/g, "") || null,
        })),
      },
    },
    include: entryInclude,
  });
}

/** The statement's payer/recipient goes on the non-bank lines (not on taxes). */
function withParty(lines: LedgerLine[], raw: unknown, amount: number): LedgerLine[] {
  const p = partyFromRaw(raw, amount);
  if (!p) return lines;
  return lines.map((l) => (/^1[12]\d\d/.test(l.account) || /^34/.test(l.account) ? l : { ...l, party: p.party || null, partyInn: p.partyInn || null }));
}

export async function companyRegime(companyId: string): Promise<{ regime: RegimeKey | null; patentAmount: number }> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { defaultRegime: true, patentAmount: true } });
  return { regime: isRegimeKey(c?.defaultRegime) ? c!.defaultRegime as RegimeKey : null, patentAmount: c?.patentAmount ?? 0 };
}

/**
 * Creates journal entries for bank transactions that don't have one yet
 * (optionally only for one import batch). Returns how many were posted.
 */
export async function postBankTransactions(companyId: string, importBatch?: string): Promise<number> {
  const { regime } = await companyRegime(companyId);
  const pending = await prisma.bankTransaction.findMany({
    where: { companyId, journalEntry: null, ...(importBatch ? { importBatch } : {}) },
    orderBy: { txDate: "asc" },
  });
  let posted = 0;
  for (const tx of pending) {
    const lines = withParty(bankTxToLines({ amount: tx.amount, description: tx.description, category: tx.category }, regime), tx.rawRow, tx.amount);
    if (lines.length === 0) continue;
    await createEntry(prisma, {
      companyId,
      date: toIsoDate(tx.txDate),
      description: tx.description || "Банковская операция",
      source: "bank",
      bankTransactionId: tx.id,
      lines,
    });
    posted++;
  }
  return posted;
}

/** Re-posts one bank transaction after its category changed. */
export async function repostBankTransaction(bankTransactionId: string): Promise<void> {
  const tx = await prisma.bankTransaction.findUnique({ where: { id: bankTransactionId } });
  if (!tx) return;
  const { regime } = await companyRegime(tx.companyId);
  const lines = withParty(bankTxToLines({ amount: tx.amount, description: tx.description, category: tx.category }, regime), tx.rawRow, tx.amount);
  await prisma.$transaction(async (db) => {
    await db.journalEntry.deleteMany({ where: { bankTransactionId } });
    if (lines.length > 0) {
      await createEntry(db, {
        companyId: tx.companyId,
        date: toIsoDate(tx.txDate),
        description: tx.description || "Банковская операция",
        source: "bank",
        bankTransactionId: tx.id,
        lines,
      });
    }
  });
}

export async function countUnpostedBankTx(companyId: string, from: string, to: string): Promise<number> {
  return prisma.bankTransaction.count({
    where: { companyId, journalEntry: null, txDate: { gte: fromIsoDate(from), lte: fromIsoDate(to) } },
  });
}
