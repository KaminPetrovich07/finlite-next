import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany } from "@/lib/auth/server";
import { postBankTransactions } from "@/lib/ledger/repo";

/** POST /api/ledger/post-bank { companyId } — creates entries for every bank transaction not yet in the journal */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });
  try {
    await requireCompany(companyId, "edit");
    const posted = await postBankTransactions(companyId);
    return NextResponse.json({ posted });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
