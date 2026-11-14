import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { entriesFor, reconcile } from "@/lib/reconcile/osv";

export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const n = z.number().finite();
const Row = z.object({
  row: z.number().int().default(0), account: z.string().max(30), name: z.string().max(300).default(""), sub: z.string().max(300).default(""),
  openDr: n, openCr: n, turnDr: n, turnCr: n, closeDr: n, closeCr: n,
});
const Body = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(ISO), to: z.string().regex(ISO),
  rows: z.array(Row).min(1).max(50000),
  /** правки сопоставления на странице — поверх сохранённого при загрузке из 1С */
  mapping: z.record(z.string().max(30), z.string().regex(/^(\d{4})?$/)).default({}),
});

/** POST /api/reconcile — сверка ОСВ из 1С с журналом FinLite за тот же период */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные ведомости");
  const { companyId, from, to, rows } = parsed.data;
  if (from > to) throw new HttpError(400, "Начало периода позже конца");
  await requireCompany(companyId, "view");
  let saved: Record<string, string> = {};
  if (companyId !== DEMO_COMPANY.id) { try { saved = (await getRecord<Record<string, string>>(companyId, "import1c", "accounts")) ?? {}; } catch { saved = {}; } }
  const mapping = { ...saved, ...Object.fromEntries(Object.entries(parsed.data.mapping).filter(([, v]) => v)) };
  const ctx = await loadCompanyContext(companyId);
  const result = reconcile(ctx.entries, rows, { from, to }, mapping);
  // операции FinLite по счетам с расхождением — для сверки с карточкой счёта в 1С
  const entries = Object.fromEntries(result.rows.filter((r) => r.status === "diff" || r.status === "onlyOurs").slice(0, 60).map((r) => [r.account, entriesFor(ctx.entries, r.account, { from, to })]));
  await logActivity("reconcile_1c", companyId === DEMO_COMPANY.id ? null : companyId, { rows: rows.length, ...result.summary });
  return NextResponse.json({ ...result, mapping, entries });
});
