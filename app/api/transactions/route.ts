import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_CATEGORIES } from "@/lib/categories";
import { repostBankTransaction } from "@/lib/ledger/repo";
import { HttpError, requireCompany, route } from "@/lib/auth/server";

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
  category: z.string().refine((c) => (ALL_CATEGORIES as readonly string[]).includes(c), "Неизвестная категория"),
});

export const PATCH = route(async (req: NextRequest) => {
  const parsed = PatchSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const tx = await prisma.bankTransaction.findUnique({ where: { id: parsed.data.id }, select: { companyId: true } });
  if (!tx) throw new HttpError(404, "Операция не найдена");
  await requireCompany(tx.companyId, "edit");

  const updated = await prisma.bankTransaction.update({
    where: { id: parsed.data.id },
    data: { category: parsed.data.category, categorySource: "manual" },
  });
  // the journal entry follows the category, so every statement updates too
  await repostBankTransaction(updated.id);
  return NextResponse.json(updated);
});
