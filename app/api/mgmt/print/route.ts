import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { segmentReport } from "@/lib/mgmt/model";
import { mgmtContext } from "@/lib/mgmt/server";
import { printMarginal, printSegments } from "@/lib/mgmt/print";
import { marginalReport } from "@/lib/mgmt/marginal";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({ companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO), kind: z.enum(["dept", "project", "line"]), mode: z.enum(["segments", "marginal"]).optional() });

/** POST /api/mgmt/print?format=pdf|docx { companyId, from, to, kind } — отчёт о прибылях по сегментам */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, kind } = parsed.data;
  await requireCompany(companyId, "view");
  const { ctx, settings, tags } = await mgmtContext(companyId);
  const marginal = parsed.data.mode === "marginal";
  await logActivity("mgmt_print", companyId, { kind, format, mode: parsed.data.mode ?? "segments" });
  const title = `${marginal ? "Маржинальный анализ" : "Прибыль по сегментам"} — ${ctx.name}`;
  const blocks = marginal ? printMarginal(ctx.name, from, to, marginalReport(ctx.entries, from, to, kind, settings, tags)) : printSegments(ctx.name, from, to, segmentReport(ctx.entries, from, to, kind, settings, tags));
  return sendDoc({ title, fileName: title.slice(0, 120), org: ctx.name, landscape: true, blocks }, format);
});
