import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { portfolio, setSegment } from "@/lib/portfolio/server";
import { buildPortfolioDoc } from "@/lib/portfolio/doc";
import { docFormat, sendDoc } from "@/lib/server/send-file";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Q = z.object({ asOf: z.string().regex(ISO), months: z.coerce.number().int().min(3).max(24).default(6), segment: z.string().max(80).optional() });

/** GET /api/portfolio?asOf=&months=6[&segment=] — все доступные компании: балл риска, показатели, сигналы. */
export const GET = route(async (req: NextRequest) => {
  const p = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) throw new HttpError(400, "Укажите дату");
  return NextResponse.json(await portfolio(p.data.asOf, p.data.months, p.data.segment || undefined));
});

/** POST /api/portfolio?format=pdf|docx { asOf, months, segment?, title? } — обзор портфеля для руководства. */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const body = await req.json().catch(() => ({}));
  const p = Q.safeParse(body);
  if (!p.success) throw new HttpError(400, "Укажите дату");
  const r = await portfolio(p.data.asOf, p.data.months, p.data.segment || undefined);
  await logActivity("portfolio_export", null, { format, companies: r.summary.companies });
  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim().slice(0, 120) : p.data.segment || "Все компании";
  return sendDoc(buildPortfolioDoc(title, r.asOf, r.rows, r.summary), format);
});

/** PUT /api/portfolio { companyId, segment } — группа портфеля компании (отрасль, ведомство, «мои клиенты»). */
export const PUT = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const companyId = typeof b?.companyId === "string" ? b.companyId : "";
  await requireCompany(companyId, "edit");
  await setSegment(companyId, typeof b?.segment === "string" ? b.segment : "");
  return NextResponse.json({ ok: true });
});
