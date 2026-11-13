import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireUser, route } from "@/lib/auth/server";
import { assignmentFor } from "@/lib/study/server";
import { forStudent, type CheckResult } from "@/lib/study/check";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };

/** GET /api/study/assignments/[id] — преподавателю: все работы группы; студенту: своя работа и её проверка. */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const me = await requireUser();
  const { a, teacher } = await assignmentFor((await ctx.params).id, me);
  const { key, ...assignment } = a;
  if (teacher) {
    const [members, subs] = await Promise.all([
      prisma.studyMember.findMany({ where: { groupId: a.groupId }, include: { user: { select: { id: true, name: true, email: true } } } }),
      prisma.submission.findMany({ where: { assignmentId: a.id } }),
    ]);
    const rows = members.map((m) => ({ user: m.user, submission: subs.find((s) => s.userId === m.user.id) ?? null }))
      .sort((x, y) => (x.user.name ?? x.user.email).localeCompare(y.user.name ?? y.user.email, "ru"));
    return NextResponse.json({ assignment: { ...assignment, key }, teacher: true, rows });
  }
  const sub = await prisma.submission.findUnique({ where: { assignmentId_userId: { assignmentId: a.id, userId: me.id } } });
  return NextResponse.json({
    assignment, teacher: false,
    submission: sub ? { ...sub, result: sub.result ? forStudent(sub.result as unknown as CheckResult, a.showAnswers) : null } : null,
  });
});
