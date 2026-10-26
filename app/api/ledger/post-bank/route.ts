import { NextRequest, NextResponse } from "next/server";
import { postBankTransactions } from "@/lib/ledger/repo";

/** POST /api/ledger/post-bank { companyId } — creates entries for every bank transaction not yet in the journal */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const companyId = typeof body?.companyId === "string" ? body.companyId : null;
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });
  try {
    const posted = await postBankTransactions(companyId);
    return NextResponse.json({ posted });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
