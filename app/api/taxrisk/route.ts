import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { loadCompanyContext } from "@/lib/server/company-context";
import { taxRisks } from "@/lib/taxrisk/check";
import { bishkekToday } from "@/lib/fx/store";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/taxrisk?companyId=&from=&to= — налоговые риски периода глазами проверяющего. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!companyId || !ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Укажите компанию и период");
  await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId);
  const today = ctx.demo ? to : bishkekToday();
  return NextResponse.json(taxRisks(ctx.entries, from, to, { today }));
});
