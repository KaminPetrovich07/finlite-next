import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";
import { computeMetrics, OUTPUT_ACTIONS } from "@/lib/metrics/compute";

/** GET /api/admin/metrics — pilot metrics: DAU/WAU/MAU, weekly retention cohorts, funnel */
export const GET = route(async () => {
  await requireAdmin();
  const since = new Date(Date.now() - 120 * 24 * 3600 * 1000);
  const [users, activity, companies, entries, feedbackNew, totals] = await Promise.all([
    prisma.user.findMany({ select: { id: true, createdAt: true, role: true } }),
    prisma.activityLog.findMany({
      where: { userId: { not: null }, createdAt: { gte: since }, action: { in: ["active_day", "login", "register", ...OUTPUT_ACTIONS] } },
      select: { userId: true, createdAt: true, action: true },
    }),
    prisma.company.findMany({ select: { ownerId: true, createdAt: true } }),
    prisma.$queryRaw<Array<{ ownerId: string | null; n: bigint }>>`SELECT c."ownerId", COUNT(e.id) AS n FROM "JournalEntry" e JOIN "Company" c ON c.id = e."companyId" GROUP BY c."ownerId"`,
    prisma.feedback.count({ where: { status: "new" } }),
    Promise.all([prisma.company.count(), prisma.journalEntry.count()]),
  ]);
  const m = computeMetrics({
    now: new Date(),
    users,
    activity: activity.map((a) => ({ userId: a.userId!, at: a.createdAt, action: a.action })),
    companies,
    entriesByCompanyOwner: entries.map((e) => ({ ownerId: e.ownerId, count: Number(e.n) })),
  });
  return NextResponse.json({ ...m, companies: totals[0], entries: totals[1], feedbackNew });
});
