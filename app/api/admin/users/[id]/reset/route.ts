import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity, requireAdmin, route } from "@/lib/auth/server";
import { newToken, sha256 } from "@/lib/auth/tokens";

type Ctx = { params: Promise<{ id: string }> };

/**
 * POST /api/admin/users/:id/reset — one-time password reset link, valid 24 hours.
 * The administrator passes it to the user personally (Telegram, WhatsApp);
 * the link itself is not stored, only its hash.
 */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  await requireAdmin();
  const { id } = await params;
  const user = await prisma.user.findUniqueOrThrow({ where: { id }, select: { email: true } });
  const token = newToken();
  await prisma.passwordReset.updateMany({ where: { userId: id, usedAt: null }, data: { usedAt: new Date() } });
  await prisma.passwordReset.create({ data: { id: sha256(token), userId: id, expiresAt: new Date(Date.now() + 24 * 3600 * 1000) } });
  await logActivity("admin_reset_link", null, { userId: id });
  const base = req.headers.get("origin") ?? `https://${req.headers.get("host")}`;
  return NextResponse.json({ email: user.email, link: `${base}/reset?token=${token}`, expiresInHours: 24 });
});
