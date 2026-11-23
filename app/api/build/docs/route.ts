import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { createBuildDoc, stockAt, suggestNumber } from "@/lib/build/server";
import { BuildDocSchema } from "@/lib/build/schema";
import type { BuildDoc } from "@/lib/build/model";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/build/docs?companyId=&objectId=&next=writeoff|cost|ks2 — номер следующего документа;
 *     &stock=YYYY-MM-DD — материалы на складе на дату (для списания).
 */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ number: "1", stock: [] });
  const stock = sp.get("stock");
  if (stock && ISO.test(stock)) {
    const m = await stockAt(companyId, stock);
    return NextResponse.json({ stock: [...m.values()].filter((s) => s.qty > 0).map((s) => ({ name: s.name, unit: s.unit, qty: s.qty, avg: s.avg, account: s.account })).sort((a, b) => a.name.localeCompare(b.name, "ru")) });
  }
  const type = sp.get("next");
  if (type !== "writeoff" && type !== "cost" && type !== "ks2") throw new HttpError(400, "Вид документа?");
  return NextResponse.json({ number: await suggestNumber(companyId, sp.get("objectId") ?? "", type) });
});

/** POST /api/build/docs { companyId, doc } — провести документ по объекту */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const companyId = typeof b?.companyId === "string" ? b.companyId : "";
  await requireCompany(companyId, "edit");
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компания только для просмотра");
  const parsed = BuildDocSchema.safeParse(b?.doc);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  await assertCanPost(companyId);
  const r = await createBuildDoc(companyId, parsed.data as BuildDoc);
  await logActivity("build_doc_create", companyId, { type: parsed.data.type });
  return NextResponse.json({ ok: true, ...r }, { status: 201 });
});
