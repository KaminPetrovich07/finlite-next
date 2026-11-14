import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { normalizeEmail } from "@/lib/auth/tokens";
import { clearPending } from "@/lib/auth/transition";

const Schema = z.object({ ownerEmail: z.string().trim().email("Укажите e-mail владельца") });

/** PATCH /api/admin/companies/:id { ownerEmail } — assign or change the owner */
export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(parsed.data.ownerEmail) }, select: { id: true } });
  if (!user) throw new HttpError(404, "Пользователь с таким e-mail не найден");
  await prisma.company.update({ where: { id }, data: { ownerId: user.id } });
  await prisma.companyAccess.deleteMany({ where: { companyId: id, userId: user.id } });
  await clearPending([id]);
  await logActivity("admin_company_owner", id, { ownerEmail: parsed.data.ownerEmail });
  return NextResponse.json({ ok: true });
});
