import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { putRecord } from "@/lib/records";
import { cpContext, runCp } from "@/lib/counterparties/server";
import { normalizeStore } from "@/lib/counterparties/types";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

function period(sp: URLSearchParams) {
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  return { from, to };
}

/** GET /api/counterparties?companyId=…&from=…&to=… — справочник и расчёты на конец периода */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  const { from, to } = period(sp);
  await requireCompany(companyId, "view");
  const ctx = await cpContext(companyId!);
  return NextResponse.json({ store: ctx.store, result: runCp(ctx, from, to), demo: ctx.c.demo, allowance: ctx.rates });
});

const Body = z.object({ companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO), store: z.unknown() });

/** PUT /api/counterparties — сохраняет справочник и привязки операций */
export const PUT = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to } = parsed.data;
  await requireCompany(companyId, "edit");
  const store = normalizeStore(parsed.data.store);
  const ctx = await cpContext(companyId);
  await putRecord(companyId, "counterparty", "main", store);
  await logActivity("counterparties_save", companyId, { count: store.list.length });
  return NextResponse.json({ ok: true, store, result: runCp(ctx, from, to, store) });
});

/** POST /api/counterparties — пересчёт без сохранения (предпросмотр правок) */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to } = parsed.data;
  await requireCompany(companyId, "view");
  const ctx = await cpContext(companyId);
  const store = normalizeStore(parsed.data.store);
  return NextResponse.json({ store, result: runCp(ctx, from, to, store) });
});
