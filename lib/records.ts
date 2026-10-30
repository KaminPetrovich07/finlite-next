// Server-side store for company documents that are not postings (accounting
// policy, counterparties, costing cards …). See CompanyRecord in the schema.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";

export type RecordKind = "policy" | "counterparty" | "costing" | "product";

/** The table is new: tell the user how to create it instead of a bare 500. */
function rethrow(e: unknown): never {
  const msg = e instanceof Error ? e.message : String(e);
  if (/CompanyRecord|does not exist|P2021/i.test(msg)) {
    throw new HttpError(503, "В базе ещё нет таблицы для этого раздела. Выполните один раз: npx prisma db push");
  }
  throw e;
}

export async function getRecord<T>(companyId: string, kind: RecordKind, key = "main"): Promise<T | null> {
  try {
    const r = await prisma.companyRecord.findUnique({ where: { companyId_kind_key: { companyId, kind, key } } });
    return r ? (r.data as T) : null;
  } catch (e) { rethrow(e); }
}

export async function listRecords<T>(companyId: string, kind: RecordKind): Promise<Array<{ key: string; data: T; updatedAt: Date }>> {
  try {
    const rows = await prisma.companyRecord.findMany({ where: { companyId, kind }, orderBy: { createdAt: "asc" } });
    return rows.map((r) => ({ key: r.key, data: r.data as T, updatedAt: r.updatedAt }));
  } catch (e) { rethrow(e); }
}

export async function putRecord<T>(companyId: string, kind: RecordKind, key: string, data: T): Promise<void> {
  const json = JSON.parse(JSON.stringify(data));
  try {
    await prisma.companyRecord.upsert({
      where: { companyId_kind_key: { companyId, kind, key } },
      create: { companyId, kind, key, data: json },
      update: { data: json },
    });
  } catch (e) { rethrow(e); }
}

export async function deleteRecord(companyId: string, kind: RecordKind, key: string): Promise<void> {
  try {
    await prisma.companyRecord.deleteMany({ where: { companyId, kind, key } });
  } catch (e) { rethrow(e); }
}
