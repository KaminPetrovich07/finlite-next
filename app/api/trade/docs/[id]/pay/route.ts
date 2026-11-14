import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { assertCanPost } from "@/lib/server/plan-guard";
import { payDoc } from "@/lib/trade/server";

type Ctx = { params: Promise<{ id: string }> };
const Body = z.object({ amount: z.number().positive("Сумма должна быть больше нуля").max(1e12), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Укажите дату"), via: z.enum(["bank", "cash"]) });

/** POST /api/trade/docs/:id/pay { amount, date, via } — оплата по документу в долг: проводка, привязанная к документу */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const e = await prisma.journalEntry.findUnique({ where: { id }, select: { companyId: true, source: true } });
  if (!e || e.source !== "trade") throw new HttpError(404, "Документ не найден");
  await requireCompany(e.companyId, "edit");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  await assertCanPost(e.companyId);
  const r = await payDoc(e.companyId, id, parsed.data);
  await logActivity("trade_doc_pay", e.companyId, { amount: parsed.data.amount, via: parsed.data.via });
  return NextResponse.json({ ok: true, ...r }, { status: 201 });
});
