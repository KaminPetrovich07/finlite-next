import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { putRecord } from "@/lib/records";
import { normalizeSettings, runTax, taxContext } from "@/lib/taxreports/server";
import type { Size } from "@/lib/taxreports/build";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/taxreports?companyId=…&from=…&to=…[&size=] — отчёты ГНС за период */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const ctx = await taxContext(companyId!);
  const size = (["small", "medium", "large"].includes(sp.get("size") ?? "") ? sp.get("size") : undefined) as Size | undefined;
  return NextResponse.json({ ...runTax(ctx, from, to, size), size: size ?? ctx.settings.size, demo: ctx.c.demo });
});

const Body = z.object({
  companyId: z.string().min(1),
  size: z.enum(["small", "medium", "large"]).optional(),
  filed: z.object({ key: z.string().max(40), date: z.string().regex(ISO).nullable() }).optional(),
});

/** PUT /api/taxreports — размер бизнеса и отметки «сдан» */
export const PUT = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, size, filed } = parsed.data;
  await requireCompany(companyId, "edit");
  const ctx = await taxContext(companyId);
  const next = normalizeSettings({ ...ctx.settings, ...(size ? { size } : {}) });
  if (filed) { if (filed.date) next.filed[filed.key] = filed.date; else delete next.filed[filed.key]; }
  await putRecord(companyId, "taxreports", "main", normalizeSettings(next));
  return NextResponse.json({ ok: true, settings: next });
});
