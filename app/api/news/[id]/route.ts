import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { assertOwner, clean, keyMatches, viewerIsAdmin } from "@/lib/community/owner";
import { readPost } from "@/lib/news/read";
import { insightFor } from "@/lib/news/insight-server";

type Ctx = { params: Promise<{ id: string }> };

/** GET /api/news/[id]?key= — the publication with comments; counts a view */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const admin = await viewerIsAdmin();
  const p = await prisma.post.findUnique({ where: { id }, include: { comments: { orderBy: { createdAt: "asc" } } } });
  if (!p || (p.status !== "published" && !admin)) throw new HttpError(404, "Публикация не найдена");
  await prisma.post.update({ where: { id }, data: { views: { increment: 1 } } }).catch(() => undefined);
  const key = req.nextUrl.searchParams.get("key");
  const keys = (req.nextUrl.searchParams.get("keys") ?? "").split(",").filter(Boolean);
  const { editHash, comments, ...rest } = p;
  const insight = await insightFor(p).catch(() => null); // разбор — дополнение: без него страница всё равно открывается
  return NextResponse.json({
    post: { ...rest, mine: keyMatches(editHash, key) },
    insight,
    comments: comments.filter((c) => c.status === "published" || admin).map(({ editHash: h, ...c }) => ({ ...c, mine: keys.some((k) => keyMatches(h, k)) })),
    admin,
  });
});

/** PUT /api/news/[id] — edit (author's key or administrator) */
export const PUT = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const body = await req.json().catch(() => null);
  const p = await prisma.post.findUnique({ where: { id }, select: { editHash: true } });
  if (!p) throw new HttpError(404, "Публикация не найдена");
  await assertOwner(p.editHash, body?.key);
  await prisma.post.update({ where: { id }, data: readPost(body) });
  return NextResponse.json({ ok: true });
});

/** PATCH /api/news/[id] — administrator: { pinned?, status?, analysis? } — «Разбор FinLite» можно дописать и к собранной новости */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  if (!(await viewerIsAdmin())) throw new HttpError(403, "Только администратор");
  const b = await req.json().catch(() => ({}));
  await prisma.post.update({ where: { id }, data: { ...(typeof b.pinned === "boolean" ? { pinned: b.pinned } : {}), ...(b.status === "hidden" || b.status === "published" ? { status: b.status } : {}), ...(typeof b.analysis === "string" ? { analysis: clean(b.analysis, 20000) || null } : {}) } });
  return NextResponse.json({ ok: true });
});

/** DELETE /api/news/[id]?key= */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const p = await prisma.post.findUnique({ where: { id }, select: { editHash: true } });
  if (!p) throw new HttpError(404, "Публикация не найдена");
  await assertOwner(p.editHash, req.nextUrl.searchParams.get("key"));
  await prisma.post.delete({ where: { id } });
  return NextResponse.json({ ok: true });
});
