import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createDemoCopy } from "@/lib/ledger/demo-copy";
import { logActivity, requireUser, route } from "@/lib/auth/server";
import { assertCanCreateCompany } from "@/lib/server/plan-guard";
import { AUTH_ON } from "@/lib/auth/mode";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * POST /api/demo — creates a real, editable copy of the demo company owned by
 * the current user (unlike companyId=demo, which is read-only and lives in memory).
 */
export const POST = route(async () => {
  const me = AUTH_ON ? await requireUser() : await getCurrentUser();
  await assertCanCreateCompany(me);
  const company = await createDemoCopy(me?.id ?? null);
  await logActivity("demo_copy", company.id);
  return NextResponse.json({ id: company.id, name: company.name }, { status: 201 });
});
