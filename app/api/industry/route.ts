import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { assertCompanyFeature } from "@/lib/server/plan-guard";
import { getRecord, putRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { SAMPLE_BANK, SAMPLE_INSURER, SAMPLE_PUBLIC } from "@/lib/industry/samples";

const SECTORS = { bank: SAMPLE_BANK, insurer: SAMPLE_INSURER, public: SAMPLE_PUBLIC } as const;
type Sector = keyof typeof SECTORS;
const isSector = (s: unknown): s is Sector => typeof s === "string" && s in SECTORS;

/** GET /api/industry?companyId=…&sector=bank|insurer|public — saved inputs or the sample */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", sector = sp.get("sector");
  if (!isSector(sector)) throw new HttpError(400, "Отрасль: bank, insurer или public");
  const level = await requireCompany(companyId, "view");
  const saved = companyId === DEMO_COMPANY.id ? null : await getRecord(companyId, "industry", sector);
  return NextResponse.json({ data: saved ?? SECTORS[sector], sample: !saved, readOnly: companyId === DEMO_COMPANY.id || level === "view" });
});

/** PUT /api/industry — { companyId, sector, data } */
export const PUT = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), sector: z.string(), data: z.record(z.unknown()) }).safeParse(await req.json().catch(() => null));
  if (!p.success || !isSector(p.data.sector)) throw new HttpError(400, "Неверные данные");
  const { companyId, sector, data } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "industry");
  if (JSON.stringify(data).length > 200_000) throw new HttpError(400, "Слишком много данных");
  await putRecord(companyId, "industry", sector, data);
  return NextResponse.json({ ok: true });
});
