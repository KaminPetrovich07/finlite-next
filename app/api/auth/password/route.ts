import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { checkPassword, hashPassword, passwordProblem } from "@/lib/auth/password";

const Schema = z.object({ current: z.string(), next: z.string(), name: z.string().trim().min(2).max(120).optional() });

/** POST /api/auth/password — change own password (and optionally name) */
export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const u = await prisma.user.findUnique({ where: { id: me.id } });
  if (!u || !(await checkPassword(parsed.data.current, u.passwordHash))) throw new HttpError(400, "Текущий пароль введён неверно");
  const problem = passwordProblem(parsed.data.next);
  if (problem) throw new HttpError(400, problem);
  await prisma.user.update({ where: { id: me.id }, data: { passwordHash: await hashPassword(parsed.data.next) } });
  await logActivity(me.id, "password_change");
  return NextResponse.json({ ok: true });
});
