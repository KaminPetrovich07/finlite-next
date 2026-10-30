import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { primaryList } from "@/lib/primary/build";
import { REGISTER_INFO } from "@/lib/primary/detect";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/primary?companyId=…&from=…&to=… — entries of the period and the documents each one needs */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const c = await loadPrimaryCtx(companyId!);
  return NextResponse.json({
    list: primaryList(c, { from, to }, c.services),
    registers: Object.entries(REGISTER_INFO).map(([kind, r]) => ({ kind, ...r })),
    people: c.people,
    policySaved: c.policySaved || c.demo,
  });
});
