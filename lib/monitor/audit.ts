// Запись в журнал действий с цепочкой хэшей и проверка цепочки (сервер).
import { prisma } from "@/lib/db";
import { newReport, nextRow, UNCHAINED, verifyRows, type ChainReport } from "./chain";

const LOCK = 7_241_001; // одна цепочка на базу: записи выстраиваются по очереди

export async function appendActivity(data: { userId: string | null; action: string; companyId?: string | null; details?: unknown }): Promise<void> {
  if (UNCHAINED.includes(data.action)) {
    await prisma.activityLog.create({ data: { userId: data.userId, actor: data.userId, action: data.action, companyId: data.companyId ?? null, details: (data.details ?? undefined) as object | undefined } });
    return;
  }
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`SELECT pg_advisory_xact_lock(${LOCK})`);
    const prev = await tx.activityLog.findFirst({ where: { hash: { not: null } }, orderBy: [{ createdAt: "desc" }], select: { hash: true, createdAt: true } });
    const row = nextRow(prev?.hash ? { hash: prev.hash, createdAt: prev.createdAt } : null, { actor: data.userId, action: data.action, companyId: data.companyId ?? null, details: data.details });
    await tx.activityLog.create({ data: { ...row, userId: data.userId, details: (row.details ?? undefined) as object | undefined } });
  });
}

/** Проверка всей цепочки порциями по 5000 записей. */
export async function verifyActivityChain(): Promise<ChainReport> {
  const state = { prev: null as string | null, report: newReport() };
  let cursor: { createdAt: Date; id: string } | null = null;
  for (;;) {
    const rows: Array<{ id: string; actor: string | null; action: string; companyId: string | null; details: unknown; createdAt: Date; prevHash: string | null; hash: string | null }> = await prisma.activityLog.findMany({
      where: { hash: { not: null }, ...(cursor ? { OR: [{ createdAt: { gt: cursor.createdAt } }, { createdAt: cursor.createdAt, id: { gt: cursor.id } }] } : {}) },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }], take: 5000,
      select: { id: true, actor: true, action: true, companyId: true, details: true, createdAt: true, prevHash: true, hash: true },
    });
    if (!rows.length) break;
    verifyRows(rows, state);
    const last = rows[rows.length - 1];
    cursor = { createdAt: last.createdAt, id: last.id };
    if (rows.length < 5000) break;
  }
  return state.report;
}
