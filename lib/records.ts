// Server-side store for company documents that are not postings (accounting
// policy, counterparties, costing cards …). See CompanyRecord in the schema.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { CLIENT_HEADER, decodeVersions, noteVersion, VERSIONS_HEADER } from "@/lib/request-context";

export type RecordKind = "group" | "recurring" | "policy" | "counterparty" | "costing" | "product" | "import1c" | "taxreports" | "asset" | "assetTax" | "stock" | "budget" | "calendar" | "industry" | "esf" | "employee" | "payrun" | "hr";

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
    if (r) noteVersion(kind, key, r.updatedAt);
    return r ? (r.data as T) : null;
  } catch (e) { rethrow(e); }
}

export async function listRecords<T>(companyId: string, kind: RecordKind): Promise<Array<{ key: string; data: T; updatedAt: Date }>> {
  try {
    const rows = await prisma.companyRecord.findMany({ where: { companyId, kind }, orderBy: { createdAt: "asc" } });
    for (const r of rows) noteVersion(kind, r.key, r.updatedAt);
    return rows.map((r) => ({ key: r.key, data: r.data as T, updatedAt: r.updatedAt }));
  } catch (e) { rethrow(e); }
}

export const CONFLICT_MESSAGE = "Пока вы редактировали, эти данные сохранил другой пользователь или другая вкладка. " +
  "Ваши изменения не записаны, чтобы не стереть чужие. Обновите страницу — появятся новые данные — и внесите свои изменения ещё раз.";

/** The version the browser last saw for this record and the browser tab's id — from the request headers. */
async function clientView(kind: string, key: string): Promise<{ expected: string | null; client: string | null }> {
  try {
    const { headers } = await import("next/headers");
    const h = await headers();
    return { expected: decodeVersions(h.get(VERSIONS_HEADER)).get(`${kind}/${key}`) ?? null, client: h.get(CLIENT_HEADER)?.slice(0, 64) || null };
  } catch {
    return { expected: null, client: null }; // not in a request (cron, tests)
  }
}

/**
 * Saves a record. If the browser says which version it edited (X-FL-Versions) and the record has
 * since been saved by someone else — another user or another tab — the save is refused with 409
 * instead of silently overwriting their work. Requests without the header (scripts, cron) save as before.
 */
export async function putRecord<T>(companyId: string, kind: RecordKind, key: string, data: T): Promise<void> {
  return putRecordAs(companyId, kind, key, data, await clientView(kind, key));
}

/** putRecord with the browser's view given explicitly (tests). */
export async function putRecordAs<T>(companyId: string, kind: RecordKind, key: string, data: T, view: { expected: string | null; client: string | null }): Promise<void> {
  const json = JSON.parse(JSON.stringify(data));
  const { expected, client } = view;
  try {
    const where = { companyId_kind_key: { companyId, kind, key } };
    const cur = await prisma.companyRecord.findUnique({ where, select: { updatedAt: true, updatedBy: true } });
    if (!cur) {
      const r = await prisma.companyRecord.create({ data: { companyId, kind, key, data: json, updatedBy: client } }).catch(async (e) => {
        // created by someone else a moment ago
        if (/P2002|Unique constraint/i.test(String((e as Error)?.message ?? e)) && expected !== null) throw new HttpError(409, CONFLICT_MESSAGE);
        return prisma.companyRecord.update({ where, data: { data: json, updatedBy: client } });
      });
      noteVersion(kind, key, r.updatedAt);
      return;
    }
    const stale = expected !== null && expected !== cur.updatedAt.toISOString() && !(client && cur.updatedBy === client);
    if (stale) throw new HttpError(409, CONFLICT_MESSAGE);
    // atomic: only if nobody saved between the read above and this write
    const res = await prisma.companyRecord.updateMany({ where: { companyId, kind, key, updatedAt: cur.updatedAt }, data: { data: json, updatedBy: client } });
    if (res.count === 0) throw new HttpError(409, CONFLICT_MESSAGE);
    const after = await prisma.companyRecord.findUnique({ where, select: { updatedAt: true } });
    if (after) noteVersion(kind, key, after.updatedAt);
  } catch (e) {
    if (e instanceof HttpError) throw e;
    rethrow(e);
  }
}

export async function deleteRecord(companyId: string, kind: RecordKind, key: string): Promise<void> {
  try {
    await prisma.companyRecord.deleteMany({ where: { companyId, kind, key } });
  } catch (e) { rethrow(e); }
}
