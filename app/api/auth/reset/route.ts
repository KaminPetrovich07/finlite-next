import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { sha256 } from "@/lib/auth/tokens";
import { clientIp, startSession } from "@/lib/auth/session";
import { tooMany } from "@/lib/auth/limits";

const Schema = z.object({ token: z.string().min(20).max(200), password: z.string().max(200) });

/** POST /api/auth/reset — sets a new password by a one-time link from the administrator */
export const POST = route(async (req: NextRequest) => {
  if (tooMany(`reset:${await clientIp()}`, 20)) throw new HttpError(429, "Слишком много попыток — подождите");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Ссылка недействительна");
  const r = await prisma.passwordReset.findUnique({ where: { id: sha256(parsed.data.token) }, include: { user: true } });
  if (!r || r.usedAt || r.expiresAt.getTime() < Date.now() || r.user.blocked) throw new HttpError(400, "Ссылка недействительна или устарела — попросите новую");
  const weak = passwordProblem(parsed.data.password, r.user.email);
  if (weak) throw new HttpError(400, weak);
  await prisma.$transaction([
    prisma.user.update({ where: { id: r.userId }, data: { passwordHash: hashPassword(parsed.data.password), failedLogins: 0, lockedUntil: null } }),
    prisma.passwordReset.update({ where: { id: r.id }, data: { usedAt: new Date() } }),
    prisma.session.deleteMany({ where: { userId: r.userId } }),
  ]);
  await startSession(r.userId);
  await prisma.activityLog.create({ data: { userId: r.userId, action: "password_reset" } });
  return NextResponse.json({ ok: true });
});
