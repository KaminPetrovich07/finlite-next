import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { computeMonth } from "@/lib/hr/server";
import { socialFundCsv } from "@/lib/hr/payroll";

export const runtime = "nodejs";

/** GET /api/hr/payrun/csv?companyId=&month= — свод по взносам и ПН по сотрудникам (Excel). */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId"), month = req.nextUrl.searchParams.get("month") ?? "";
  if (!companyId || companyId === "demo" || !/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Укажите компанию и месяц");
  await requireCompany(companyId, "view");
  const r = await computeMonth(companyId, month);
  return new NextResponse(socialFundCsv(r.rows, r.employees, month), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="socfund-${month}.csv"`, "Cache-Control": "no-store" } });
});
