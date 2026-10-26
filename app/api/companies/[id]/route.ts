import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REGIMES } from "@/lib/tax-engine";

const Schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  defaultRegime: z.string().refine((k) => k in REGIMES, "Неизвестный налоговый режим").optional(),
  patentAmount: z.number().min(0).optional(),
});

/** PATCH /api/companies/:id — company settings that the ledger depends on (tax regime, patent fee) */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });
  try {
    const company = await prisma.company.update({
      where: { id },
      data: parsed.data,
      select: { id: true, name: true, defaultRegime: true, patentAmount: true },
    });
    return NextResponse.json(company);
  } catch {
    return NextResponse.json({ error: "Компания не найдена или база данных недоступна" }, { status: 404 });
  }
}
