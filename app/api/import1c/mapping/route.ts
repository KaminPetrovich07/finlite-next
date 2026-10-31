import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { getRecord, putRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

/** GET /api/import1c/mapping?companyId=… — сопоставление счетов, сохранённое при прошлой загрузке */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ mapping: {} });
  let mapping: Record<string, string> = {};
  try { mapping = (await getRecord<Record<string, string>>(companyId!, "import1c", "accounts")) ?? {}; } catch { mapping = {}; }
  return NextResponse.json({ mapping });
});

const Body = z.object({ companyId: z.string().min(1), mapping: z.record(z.string().regex(/^[\d.]{2,16}$/), z.string().regex(/^(\d{4}(\.\d{2})?)?$/)) });

/** PUT /api/import1c/mapping — запоминает сопоставление для следующих загрузок */
export const PUT = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  await requireCompany(parsed.data.companyId, "edit");
  const prev = (await getRecord<Record<string, string>>(parsed.data.companyId, "import1c", "accounts")) ?? {};
  await putRecord(parsed.data.companyId, "import1c", "accounts", { ...prev, ...Object.fromEntries(Object.entries(parsed.data.mapping).filter(([, v]) => v)) });
  return NextResponse.json({ ok: true });
});
