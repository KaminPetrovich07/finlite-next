// Server side of recurring operations: post what is due, for one company or for all (daily cron).
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { assertCanPost } from "@/lib/server/plan-guard";
import { listRecords } from "@/lib/records";
import { createEntry } from "./repo";
import { dueRuns, type RecurringTemplate } from "./recurring";

export const bishkekToday = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);

export interface RunResult { posted: number; skipped: Array<{ templateId: string; description: string; month: string; reason: string }> }

export async function doneRefs(companyId: string): Promise<Set<string>> {
  const rows = await prisma.journalEntry.findMany({ where: { companyId, sourceRef: { startsWith: "rec:" } }, select: { sourceRef: true } });
  return new Set(rows.map((r) => r.sourceRef!).filter(Boolean));
}

export async function lockedThrough(companyId: string): Promise<string | null> {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } });
  return c?.lockedThrough ? c.lockedThrough.toISOString().slice(0, 10) : null;
}

/** Months in a period closed for changes are never posted — and are not «due» either. */
export const openRuns = <R extends { date: string }>(runs: R[], lock: string | null) => (lock ? runs.filter((r) => r.date > lock) : runs);

/** Posts every due month of every active template of the company. Never posts the same month twice. */
export async function runRecurring(companyId: string, today = bishkekToday()): Promise<RunResult> {
  const templates = (await listRecords<RecurringTemplate>(companyId, "recurring")).map((r) => r.data);
  const done = await doneRefs(companyId);
  const lock = await lockedThrough(companyId);
  const res: RunResult = { posted: 0, skipped: [] };
  for (const t of templates) {
    for (const run of openRuns(dueRuns(t, done, today), lock)) {
      try {
        await assertCanPost(companyId, 1);
        await createEntry(prisma, { companyId, date: run.date, description: t.description, source: "manual", sourceRef: run.ref, lines: t.lines, createdByName: "по расписанию" });
        done.add(run.ref);
        res.posted++;
      } catch (e) {
        if (!(e instanceof HttpError)) throw e;
        res.skipped.push({ templateId: t.id, description: t.description, month: run.month, reason: e.message });
      }
    }
  }
  return res;
}

/** Daily cron: all companies that have recurring operations. */
export async function runRecurringAll(): Promise<{ companies: number; posted: number; skipped: number }> {
  const ids = await prisma.companyRecord.findMany({ where: { kind: "recurring" }, distinct: ["companyId"], select: { companyId: true } });
  let posted = 0, skipped = 0;
  for (const { companyId } of ids) {
    try { const r = await runRecurring(companyId); posted += r.posted; skipped += r.skipped.length; } catch { skipped++; }
  }
  return { companies: ids.length, posted, skipped };
}
