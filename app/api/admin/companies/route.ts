import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/companies — every company with its owner (companies created before sign-in have none) */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, inn: true, createdAt: true, owner: { select: { email: true, name: true } }, _count: { select: { journalEntries: true, access: true } } },
  });
  return NextResponse.json(rows.map(({ _count, ...c }) => ({ ...c, entries: _count.journalEntries, shared: _count.access })));
});
