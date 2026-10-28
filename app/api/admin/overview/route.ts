import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/overview — counts for the admin dashboard */
export const GET = route(async () => {
  await requireAdmin();
  const weekAgo = new Date(Date.now() - 7 * 86_400_000);
  const [users, byRole, companies, entries, feedbackNew, activeWeek, exportsWeek] = await Promise.all([
    prisma.user.count(),
    prisma.user.groupBy({ by: ["role"], _count: { _all: true } }),
    prisma.company.count(),
    prisma.journalEntry.count(),
    prisma.feedback.count({ where: { status: "new" } }),
    prisma.user.count({ where: { lastLoginAt: { gte: weekAgo } } }),
    prisma.activityLog.count({ where: { action: "export", createdAt: { gte: weekAgo } } }),
  ]);
  return NextResponse.json({
    users, companies, entries, feedbackNew, activeWeek, exportsWeek,
    roles: Object.fromEntries(byRole.map((r) => [r.role, r._count._all])),
  });
});
