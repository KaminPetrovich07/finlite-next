import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { z } from "zod";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { assignOwners, pendingOwners } from "@/lib/auth/transition";

/** GET /api/admin/companies — every company with its owner (companies created before sign-in have none) */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, inn: true, createdAt: true, owner: { select: { email: true, name: true } }, _count: { select: { journalEntries: true, access: true } } },
  });
  const pending = await pendingOwners();
  return NextResponse.json(rows.map(({ _count, ...c }) => ({ ...c, entries: _count.journalEntries, shared: _count.access, pendingOwner: pending[c.id] ?? null })));
});

const Assign = z.object({ ids: z.array(z.string().min(1)).min(1, "Выберите компании").max(500), email: z.string().trim().email("Укажите e-mail владельца").max(200) });

/**
 * POST /api/admin/companies
 *  { claimOrphans: true } — все компании без владельца переходят к администратору;
 *  { assign: { ids, email } } — передать компании владельцу по e-mail. Если человек ещё не
 *    зарегистрирован, компании перейдут к нему при регистрации (или при входе) с этим e-mail.
 */
export const POST = route(async (req: Request) => {
  const me = await requireAdmin();
  const b = await req.json().catch(() => null);
  if (b?.claimOrphans === true) {
    const r = await prisma.company.updateMany({ where: { ownerId: null }, data: { ownerId: me.id } });
    await logActivity("admin_claim_orphans", null, { count: r.count });
    return NextResponse.json({ ok: true, count: r.count });
  }
  if (b?.assign) {
    const parsed = Assign.safeParse(b.assign);
    if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
    const r = await assignOwners(parsed.data.ids, parsed.data.email);
    await logActivity("admin_assign_owner", null, { email: r.email, now: r.now, pending: r.pending });
    return NextResponse.json({ ok: true, ...r });
  }
  throw new HttpError(400, "Неизвестное действие");
});
