import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertOwner, clean, issueKey, keyMatches, limit, viewerIsAdmin } from "@/lib/community/owner";

type Ctx = { params: Promise<{ id: string }> };

/** POST — a review with the author's name and organisation (no anonymous reviews) */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  await limit("review", 5, 60);
  const b = await req.json().catch(() => null);
  const authorName = clean(b?.authorName, 120), authorOrg = clean(b?.authorOrg, 200), text = clean(b?.text, 3000);
  const rating = Math.round(Number(b?.rating));
  if (!authorName || !authorOrg) throw new HttpError(400, "Укажите своё имя и организацию — анонимных отзывов нет");
  if (!(rating >= 1 && rating <= 5)) throw new HttpError(400, "Оценка — от 1 до 5");
  if (text.length < 20) throw new HttpError(400, "Опишите работу специалиста — хотя бы пару предложений");
  if (!["employer", "client", "colleague"].includes(b?.relation)) throw new HttpError(400, "Кем вы приходитесь специалисту?");
  const me = await getCurrentUser();
  if (AUTH_ON && !me) throw new HttpError(401, "Войдите, чтобы оставить отзыв");
  const s = await prisma.specialist.findUnique({ where: { id }, select: { published: true, editHash: true } });
  if (!s || !s.published) throw new HttpError(404, "Анкета не найдена");
  if (keyMatches(s.editHash, b?.specialistKey)) throw new HttpError(400, "Нельзя оставить отзыв о себе");
  const { key, hash } = issueKey();
  const r = await prisma.review.create({ data: { specialistId: id, authorName, authorOrg, authorRole: clean(b?.authorRole, 120) || null, relation: b.relation, rating, text, userId: me?.id ?? null, editHash: hash } });
  return NextResponse.json({ id: r.id, key }, { status: 201 });
});

/** PATCH — { reviewId, reply, key } the specialist answers with the profile key; administrator: { reviewId, status } */
export const PATCH = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const b = await req.json().catch(() => null);
  const r = await prisma.review.findFirst({ where: { id: String(b?.reviewId ?? ""), specialistId: id } });
  if (!r) throw new HttpError(404, "Отзыв не найден");
  if (b?.status && (await viewerIsAdmin())) {
    await prisma.review.update({ where: { id: r.id }, data: { status: b.status === "hidden" ? "hidden" : "published" } });
    return NextResponse.json({ ok: true });
  }
  const s = await prisma.specialist.findUnique({ where: { id }, select: { editHash: true } });
  await assertOwner(s?.editHash, b?.key);
  await prisma.review.update({ where: { id: r.id }, data: { reply: clean(b?.reply, 2000) || null } });
  return NextResponse.json({ ok: true });
});

/** DELETE ?reviewId=&key= — the review's author withdraws it */
export const DELETE = route(async (req: NextRequest, ctx: Ctx) => {
  const { id } = await ctx.params;
  const sp = req.nextUrl.searchParams;
  const r = await prisma.review.findFirst({ where: { id: sp.get("reviewId") ?? "", specialistId: id }, select: { id: true, editHash: true } });
  if (!r) throw new HttpError(404, "Отзыв не найден");
  await assertOwner(r.editHash, sp.get("key"));
  await prisma.review.delete({ where: { id: r.id } });
  return NextResponse.json({ ok: true });
});
