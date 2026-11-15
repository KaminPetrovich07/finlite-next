import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { loadCompanyContext } from "@/lib/server/company-context";
import { diagnose, DEFAULT_TERMS } from "@/lib/insolvency/diagnose";
import { buildDiagnosisDoc } from "@/lib/insolvency/doc";
import { docFormat, sendDoc } from "@/lib/server/send-file";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Days = z.coerce.number().int().min(1).max(730);
const Q = z.object({
  companyId: z.string().min(1), asOf: z.string().regex(ISO), months: z.coerce.number().int().min(3).max(24).default(12),
  staff: Days.optional(), budget: Days.optional(), quarterlyTax: Days.optional(), suppliers: Days.optional(), interest: Days.optional(), other: Days.optional(),
});

async function run(params: Record<string, unknown>) {
  const p = Q.safeParse(params);
  if (!p.success) throw new HttpError(400, "Укажите компанию и дату");
  const { companyId, asOf, months, ...t } = p.data;
  await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId);
  const terms = Object.fromEntries(Object.entries(t).filter(([, v]) => v != null)) as Partial<typeof DEFAULT_TERMS>;
  return { ctx, d: diagnose(ctx.entries, asOf, { months, terms }) };
}

/** GET /api/insolvency?companyId=&asOf=&months=12[&suppliers=30…] — финансовая диагностика на дату. */
export const GET = route(async (req: NextRequest) => {
  const { ctx, d } = await run(Object.fromEntries(req.nextUrl.searchParams));
  return NextResponse.json({ company: { name: ctx.name, inn: ctx.inn, demo: ctx.demo }, ...d });
});

/** POST /api/insolvency?format=pdf|docx  { companyId, asOf, months, …сроки } — заключение файлом. */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const { ctx, d } = await run((await req.json().catch(() => ({}))) ?? {});
  await logActivity("insolvency_export", ctx.demo ? null : ctx.id, { format });
  return sendDoc(buildDiagnosisDoc({ name: ctx.name, inn: ctx.inn }, d), format);
});
