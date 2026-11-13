import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, route } from "@/lib/auth/server";
import { PRESETS } from "@/lib/study/presets";

export const runtime = "nodejs";

/** GET /api/study — мои группы как преподавателя и как студента, с заданиями и моими работами. */
export const GET = route(async () => {
  const me = await requireUser();
  const [teaching, member, companies] = await Promise.all([
    prisma.studyGroup.findMany({
      where: { ownerId: me.id }, orderBy: { createdAt: "desc" },
      include: { _count: { select: { members: true } }, assignments: { orderBy: { createdAt: "desc" }, include: { _count: { select: { submissions: true } } } } },
    }),
    prisma.studyMember.findMany({
      where: { userId: me.id }, orderBy: { createdAt: "desc" },
      include: { group: { include: { owner: { select: { name: true, email: true } }, assignments: { orderBy: { createdAt: "desc" }, include: { submissions: { where: { userId: me.id }, select: { id: true, companyId: true, score: true, checks: true, checkedAt: true } } } } } } },
    }),
    prisma.company.findMany({ where: { ownerId: me.id }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const strip = <T extends { key?: unknown }>(a: T) => { const { key: _k, ...rest } = a; return rest; };
  return NextResponse.json({
    teaching: teaching.map((g) => ({ ...g, assignments: g.assignments.map(strip) })),
    learning: member.map((m) => ({ id: m.group.id, name: m.group.name, teacher: m.group.owner.name || m.group.owner.email, assignments: m.group.assignments.map((a) => ({ ...strip(a), mine: a.submissions[0] ?? null, submissions: undefined })) })),
    companies,
    presets: PRESETS.map((p) => ({ key: p.key, title: p.title, periodFrom: p.periodFrom, periodTo: p.periodTo })),
  });
});
