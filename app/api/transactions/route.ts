import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { ALL_CATEGORIES } from "@/lib/categories";

export async function GET(req: NextRequest) {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const importBatch = req.nextUrl.searchParams.get("importBatch");
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });

  const transactions = await prisma.bankTransaction.findMany({
    where: { companyId, ...(importBatch ? { importBatch } : {}) },
    orderBy: { txDate: "desc" },
    take: 500,
  });
  return NextResponse.json(transactions);
}

const PatchSchema = z.object({
  id: z.string(),
  category: z.string().refine((c) => (ALL_CATEGORIES as readonly string[]).includes(c), "Неизвестная категория"),
});

export async function PATCH(req: NextRequest) {
  const parsed = PatchSchema.safeParse(await req.json());
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const updated = await prisma.bankTransaction.update({
    where: { id: parsed.data.id },
    data: { category: parsed.data.category, categorySource: "manual" },
  });
  return NextResponse.json(updated);
}
