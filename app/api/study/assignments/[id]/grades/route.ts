import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireUser, route } from "@/lib/auth/server";
import { gradesCsv } from "@/lib/study/check";
import { assignmentFor } from "@/lib/study/server";

export const runtime = "nodejs";

/** GET /api/study/assignments/[id]/grades — ведомость в CSV для Excel. */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  const { a, teacher } = await assignmentFor((await ctx.params).id, me);
  if (!teacher) throw new HttpError(403, "Ведомость доступна преподавателю");
  const [members, subs] = await Promise.all([
    prisma.studyMember.findMany({ where: { groupId: a.groupId }, include: { user: { select: { id: true, name: true, email: true } } } }),
    prisma.submission.findMany({ where: { assignmentId: a.id } }),
  ]);
  const csv = gradesCsv(members.map((m) => { const s = subs.find((x) => x.userId === m.user.id); return { name: m.user.name ?? "", email: m.user.email, score: s?.score ?? null, checks: s?.checks ?? 0, checkedAt: s?.checkedAt ?? null, started: !!s }; })
    .sort((x, y) => (x.name || x.email).localeCompare(y.name || y.email, "ru")));
  return new NextResponse(csv, { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="grades.csv"; filename*=UTF-8''${encodeURIComponent(`Ведомость_${a.title.slice(0, 40)}.csv`)}`, "Cache-Control": "no-store" } });
});
