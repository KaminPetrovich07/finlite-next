import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/users — every account with its usage */
export const GET = route(async () => {
  await requireAdmin();
  const [users, sessions, entries] = await Promise.all([
    prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      select: {
        id: true, email: true, name: true, organization: true, phone: true, role: true, blocked: true,
        plan: true, paidUntil: true, planNote: true, createdAt: true, lastLoginAt: true, lockedUntil: true, consentAt: true, totpEnabledAt: true,
        _count: { select: { ownedCompanies: true, feedback: true } },
      },
    }),
    prisma.session.groupBy({ by: ["userId"], _max: { lastSeenAt: true } }),
    prisma.$queryRaw<Array<{ ownerId: string; n: bigint }>>`SELECT c."ownerId", COUNT(e.id) AS n FROM "JournalEntry" e JOIN "Company" c ON c.id = e."companyId" WHERE c."ownerId" IS NOT NULL GROUP BY c."ownerId"`,
  ]);
  const seen = new Map(sessions.map((s) => [s.userId, s._max.lastSeenAt]));
  const posted = new Map(entries.map((e) => [e.ownerId, Number(e.n)]));
  return NextResponse.json(users.map(({ _count, ...u }) => ({
    ...u, companies: _count.ownedCompanies, feedback: _count.feedback, entries: posted.get(u.id) ?? 0, lastSeenAt: seen.get(u.id) ?? null,
  })));
});
