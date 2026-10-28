import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { REGIMES } from "@/lib/tax-engine";
import { HttpError, logActivity, route } from "@/lib/auth/server";

/** GET /api/companies — every company, newest first, with its journal size */
export const GET = route(async () => {
  const rows = await prisma.company.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, name: true, inn: true, activity: true, defaultRegime: true, patentAmount: true, createdAt: true,
      _count: { select: { journalEntries: true } },
    },
  });
  return NextResponse.json(rows.map(({ _count, ...c }) => ({ ...c, entries: _count.journalEntries, access: "edit" })));
});

const CreateSchema = z.object({
  name: z.string().trim().min(1, "Название компании обязательно").max(200),
  inn: z.string().trim().regex(/^\d{10,14}$/, "ИНН — 10–14 цифр").optional().or(z.literal("")),
  activity: z.string().trim().max(300).optional(),
  defaultRegime: z.string().refine((k) => k in REGIMES, "Неизвестный налоговый режим").optional().or(z.literal("")),
});

/** POST /api/companies — create a company */
export const POST = route(async (req: NextRequest) => {
  const parsed = CreateSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { name, inn, activity, defaultRegime } = parsed.data;
  const company = await prisma.company.create({
    data: { name, inn: inn || null, activity: activity || null, defaultRegime: defaultRegime || null },
  });
  await logActivity("company_create", company.id, { name });
  return NextResponse.json({ ...company, access: "edit", entries: 0 }, { status: 201 });
});
