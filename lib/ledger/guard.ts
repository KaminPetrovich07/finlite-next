// ════════════════════════════════════════════════════════════════════════
// lib/ledger/guard.ts — the one gate every write to the journal passes.
//
// Hooked into the Prisma client (lib/db.ts), so no route can forget it:
//   1. Period lock. A company may forbid changes to entries dated on or
//      before Company.lockedThrough. Creating, changing or deleting such an
//      entry — by hand, from a bank statement, ESF, 1C, payroll, assets,
//      stock, FX, taxes or the period close — is refused with HTTP 423.
//      Deleting a bank statement row would cascade to its entry, so it is
//      checked too.
//   2. History. Every create / change / delete of an entry is written to
//      EntryEvent with who did it and a snapshot before and after. A bulk
//      import is one event. The record is written through the same
//      transaction as the change, so a rolled-back change leaves no trace.
//
// Interactive transactions: lib/db.ts runs the callback of
// prisma.$transaction(async (tx) => …) inside `dbContext` with the tx
// client, so the lookups and the history rows here go through the same
// transaction (and the same connection — no deadlock on a pool of one).
// ════════════════════════════════════════════════════════════════════════

import { AsyncLocalStorage } from "node:async_hooks";
import { HttpError } from "@/lib/http-error";
import { dmy, isLocked, isoDay, snapshotOf, type Snapshot } from "@/lib/ledger/history";
export { isLocked, isoDay, snapshotOf, describeChange, type Snapshot, type SnapLine } from "@/lib/ledger/history";

export interface DbContext {
  /** the interactive-transaction client, when inside prisma.$transaction(fn) */
  tx?: unknown;
  /** the caller writes its own history event (e.g. editing an entry) */
  silent?: boolean;
}
export const dbContext = new AsyncLocalStorage<DbContext>();

/** Runs `fn` with automatic history events switched off (lock checks stay on). */
export function quietly<T>(fn: () => Promise<T>): Promise<T> {
  return dbContext.run({ ...dbContext.getStore(), silent: true }, fn);
}

// ── period lock ─────────────────────────────────────────────────────────

export class PeriodLockedError extends HttpError {
  constructor(public through: string, public date: string) {
    super(423, `Период по ${dmy(through)} закрыт для изменений, а операция датирована ${dmy(date)}. ` +
      `Исправление проведите сторнировочной проводкой в открытом периоде или попросите владельца компании снять запрет на странице «Закрытие месяца».`);
  }
}

/** Throws for the first (company, date) pair that falls into a locked period. */
export function assertOpen(pairs: Array<{ companyId: string; date: Date | string }>, locks: Map<string, Date | string | null>): void {
  for (const p of pairs) {
    const through = locks.get(p.companyId);
    if (isLocked(p.date, through)) throw new PeriodLockedError(isoDay(through!), isoDay(p.date));
  }
}

// ── the Prisma hook ─────────────────────────────────────────────────────

type AnyClient = any; // eslint-disable-line @typescript-eslint/no-explicit-any
type AnyArgs = any; // eslint-disable-line @typescript-eslint/no-explicit-any

async function actor(): Promise<{ id: string | null; name: string | null }> {
  try {
    const { getCurrentUser } = await import("@/lib/auth/session");
    const u = await getCurrentUser();
    return u ? { id: u.id, name: u.name?.trim() || u.email } : { id: null, name: null };
  } catch {
    return { id: null, name: null };
  }
}

const companyOf = (data: AnyArgs): string | undefined => data?.companyId ?? data?.company?.connect?.id;

