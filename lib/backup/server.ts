// Сервер: выгрузить компанию из базы и загрузить копию как новую компанию.
import { randomUUID } from "node:crypto";
import { gunzipSync, gzipSync } from "node:zlib";
import { prisma } from "@/lib/db";
import { buildBackup, BackupError, planImport } from "./company";

export async function exportCompany(companyId: string): Promise<{ name: string; gz: Buffer }> {
  const company = await prisma.company.findUniqueOrThrow({ where: { id: companyId }, select: { name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true } });
  const [entries, bankTransactions, records, esgReports, reports] = await Promise.all([
    prisma.journalEntry.findMany({ where: { companyId }, include: { lines: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.bankTransaction.findMany({ where: { companyId }, orderBy: { txDate: "asc" } }),
    prisma.companyRecord.findMany({ where: { companyId }, select: { kind: true, key: true, data: true } }),
    prisma.esgReport.findMany({ where: { companyId } }),
    prisma.report.findMany({ where: { companyId } }),
  ]);
  const file = buildBackup({ company, entries: entries as never, bankTransactions: bankTransactions as never, records, esgReports: esgReports as never, reports: reports as never });
  return { name: company.name, gz: gzipSync(Buffer.from(JSON.stringify(file)), { level: 9 }) };
}

/** Байты файла (.json или .json.gz) → JSON. */
export function readBackupBytes(buf: Buffer): unknown {
  let text: string;
  try { text = (buf[0] === 0x1f && buf[1] === 0x8b ? gunzipSync(buf, { maxOutputLength: 300 * 1024 * 1024 }) : buf).toString("utf8"); }
  catch { throw new BackupError("Файл повреждён: не удалось распаковать"); }
  try { return JSON.parse(text); } catch { throw new BackupError("Файл повреждён: это не JSON"); }
}

const CHUNK = 1000;
async function inChunks<T>(rows: T[], fn: (part: T[]) => Promise<unknown>) { for (let i = 0; i < rows.length; i += CHUNK) await fn(rows.slice(i, i + CHUNK)); }

export async function importCompany(raw: unknown, ownerId: string | null, name?: string) {
  const plan = planImport(raw, () => randomUUID().replace(/-/g, ""));
  const company = await prisma.company.create({ data: { ...plan.company, name: name ?? `${plan.company.name} (из копии)`, ownerId } });
  try {
    await prisma.$transaction(async (db) => {
      await inChunks(plan.bankTransactions, (p) => db.bankTransaction.createMany({ data: p.map((t) => ({ ...t, companyId: company.id })) as never }));
      await inChunks(plan.entries, (p) => db.journalEntry.createMany({ data: p.map((e) => ({ ...e, companyId: company.id })) as never }));
      await inChunks(plan.lines, (p) => db.journalLine.createMany({ data: p as never }));
      await inChunks(plan.records, (p) => db.companyRecord.createMany({ data: p.map((r) => ({ ...r, data: r.data as object, companyId: company.id })) }));
      await inChunks(plan.esgReports, (p) => db.esgReport.createMany({ data: p.map((r) => ({ ...r, companyId: company.id })) as never }));
      await inChunks(plan.reports, (p) => db.report.createMany({ data: p.map((r) => ({ ...r, companyId: company.id })) as never }));
    }, { timeout: 55_000, maxWait: 10_000 });
  } catch (e) {
    await prisma.company.delete({ where: { id: company.id } }).catch(() => undefined); // не оставляем полупустую компанию
    throw e;
  }
  return { id: company.id, name: company.name, stats: plan.stats };
}
