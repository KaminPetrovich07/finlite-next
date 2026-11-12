import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { verifyPassword } from "@/lib/auth/password";
import { endSession } from "@/lib/auth/session";

const Profile = z.object({
  name: z.string().trim().min(2, "Укажите имя").max(120).optional(),
  organization: z.string().trim().max(200).nullable().optional(),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{6,20}$/, "Телефон в формате +996 …").nullable().optional().or(z.literal("")),
});

/** PATCH /api/account — name, organization, phone */
export const PATCH = route(async (req: NextRequest) => {
  const me = await requireUser();
  const parsed = Profile.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const d = parsed.data;
  const user = await prisma.user.update({
    where: { id: me.id },
    data: { ...d, ...(d.phone === "" ? { phone: null } : {}) },
    select: { id: true, email: true, name: true, organization: true, phone: true },
  });
  await logActivity("profile_update");
  return NextResponse.json(user);
});

const Delete = z.object({ password: z.string().max(200), confirm: z.literal("УДАЛИТЬ", { errorMap: () => ({ message: "Введите слово УДАЛИТЬ" }) }) });

/**
 * DELETE /api/account — removes the account, every company the user owns
 * (with journals, statements and documents) and all sessions. Companies
 * shared with the user are not touched — only the access is removed.
 */
export const DELETE = route(async (req: NextRequest) => {
  const me = await requireUser();
  const parsed = Delete.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const user = await prisma.user.findUniqueOrThrow({ where: { id: me.id } });
  if (!verifyPassword(parsed.data.password, user.passwordHash)) throw new HttpError(400, "Пароль указан неверно");
  if (user.role === "admin" && (await prisma.user.count({ where: { role: "admin" } })) === 1) {
    throw new HttpError(400, "Это единственный администратор — сначала назначьте другого");
  }
  const companies = await prisma.company.findMany({ where: { ownerId: me.id }, select: { id: true } });
  await prisma.$transaction([
    prisma.company.deleteMany({ where: { ownerId: me.id } }),
    prisma.activityLog.create({ data: { action: "account_delete", details: { companies: companies.length } } }),
    prisma.user.delete({ where: { id: me.id } }),
  ]);
  await endSession();
  return NextResponse.json({ ok: true });
});
