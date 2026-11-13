import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { FORM_BY_ID } from "@/lib/forms";
import { buildForm } from "@/lib/forms/render";
import { loadFills } from "@/lib/forms/fills";

export const runtime = "nodejs";
export const maxDuration = 60;

const Cell = z.string().max(500);
const Body = z.object({
  formId: z.string().max(60),
  companyId: z.string().max(60).optional(),
  blank: z.boolean().optional(),
  values: z.object({
    f: z.record(z.string().max(60), Cell).optional(),
    t: z.record(z.string().max(60), z.array(z.array(Cell).max(60)).max(500)).optional(),
  }).optional(),
});

/** POST /api/forms/export?format=pdf|docx — бланк альбома: чистый или заполненный */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { formId, companyId, blank, values } = parsed.data;
  const def = FORM_BY_ID[formId];
  if (!def) throw new HttpError(404, "Бланк не найден");
  let fills = {};
  if (companyId) {
    await requireCompany(companyId, "view");
    fills = await loadFills(companyId);
  }
  await logActivity("form_export", companyId ?? null, { formId, format, blank: !!blank });
  return sendDoc(buildForm(def, values ?? {}, fills, !!blank), format);
});
