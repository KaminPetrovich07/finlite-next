import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";

const Schema = z.object({ ownerEmail: z.string().trim().toLowerCase().email().nullable() });

/** PATCH /api/admin/companies/:id { ownerEmail } — hand a company to another user (or to nobody) */
export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const admin = await requireAdmin();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверный email");
  let ownerId: string | null = null;
  if (parsed.data.ownerEmail) {
    const u = await prisma.user.findUnique({ where: { email: parsed.data.ownerEmail }, select: { id: true } });
    if (!u) throw new HttpError(404, "Пользователь с таким email не найден");
    ownerId = u.id;
  }
  await prisma.company.update({ where: { id }, data: { ownerId } });
  await logActivity(admin.id, "admin_company_owner", id, { ownerEmail: parsed.data.ownerEmail });
  return NextResponse.json({ ok: true });
});
