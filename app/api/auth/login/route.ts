import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, isAdminEmail, logActivity, route } from "@/lib/auth/server";
import { checkPassword } from "@/lib/auth/password";
import { assertAuthConfigured, authEnabled, cookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth/session";

const Schema = z.object({ email: z.string().trim().toLowerCase().max(200), password: z.string().max(200) });

/** POST /api/auth/login */
export const POST = route(async (req: NextRequest) => {
  if (!authEnabled()) throw new HttpError(404, "Вход в систему отключён");
  assertAuthConfigured(); // before touching the database, so a missing secret never leaves a half-created account
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Введите email и пароль");
  const { email, password } = parsed.data;
  const user = await prisma.user.findUnique({ where: { email } });
  const ok = await checkPassword(password, user?.passwordHash);
  if (!user || !ok) throw new HttpError(401, "Неверный email или пароль");
  if (user.blocked) throw new HttpError(403, "Доступ заблокирован администратором");
  // ADMIN_EMAIL is promoted on login too (covers accounts created before it was set).
  const role = isAdminEmail(email) ? "admin" : user.role;
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), role } });
  await logActivity(user.id, "login");
  const res = NextResponse.json({ id: user.id, name: user.name, email: user.email, role });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), cookieOptions);
  return res;
});
