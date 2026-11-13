import { NextRequest, NextResponse } from "next/server";
import { fetchNbkr } from "@/lib/fx/store";
import { recordError } from "@/lib/monitor/errors";
import { runReminders } from "@/lib/calendar/server";
import { collect } from "@/lib/news/collect";
import { publishFxDaily } from "@/lib/news/fxpost";
import { runRecurringAll } from "@/lib/ledger/recurring-server";
import { refreshIfStale } from "@/lib/science/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/daily — run by Vercel Cron (vercel.json) once a day.
 * Vercel sends «Authorization: Bearer $CRON_SECRET» when CRON_SECRET is set.
 * Loads the official NBKR rates, sends tax-deadline reminders (Telegram, e-mail)
 * collects the news feeds of «Новости и наука» and posts the recurring operations that are due.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  const result: Record<string, unknown> = {};
  try { result.fx = await fetchNbkr(); } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    result.fx = { error: message };
    // иначе курс молча «застывает» на вчерашнем — администратор узнаёт об этом в «Ошибках» и в Telegram
    await recordError({ source: "server", message: `Курсы НБКР не загрузились по расписанию: ${message}`, url: "/api/cron/daily" });
  }
  try { result.fxPost = await publishFxDaily(); } catch (e) { result.fxPost = { error: e instanceof Error ? e.message : String(e) }; }
  try { result.news = (await collect({ force: true })).map((r) => ({ source: r.source, added: r.added, ...(r.error ? { error: r.error } : {}) })); } catch (e) { result.news = { error: e instanceof Error ? e.message : String(e) }; }
  // регулярные операции (аренда, связь, подписки): проводки за наступившие даты
  try { result.recurring = await runRecurringAll(); } catch (e) { result.recurring = { error: e instanceof Error ? e.message : String(e) }; }
  try { result.reminders = await runReminders(); } catch (e) { result.reminders = { error: e instanceof Error ? e.message : String(e) }; }
  // наука: сводка OpenAlex раз в неделю, в остальные дни — перевод того, что осталось
  try { result.science = await refreshIfStale(); } catch (e) { result.science = { error: e instanceof Error ? e.message : String(e) }; }
  return NextResponse.json({ ok: true, ...result });
}
