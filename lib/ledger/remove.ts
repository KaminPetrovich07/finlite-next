// ════════════════════════════════════════════════════════════════════════
// lib/ledger/remove.ts — удаление проводок (по одной и списком) и «Удалённые».
//
// Удалить можно любую проводку, кроме дат в закрытом периоде:
//  • вместе с продажей уходит автоматически списанная по ней себестоимость;
//  • проводка из выписки удаляется вместе со строкой выписки — иначе кнопка
//    «Провести операции из выписок» создала бы её снова.
// Каждое удаление уже записано в историю (EntryEvent) со снимком проводки —
// по нему «Удалённые» восстанавливают проводку с тем же номером.
// ════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { isLocked, isoDay, quietly, recordEntryEvent, type Snapshot } from "@/lib/ledger/guard";
import { snapshotOf } from "@/lib/ledger/history";
import { fromIsoDate } from "@/lib/ledger/repo";
import { normalizeUnit } from "@/lib/okei";
export { SOURCE_NOTE } from "@/lib/ledger/source-note";

export interface DeleteResult { deleted: number; locked: number; bankRows: number; cogs: number }

/**
 * Deletes the company's entries with these ids. Entries in a closed period are skipped (counted in `locked`).
 * A bank entry goes together with its statement row; a sale takes its automatic cost of goods with it.
 */
export async function deleteEntries(companyId: string, ids: string[]): Promise<DeleteResult> {
  const uniq = [...new Set(ids)].slice(0, 2000);
  if (!uniq.length) return { deleted: 0, locked: 0, bankRows: 0, cogs: 0 };
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } });
  if (!company) throw new HttpError(404, "Компания не найдена");
  const rows = await prisma.journalEntry.findMany({ where: { companyId, id: { in: uniq } }, select: { id: true, date: true, source: true, bankTransactionId: true } });
  const open = rows.filter((r) => !isLocked(r.date, company.lockedThrough));
  const locked = rows.length - open.length;
  if (!open.length) return { deleted: 0, locked, bankRows: 0, cogs: 0 };
  const bankTx = open.filter((r) => r.bankTransactionId).map((r) => r.bankTransactionId!);
  const plain = open.filter((r) => !r.bankTransactionId).map((r) => r.id);
  // себестоимость по удаляемым продажам (sourceRef «<id продажи>:<строка>»), если сама она не в списке
  const cogsRows = await prisma.journalEntry.findMany({
    where: { companyId, source: "cogs", OR: open.map((r) => ({ sourceRef: { startsWith: `${r.id}:` } })) },
    select: { id: true, date: true },
  });
  const cogsIds = cogsRows.filter((c) => !isLocked(c.date, company.lockedThrough) && !plain.includes(c.id)).map((c) => c.id);
  await prisma.$transaction(async (tx) => {
    if (plain.length || cogsIds.length) await tx.journalEntry.deleteMany({ where: { companyId, id: { in: [...plain, ...cogsIds] } } });
    if (bankTx.length) await tx.bankTransaction.deleteMany({ where: { companyId, id: { in: bankTx } } });
  });
  return { deleted: open.length, locked, bankRows: bankTx.length, cogs: cogsIds.length };
}

export interface TrashItem {
  eventId: string;
  entryId: string;
  deletedAt: string;
  deletedBy: string | null;
  note: string | null;
  snapshot: Snapshot;
  total: number;
}

export const TRASH_DAYS = 90;

/** Entries deleted in the last 90 days that do not exist now — newest first. */
export async function listTrash(companyId: string, limit = 300): Promise<TrashItem[]> {
  const since = new Date(Date.now() - TRASH_DAYS * 864e5);
  const events = await prisma.entryEvent.findMany({
    where: { companyId, action: "delete", entryId: { not: null }, createdAt: { gte: since } },
    orderBy: { createdAt: "desc" }, take: limit * 3,
  });
  const ids = [...new Set(events.map((e) => e.entryId!))];
  const alive = new Set((await prisma.journalEntry.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((r) => r.id));
  const seen = new Set<string>();
  const out: TrashItem[] = [];
  for (const e of events) {
    const snap = e.before as unknown as Snapshot | null;
    if (!snap || !Array.isArray(snap.lines) || alive.has(e.entryId!) || seen.has(e.entryId!)) continue;
    seen.add(e.entryId!);
    out.push({
      eventId: e.id, entryId: e.entryId!, deletedAt: e.createdAt.toISOString(), deletedBy: e.userName, note: e.note, snapshot: snap,
      total: Math.round(snap.lines.reduce((s, l) => s + (Number(l.debit) || 0), 0) * 100) / 100,
    });
    if (out.length >= limit) break;
  }
  return out;
}

export interface RestoreResult { restored: Array<{ entryId: string; date: string; source: string }>; skipped: Array<{ entryId: string; reason: string }> }

/** Puts deleted entries back under their old ids, from the history snapshots. */
export async function restoreEntries(companyId: string, eventIds: string[]): Promise<RestoreResult> {
  const events = await prisma.entryEvent.findMany({ where: { companyId, action: "delete", id: { in: [...new Set(eventIds)].slice(0, 2000) } }, orderBy: { createdAt: "asc" } });
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } });
  const res: RestoreResult = { restored: [], skipped: [] };
  for (const e of events) {
    const snap = e.before as unknown as Snapshot | null;
    const id = e.entryId;
    if (!id || !snap || !Array.isArray(snap.lines) || snap.lines.length < 2) { res.skipped.push({ entryId: id ?? "", reason: "нет снимка проводки" }); continue; }
    if (isLocked(snap.date, company?.lockedThrough)) { res.skipped.push({ entryId: id, reason: `период по ${isoDay(company!.lockedThrough!).split("-").reverse().join(".")} закрыт` }); continue; }
    if (await prisma.journalEntry.findUnique({ where: { id }, select: { id: true } })) { res.skipped.push({ entryId: id, reason: "уже восстановлена" }); continue; }
    // строки выписки больше нет — проводка возвращается как ручная
    const source = snap.source === "bank" ? "manual" : snap.source;
    if (snap.sourceRef && source !== "manual" && (await prisma.journalEntry.findFirst({ where: { companyId, source, sourceRef: snap.sourceRef }, select: { id: true } }))) {
      res.skipped.push({ entryId: id, reason: "раздел уже сформировал её заново" }); continue;
    }
    await quietly(() => prisma.$transaction(async (tx) => {
      const row = await tx.journalEntry.create({
        data: {
          id, companyId, date: fromIsoDate(snap.date), description: snap.description, source, sourceRef: snap.sourceRef ?? null,
          lines: {
            create: snap.lines.map((l) => ({
              accountCode: l.account, debit: Number(l.debit) || 0, credit: Number(l.credit) || 0, memo: l.memo ?? null,
              party: l.party ?? null, partyInn: l.partyInn ?? null, item: l.item ?? null,
              qty: typeof l.qty === "number" && l.qty > 0 ? l.qty : null, unit: normalizeUnit(l.unit ?? undefined) || null,
              currency: l.currency ?? null, amountCur: typeof l.amountCur === "number" ? l.amountCur : null,
            })),
          },
        },
        include: { lines: true },
      });
      await recordEntryEvent(tx, {
        companyId, entryId: id, action: "restore", source, entryDate: snap.date, after: snapshotOf(row),
        note: snap.source === "bank" ? "восстановлена из удалённых как ручная проводка (строки выписки больше нет)" : "восстановлена из удалённых",
      });
    }));
    res.restored.push({ entryId: id, date: snap.date, source });
  }
  return res;
}
