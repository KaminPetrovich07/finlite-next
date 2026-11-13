import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { runRecurring } from "@/lib/ledger/recurring-server";

/** POST /api/ledger/recurring/run { companyId } — провести все регулярные операции, срок которых наступил */
export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  if (!companyId) throw new HttpError(400, "companyId обязателен");
  await requireCompany(companyId, "edit");
  const r = await runRecurring(companyId);
  if (r.posted) await logActivity("recurring_run", companyId, { posted: r.posted });
  return NextResponse.json(r);
});
