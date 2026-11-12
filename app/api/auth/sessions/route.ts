import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity, requireUser, route } from "@/lib/auth/server";

/** GET /api/auth/sessions — browsers where the user is signed in */
export const GET = route(async () => {
  const me = await requireUser();
  const rows = await prisma.session.findMany({
    where: { userId: me.id, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, createdAt: true, lastSeenAt: true, ip: true, userAgent: true },
  });
  return NextResponse.json(rows.map(({ id, ...s }) => ({ ...s, current: id === me.sessionId })));
});

/** DELETE /api/auth/sessions — sign out everywhere except this browser */
export const DELETE = route(async () => {
  const me = await requireUser();
  const r = await prisma.session.deleteMany({ where: { userId: me.id, NOT: { id: me.sessionId } } });
  await logActivity("sessions_revoke", null, { count: r.count });
  return NextResponse.json({ ok: true, count: r.count });
});
