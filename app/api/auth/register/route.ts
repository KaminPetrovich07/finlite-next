import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, isAdminEmail, logActivity, route } from "@/lib/auth/server";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { assertAuthConfigured, authEnabled, cookieOptions, SESSION_COOKIE, signSession } from "@/lib/auth/session";

const Schema = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(120),
  email: z.string().trim().toLowerCase().email("Неверный email").max(200),
  password: z.string(),
});

/** POST /api/auth/register — free sign-up; ADMIN_EMAIL becomes administrator. */
export const POST = route(async (req: NextRequest) => {
  if (!authEnabled()) throw new HttpError(404, "Вход в систему отключён");
  assertAuthConfigured(); // before touching the database, so a missing secret never leaves a half-created account
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, email, password } = parsed.data;
  const problem = passwordProblem(password);
  if (problem) throw new HttpError(400, problem);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "Пользователь с таким email уже зарегистрирован — войдите");
  }
  const user = await prisma.user.create({
    data: { name, email, passwordHash: await hashPassword(password), role: isAdminEmail(email) ? "admin" : "full", lastLoginAt: new Date() },
    select: { id: true, name: true, email: true, role: true },
  });
  await logActivity(user.id, "register");
  const res = NextResponse.json(user, { status: 201 });
  res.cookies.set(SESSION_COOKIE, await signSession(user.id), cookieOptions);
  return res;
});
