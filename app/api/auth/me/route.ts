import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { effectivePlan } from "@/lib/plans";

/** GET /api/auth/me — the signed-in user with the plan and its limits; { user: null } when signed out */
export const GET = route(async () => {
  const u = await getCurrentUser();
  if (!u) return NextResponse.json({ user: null });
  const owned = await prisma.company.count({ where: { ownerId: u.id } });
  const { sessionId: _s, ...user } = u;
  if (u.role === "admin") {
    return NextResponse.json({ user, plan: { key: "admin", name: "Администратор", companies: null, entriesPerMonth: null, paid: false, features: null }, owned });
  }
  const plan = effectivePlan(u.plan, u.paidUntil);
  return NextResponse.json({ user, plan: { key: plan.key, name: plan.name, companies: plan.companies, entriesPerMonth: plan.entriesPerMonth, paid: plan.paid, features: plan.features }, owned });
});
