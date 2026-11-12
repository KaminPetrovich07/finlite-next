import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost, assertCompanyFeature } from "@/lib/server/plan-guard";
import { deleteRecord, putRecord } from "@/lib/records";
import { createEntry } from "@/lib/ledger/repo";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadAssets } from "@/lib/assets/store";
import { accumulatedAt, acquisitionLines, bookSchedule, depreciationFor, isDepreciable } from "@/lib/assets/depreciation";
import { normalizeAsset } from "@/lib/assets/types";

const YM = /^\d{4}-\d{2}$/;
const thisMonth = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 7);

/** GET /api/assets?companyId=…&ym=YYYY-MM — cards with carrying amounts at the end of the month */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const ym = YM.test(sp.get("ym") ?? "") ? sp.get("ym")! : thisMonth();
  const level = await requireCompany(companyId, "view");
  const assets = await loadAssets(companyId);
  const posted = companyId === DEMO_COMPANY.id ? [] : (await prisma.journalEntry.findMany({
    where: { companyId, source: "depreciation" }, select: { sourceRef: true, id: true },
  })).map((r) => r.sourceRef).filter((x): x is string => !!x).sort();
  const rows = assets.map((a) => {
    const acc = accumulatedAt(a, ym);
    const sched = bookSchedule(a, "2100-12");
    return {
      ...a,
      depreciable: isDepreciable(a),
      accumulated: acc,
      nbv: Math.round((a.cost - acc) * 100) / 100,
      monthAmount: depreciationFor(a, ym),
      fullyDepreciatedAt: sched.length ? sched[sched.length - 1].ym : null,
    };
  });
  return NextResponse.json({ ym, assets: rows, posted, readOnly: companyId === DEMO_COMPANY.id || level === "view" });
});

const Body = z.object({
  companyId: z.string().min(1),
  asset: z.record(z.unknown()),
  /** create the acquisition entry: Dt asset / Кт 3110 supplier, 1210 bank or 1110 cash */
  post: z.object({ creditAccount: z.enum(["3110", "1210", "1110", "5240"]) }).optional(),
});

async function guard(companyId: string) {
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть. Создайте свою компанию.");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "fixedAssets");
}

/** POST /api/assets — new card (and, if asked, the acquisition entry) */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, post } = p.data;
  await guard(companyId);
  const id = `os_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;
  const { asset, errors } = normalizeAsset(p.data.asset, id);
  if (!asset) throw new HttpError(400, errors.join("; "));
  if (!asset.inventoryNo) {
    const n = (await loadAssets(companyId)).length + 1;
    asset.inventoryNo = String(n).padStart(6, "0");
  }
  await putRecord(companyId, "asset", id, asset);
  if (post) {
    await assertCanPost(companyId);
    await createEntry(prisma, {
      companyId, date: asset.inServiceAt, source: "asset", sourceRef: `acq:${id}`,
      description: `Принят к учёту: ${asset.name}, инв. № ${asset.inventoryNo}`,
      lines: acquisitionLines(asset, post.creditAccount),
    });
  }
  await logActivity("asset_create", companyId, { name: asset.name, cost: asset.cost });
  return NextResponse.json({ asset }, { status: 201 });
});

/** PUT /api/assets — edit a card (the journal is not touched) */
export const PUT = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId } = p.data;
  await guard(companyId);
  const id = String(p.data.asset.id ?? "");
  const existing = (await loadAssets(companyId)).find((a) => a.id === id);
  if (!existing) throw new HttpError(404, "Карточка не найдена");
  const { asset, errors } = normalizeAsset({ ...existing, ...p.data.asset }, id);
  if (!asset) throw new HttpError(400, errors.join("; "));
  await putRecord(companyId, "asset", id, asset);
  return NextResponse.json({ asset });
});

/** DELETE /api/assets?companyId=…&id=… — removes the card and its acquisition entry */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", id = sp.get("id") ?? "";
  await guard(companyId);
  await deleteRecord(companyId, "asset", id);
  await prisma.journalEntry.deleteMany({ where: { companyId, source: "asset", sourceRef: { in: [`acq:${id}`, `disp:${id}`] } } });
  return NextResponse.json({ ok: true });
});
