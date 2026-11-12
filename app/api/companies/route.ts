import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REGIMES } from "@/lib/tax-engine";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { assertCanCreateCompany } from "@/lib/server/plan-guard";
import { AUTH_ON } from "@/lib/auth/mode";

/**
 * GET /api/companies — the companies the user owns or that are shared with
 * them (the administrator sees all), newest first, with journal size and the
 * user's access level. Signed out → an empty list (only the demo is available).
 */
export const GET = route(async () => {
  const me = await getCurrentUser();
  if (!AUTH_ON) {
    // открытый режим: все компании, полный доступ
    const all = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true, createdAt: true, _count: { select: { journalEntries: true } } },
    });
    return NextResponse.json(all.map(({ _count, ...c }) => ({ ...c, entries: _count.journalEntries, access: "edit", own: true, manage: true, adminView: false, owner: null })));
  }
  if (!me) return NextResponse.json([]);
  const admin = isAdmin(me);
  const rows = await prisma.company.findMany({
    where: admin ? {} : { OR: [{ ownerId: me.id }, { access: { some: { userId: me.id } } }] },
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true, createdAt: true, ownerId: true,
      owner: { select: { email: true, name: true } },
      access: { where: { userId: me.id }, select: { level: true } },
      _count: { select: { journalEntries: true } },
    },
  });
  return NextResponse.json(rows.map(({ _count, access, owner, ownerId, ...c }) => {
    const own = ownerId === me.id;
    const level = own || admin ? "edit" : (access[0]?.level === "edit" ? "edit" : "view");
    return { ...c, entries: _count.journalEntries, access: level, own, manage: own || admin, adminView: admin && !own, owner: own ? null : owner };
  }));
});

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Название компании обязательно").max(200),
  inn: z.string().trim().regex(/^\d{10,14}$/, "ИНН — 10–14 цифр").optional().or(z.literal("")),
  activity: z.string().trim().max(300).optional(),
  defaultRegime: z.string().refine((k) => k in REGIMES, "Неизвестный налоговый режим").optional().or(z.literal("")),
});

/** POST /api/companies — create a company */
export const POST = route(async (req: NextRequest) => {
  const me = AUTH_ON ? await requireUser() : await getCurrentUser();
  await assertCanCreateCompany(me);
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, inn, activity, defaultRegime } = parsed.data;
  const company = await prisma.company.create({
    data: { name, inn: inn || null, activity: activity || null, defaultRegime: defaultRegime || null, ownerId: me?.id ?? null },
  });
  await logActivity("company_create", company.id, { name });
  return NextResponse.json({ ...company, access: "edit", own: true, manage: true, entries: 0 }, { status: 201 });
});
