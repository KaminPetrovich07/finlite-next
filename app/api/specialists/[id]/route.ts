import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { isAdmin } from "@/lib/auth/access";
import { effectivePlan, hasFeature } from "@/lib/plans";
import { assertOwner, keyMatches } from "@/lib/community/owner";
import { confirmedWorkplaces, rating, type Cert, type Education, type Workplace } from "@/lib/talent/rating";
import { readSpecialist, requireConsent } from "@/lib/talent/read";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/specialists/[id]?key=&keys= — full profile with rating breakdown and reviews */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const s = await prisma.specialist.findUnique({ where: { id }, include: { reviews: { orderBy: { createdAt: "desc" } } } });
  const key = req.nextUrl.searchParams.get("key");
  const mine = !!s && keyMatches(s.editHash, key);
  if (!s || (!s.published && !mine)) throw new HttpError(404, "Анкета не найдена");
  const me = await getCurrentUser();
  // contacts: everyone in the open mode; with sign-in — plans that include them, and the person themselves
  const contacts = !AUTH_ON || mine || (!!me && (isAdmin(me) || hasFeature(effectivePlan(me.plan, me.paidUntil), "talentContacts")));
  const workplaces = s.workplaces as unknown as Workplace[];
  const visible = s.reviews.filter((r) => r.status === "published");
  const r = rating({ experienceYears: s.experienceYears, certificates: s.certificates as unknown as Cert[], workplaces, education: s.education as unknown as Education[], about: s.about, updatedAt: s.updatedAt, reviews: visible });
  const confirmed = confirmedWorkplaces(workplaces, visible);
  const keys = (req.nextUrl.searchParams.get("keys") ?? "").split(",").filter(Boolean);
  const { editHash: _h, phone, email, telegram, reviews, ...rest } = s;
  return NextResponse.json({
    specialist: { ...rest, workplaces: workplaces.map((w, i) => ({ ...w, confirmed: confirmed[i] })), ...(contacts ? { phone, email, telegram } : { contactsHidden: !!(phone || email || telegram) }), mine },
    rating: r,
    reviews: visible.map(({ editHash, userId: _u, ...x }) => ({ ...x, mine: keys.some((k) => keyMatches(editHash, k)) })),
  });
});

/** PUT /api/specialists/[id] — the person edits their profile with the key */
export const PUT = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const raw = await req.json().catch(() => null);
  const s = await prisma.specialist.findUnique({ where: { id }, select: { editHash: true } });
  if (!s) throw new HttpError(404, "Анкета не найдена");
  await assertOwner(s.editHash, raw?.key);
  await prisma.specialist.update({ where: { id }, data: { ...readSpecialist(raw), ...requireConsent(raw) } });
  return NextResponse.json({ ok: true });
});

/** DELETE /api/specialists/[id]?key= — consent withdrawn: the profile and its reviews are deleted for good */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const s = await prisma.specialist.findUnique({ where: { id }, select: { editHash: true } });
  if (!s) throw new HttpError(404, "Анкета не найдена");
  await assertOwner(s.editHash, req.nextUrl.searchParams.get("key"));
  await prisma.specialist.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
