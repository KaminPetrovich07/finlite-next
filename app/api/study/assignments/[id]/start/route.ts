import { NextRequest, NextResponse } from "next/server";
import { logActivity, requireUser, route } from "@/lib/auth/server";
import { limit } from "@/lib/community/owner";
import { assignmentFor, startSubmission } from "@/lib/study/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/study/assignments/[id]/start — создать студенту его копию стартовой компании. */
export const POST = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const me = await requireUser();
  await limit("study-start", 10, 10);
  const { a } = await assignmentFor((await ctx.params).id, me);
  const s = await startSubmission(a.id, me);
  await logActivity("study_start", s.companyId, { assignment: a.id });
  return NextResponse.json({ ok: true, companyId: s.companyId, submissionId: s.id });
});
