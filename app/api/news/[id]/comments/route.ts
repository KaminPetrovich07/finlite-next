import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertOwner, clean, issueKey, limit, viewerIsAdmin } from "@/lib/community/owner";

type Ctx = { params: Promise<{ id: string }> };

/** POST /api/news/[id]/comments — { authorName, authorOrg?, body, parentId? } */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await limit("comment", 30, 60);
  const b = await req.json().catch(() => null);
  const body = clean(b?.body, 5000), authorName = clean(b?.authorName, 120);
  if (body.length < 2) throw new HttpError(400, "Комментарий пустой");
  if (!authorName) throw new HttpError(400, "Укажите имя — анонимных комментариев нет");
  const me = await getCurrentUser();
  if (AUTH_ON && !me) throw new HttpError(401, "Войдите, чтобы комментировать");
  const post = await prisma.post.findUnique({ where: { id }, select: { status: true } });
  if (!post || post.status !== "published") throw new HttpError(404, "Публикация не найдена");
  const parentId = typeof b?.parentId === "string" && (await prisma.comment.count({ where: { id: b.parentId, postId: id } })) ? b.parentId : null;
  const { key, hash } = issueKey();
  const c = await prisma.comment.create({ data: { postId: id, parentId, authorName, authorOrg: clean(b?.authorOrg, 200) || null, body, userId: me?.id ?? null, editHash: hash } });
  return NextResponse.json({ id: c.id, key }, { status: 201 });
});

/** DELETE /api/news/[id]/comments?commentId=&key= — author or administrator; PATCH (admin) hides */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const c = await prisma.comment.findUnique({ where: { id: sp.get("commentId") ?? "" }, select: { id: true, editHash: true } });
  if (!c) throw new HttpError(404, "Комментарий не найден");
  await assertOwner(c.editHash, sp.get("key"));
  if (await viewerIsAdmin()) await prisma.comment.update({ where: { id: c.id }, data: { status: "hidden" } });
  else await prisma.comment.delete({ where: { id: c.id } });
  return NextResponse.json({ ok: true });
});
