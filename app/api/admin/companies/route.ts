import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity, requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/companies — every company with its owner (companies created before sign-in have none) */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, inn: true, createdAt: true, owner: { select: { email: true, name: true } }, _count: { select: { journalEntries: true, access: true } } },
  });
  return NextResponse.json(rows.map(({ _count, ...c }) => ({ ...c, entries: _count.journalEntries, shared: _count.access })));
});

/**
 * POST /api/admin/companies { claimOrphans: true } — companies created while
 * sign-in was off have no owner; after sign-in is switched on they go to the
 * administrator who presses the button (owners can be changed one by one later).
 */
export const POST = route(async (req: Request) => {
  const me = await requireAdmin();
  const b = await req.json().catch(() => null);
  if (b?.claimOrphans !== true) return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  const r = await prisma.company.updateMany({ where: { ownerId: null }, data: { ownerId: me.id } });
  await logActivity("admin_claim_orphans", null, { count: r.count });
  return NextResponse.json({ ok: true, count: r.count });
});
