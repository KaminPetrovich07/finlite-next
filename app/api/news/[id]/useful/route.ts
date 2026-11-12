import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { limit } from "@/lib/community/owner";

/** POST /api/news/[id]/useful — { clientId } one «полезно» per browser; again — takes it back */
export const POST = route(async (req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await limit("useful", 60, 10);
  const b = await req.json().catch(() => null);
  const clientId = typeof b?.clientId === "string" ? b.clientId.slice(0, 64) : "";
  if (clientId.length < 8) throw new HttpError(400, "Нет идентификатора браузера");
  const existing = await prisma.postVote.findUnique({ where: { postId_clientId: { postId: id, clientId } } });
  if (existing) {
    await prisma.$transaction([prisma.postVote.delete({ where: { postId_clientId: { postId: id, clientId } } }), prisma.post.update({ where: { id }, data: { useful: { decrement: 1 } } })]);
  } else {
    await prisma.$transaction([prisma.postVote.create({ data: { postId: id, clientId } }), prisma.post.update({ where: { id }, data: { useful: { increment: 1 } } })]);
  }
  const p = await prisma.post.findUnique({ where: { id }, select: { useful: true } });
  return NextResponse.json({ useful: p?.useful ?? 0, voted: !existing });
});
