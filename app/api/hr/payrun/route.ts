import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { computeMonth, postMonth, saveTimesheet } from "@/lib/hr/server";

export const runtime = "nodejs";
const MONTH = /^\d{4}-(0[1-9]|1[0-2])$/;
function args(companyId: unknown, month: unknown) {
  if (typeof companyId !== "string" || !companyId || companyId === "demo") throw new HttpError(400, "Кадры ведутся в своей компании — создайте её или копию демо-компании");
  if (typeof month !== "string" || !MONTH.test(month)) throw new HttpError(400, "Укажите месяц");
  return { companyId, month };
}

/** GET /api/hr/payrun?companyId=&month=YYYY-MM — табель и расчёт зарплаты за месяц. */
export const GET = route(async (req: NextRequest) => {
  const { companyId, month } = args(req.nextUrl.searchParams.get("companyId"), req.nextUrl.searchParams.get("month"));
  await requireCompany(companyId, "view");
  return NextResponse.json(await computeMonth(companyId, month));
});

/** PUT /api/hr/payrun { companyId, month, timesheet } — сохранить табель. */
export const PUT = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => ({}));
  const { companyId, month } = args(b.companyId, b.month);
  await requireCompany(companyId, "edit");
  if (!Array.isArray(b.timesheet)) throw new HttpError(400, "Нет табеля");
  return NextResponse.json(await saveTimesheet(companyId, month, b.timesheet));
});

/** POST /api/hr/payrun { companyId, month } — провести зарплату месяца в журнал (прежняя проводка месяца заменяется). */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => ({}));
  const { companyId, month } = args(b.companyId, b.month);
  await requireCompany(companyId, "edit");
  await assertCanPost(companyId);
  if (Array.isArray(b.timesheet)) await saveTimesheet(companyId, month, b.timesheet);
  try {
    const r = await postMonth(companyId, month);
    await logActivity("hr_post", companyId, { month, gross: r.totals.gross });
    return NextResponse.json(r);
  } catch (e) {
    if (e instanceof Error && /Нет начислений/.test(e.message)) throw new HttpError(400, e.message);
    throw e;
  }
});
