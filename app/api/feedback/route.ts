import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";

const Schema = z.object({
  kind: z.enum(["idea", "bug", "question", "other"]).default("idea"),
  message: z.string().trim().min(5, "Опишите подробнее — хотя бы пару слов").max(5000),
  page: z.string().max(300).optional(),
});

/** POST /api/feedback — message to the system's creator */
export const POST = route(async (req: NextRequest) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const f = await prisma.feedback.create({ data: { ...parsed.data } });
  return NextResponse.json({ id: f.id }, { status: 201 });
});