export function withJournalGuard<C>(base: C): C {
  const b = base as AnyClient;
  /** inside prisma.$transaction(fn) — the tx client, otherwise the plain one */
  const db = (): AnyClient => (dbContext.getStore()?.tx as AnyClient) ?? b;
  const silent = () => !!dbContext.getStore()?.silent;

  async function locksFor(companyIds: Iterable<string>): Promise<Map<string, Date | null>> {
    const ids = [...new Set([...companyIds].filter(Boolean))];
    if (!ids.length) return new Map();
    const rows: Array<{ id: string; lockedThrough: Date | null }> = await db().company.findMany({ where: { id: { in: ids } }, select: { id: true, lockedThrough: true } });
    return new Map(rows.map((r) => [r.id, r.lockedThrough]));
  }
  async function check(pairs: Array<{ companyId: string; date: Date | string }>) {
    if (!pairs.length) return;
    assertOpen(pairs, await locksFor(pairs.map((p) => p.companyId)));
  }
  async function existing(where: AnyArgs) {
    return db().journalEntry.findMany({ where, include: { lines: true } }) as Promise<Array<AnyArgs>>;
  }
  async function record(events: Array<Record<string, unknown>>) {
    if (silent() || !events.length) return;
    const who = await actor();
    await db().entryEvent.createMany({ data: events.map((e) => ({ userId: who.id, userName: who.name, ...e })) });
  }
  const ev = (action: string, row: AnyArgs, before: Snapshot | null, after: Snapshot | null, note?: string) => ({
    companyId: row.companyId, entryId: row.id, action, source: row.source, entryDate: new Date(`${isoDay(row.date)}T00:00:00.000Z`),
    // empty side is simply left out (database NULL): Prisma.JsonNull from another client bundle would be stored as {}
    ...(before ? { before } : {}), ...(after ? { after } : {}), ...(note ? { note } : {}),
  });

  return b.$extends({
    name: "fl-journal-guard",
    query: {
      journalEntry: {
        async create({ args, query }: AnyArgs) {
          const companyId = companyOf(args.data);
          if (companyId && args.data?.date) await check([{ companyId, date: args.data.date }]);
          const who = await actor();
          args.data = { createdById: who.id, createdByName: who.name, ...args.data };
          const res = await query(args);
          if (!silent() && res?.id) {
            const row = await db().journalEntry.findUnique({ where: { id: res.id }, include: { lines: true } });
            if (row) await record([ev("create", row, null, snapshotOf(row))]);
          }
          return res;
        },
        async createMany({ args, query }: AnyArgs) {
          const data: AnyArgs[] = Array.isArray(args.data) ? args.data : [args.data];
          await check(data.filter((d) => companyOf(d) && d.date).map((d) => ({ companyId: companyOf(d)!, date: d.date })));
          const who = await actor();
          args.data = data.map((d) => ({ createdById: who.id, createdByName: who.name, ...d }));
          const res = await query(args);
          const byCompany = new Map<string, AnyArgs[]>();
          for (const d of data) { const c = companyOf(d); if (c) (byCompany.get(c) ?? byCompany.set(c, []).get(c)!).push(d); }
          await record([...byCompany].map(([companyId, ds]) => {
            const dates = ds.map((d) => isoDay(d.date)).sort();
            return { companyId, action: "import", source: ds[0]?.source ?? null, entryDate: new Date(`${dates[0]}T00:00:00.000Z`), note: `Загружено проводок: ${ds.length}, даты ${dmy(dates[0])} – ${dmy(dates[dates.length - 1])}` };
          }));
          return res;
        },
        async update({ args, query }: AnyArgs) {
          const before = await existing(args.where);
          await check([...before.map((r) => ({ companyId: r.companyId, date: r.date })), ...(args.data?.date && before[0] ? [{ companyId: before[0].companyId, date: args.data.date }] : [])]);
          const res = await query(args);
          if (!silent() && before[0]) {
            const after = await db().journalEntry.findUnique({ where: { id: before[0].id }, include: { lines: true } });
            if (after) await record([ev("update", after, snapshotOf(before[0]), snapshotOf(after))]);
          }
          return res;
        },
        async updateMany({ args, query }: AnyArgs) {
          const before = await existing(args.where);
          await check([...before.map((r) => ({ companyId: r.companyId, date: r.date })), ...(args.data?.date ? before.map((r) => ({ companyId: r.companyId, date: args.data.date })) : [])]);
          const res = await query(args);
          if (!silent() && before.length) {
            const after = await existing({ id: { in: before.map((r) => r.id) } });
            const map = new Map(after.map((r) => [r.id, r]));
            await record(before.filter((r) => map.has(r.id)).map((r) => ev("update", map.get(r.id), snapshotOf(r), snapshotOf(map.get(r.id)))));
          }
          return res;
        },
        async upsert({ args, query }: AnyArgs) {
          const before = await existing(args.where);
          const c = companyOf(args.create);
          await check([...before.map((r) => ({ companyId: r.companyId, date: r.date })), ...(c && args.create?.date ? [{ companyId: c, date: args.create.date }] : [])]);
          return query(args);
        },
        async delete({ args, query }: AnyArgs) {
          const before = await existing(args.where);
          await check(before.map((r) => ({ companyId: r.companyId, date: r.date })));
          const res = await query(args);
          await record(before.map((r) => ev("delete", r, snapshotOf(r), null)));
          return res;
        },
        async deleteMany({ args, query }: AnyArgs) {
          const before = await existing(args.where ?? {});
          await check(before.map((r) => ({ companyId: r.companyId, date: r.date })));
          const res = await query(args);
          await record(before.map((r) => ev("delete", r, snapshotOf(r), null)));
          return res;
        },
      },
      journalLine: {
        // lines are added to new entries through the nested create of journalEntry (not hooked here);
        // a top-level line write touches an existing entry — check its date
        async create({ args, query }: AnyArgs) {
          const id = args.data?.entryId ?? args.data?.entry?.connect?.id;
          if (id) await check((await db().journalEntry.findMany({ where: { id }, select: { companyId: true, date: true } })));
          return query(args);
        },
        async createMany({ args, query }: AnyArgs) {
          const data: AnyArgs[] = Array.isArray(args.data) ? args.data : [args.data];
          const ids = [...new Set(data.map((d) => d.entryId).filter(Boolean))];
          if (ids.length) await check(await db().journalEntry.findMany({ where: { id: { in: ids } }, select: { companyId: true, date: true } }));
          return query(args);
        },
        async update(p: AnyArgs) { return lineChange(p); },
        async updateMany(p: AnyArgs) { return lineChange(p); },
        async upsert(p: AnyArgs) { return lineChange(p); },
        async delete(p: AnyArgs) { return lineChange(p); },
        async deleteMany(p: AnyArgs) { return lineChange(p); },
      },
      bankTransaction: {
        // deleting a statement row deletes its entry (onDelete: Cascade) — the database does that, so check here
        async delete(p: AnyArgs) { return bankDelete(p); },
        async deleteMany(p: AnyArgs) { return bankDelete(p); },
      },
    },
  }) as C;

  async function lineChange({ args, query }: AnyArgs) {
    const lines: Array<{ entryId: string }> = await db().journalLine.findMany({ where: args.where ?? {}, select: { entryId: true } });
    const ids = [...new Set(lines.map((l) => l.entryId))];
    const before = ids.length ? await existing({ id: { in: ids } }) : [];
    await check(before.map((r) => ({ companyId: r.companyId, date: r.date })));
    const res = await query(args);
    if (!silent() && before.length) {
      const after = await existing({ id: { in: ids } });
      const map = new Map(after.map((r) => [r.id, r]));
      await record(before.filter((r) => map.has(r.id)).map((r) => ev("update", map.get(r.id), snapshotOf(r), snapshotOf(map.get(r.id)))));
    }
    return res;
  }

  async function bankDelete({ args, query }: AnyArgs) {
    const txs: Array<{ companyId: string; txDate: Date; journalEntry: AnyArgs | null }> = await db().bankTransaction.findMany({
      where: args.where ?? {}, select: { companyId: true, txDate: true, journalEntry: { include: { lines: true } } },
    });
    await check(txs.flatMap((t) => [{ companyId: t.companyId, date: t.txDate }, ...(t.journalEntry ? [{ companyId: t.companyId, date: t.journalEntry.date }] : [])]));
    const res = await query(args);
    await record(txs.filter((t) => t.journalEntry).map((t) => ev("delete", t.journalEntry, snapshotOf(t.journalEntry), null, "удалена строка банковской выписки")));
    return res;
  }
}

/** Writes one history event explicitly (for callers that run `quietly`). */
export async function recordEntryEvent(db: AnyClient, e: { companyId: string; entryId?: string | null; action: string; source?: string | null; entryDate?: Date | string | null; before?: Snapshot | null; after?: Snapshot | null; note?: string | null }) {
  const who = await actor();
  await db.entryEvent.create({
    data: {
      companyId: e.companyId, entryId: e.entryId ?? null, action: e.action, source: e.source ?? null,
      entryDate: e.entryDate ? new Date(`${isoDay(e.entryDate)}T00:00:00.000Z`) : null,
      ...(e.before ? { before: e.before as object } : {}), ...(e.after ? { after: e.after as object } : {}), note: e.note ?? null,
      userId: who.id, userName: who.name,
    },
  });
}
