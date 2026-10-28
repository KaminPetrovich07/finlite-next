import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, requireAdmin, route } from "@/lib/auth/server";

const Schema = z.object({
  status: z.enum(["new", "in_progress", "done"]).optional(),
  reply: z.string().trim().max(5000).optional(),
});

/** PATCH /api/admin/feedback/:id — status and reply (the user sees the reply in their account) */
export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await requireAdmin();
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { status, reply } = parsed.data;
  const f = await prisma.feedback.update({
    where: { id },
    data: { ...(status ? { status } : {}), ...(reply !== undefined ? { reply: reply || null, repliedAt: reply ? new Date() : null } : {}) },
  });
  return NextResponse.json(f);
});
