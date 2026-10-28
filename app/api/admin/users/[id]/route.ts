import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { hashPassword, tempPassword } from "@/lib/auth/password";

type Ctx = { params: Promise<{ id: string }> };

const Schema = z.object({
  role: z.enum(["admin", "full", "limited"]).optional(),
  blocked: z.boolean().optional(),
  name: z.string().trim().min(1).max(120).optional(),
  resetPassword: z.literal(true).optional(),
});

/** PATCH /api/admin/users/:id — role, block, name; resetPassword returns a one-time password */
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const admin = await requireAdmin();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { resetPassword, ...rest } = parsed.data;
  if (id === admin.id && (rest.role && rest.role !== "admin" || rest.blocked)) {
    throw new HttpError(400, "Нельзя снять права администратора или заблокировать самого себя");
  }
  let password: string | undefined;
  const data: Record<string, unknown> = { ...rest };
  if (resetPassword) {
    password = tempPassword();
    data.passwordHash = await hashPassword(password);
  }
  const user = await prisma.user.update({ where: { id }, data, select: { id: true, email: true, role: true, blocked: true, name: true } });
  await logActivity(admin.id, resetPassword ? "admin_password_reset" : "admin_user_update", null, { userId: id, email: user.email, ...rest });
  return NextResponse.json({ user, password });
});

/** DELETE /api/admin/users/:id — removes the account; their companies stay (owner cleared) */
export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const admin = await requireAdmin();
  if (id === admin.id) throw new HttpError(400, "Нельзя удалить самого себя");
  const u = await prisma.user.delete({ where: { id }, select: { email: true } });
  await logActivity(admin.id, "admin_user_delete", null, { email: u.email });
  return NextResponse.json({ ok: true });
});
