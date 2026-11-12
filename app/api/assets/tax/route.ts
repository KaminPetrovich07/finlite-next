import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { assertCompanyFeature } from "@/lib/server/plan-guard";
import { putRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadAssets, loadTaxSettings } from "@/lib/assets/store";
import { taxChain } from "@/lib/assets/depreciation";

/** GET /api/assets/tax?companyId=…&year=YYYY — tax depreciation by НК КР groups, every year up to `year` */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const year = Number(sp.get("year")) || new Date().getUTCFullYear();
  await requireCompany(companyId, "view");
  const assets = await loadAssets(companyId);
  const settings = await loadTaxSettings(companyId, assets);
  const chain = settings.startYear <= year ? taxChain(assets, year, settings) : [];
  return NextResponse.json({ settings, years: chain, assets: assets.map((a) => ({ id: a.id, name: a.name, taxGroup: a.taxGroup, cost: a.cost, acquiredAt: a.acquiredAt })) });
});

const Group = z.record(z.string().regex(/^[1-6]$/), z.number().min(0));
const Body = z.object({
  companyId: z.string().min(1),
  settings: z.object({
    rp: z.number().min(1).max(100000),
    startYear: z.number().int().min(1990).max(2100),
    opening: Group,
    objectOpening: z.record(z.string(), z.number().min(0)),
    repairs: z.record(z.string().regex(/^\d{4}$/), Group),
  }),
});

/** PUT /api/assets/tax — opening tax values of groups, repairs by year, расчётный показатель */
export const PUT = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, settings } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "fixedAssets");
  await putRecord(companyId, "assetTax", "main", settings);
  return NextResponse.json({ ok: true });
});
