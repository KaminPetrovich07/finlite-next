import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { PLANS } from "@/lib/plans";

const Schema = z.object({
  role: z.enum(["admin", "user"]).optional(),
  blocked: z.boolean().optional(),
  plan: z.string().refine((k) => k in PLANS, "Неизвестный тариф").optional(),
  paidUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
  planNote: z.string().max(500).nullable().optional(),
  unlock: z.boolean().optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/admin/users/:id — role, blocking, plan and paid-until date */
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const admin = await requireAdmin();
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const d = parsed.data;
  if (id === admin.id && (d.role === "user" || d.blocked)) throw new HttpError(400, "Нельзя снять права или заблокировать самого себя");
  const user = await prisma.user.update({
    where: { id },
    data: {
      ...(d.role ? { role: d.role } : {}),
      ...(d.blocked !== undefined ? { blocked: d.blocked } : {}),
      ...(d.plan ? { plan: d.plan } : {}),
      ...(d.paidUntil !== undefined ? { paidUntil: d.paidUntil ? new Date(d.paidUntil + "T23:59:59+06:00") : null } : {}),
      ...(d.planNote !== undefined ? { planNote: d.planNote } : {}),
      ...(d.unlock ? { lockedUntil: null, failedLogins: 0 } : {}),
    },
    select: { id: true, email: true, role: true, blocked: true, plan: true, paidUntil: true, planNote: true },
  });
  if (d.blocked) await prisma.session.deleteMany({ where: { userId: id } });
  await logActivity("admin_user_update", null, { userId: id, ...d });
  return NextResponse.json(user);
});
