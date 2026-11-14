import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { newToken, normalizeEmail, sha256 } from "@/lib/auth/tokens";
import { clientIp } from "@/lib/auth/session";
import { tooMany } from "@/lib/auth/limits";
import { emailReady, sendEmail, sendTelegram, telegramReady } from "@/lib/notify/send";
import { alertSettings } from "@/lib/monitor/errors";

const Schema = z.object({ email: z.string().trim().email("Укажите e-mail").max(200) });
const HOUR = 3600 * 1000;

/**
 * POST /api/auth/forgot { email } — «Забыли пароль».
 * With e-mail configured (RESEND_API_KEY, FL_MAIL_FROM) the user gets a one-time link valid 1 hour.
 * Either way the administrator sees the request in «Обратная связь» (and in Telegram, if alerts are on)
 * and can issue a link by hand. The answer is the same whether the e-mail is registered or not.
 */
export const POST = route(async (req: NextRequest) => {
  if (tooMany(`forgot:${await clientIp()}`, 5, HOUR)) throw new HttpError(429, "Слишком много запросов — попробуйте через час");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const email = normalizeEmail(parsed.data.email);
  const mail = emailReady();
  const answer = NextResponse.json({ ok: true, mail });
  if (tooMany(`forgot-email:${email}`, 3, HOUR)) return answer;

  const user = await prisma.user.findUnique({ where: { email }, select: { id: true, email: true, name: true, blocked: true } });
  if (!user || user.blocked) return answer;

  let sent = false;
  if (mail) {
    const token = newToken();
    await prisma.passwordReset.updateMany({ where: { userId: user.id, usedAt: null }, data: { usedAt: new Date() } });
    await prisma.passwordReset.create({ data: { id: sha256(token), userId: user.id, expiresAt: new Date(Date.now() + HOUR) } });
    const base = (process.env.FL_SITE_URL || req.nextUrl.origin).replace(/\/$/, "");
    try {
      await sendEmail([user.email], "FinLite KG — смена пароля",
        `Здравствуйте${user.name ? `, ${user.name}` : ""}!\n\nКто-то (надеемся, вы) запросил смену пароля в FinLite KG.\n` +
        `Чтобы задать новый пароль, откройте ссылку в течение часа:\n\n${base}/reset?token=${token}\n\n` +
        `Если вы не запрашивали смену пароля, просто не открывайте ссылку — старый пароль продолжит работать.`);
      sent = true;
    } catch { /* письмо не ушло — администратор увидит запрос ниже */ }
  }
  await prisma.feedback.create({
    data: { userId: user.id, kind: "question", page: "/login", message: sent ? "Запрос на смену пароля — ссылка отправлена на почту." : "Запрос на смену пароля. Выдайте одноразовую ссылку: Администрирование → Пользователи → «ссылка сброса».", status: sent ? "done" : "new" },
  });
  await prisma.activityLog.create({ data: { userId: user.id, action: "password_forgot", details: { mailed: sent } } });
  if (!sent && telegramReady()) {
    const chats = new Set<string>((await alertSettings()).chats.map((c) => String(c.id)));
    if (process.env.FL_ALERT_CHAT_ID) chats.add(process.env.FL_ALERT_CHAT_ID);
    for (const id of chats) await sendTelegram(id, `FinLite KG: ${user.email} просит сменить пароль. Выдайте ссылку в админке → Пользователи.`).catch(() => undefined);
  }
  return answer;
});
