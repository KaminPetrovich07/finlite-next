import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { clean, cleanList, limit } from "@/lib/community/owner";
import { isPostKind } from "@/lib/news/types";
import { collect, errorText, readSource } from "@/lib/news/collect";
import { normalizeSource } from "@/lib/news/sources";
import { isRelevant } from "@/lib/news/feeds";

export const runtime = "nodejs";
export const maxDuration = 60;

/** Who may change the list: anybody with the link in open mode, the administrator otherwise. */
const editor = async () => { if (AUTH_ON) await requireAdmin(); };

function missingTable(e: unknown): never {
  if (/FeedSource|does not exist|P2021/i.test(String(e))) throw new HttpError(503, "В базе ещё нет таблицы источников. Выполните один раз: npx prisma db push");
  throw e;
}

/** GET /api/news/sources — the feeds and how their last download went */
export const GET = route(async () => {
  try {
    const sources = await prisma.feedSource.findMany({ orderBy: { createdAt: "asc" } });
    return NextResponse.json({ sources, canEdit: !AUTH_ON || undefined });
  } catch (e) { missingTable(e); }
});

/** POST /api/news/sources { url, name, kind, filter, tags, test? } — add a feed (or only preview it with test: true) */
export const POST = route(async (req: NextRequest) => {
  await editor();
  await limit("feed-src", 20, 60);
  const b = await req.json().catch(() => null);
  const src = normalizeSource(clean(b?.url, 500));
  if (!src) throw new HttpError(400, "Нужен адрес ленты (https://…) или Telegram-канал (@канал)");
  if (b?.test) {
    try {
      const items = await readSource(src.url, src.type);
      return NextResponse.json({
        ok: true, url: src.url, type: src.type, count: items.length,
        items: items.slice(0, 6).map((i) => ({ title: i.title, date: i.date, image: i.image, url: i.url, relevant: isRelevant(`${i.title} ${i.summary}`) })),
      });
    } catch (e) {
      return NextResponse.json({ ok: false, url: src.url, type: src.type, error: errorText(e) });
    }
  }
  const name = clean(b?.name, 120);
  if (!name) throw new HttpError(400, "Укажите название источника");
  const kind = isPostKind(b?.kind) ? b.kind : "news";
  try {
    const s = await prisma.feedSource.create({ data: { name, url: src.url, type: src.type, kind, filter: !!b?.filter, tags: cleanList(b?.tags, 5, 30) } });
    const [result] = await collect({ sourceId: s.id });
    return NextResponse.json({ ok: true, source: s, result }, { status: 201 });
  } catch (e) {
    if (/Unique constraint|P2002/.test(String(e))) throw new HttpError(409, "Такой источник уже есть");
    missingTable(e);
  }
});

/** PATCH /api/news/sources { id, enabled?, name?, kind?, filter?, tags? } */
export const PATCH = route(async (req: NextRequest) => {
  await editor();
  const b = await req.json().catch(() => null);
  const id = clean(b?.id, 40);
  if (!id) throw new HttpError(400, "Нет источника");
  const data: Record<string, unknown> = {};
  if (typeof b.enabled === "boolean") data.enabled = b.enabled;
  if (typeof b.filter === "boolean") data.filter = b.filter;
  if (typeof b.name === "string" && clean(b.name, 120)) data.name = clean(b.name, 120);
  if (isPostKind(b.kind)) data.kind = b.kind;
  if (Array.isArray(b.tags)) data.tags = cleanList(b.tags, 5, 30);
  try {
    const s = await prisma.feedSource.update({ where: { id }, data });
    return NextResponse.json({ ok: true, source: s });
  } catch (e) { missingTable(e); }
});

/** DELETE /api/news/sources?id=…[&posts=1] — remove a feed; with posts=1 also its collected items */
export const DELETE = route(async (req: NextRequest) => {
  await editor();
  const id = clean(req.nextUrl.searchParams.get("id"), 40);
  try {
    const s = await prisma.feedSource.delete({ where: { id } });
    let removed = 0;
    if (req.nextUrl.searchParams.get("posts") === "1") removed = (await prisma.post.deleteMany({ where: { auto: true, sourceName: s.name } })).count;
    return NextResponse.json({ ok: true, removed });
  } catch (e) { missingTable(e); }
});
