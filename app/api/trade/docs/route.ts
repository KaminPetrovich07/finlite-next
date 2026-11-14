import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { createDoc, listDocs, suggestNumber } from "@/lib/trade/server";
import { Doc } from "@/lib/trade/schema";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/trade/docs?companyId=&from=&to= — документы периода; &next=YYYY-MM-DD — номер следующей реализации */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const next = sp.get("next");
  if (next && ISO.test(next)) return NextResponse.json({ number: companyId === DEMO_COMPANY.id ? "1" : await suggestNumber(companyId, next) });
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Период задан неверно");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ docs: [], readOnly: true });
  return NextResponse.json({ docs: await listDocs(companyId, from, to), readOnly: level === "view" });
});

/** POST /api/trade/docs { companyId, doc } — новый документ: проводка в журнале и копия документа */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const companyId = typeof b?.companyId === "string" ? b.companyId : "";
  await requireCompany(companyId, "edit");
  const parsed = Doc.safeParse(b?.doc);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  await assertCanPost(companyId);
  const r = await createDoc(companyId, parsed.data);
  await logActivity("trade_doc_create", companyId, { type: parsed.data.type, number: parsed.data.number });
  return NextResponse.json({ ok: true, ...r }, { status: 201 });
});
