import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { costingContext, run } from "@/lib/costing/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({ companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO), products: z.array(z.unknown()).max(100), outputs: z.record(z.unknown()) });

/** POST /api/costing/calc — recalculates with the norms and output on screen, without saving */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to } = parsed.data;
  await requireCompany(companyId, "view");
  const ctx = await costingContext(companyId, from, to);
  return NextResponse.json(run(ctx, parsed.data.products, parsed.data.outputs));
});
