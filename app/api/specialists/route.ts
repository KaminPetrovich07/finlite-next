import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { clean, issueKey, limit } from "@/lib/community/owner";
import { rating, type Cert, type Education, type Workplace } from "@/lib/talent/rating";
import { readSpecialist, requireConsent } from "@/lib/talent/read";

/** GET /api/specialists?q=&spec=&city=&availability=&minExp= — published profiles, best rating first */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const q = clean(sp.get("q"), 100), spec = clean(sp.get("spec"), 60), city = clean(sp.get("city"), 100), av = sp.get("availability");
  const minExp = Number(sp.get("minExp")) || 0;
  const rows = await prisma.specialist.findMany({
    where: {
      published: true,
      ...(spec ? { specializations: { has: spec } } : {}),
      ...(city ? { city: { contains: city, mode: "insensitive" } } : {}),
      ...(av && ["open", "part", "busy"].includes(av) ? { availability: av } : {}),
      ...(minExp ? { experienceYears: { gte: minExp } } : {}),
      ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" } }, { headline: { contains: q, mode: "insensitive" } }, { about: { contains: q, mode: "insensitive" } }, { skills: { has: q } }] } : {}),
    },
    include: { reviews: { select: { rating: true, authorName: true, authorOrg: true, status: true } } },
    take: 500,
  });
  const list = rows.map((s) => {
    const r = rating({ experienceYears: s.experienceYears, certificates: s.certificates as unknown as Cert[], workplaces: s.workplaces as unknown as Workplace[], education: s.education as unknown as Education[], about: s.about, updatedAt: s.updatedAt, reviews: s.reviews });
    const w = (s.workplaces as unknown as Workplace[]) ?? [];
    return {
      id: s.id, fullName: s.fullName, headline: s.headline, city: s.city, experienceYears: s.experienceYears, specializations: s.specializations,
      availability: s.availability, workFormat: s.workFormat, rateFrom: s.rateFrom, current: w.find((x) => x.current) ?? w[0] ?? null,
      certificates: (s.certificates as unknown as Cert[]).length, rating: r.total, reviewAvg: r.reviewAvg, reviewCount: r.reviewCount, updatedAt: s.updatedAt,
    };
  }).sort((a, b) => b.rating - a.rating || b.experienceYears - a.experienceYears);
  return NextResponse.json({ specialists: list });
});

/** POST /api/specialists — a profile the person publishes about themselves; returns the edit key */
export const POST = route(async (req: NextRequest) => {
  await limit("spec", 5, 60);
  const raw = await req.json().catch(() => null);
  const me = await getCurrentUser();
  if (AUTH_ON && !me) throw new HttpError(401, "Войдите, чтобы разместить анкету");
  const data = readSpecialist(raw);
  const { key, hash } = issueKey();
  const s = await prisma.specialist.create({ data: { ...data, ...requireConsent(raw), userId: me?.id ?? null, editHash: hash } });
  await logActivity("specialist_create", null, { id: s.id });
  return NextResponse.json({ id: s.id, key }, { status: 201 });
});
