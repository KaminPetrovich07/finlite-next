import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireUser, route } from "@/lib/auth/server";
import { limit } from "@/lib/community/owner";

export const runtime = "nodejs";

/** POST /api/study/join { code } — вступить в группу по коду преподавателя. */
export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  await limit("study-join", 10, 10);
  const code = String((await req.json().catch(() => ({}))).code ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const g = code.length === 6 ? await prisma.studyGroup.findUnique({ where: { code } }) : null;
  if (!g) throw new HttpError(404, "Группа с таким кодом не найдена — проверьте код у преподавателя");
  if (g.ownerId === me.id) throw new HttpError(400, "Это ваша группа — вы в ней преподаватель");
  await prisma.studyMember.upsert({ where: { groupId_userId: { groupId: g.id, userId: me.id } }, create: { groupId: g.id, userId: me.id }, update: {} });
  return NextResponse.json({ ok: true, name: g.name });
});
