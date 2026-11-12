import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { clean, limit, safeUrl } from "@/lib/community/owner";
import { describeChanges, missingTables, saveText } from "@/lib/law/store";
import { LoadError, textFromUrl, textOf } from "@/lib/law/load";
import { compareEditions, type Changes } from "@/lib/law/text";

export const runtime = "nodejs";
export const maxDuration = 60;

const editor = async () => { if (AUTH_ON) await requireAdmin(); };
type Ctx = { params: Promise<{ slug: string }> };

async function docBySlug(slug: string) {
  const d = await prisma.legalDoc.findUnique({ where: { slug: clean(slug, 100) } });
  if (!d) throw new HttpError(404, "Документ не найден");
  return d;
}

/** GET /api/law/:slug[?edition=id] — full text, contents and the history of editions */
export const GET = route(async (req: NextRequest, ctx: Ctx) => {
  const { slug } = await ctx.params;
  try {
    const d = await docBySlug(slug);
    const editions = await prisma.legalEdition.findMany({ where: { docId: d.id }, orderBy: { createdAt: "desc" }, select: { id: true, createdAt: true, amendedAt: true, changes: true } });
    const eid = req.nextUrl.searchParams.get("edition");
    if (eid) {
      const e = await prisma.legalEdition.findFirst({ where: { id: eid, docId: d.id } });
      if (!e) throw new HttpError(404, "Редакция не найдена");
      return NextResponse.json({ edition: { id: e.id, createdAt: e.createdAt, amendedAt: e.amendedAt, text: e.text, changes: d.text ? compareEditions(e.text, d.text) : null } });
    }
    return NextResponse.json({
      doc: d,
      editions: editions.map((e) => ({ ...e, summary: e.changes ? describeChanges(e.changes as unknown as Changes) : null })),
      canEdit: !AUTH_ON || undefined,
    });
  } catch (e) { missingTables(e); }
});

/**
 * POST /api/law/:slug — load the text:
 *   JSON { url }       — from a web page or a file link (kept for the daily check);
 *   multipart «file»   — from a DOCX, PDF, HTML or TXT file.
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  await editor();
  await limit("law-load", 20, 60);
  const { slug } = await ctx.params;
  try {
    const d = await docBySlug(slug);
    let text: string, origin: "url" | "file", url: string | null = null;
    try {
      if ((req.headers.get("content-type") ?? "").includes("multipart/form-data")) {
        const form = await req.formData();
        const f = form.get("file");
        if (!(f instanceof File)) throw new HttpError(400, "Выберите файл");
        if (f.size > 25 * 1024 * 1024) throw new HttpError(400, "Файл больше 25 МБ");
        text = await textOf(f.name, f.type, new Uint8Array(await f.arrayBuffer()), d.title);
        origin = "file";
      } else {
        const b = await req.json().catch(() => null);
        url = safeUrl(b?.url) ?? d.sourceUrl;
        if (!url) throw new HttpError(400, "Вставьте ссылку на страницу документа");
        text = await textFromUrl(url, d.title);
        origin = "url";
      }
    } catch (e) {
      if (e instanceof LoadError) throw new HttpError(422, `Не удалось загрузить: ${e.message}`);
      throw e;
    }
    if (text.length < 300) throw new HttpError(422, "В файле почти нет текста — возможно, это скан. Нужен документ с текстовым слоем");
    const r = await saveText(d.id, text, origin, url);
    await logActivity("law_load", null, { slug: d.slug, origin, status: r.status, chars: r.chars });
    return NextResponse.json({ ok: true, ...r, summary: r.changes ? describeChanges(r.changes) : null });
  } catch (e) { missingTables(e); }
});

/** PATCH /api/law/:slug { autoUpdate?, sourceUrl?, title? } */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  await editor();
  const { slug } = await ctx.params;
  const b = await req.json().catch(() => null);
  const data: Record<string, unknown> = {};
  if (typeof b?.autoUpdate === "boolean") data.autoUpdate = b.autoUpdate;
  if (b?.sourceUrl === null || b?.sourceUrl === "") data.sourceUrl = null;
  else if (typeof b?.sourceUrl === "string") data.sourceUrl = safeUrl(b.sourceUrl);
  if (typeof b?.title === "string" && clean(b.title, 300).length >= 5) data.title = clean(b.title, 300);
  try {
    const d = await docBySlug(slug);
    await prisma.legalDoc.update({ where: { id: d.id }, data });
    return NextResponse.json({ ok: true });
  } catch (e) { missingTables(e); }
});

/** DELETE /api/law/:slug — remove the act and its editions */
export const DELETE = route(async (_req: NextRequest, ctx: Ctx) => {
  await editor();
  const { slug } = await ctx.params;
  try {
    const d = await docBySlug(slug);
    await prisma.legalDoc.delete({ where: { id: d.id } });
    return NextResponse.json({ ok: true });
  } catch (e) { missingTables(e); }
});
