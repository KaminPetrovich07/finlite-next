import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { cpContext, runCp } from "@/lib/counterparties/server";
import { buildInv17, buildReconciliationAct } from "@/lib/counterparties/doc";
import { normalizeStore } from "@/lib/counterparties/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO),
  doc: z.enum(["act", "inv17"]), cpId: z.string().max(100).optional(), store: z.unknown().optional(),
  order: z.object({ number: z.string().max(30), date: z.string().max(10) }).optional(),
});

/** POST /api/counterparties/export?format=pdf|docx — акт сверки или ИНВ-17 */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, doc, cpId } = parsed.data;
  await requireCompany(companyId, "view");
  const ctx = await cpContext(companyId);
  const store = parsed.data.store === undefined ? ctx.store : normalizeStore(parsed.data.store);
  const res = runCp(ctx, from, to, store);
  const org = { name: ctx.c.companyName, inn: ctx.c.inn, people: ctx.c.people };
  await logActivity("counterparties_export", ctx.c.demo ? null : companyId, { format, doc });
  if (doc === "act") {
    const row = res.rows.find((r) => r.id === cpId);
    if (!row) throw new HttpError(404, "Контрагент не найден");
    return sendDoc(buildReconciliationAct(org, row, store.list.find((c) => c.id === cpId), from, to), format);
  }
  const order = parsed.data.order ?? { number: "", date: "" };
  return sendDoc(buildInv17(org, res, store.list, order), format);
});
