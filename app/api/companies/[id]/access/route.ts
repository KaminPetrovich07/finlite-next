import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route, type SessionUser } from "@/lib/auth/server";

type Ctx = { params: Promise<{ id: string }> };

/** Only the owner or the admin manages who else sees a company. */
async function requireManager(id: string): Promise<SessionUser> {
  const user = await requireUser();
  const c = await prisma.company.findUnique({ where: { id }, select: { ownerId: true } });
  if (!c) throw new HttpError(404, "Компания не найдена");
  if (user.role !== "admin" && c.ownerId !== user.id) throw new HttpError(403, "Доступом управляет владелец компании или администратор");
  return user;
}

/** GET /api/companies/:id/access — who has access */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  await requireManager(id);
  const rows = await prisma.companyAccess.findMany({
    where: { companyId: id },
    orderBy: { createdAt: "asc" },
    select: { level: true, createdAt: true, user: { select: { id: true, name: true, email: true, role: true } } },
  });
  return NextResponse.json(rows);
});

const Grant = z.object({ email: z.string().trim().toLowerCase().email("Неверный email"), level: z.enum(["view", "edit"]) });

/** POST /api/companies/:id/access { email, level } — share with a registered user */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const me = await requireManager(id);
  const parsed = Grant.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const target = await prisma.user.findUnique({ where: { email: parsed.data.email }, select: { id: true, role: true } });
  if (!target) throw new HttpError(404, "Пользователь с таким email не зарегистрирован — попросите его зарегистрироваться");
  if (target.id === me.id) throw new HttpError(400, "Это вы");
  await prisma.companyAccess.upsert({
    where: { companyId_userId: { companyId: id, userId: target.id } },
    create: { companyId: id, userId: target.id, level: parsed.data.level },
    update: { level: parsed.data.level },
  });
  await logActivity(me.id, "access_grant", id, { email: parsed.data.email, level: parsed.data.level });
  return NextResponse.json({ ok: true, note: target.role === "limited" && parsed.data.level === "edit" ? "У пользователя ограниченный доступ — он сможет только просматривать" : undefined });
});

/** DELETE /api/companies/:id/access?userId=… */
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const me = await requireManager(id);
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) throw new HttpError(400, "userId обязателен");
  await prisma.companyAccess.deleteMany({ where: { companyId: id, userId } });
  await logActivity(me.id, "access_revoke", id, { userId });
  return NextResponse.json({ ok: true });
});
