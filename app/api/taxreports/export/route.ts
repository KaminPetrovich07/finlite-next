import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { runTax, taxContext } from "@/lib/taxreports/server";
import { buildTaxReportDoc } from "@/lib/taxreports/doc";
import { filedKey } from "@/lib/taxreports/build";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO),
  size: z.enum(["small", "medium", "large"]).optional(), keys: z.array(z.string().max(40)).max(50).optional(),
});

/** POST /api/taxreports/export?format=pdf|docx — расчёты для заполнения отчётов и расчёты с бюджетом */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, size, keys } = parsed.data;
  await requireCompany(companyId, "view");
  const ctx = await taxContext(companyId);
  const res = runTax(ctx, from, to, size);
  const reports = keys?.length ? res.reports.filter((r) => keys.includes(filedKey(r.form, r.period.from))) : res.reports;
  if (!reports.length) throw new HttpError(400, "Нет отчётов за выбранный период");
  await logActivity("taxreports_export", ctx.c.demo ? null : companyId, { format, n: reports.length });
  return sendDoc(buildTaxReportDoc({ name: ctx.c.companyName, inn: ctx.c.inn, people: ctx.c.people }, reports, keys?.length === 1 ? [] : res.budget, res.regimeName), format);
});
