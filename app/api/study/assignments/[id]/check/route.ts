import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireUser, route } from "@/lib/auth/server";
import { limit } from "@/lib/community/owner";
import { forStudent } from "@/lib/study/check";
import { assignmentFor, checkSubmission } from "@/lib/study/server";

export const runtime = "nodejs";

/** POST /api/study/assignments/[id]/check { userId? } — проверить работу (свою; преподаватель — любого студента или всех: userId="all"). */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  await limit("study-check", 30, 10);
  const { a, teacher } = await assignmentFor((await ctx.params).id, me);
  const b = await req.json().catch(() => ({}));
  if (teacher && b.userId === "all") {
    const subs = await prisma.submission.findMany({ where: { assignmentId: a.id }, select: { id: true } });
    for (const s of subs) await checkSubmission(s.id);
    return NextResponse.json({ ok: true, checked: subs.length });
  }
  const userId = teacher && typeof b.userId === "string" ? b.userId : me.id;
  const sub = await prisma.submission.findUnique({ where: { assignmentId_userId: { assignmentId: a.id, userId } } });
  if (!sub) throw new HttpError(400, "Работа ещё не начата");
  const r = await checkSubmission(sub.id);
  return NextResponse.json({ ok: true, result: teacher ? r : forStudent(r, a.showAnswers) });
});
