import { NextRequest, NextResponse } from "next/server";
import { requireCompany, route } from "@/lib/auth/server";
import { loadFills } from "@/lib/forms/fills";

/** GET /api/forms?companyId=… — реквизиты, которые бланки подставляют сами */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  return NextResponse.json(await loadFills(companyId!));
});
