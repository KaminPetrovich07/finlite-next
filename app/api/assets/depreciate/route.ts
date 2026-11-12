import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost, assertCompanyFeature } from "@/lib/server/plan-guard";
import { createEntry } from "@/lib/ledger/repo";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadAssets } from "@/lib/assets/store";
import { depreciationLines, monthEnd } from "@/lib/assets/depreciation";

const Body = z.object({ companyId: z.string().min(1), ym: z.string().regex(/^\d{4}-\d{2}$/) });

/** GET /api/assets/depreciate?companyId=…&ym=… — what would be posted for the month */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", ym = sp.get("ym") ?? "";
  if (!/^\d{4}-\d{2}$/.test(ym)) throw new HttpError(400, "Месяц в формате ГГГГ-ММ");
  await requireCompany(companyId, "view");
  const d = depreciationLines(await loadAssets(companyId), ym);
  return NextResponse.json({ ym, date: monthEnd(ym), ...d });
});

/** POST /api/assets/depreciate — post (or re-post) the month's depreciation as one entry */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, ym } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "fixedAssets");
  const d = depreciationLines(await loadAssets(companyId), ym);
  if (!d.lines.length) throw new HttpError(400, "За этот месяц амортизация не начисляется: нет объектов в эксплуатации или все самортизированы");
  const existing = await prisma.journalEntry.count({ where: { companyId, source: "depreciation", sourceRef: ym } });
  if (!existing) await assertCanPost(companyId);
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { companyId, source: "depreciation", sourceRef: ym } });
    await createEntry(tx, {
      companyId, date: monthEnd(ym), source: "depreciation", sourceRef: ym,
      description: `Начисление амортизации за ${ym.slice(5, 7)}.${ym.slice(0, 4)} (${d.rows.length} об.)`,
      lines: d.lines,
    });
  });
  await logActivity("depreciation", companyId, { ym, total: d.total });
  return NextResponse.json({ ok: true, replaced: existing > 0, total: d.total, count: d.rows.length });
});

/** DELETE /api/assets/depreciate?companyId=…&ym=… — cancel the month's depreciation entry */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", ym = sp.get("ym") ?? "";
  await requireCompany(companyId, "edit");
  const r = await prisma.journalEntry.deleteMany({ where: { companyId, source: "depreciation", sourceRef: ym } });
  return NextResponse.json({ ok: true, deleted: r.count });
});
