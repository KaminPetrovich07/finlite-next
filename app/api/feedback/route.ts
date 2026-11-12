import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { tooMany } from "@/lib/auth/limits";
import { clientIp } from "@/lib/auth/session";

const Schema = z.object({
  kind: z.enum(["idea", "bug", "question", "other"]).default("idea"),
  message: z.string().trim().min(5, "Опишите подробнее — хотя бы пару слов").max(5000),
  page: z.string().max(300).optional(),
});

/** POST /api/feedback — message to the system's creator */
export const POST = route(async (req: NextRequest) => {
  if (tooMany(`fb:${await clientIp()}`, 15, 60 * 60 * 1000)) throw new HttpError(429, "Слишком много сообщений — попробуйте позже");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const me = await getCurrentUser();
  const f = await prisma.feedback.create({ data: { ...parsed.data, userId: me?.id ?? null } });
  return NextResponse.json({ id: f.id }, { status: 201 });
});

/** GET /api/feedback — the signed-in user's own messages with the creator's answers */
export const GET = route(async () => {
  const me = await getCurrentUser();
  if (!me) return NextResponse.json([]);
  const rows = await prisma.feedback.findMany({
    where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 100,
    select: { id: true, kind: true, message: true, status: true, reply: true, repliedAt: true, createdAt: true },
  });
  return NextResponse.json(rows);
});
