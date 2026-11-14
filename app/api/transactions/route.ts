import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_CATEGORIES } from "@/lib/categories";
import { fromIsoDate, repostBankTransaction } from "@/lib/ledger/repo";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";

export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const importBatch = req.nextUrl.searchParams.get("importBatch");
  await requireCompany(companyId, "view");

  const transactions = await prisma.bankTransaction.findMany({
    where: { companyId: companyId!, ...(importBatch ? { importBatch } : {}) },
    orderBy: { txDate: "desc" },
    take: 500,
  });
  return NextResponse.json(transactions);
});

const PatchSchema = z.object({
  id: z.string(),
  category: z.string().refine((c) => (ALL_CATEGORIES as readonly string[]).includes(c), "Неизвестная категория").optional(),
  txDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД").optional(),
  amount: z.number().refine((n) => Number.isFinite(n) && n !== 0 && Math.abs(n) < 1e13, "Сумма не может быть нулевой").optional(),
  description: z.string().trim().max(500).optional(),
});

/** PATCH /api/transactions { id, category?, txDate?, amount?, description? } — правка строки выписки; проводка формируется заново */
export const PATCH = route(async (req: NextRequest) => {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const tx = await prisma.bankTransaction.findUnique({ where: { id: parsed.data.id }, select: { companyId: true } });
  if (!tx) throw new HttpError(404, "Операция не найдена");
  await requireCompany(tx.companyId, "edit");
  const d = parsed.data;
  const updated = await prisma.bankTransaction.update({
    where: { id: d.id },
    data: {
      ...(d.category ? { category: d.category, categorySource: "manual" } : {}),
      ...(d.txDate ? { txDate: fromIsoDate(d.txDate) } : {}),
      ...(d.amount !== undefined ? { amount: Math.round(d.amount * 100) / 100 } : {}),
      ...(d.description !== undefined ? { description: d.description } : {}),
    },
  });
  // the journal entry follows the statement row, so every statement updates too
  await repostBankTransaction(updated.id);
  return NextResponse.json(updated);
});

const DeleteSchema = z.union([
  z.object({ companyId: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(5000) }),
  z.object({ companyId: z.string().min(1), importBatch: z.string().min(1) }),
]);

/**
 * DELETE /api/transactions { companyId, ids } | { companyId, importBatch } — удалить строки выписки
 * (или всю загрузку) вместе с их проводками. Проводки попадают в «Удалённые» журнала.
 */
export const DELETE = route(async (req: NextRequest) => {
  const parsed = DeleteSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Укажите, какие строки выписки удалить");
  const b = parsed.data;
  await requireCompany(b.companyId, "edit");
  const r = await prisma.bankTransaction.deleteMany({ where: { companyId: b.companyId, ...("ids" in b ? { id: { in: b.ids } } : { importBatch: b.importBatch }) } });
  await logActivity("bank_delete", b.companyId, { count: r.count, ...("importBatch" in b ? { importBatch: b.importBatch } : {}) });
  return NextResponse.json({ ok: true, deleted: r.count });
});
