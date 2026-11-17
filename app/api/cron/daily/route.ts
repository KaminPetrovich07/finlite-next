import { NextRequest, NextResponse } from "next/server";
import { fetchNbkr } from "@/lib/fx/store";
import { recordError } from "@/lib/monitor/errors";
import { runReminders } from "@/lib/calendar/server";
import { collect } from "@/lib/news/collect";
import { publishFxDaily } from "@/lib/news/fxpost";
import { runRecurringAll } from "@/lib/ledger/recurring-server";
import { refreshIfStale } from "@/lib/science/server";
import { pruneOld } from "@/lib/monitor/retention";
import { sendReminders } from "@/lib/collect/server";
import { prisma } from "@/lib/db";
import { storageState } from "@/lib/monitor/storage";

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
  // сначала убрать служебное старьё (входы, ошибки, старые автоновости), потом решать, есть ли место
  try { result.pruned = await pruneOld(); } catch (e) { result.pruned = { error: e instanceof Error ? e.message : String(e) }; }
  try { result.collectReminders = await sendReminders(); } catch (e) { result.collectReminders = { error: e instanceof Error ? e.message : String(e) }; }
  // отпечаток журнала действий раз в сутки — в журнал сервера (docker logs, Vercel Logs), вне базы:
  // по нему можно убедиться, что записи до этого момента потом не переписали целиком
  try {
    const head = await prisma.activityLog.findFirst({ where: { hash: { not: null } }, orderBy: { createdAt: "desc" }, select: { hash: true, createdAt: true } });
    if (head?.hash) { result.auditHead = { hash: head.hash, at: head.createdAt.toISOString() }; console.log(`[audit-anchor] ${head.createdAt.toISOString()} ${head.hash}`); }
  } catch { /* не мешает остальным задачам */ }
  try {
    const s = await storageState(true);
    result.storage = { mb: Math.round(s.bytes / 1048576), limitMb: Math.round(s.limit / 1048576), level: s.level };
    if (s.level !== "ok") await recordError({ source: "server", message: `База данных заполнена на ${Math.round(s.share * 100)} % (${Math.round(s.bytes / 1048576)} из ${Math.round(s.limit / 1048576)} МБ): автосбор новостей и редакций законов приостановлен. Админ → «База данных».`, url: "/api/cron/daily" });
  } catch (e) { result.storage = { error: e instanceof Error ? e.message : String(e) }; }
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
