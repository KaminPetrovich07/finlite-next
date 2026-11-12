import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/auth/server";

const Schema = z.object({ status: z.enum(["new", "in_progress", "done"]).optional(), reply: z.string().max(5000).nullable().optional() });

/** PATCH /api/admin/feedback/:id — status and the answer shown to the user */
export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  await requireAdmin();
  const { id } = await params;
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const f = await prisma.feedback.update({
    where: { id },
    data: { ...parsed.data, ...(parsed.data.reply ? { repliedAt: new Date() } : {}) },
  });
  return NextResponse.json(f);
});
