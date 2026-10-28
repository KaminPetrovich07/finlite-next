import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REGIMES } from "@/lib/tax-engine";
import { HttpError, logActivity, requireAdmin, requireCompany, route } from "@/lib/auth/server";

const Schema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  inn: z.string().trim().regex(/^\d{10,14}$/, "ИНН — 10–14 цифр").nullable().optional().or(z.literal("")),
  activity: z.string().trim().max(300).nullable().optional(),
  defaultRegime: z.string().refine((k) => k in REGIMES, "Неизвестный налоговый режим").optional(),
  patentAmount: z.number().min(0).optional(),
});

type Ctx = { params: Promise<{ id: string }> };

/** PATCH /api/companies/:id — company settings the ledger depends on (regime, patent fee) and profile */
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const user = await requireCompany(id, "edit");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const data = { ...parsed.data, ...(parsed.data.inn === "" ? { inn: null } : {}) };
  const company = await prisma.company.update({
    where: { id }, data,
    select: { id: true, name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true },
  });
  await logActivity(user.id, "company_update", id, { fields: Object.keys(parsed.data) });
  return NextResponse.json(company);
});

/** DELETE /api/companies/:id — admin only; removes the company with its journal */
export const DELETE = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const admin = await requireAdmin();
  const c = await prisma.company.findUnique({ where: { id }, select: { name: true } });
  if (!c) throw new HttpError(404, "Компания не найдена");
  await prisma.company.delete({ where: { id } });
  await logActivity(admin.id, "company_delete", id, { name: c.name });
  return NextResponse.json({ ok: true });
});
