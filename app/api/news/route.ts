import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertUserFeature } from "@/lib/server/plan-guard";
import { clean, issueKey, limit, viewerIsAdmin } from "@/lib/community/owner";
import { isPostKind } from "@/lib/news/types";
import { readPost } from "@/lib/news/read";
import { lastRun, REFRESH_EVERY_MIN } from "@/lib/news/collect";

const LIST_SELECT = { id: true, kind: true, title: true, summary: true, sourceUrl: true, sourceName: true, imageUrl: true, auto: true, docDate: true, tags: true, authorName: true, authorOrg: true, pinned: true, views: true, useful: true, createdAt: true, status: true, _count: { select: { comments: true } } } as const;

/** GET /api/news?kind=a,b&q=&tag=&take= — newest first, pinned on top */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const kinds = (sp.get("kind") ?? "").split(",").filter(isPostKind), q = clean(sp.get("q"), 100), tag = clean(sp.get("tag"), 60);
  const admin = await viewerIsAdmin();
  const rows = await prisma.post.findMany({
    where: {
      ...(admin ? {} : { status: "published" }),
      ...(kinds.length ? { kind: { in: kinds } } : {}),
      ...(tag ? { tags: { has: tag } } : {}),
      ...(q ? { OR: [{ title: { contains: q, mode: "insensitive" } }, { summary: { contains: q, mode: "insensitive" } }, { body: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: [{ pinned: "desc" }, { createdAt: "desc" }],
    take: Math.min(Number(sp.get("take")) || 60, 300),
    select: LIST_SELECT,
  });
  const tags = await prisma.post.findMany({ where: { status: "published" }, select: { tags: true }, orderBy: { createdAt: "desc" }, take: 1500 });
  const last = await lastRun();
  const count = new Map<string, number>();
  for (const t of tags) for (const x of t.tags) count.set(x, (count.get(x) ?? 0) + 1);
  return NextResponse.json({
    posts: rows.map(({ _count, ...p }) => ({ ...p, comments: _count.comments })),
    tags: [...count].sort((a, b) => b[1] - a[1]).slice(0, 30).map(([t, n]) => ({ tag: t, n })),
    admin,
    lastRunAt: last,
    stale: !last || Date.now() - last.getTime() > REFRESH_EVERY_MIN * 60e3,
  });
});

/** POST /api/news — a new publication; the answer carries the key to edit or delete it */
export const POST = route(async (req: NextRequest) => {
  await limit("post", 10, 60);
  const data = readPost(await req.json().catch(() => null));
  const me = await getCurrentUser();
  if (AUTH_ON) {
    if (!me) throw new HttpError(401, "Войдите, чтобы публиковать");
    if (!(await viewerIsAdmin()) && ["article", "research", "collection"].includes(data.kind)) assertUserFeature(me, "publish");
  }
  const { key, hash } = issueKey();
  const post = await prisma.post.create({ data: { ...data, userId: me?.id ?? null, editHash: hash } });
  await logActivity("post_create", null, { id: post.id, kind: post.kind });
  return NextResponse.json({ id: post.id, key }, { status: 201 });
});
