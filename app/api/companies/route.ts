import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REGIMES } from "@/lib/tax-engine";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";

/**
 * GET /api/companies — companies the user can open, with their access level.
 * Admin sees every company (with owner); others see own + shared.
 */
export const GET = route(async () => {
  const user = await requireUser();
  const rows = await prisma.company.findMany({
    where: user.role === "admin" ? undefined : { OR: [{ ownerId: user.id }, { access: { some: { userId: user.id } } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true, createdAt: true, ownerId: true,
      owner: { select: { name: true, email: true } },
      access: { where: { userId: user.id }, select: { level: true } },
      _count: { select: { journalEntries: true } },
    },
  });
  return NextResponse.json(rows.map(({ access, _count, ...c }) => {
    const own = c.ownerId === user.id;
    const level = user.role === "admin" || own ? "edit" : access[0]?.level === "edit" ? "edit" : "view";
    return { ...c, own, entries: _count.journalEntries, access: user.role === "limited" ? "view" : level };
  }));
});

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Название компании обязательно").max(200),
  inn: z.string().trim().regex(/^\d{10,14}$/, "ИНН — 10–14 цифр").optional().or(z.literal("")),
  activity: z.string().trim().max(300).optional(),
  defaultRegime: z.string().refine((k) => k in REGIMES, "Неизвестный налоговый режим").optional().or(z.literal("")),
});

/** POST /api/companies — create a company owned by the current user */
export const POST = route(async (req: NextRequest) => {
  const user = await requireUser();
  if (user.role === "limited") throw new HttpError(403, "С ограниченным доступом создавать компании нельзя — обратитесь к администратору");
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, inn, activity, defaultRegime } = parsed.data;
  const company = await prisma.company.create({
    data: { name, inn: inn || null, activity: activity || null, defaultRegime: defaultRegime || null, ownerId: user.id },
  });
  await logActivity(user.id, "company_create", company.id, { name });
  return NextResponse.json({ ...company, own: true, access: "edit", entries: 0 }, { status: 201 });
});
