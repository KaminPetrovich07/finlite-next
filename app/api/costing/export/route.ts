import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { costingContext, run } from "@/lib/costing/server";
import { buildCostingDoc } from "@/lib/costing/doc";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO),
  products: z.array(z.unknown()).max(100), outputs: z.record(z.unknown()), productId: z.string().optional(),
});

/** POST /api/costing/export?format=pdf|docx — калькуляционный отчёт и карточки-калькуляции */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, productId } = parsed.data;
  await requireCompany(companyId, "view");
  const ctx = await costingContext(companyId, from, to);
  const { result } = run(ctx, parsed.data.products, parsed.data.outputs);
  if (!result.products.length) throw new HttpError(400, "Укажите выпуск хотя бы по одному изделию");
  await logActivity("costing_export", ctx.c.demo ? null : companyId, { format });
  return sendDoc(buildCostingDoc(ctx.c.companyName, from, to, result, ctx.c.people, productId), format);
});
