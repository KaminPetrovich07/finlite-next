import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { loadCompanyContext } from "@/lib/server/company-context";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { buildPolicyDoc } from "@/lib/policy/build";
import { defaultPolicy, normalizePolicy } from "@/lib/policy/types";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ companyId: z.string().min(1), data: z.record(z.unknown()) });

/**
 * POST /api/policy/export?format=pdf|docx — the policy as on screen (also
 * unsaved changes and the demo company), rendered as an official document.
 */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  await requireCompany(parsed.data.companyId, "view");
  const ctx = await loadCompanyContext(parsed.data.companyId);
  const policy = normalizePolicy(parsed.data.data, defaultPolicy(ctx));
  const doc = buildPolicyDoc({ name: ctx.name, regime: ctx.regime }, policy, ctx.entries);
  await logActivity("policy_export", ctx.demo ? null : ctx.id, { format });
  return sendDoc(doc, format);
});
