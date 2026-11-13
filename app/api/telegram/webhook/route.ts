import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { companyByLinkCode, loadCalendarSettings, saveCalendarSettings, companyEvents, bishkekToday } from "@/lib/calendar/server";
import { reminderText } from "@/lib/calendar/events";
import { sendTelegram } from "@/lib/notify/send";
import { alertSettings, saveAlertSettings } from "@/lib/monitor/errors";

/**
 * POST /api/telegram/webhook — updates from the bot. Telegram sends the secret
 * set in setWebhook in X-Telegram-Bot-Api-Secret-Token.
 *   /start <code> — subscribe this chat to the company's reminders
 *   /stop         — unsubscribe from every company
 *   /next         — upcoming deadlines now
 */
export async function POST(req: NextRequest) {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!secret || req.headers.get("x-telegram-bot-api-secret-token") !== secret) return NextResponse.json({ ok: false }, { status: 401 });
  const u = await req.json().catch(() => null);
  const msg = u?.message;
  const chatId: number | undefined = msg?.chat?.id;
  const text: string = (msg?.text ?? "").trim();
  if (!chatId || !text) return NextResponse.json({ ok: true });
  const who = msg.chat.title ?? [msg.from?.first_name, msg.from?.last_name].filter(Boolean).join(" ") ?? String(chatId);
  try {
    const subscribed = await prisma.companyRecord.findMany({ where: { kind: "calendar" }, select: { companyId: true, data: true, company: { select: { name: true } } } });
    const mine = subscribed.filter((r) => ((r.data as any)?.chats ?? []).some((c: any) => c.id === chatId));
    const arg = text.split(/\s+/)[1] ?? "";
    if (text.startsWith("/start") && arg.startsWith("alerts_")) {
      // администратор подключает чат к оповещениям об ошибках сайта
      const s = await alertSettings();
      if (s.code && arg === `alerts_${s.code}`) {
        if (!s.chats.some((c) => c.id === chatId)) s.chats.push({ id: chatId, name: who, at: new Date().toISOString() });
        s.code = undefined; // ссылка одноразовая
        await saveAlertSettings(s);
        await sendTelegram(chatId, "Готово: сюда будут приходить сообщения об ошибках на сайте FinLite KG.");
      } else await sendTelegram(chatId, "Ссылка устарела. Получите новую в Админке → Ошибки.");
      return NextResponse.json({ ok: true });
    }
    if (text.startsWith("/start")) {
      const code = arg;
      const companyId = code ? await companyByLinkCode(code) : null;
      if (!companyId) {
        await sendTelegram(chatId, "Откройте ссылку на бота из раздела «Налоговый календарь» в FinLite KG — так бот узнает, о какой компании напоминать.");
      } else {
        const s = await loadCalendarSettings(companyId);
        if (!s.chats.some((c) => c.id === chatId)) s.chats.push({ id: chatId, name: who, at: new Date().toISOString() });
        await saveCalendarSettings(companyId, s);
        const c = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true } });
        await sendTelegram(chatId, `Готово: напомню о сроках налоговых отчётов «${c?.name}» за ${s.daysBefore} дн., накануне и в день срока.\n/next — ближайшие сроки, /stop — отписаться.`);
      }
    } else if (text.startsWith("/stop")) {
      for (const r of mine) {
        const s = await loadCalendarSettings(r.companyId);
        s.chats = s.chats.filter((c) => c.id !== chatId);
        await saveCalendarSettings(r.companyId, s);
      }
      await sendTelegram(chatId, mine.length ? "Напоминания выключены." : "Вы не подписаны на напоминания.");
    } else if (text.startsWith("/next")) {
      const today = bishkekToday();
      const all = [];
      for (const r of mine) all.push(...(await companyEvents(r.companyId, r.company.name, today)).events.filter((e) => e.status !== "done" && e.daysLeft >= -30 && e.daysLeft <= 30));
      await sendTelegram(chatId, all.length ? reminderText(all.sort((a, b) => a.deadline.localeCompare(b.deadline))) : "В ближайшие 30 дней сроков нет.");
    }
  } catch (e) {
    console.error("telegram webhook", e);
  }
  return NextResponse.json({ ok: true });
}
