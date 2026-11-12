import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { telegram } from "@/lib/notify/send";

/** POST /api/telegram/setup — point the bot at this site (once, after the token is set) */
export const POST = route(async (req: NextRequest) => {
  if (AUTH_ON) await requireAdmin();
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!process.env.TELEGRAM_BOT_TOKEN || !secret) throw new HttpError(400, "В Vercel не заданы TELEGRAM_BOT_TOKEN и TELEGRAM_WEBHOOK_SECRET");
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  const url = `https://${host}/api/telegram/webhook`;
  await telegram("setWebhook", { url, secret_token: secret, allowed_updates: ["message"] });
  await telegram("setMyCommands", { commands: [{ command: "next", description: "Ближайшие сроки" }, { command: "stop", description: "Отписаться от напоминаний" }] });
  return NextResponse.json({ ok: true, url });
});
