import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { clean, limit, safeUrl } from "@/lib/community/owner";
import { CATEGORIES, LAW_CATALOG, slugify } from "@/lib/law/catalog";
import { ensureCatalog, missingTables } from "@/lib/law/store";
import type { TocItem } from "@/lib/law/text";

export const runtime = "nodejs";

const LIST = { id: true, slug: true, title: true, category: true, kind: true, sourceUrl: true, requisites: true, amendedAt: true, chars: true, origin: true, autoUpdate: true, loadedAt: true, checkedAt: true, changedAt: true, lastError: true } as const;

/** Up to `max` places where `q` occurs, each with the article it is in. */
function snippets(text: string, toc: TocItem[], q: string, max = 4) {
  const out: Array<{ anchor: string | null; where: string | null; text: string }> = [];
  const low = text.toLowerCase(), needle = q.toLowerCase();
  const lineStarts: number[] = [0];
  for (let i = text.indexOf("\n"); i >= 0; i = text.indexOf("\n", i + 1)) lineStarts.push(i + 1);
  let from = 0, found = 0;
  while (out.length < max) {
    const i = low.indexOf(needle, from);
    if (i < 0) break;
    found++;
    let line = 0;
    for (let lo = 0, hi = lineStarts.length - 1; lo <= hi;) { const mid = (lo + hi) >> 1; if (lineStarts[mid] <= i) { line = mid; lo = mid + 1; } else hi = mid - 1; }
    const at = [...toc].reverse().find((t) => t.line <= line && t.level === 3) ?? [...toc].reverse().find((t) => t.line <= line) ?? null;
    if (!out.some((o) => o.anchor && o.anchor === at?.anchor)) {
      const s = Math.max(0, i - 90), e = Math.min(text.length, i + needle.length + 110);
      out.push({ anchor: at?.anchor ?? null, where: at?.label.split(".")[0] ?? null, text: `${s > 0 ? "…" : ""}${text.slice(s, e).replace(/\s+/g, " ")}${e < text.length ? "…" : ""}` });
    }
    from = i + needle.length;
  }
  let total = found;
  for (let i = low.indexOf(needle, from); i >= 0 && total < 999; i = low.indexOf(needle, i + needle.length)) total++;
  return { hits: out, total };
}

/** GET /api/law?q= — the catalogue; with q — where the words occur in the full texts */
export const GET = route(async (req: NextRequest) => {
  try {
    await ensureCatalog();
    const q = clean(req.nextUrl.searchParams.get("q"), 100);
    // порядок каталога (главное наверху), добавленные вручную — после, по названию
    const pos = (slug: string) => { const i = LAW_CATALOG.findIndex((c) => c.slug === slug); return i < 0 ? 999 : i; };
    const docs = (await prisma.legalDoc.findMany({ select: LIST })).sort((a, b) => pos(a.slug) - pos(b.slug) || a.title.localeCompare(b.title, "ru"));
    if (q.length < 2) return NextResponse.json({ docs, categories: CATEGORIES, canEdit: !AUTH_ON || undefined });
    const found = await prisma.legalDoc.findMany({ where: { text: { contains: q, mode: "insensitive" } }, select: { slug: true, title: true, text: true, toc: true } });
    const results = found.map((d) => ({ slug: d.slug, title: d.title, ...snippets(d.text ?? "", (d.toc as unknown as TocItem[]) ?? [], q) }))
      .sort((a, b) => b.total - a.total);
    return NextResponse.json({ docs, categories: CATEGORIES, results });
  } catch (e) { missingTables(e); }
});

/** POST /api/law { title, category, kind, url? } — add an act that is not in the catalogue */
export const POST = route(async (req: NextRequest) => {
  if (AUTH_ON) await requireAdmin();
  await limit("law-add", 30, 60);
  const b = await req.json().catch(() => null);
  const title = clean(b?.title, 300);
  if (title.length < 5) throw new HttpError(400, "Укажите полное название документа");
  const category = (CATEGORIES as readonly string[]).includes(b?.category) ? b.category : "Прочее";
  const kind = ["code", "law", "decree", "nbkr", "standard", "other"].includes(b?.kind) ? b.kind : "law";
  try {
    let slug = slugify(title), k = 2;
    while (await prisma.legalDoc.findUnique({ where: { slug }, select: { id: true } })) slug = `${slugify(title)}-${k++}`;
    const doc = await prisma.legalDoc.create({ data: { slug, title, category, kind, sourceUrl: safeUrl(b?.url) }, select: LIST });
    return NextResponse.json({ ok: true, doc }, { status: 201 });
  } catch (e) { missingTables(e); }
});
