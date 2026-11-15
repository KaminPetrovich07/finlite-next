import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { createImport, deleteImport, listImports, nextImportNumber, rateOn } from "@/lib/import-goods/server";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

const Row = z.object({
  item: z.string().max(200), hs: z.string().max(20), unit: z.string().max(20), qty: z.number().min(0).max(1e9), price: z.number().min(0).max(1e12),
  duty: z.number().min(0).max(100).optional(), minBase: z.number().min(0).max(1e9).optional(),
});
const Doc = z.object({
  number: z.string().max(30), date: z.string().regex(ISO), origin: z.enum(["eaeu", "third"]), country: z.string().max(60), supplier: z.string().max(200), supplierInn: z.string().max(20).optional(),
  currency: z.string().regex(/^[A-Z]{3}$/), rate: z.number().min(0).max(1e6), rows: z.array(Row).min(1).max(300),
  delivery: z.number().min(0).max(1e12), carrier: z.string().max(200).optional(), deliveryInCustomsValue: z.boolean(), fees: z.number().min(0).max(1e12), other: z.number().min(0).max(1e12),
  vatPayer: z.boolean(), paidNow: z.boolean(), docs: z.string().max(300).optional(),
});

/** GET /api/import-goods?companyId= — список ввозов; &rate=USD&date= — курс НБКР; &next=1 — следующий номер */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const code = sp.get("rate"), date = sp.get("date") ?? "";
  if (code && ISO.test(date)) return NextResponse.json({ rate: await rateOn(date, code.toUpperCase()) });
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ imports: [], readOnly: true, next: "1" });
  const [imports, next] = await Promise.all([listImports(companyId), nextImportNumber(companyId)]);
  return NextResponse.json({ imports, readOnly: level === "view", next });
});

/** POST /api/import-goods { companyId, doc } — ввоз: проводка в журнале и копия документа */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const companyId = typeof b?.companyId === "string" ? b.companyId : "";
  await requireCompany(companyId, "edit");
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компания только для просмотра — создайте свою или копию демо");
  const parsed = Doc.safeParse(b?.doc);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  await assertCanPost(companyId);
  const r = await createImport(companyId, parsed.data);
  await logActivity("import_goods_create", companyId, { number: parsed.data.number, origin: parsed.data.origin });
  return NextResponse.json({ ok: true, ...r }, { status: 201 });
});

/** DELETE /api/import-goods?companyId=&entryId= — в корзину (проводка) и удалить копию документа */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", entryId = sp.get("entryId") ?? "";
  await requireCompany(companyId, "edit");
  return NextResponse.json(await deleteImport(companyId, entryId));
});
