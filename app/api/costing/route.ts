import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { putRecord } from "@/lib/records";
import { costingContext, run } from "@/lib/costing/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/costing?companyId=…&from=…&to=… — products, output and the calculation for the period */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const ctx = await costingContext(companyId!, from, to);
  const { products, outputs, result } = run(ctx);
  return NextResponse.json({ products, outputs, result, demo: ctx.c.demo, hasProduction: ctx.c.policy?.activities.some((a) => a !== "services" && a !== "trade") ?? false });
});

const Body = z.object({ companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO), products: z.array(z.unknown()).max(100), outputs: z.record(z.unknown()) });

/** PUT /api/costing — saves the product norms and the period's output */
export const PUT = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to } = parsed.data;
  await requireCompany(companyId, "edit");
  const ctx = await costingContext(companyId, from, to);
  const { products, outputs, result } = run(ctx, parsed.data.products, parsed.data.outputs);
  await putRecord(companyId, "product", "main", products);
  await putRecord(companyId, "costing", `${from}_${to}`, outputs);
  await logActivity("costing_save", companyId, { from, to, products: products.length });
  return NextResponse.json({ ok: true, products, outputs, result });
});
