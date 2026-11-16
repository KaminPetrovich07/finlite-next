import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { createDemoCopy } from "@/lib/ledger/demo-copy";
import { createShowcase, createSoe } from "@/lib/showcase/seed";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { assertCanCreateCompany } from "@/lib/server/plan-guard";
import { AUTH_ON } from "@/lib/auth/mode";
import { getCurrentUser } from "@/lib/auth/session";

/**
 * POST /api/demo — creates a real, editable copy of the demo company owned by
 * the current user (unlike companyId=demo, which is read-only and lives in memory).
 */
export const maxDuration = 60;

/** ?kind=showcase — демо-компания для показа: торговля с импортом, август–ноябрь 2026 (lib/showcase/plan.ts). */
export const POST = route(async (req: NextRequest) => {
  const me = AUTH_ON ? await requireUser() : await getCurrentUser();
  await assertCanCreateCompany(me);
  if (req.nextUrl.searchParams.get("kind") === "soe") {
    const i = Number(req.nextUrl.searchParams.get("i"));
    if (!Number.isInteger(i) || i < 0 || i > 9) throw new HttpError(400, "i = 0…9");
    const r = await createSoe(me?.id ?? null, i);
    await logActivity("demo_soe", r.id, { i });
    return NextResponse.json(r, { status: 201 });
  }
  if (req.nextUrl.searchParams.get("kind") === "showcase") {
    const r = await createShowcase(me?.id ?? null);
    await logActivity("demo_showcase", r.id, { operations: r.operations });
    return NextResponse.json(r, { status: 201 });
  }
  const company = await createDemoCopy(me?.id ?? null);
  await logActivity("demo_copy", company.id);
  return NextResponse.json({ id: company.id, name: company.name }, { status: 201 });
});
