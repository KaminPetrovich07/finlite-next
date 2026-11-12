import { NextRequest, NextResponse } from "next/server";
import { logActivity, route } from "@/lib/auth/server";
import { limit } from "@/lib/community/owner";
import { collect, lastRun, REFRESH_EVERY_MIN } from "@/lib/news/collect";
import { publishFxDaily } from "@/lib/news/fxpost";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/news/refresh — when the feed was last updated and whether it is time again */
export const GET = route(async () => {
  const last = await lastRun();
  return NextResponse.json({ lastRunAt: last, stale: !last || Date.now() - last.getTime() > REFRESH_EVERY_MIN * 60e3 });
});

/**
 * POST /api/news/refresh { force? } — download the feeds now. Without `force`
 * nothing happens if they were updated less than 20 minutes ago.
 */
export const POST = route(async (req: NextRequest) => {
  await limit("feed", 6, 60);
  const body = await req.json().catch(() => ({}));
  const results = await collect({ force: body?.force === true });
  if (results.length) await publishFxDaily().catch(() => undefined); // заметка о курсах за последний день
  const added = results.reduce((s, r) => s + r.added, 0);
  if (results.length) await logActivity("news_collect", null, { added, failed: results.filter((r) => !r.ok).length });
  return NextResponse.json({ ok: true, ran: results.length > 0, added, results, lastRunAt: await lastRun() });
});
