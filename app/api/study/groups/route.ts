import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { clean, limit } from "@/lib/community/owner";
import { joinCode } from "@/lib/study/check";

export const runtime = "nodejs";

/** POST /api/study/groups { name } — новая учебная группа с кодом для вступления. */
export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  await limit("study-group", 20, 60);
  const name = clean((await req.json().catch(() => ({}))).name, 120);
  if (!name) throw new HttpError(400, "Укажите название группы, например «БиА-2-24»");
  for (let i = 0; i < 5; i++) {
    const code = joinCode();
    if (await prisma.studyGroup.findUnique({ where: { code } })) continue;
    const g = await prisma.studyGroup.create({ data: { name, code, ownerId: me.id } });
    await logActivity("study_group", null, { id: g.id });
    return NextResponse.json(g, { status: 201 });
  }
  throw new HttpError(500, "Не удалось подобрать код — попробуйте ещё раз");
});
