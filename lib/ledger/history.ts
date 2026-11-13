// Journal history and period lock — pure helpers shared by the server guard
// (lib/ledger/guard.ts) and the pages (no database, no Node APIs).


export const isoDay = (d: Date | string): string => (typeof d === "string" ? d.slice(0, 10) : d.toISOString().slice(0, 10));
export const dmy = (iso: string) => iso.split("-").reverse().join(".");

/** True when an entry dated `date` falls into the locked part of the books. */
export function isLocked(date: Date | string, lockedThrough: Date | string | null | undefined): boolean {
  return !!lockedThrough && isoDay(date) <= isoDay(lockedThrough);
}

export interface SnapLine { account: string; debit: number; credit: number; memo?: string | null; party?: string | null; partyInn?: string | null; item?: string | null; qty?: number | null; unit?: string | null; currency?: string | null; amountCur?: number | null }
export interface Snapshot { date: string; description: string; source: string; sourceRef?: string | null; lines: SnapLine[] }

const num = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v));

/** Entry row (with lines) → plain JSON stored in the history. */
export function snapshotOf(row: {
  date: Date | string; description: string; source: string; sourceRef?: string | null;
  lines?: Array<{ accountCode: string; debit: unknown; credit: unknown; memo?: string | null; party?: string | null; partyInn?: string | null; item?: string | null; qty?: unknown; unit?: string | null; currency?: string | null; amountCur?: unknown }>;
}): Snapshot {
  return {
    date: isoDay(row.date), description: row.description, source: row.source, sourceRef: row.sourceRef ?? null,
    lines: (row.lines ?? []).map((l) => {
      const out: SnapLine = { account: l.accountCode, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0 };
      if (l.memo) out.memo = l.memo;
      if (l.party) out.party = l.party;
      if (l.partyInn) out.partyInn = l.partyInn;
      if (l.item) out.item = l.item;
      if (num(l.qty) !== null) out.qty = num(l.qty);
      if (l.unit) out.unit = l.unit;
      if (l.currency) out.currency = l.currency;
      if (num(l.amountCur) !== null) out.amountCur = num(l.amountCur);
      return out;
    }),
  };
}

/** What changed between two snapshots — short human-readable lines for the history view. */
export function describeChange(before: Snapshot | null | undefined, after: Snapshot | null | undefined): string[] {
  if (!before || !after) return [];
  const out: string[] = [];
  if (before.date !== after.date) out.push(`дата: ${dmy(before.date)} → ${dmy(after.date)}`);
  if (before.description !== after.description) out.push(`содержание: «${before.description}» → «${after.description}»`);
  const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).replace(/\u00a0|\u202f/g, " ");
  const key = (l: SnapLine) => `${l.debit > 0 ? "Дт" : "Кт"} ${l.account} ${money(l.debit || l.credit)}`;
  const extra = (l: SnapLine) => [l.party, l.item, l.memo].filter(Boolean).join(" · ");
  const b = before.lines.map((l) => `${key(l)}${extra(l) ? ` (${extra(l)})` : ""}`);
  const a = after.lines.map((l) => `${key(l)}${extra(l) ? ` (${extra(l)})` : ""}`);
  const removed = b.filter((x) => !a.includes(x));
  const added = a.filter((x) => !b.includes(x));
  for (const x of removed) out.push(`убрано: ${x}`);
  for (const x of added) out.push(`добавлено: ${x}`);
  return out;
}
