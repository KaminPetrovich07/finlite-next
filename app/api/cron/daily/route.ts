import { NextRequest, NextResponse } from "next/server";
import { fetchNbkr } from "@/lib/fx/store";
import { runReminders } from "@/lib/calendar/server";
import { collect } from "@/lib/news/collect";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/daily — run by Vercel Cron (vercel.json) once a day.
 * Vercel sends «Authorization: Bearer $CRON_SECRET» when CRON_SECRET is set.
 * Loads the official NBKR rates, sends tax-deadline reminders (Telegram, e-mail)
 * and collects the news feeds of «Новости и наука».
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  const result: Record<string, unknown> = {};
  try { result.fx = await fetchNbkr(); } catch (e) { result.fx = { error: e instanceof Error ? e.message : String(e) }; }
  try { result.news = (await collect({ force: true })).map((r) => ({ source: r.source, added: r.added, ...(r.error ? { error: r.error } : {}) })); } catch (e) { result.news = { error: e instanceof Error ? e.message : String(e) }; }
  try { result.reminders = await runReminders(); } catch (e) { result.reminders = { error: e instanceof Error ? e.message : String(e) }; }
  return NextResponse.json({ ok: true, ...result });
}
