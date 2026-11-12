import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { hashPassword, passwordProblem, verifyPassword } from "@/lib/auth/password";

const Schema = z.object({ current: z.string().max(200), next: z.string().max(200) });

/** POST /api/auth/password — change the password; signs out every other browser */
export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Заполните оба поля");
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!verifyPassword(parsed.data.current, user.passwordHash)) throw new HttpError(400, "Текущий пароль указан неверно");
  const weak = passwordProblem(parsed.data.next, user.email);
  if (weak) throw new HttpError(400, weak);
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: hashPassword(parsed.data.next) } });
  await prisma.session.deleteMany({ where: { userId: me.id, NOT: { id: me.sessionId } } });
  await logActivity("password_change");
  return NextResponse.json({ ok: true });
});
