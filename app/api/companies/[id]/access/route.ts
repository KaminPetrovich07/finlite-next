import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { canManage } from "@/lib/auth/access";
import { normalizeEmail } from "@/lib/auth/tokens";

type Ctx = { params: Promise<{ id: string }> };

async function requireManage(id: string) {
  const level = await requireCompany(id, "view");
  if (!canManage(level)) throw new HttpError(403, "Доступом управляет владелец компании");
}

/** GET /api/companies/:id/access — who else sees the company */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  await requireManage(id);
  const rows = await prisma.companyAccess.findMany({
    where: { companyId: id }, orderBy: { createdAt: "asc" },
    select: { level: true, createdAt: true, user: { select: { id: true, email: true, name: true } } },
  });
  return NextResponse.json(rows.map((r) => ({ userId: r.user.id, email: r.user.email, name: r.user.name, level: r.level, since: r.createdAt })));
});

const Grant = z.object({ email: z.string().trim().email("Укажите e-mail").max(200), level: z.enum(["view", "edit"]) });

/** POST /api/companies/:id/access { email, level } — share with a registered user (e.g. the company's accountant) */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  await requireManage(id);
  const parsed = Grant.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (!user) throw new HttpError(404, "Пользователь с таким e-mail не зарегистрирован — попросите его сначала зарегистрироваться");
  const company = await prisma.company.findUniqueOrThrow({ where: { id }, select: { ownerId: true } });
  if (company.ownerId === user.id) throw new HttpError(400, "Это владелец компании — у него уже полный доступ");
  await prisma.companyAccess.upsert({
    where: { companyId_userId: { companyId: id, userId: user.id } },
    create: { companyId: id, userId: user.id, level: parsed.data.level },
    update: { level: parsed.data.level },
  });
  await logActivity("access_grant", id, { email, level: parsed.data.level });
  return NextResponse.json({ ok: true }, { status: 201 });
});

/** DELETE /api/companies/:id/access?userId= — revoke */
export const DELETE = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  await requireManage(id);
  const userId = req.nextUrl.searchParams.get("userId");
  if (!userId) throw new HttpError(400, "userId обязателен");
  await prisma.companyAccess.deleteMany({ where: { companyId: id, userId } });
  await logActivity("access_revoke", id, { userId });
  return NextResponse.json({ ok: true });
});
