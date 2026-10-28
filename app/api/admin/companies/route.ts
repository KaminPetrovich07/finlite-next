import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/companies — every company with owner, shares and activity */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, inn: true, defaultRegime: true, createdAt: true, updatedAt: true,
      owner: { select: { id: true, name: true, email: true } },
      access: { select: { level: true, user: { select: { id: true, name: true, email: true } } } },
      _count: { select: { journalEntries: true, bankTransactions: true, esgReports: true } },
      journalEntries: { select: { date: true }, orderBy: { date: "desc" }, take: 1 },
    },
  });
  return NextResponse.json(rows.map(({ journalEntries, ...c }) => ({ ...c, lastEntry: journalEntries[0]?.date ?? null })));
});
