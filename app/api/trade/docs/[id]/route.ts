import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getDoc, updateDoc } from "@/lib/trade/server";
import { Doc } from "@/lib/trade/schema";

type Ctx = { params: Promise<{ id: string }> };

async function companyOf(id: string): Promise<string> {
  const e = await prisma.journalEntry.findUnique({ where: { id }, select: { companyId: true, source: true } });
  if (!e || e.source !== "trade") throw new HttpError(404, "Документ не найден");
  return e.companyId;
}

/** GET /api/trade/docs/:id — документ для правки (version — для защиты от перезаписи чужих правок) */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const companyId = await companyOf(id);
  await requireCompany(companyId, "view");
  return NextResponse.json(await getDoc(companyId, id));
});

/** PUT /api/trade/docs/:id { doc, version } — изменить документ; проводка и себестоимость пересчитываются */
export const PUT = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const companyId = await companyOf(id);
  await requireCompany(companyId, "edit");
  const b = await req.json().catch(() => null);
  const parsed = Doc.safeParse(b?.doc);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const r = await updateDoc(companyId, id, parsed.data, typeof b?.version === "string" ? b.version : undefined);
  await logActivity("trade_doc_update", companyId, { type: parsed.data.type, number: parsed.data.number });
  return NextResponse.json({ ok: true, ...r });
});
