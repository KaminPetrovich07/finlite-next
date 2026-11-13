import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";
import { alertSettings, saveAlertSettings } from "@/lib/monitor/errors";
import { randomBytes } from "node:crypto";

export const runtime = "nodejs";

/** GET /api/admin/errors?all=1 — журнал ошибок и подключённые чаты Telegram. */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const all = req.nextUrl.searchParams.get("all") === "1";
  const [rows, open, s] = await Promise.all([
    prisma.errorEvent.findMany({ where: all ? {} : { resolved: false }, orderBy: { lastAt: "desc" }, take: 200 }),
    prisma.errorEvent.count({ where: { resolved: false } }),
    alertSettings(),
  ]);
  const bot = process.env.TELEGRAM_BOT_USERNAME;
  return NextResponse.json({
    errors: rows, open,
    alerts: { chats: s.chats, botReady: !!process.env.TELEGRAM_BOT_TOKEN && !!bot, link: s.code && bot ? `https://t.me/${bot}?start=alerts_${s.code}` : null },
  });
});

/**
 * POST /api/admin/errors
 *   { resolve: id } | { resolveAll: true } — отметить исправленными
 *   { link: true } — новая ссылка для подключения Telegram
 *   { removeChat: chatId }
 */
export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  const b = await req.json().catch(() => ({}));
  if (typeof b.resolve === "string") await prisma.errorEvent.update({ where: { id: b.resolve }, data: { resolved: true } });
  else if (b.resolveAll === true) await prisma.errorEvent.updateMany({ where: { resolved: false }, data: { resolved: true } });
  else if (b.link === true) { const s = await alertSettings(); s.code = randomBytes(9).toString("base64url"); await saveAlertSettings(s); }
  else if (b.removeChat !== undefined) { const s = await alertSettings(); s.chats = s.chats.filter((c) => c.id !== Number(b.removeChat)); await saveAlertSettings(s); }
  else return NextResponse.json({ error: "Неизвестное действие" }, { status: 400 });
  return NextResponse.json({ ok: true });
});
