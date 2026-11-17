import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { LOCK_MINUTES, MAX_FAILED } from "@/lib/auth/limits";
import { RETENTION } from "@/lib/monitor/retention";
import { storageState } from "@/lib/monitor/storage";
import { RELEASE, RELEASE_DATE } from "@/lib/version";
import { adminTwofaRequired, idleMinutes } from "@/lib/auth/policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * GET /api/admin/system — сведения для администратора и проверяющих: версия,
 * где работает, база, настройки защиты, какие внешние сервисы включены.
 * Значения ключей и паролей не возвращаются никогда — только «задан / не задан».
 */
export const GET = route(async () => {
  await requireAdmin();
  const set = (k: string) => !!process.env[k];
  const [pg, users, admins, twofa, admins2fa, blocked, companies, entries, store] = await Promise.all([
    prisma.$queryRaw<Array<{ v: string }>>`SELECT current_setting('server_version') AS v`.then((r) => r[0]?.v ?? "?").catch(() => "?"),
    prisma.user.count(),
    prisma.user.count({ where: { role: "admin" } }),
    prisma.user.count({ where: { totpEnabledAt: { not: null } } }),
    prisma.user.count({ where: { role: "admin", totpEnabledAt: { not: null } } }),
    prisma.user.count({ where: { blocked: true } }),
    prisma.company.count(),
    prisma.journalEntry.count().catch(() => null),
    storageState().catch(() => null),
  ]);
  const hops = Number(process.env.FL_TRUSTED_PROXIES ?? 0) || 0;
  return NextResponse.json({
    release: RELEASE, releaseDate: RELEASE_DATE,
    runtime: { node: process.version, platform: `${process.platform}/${process.arch}`, hosting: process.env.VERCEL ? "Vercel" : "собственный сервер", uptimeMin: Math.round(process.uptime() / 60), timezone: "Asia/Bishkek (UTC+6) — даты учёта" },
    database: { engine: "PostgreSQL", version: pg, mb: store ? Math.round(store.bytes / 1048576) : null, limitMb: store ? Math.round(store.limit / 1048576) : null },
    counts: { users, admins, blocked, companies, entries },
    security: {
      authOn: AUTH_ON, passwordHash: "scrypt (N=16384, r=8, p=1), соль 16 байт", passwordRule: "не короче 8 символов, буквы и цифры, не содержит e-mail",
      lockout: `${MAX_FAILED} неверных паролей → вход закрыт на ${LOCK_MINUTES} мин`, sessionDays: 30, cookie: "HttpOnly, SameSite=Lax, Secure (HTTPS)",
      twofaUsers: twofa, twofaAdmins: admins2fa,
      clientIp: process.env.VERCEL ? "X-Real-IP от Vercel" : hops > 0 ? `X-Forwarded-For, доверенных прокси: ${hops}` : "без доверенного прокси (поставьте FL_TRUSTED_PROXIES за nginx/Caddy)",
      auditDays: RETENTION.activityDays, cronSecret: set("CRON_SECRET"),
      adminTwofaRequired: adminTwofaRequired(), idleMinutes: idleMinutes(),
    },
    integrations: [
      { name: "Курсы НБКР (nbkr.kg)", on: true, note: "раз в сутки, только загрузка курсов" },
      { name: "Тексты законов (cbd.minjust.gov.kg)", on: true, note: "по запросу пользователя и раз в сутки проверка редакций" },
      { name: "Новостные ленты", on: true, note: "открытые RSS/Telegram-каналы, только чтение" },
      { name: "Научные данные OpenAlex", on: true, note: "раздел «Наука», только чтение" },
      { name: "Почта (Resend)", on: set("RESEND_API_KEY"), note: "письма сброса пароля и напоминания" },
      { name: "Telegram-бот", on: set("TELEGRAM_BOT_TOKEN"), note: "напоминания о сроках, оповещения об ошибках" },
      { name: "ИИ-категоризация выписки (Anthropic)", on: set("ANTHROPIC_API_KEY"), note: "если включено — назначения платежей нераспознанных строк выписки уходят во внешний сервис; по умолчанию выключено" },
    ],
  });
});
