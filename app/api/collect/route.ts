import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { createCampaign, overview } from "@/lib/collect/server";

export const runtime = "nodejs";
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/collect — сборы, которые ведёт пользователь, и отчёты, которые он должен сдать. */
export const GET = route(async () => NextResponse.json(await overview()));

const Body = z.object({
  title: z.string().trim().min(3).max(160), segment: z.string().trim().min(1).max(80),
  periodEnd: z.string().regex(ISO), deadline: z.string().regex(ISO), note: z.string().trim().max(1000).optional(),
});

/** POST /api/collect — объявить сбор отчётности по группе. */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Укажите название, группу, период и срок сдачи");
  const c = await createCampaign(p.data);
  await logActivity("collect_create", null, { id: c.id, title: c.title, segment: c.segment, periodEnd: c.periodEnd, deadline: c.deadline });
  return NextResponse.json(c, { status: 201 });
});
