import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getRecord, putRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { checkPolicy } from "@/lib/policy/checks";
import { documentSchedule, workingChart } from "@/lib/policy/build";
import { defaultPolicy, normalizePolicy, type PolicyInput } from "@/lib/policy/types";

/** GET /api/policy?companyId=… — saved policy (or a suggested one), checks against the journal */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId!);
  const base = defaultPolicy(ctx);
  const stored = ctx.demo ? null : await getRecord<PolicyInput>(ctx.id, "policy");
  const policy = stored ? normalizePolicy(stored, base) : base;
  return NextResponse.json({
    policy,
    saved: !!stored,
    company: { name: ctx.name, regime: ctx.regime, demo: ctx.demo },
    checks: checkPolicy(policy, ctx.regime, ctx.entries),
    chart: workingChart(policy, ctx.entries),
    schedule: documentSchedule(policy),
  });
});

const Body = z.object({ companyId: z.string().min(1), data: z.record(z.unknown()) });

/** PUT /api/policy — saves the policy; answers with fresh checks */
export const PUT = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, data } = parsed.data;
  await requireCompany(companyId, "edit");
  const ctx = await loadCompanyContext(companyId);
  const policy = normalizePolicy(data, defaultPolicy(ctx));
  await putRecord(companyId, "policy", "main", policy);
  await logActivity("policy_save", companyId);
  return NextResponse.json({
    ok: true,
    policy,
    checks: checkPolicy(policy, ctx.regime, ctx.entries),
    chart: workingChart(policy, ctx.entries),
    schedule: documentSchedule(policy),
  });
});
