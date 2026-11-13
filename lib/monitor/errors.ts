// Журнал ошибок сайта и оповещение администратора в Telegram. Никогда не бросает исключений:
// сбор ошибок не должен сам ломать страницу.
import { prisma } from "@/lib/db";
import { sendTelegram, telegramReady } from "@/lib/notify/send";
import { fingerprint, isNoise, routeOf, shouldAlert } from "./fingerprint";

export interface ErrorInput { source: "client" | "server" | "api"; message: string; stack?: string | null; url?: string | null; digest?: string | null; userAgent?: string | null; userId?: string | null }

const cut = (s: string | null | undefined, n: number) => (s ? String(s).slice(0, n) : null);
export const ALERTS_KEY = "alerts";
export interface AlertSettings { code?: string; chats: Array<{ id: number; name: string; at: string }> }

export async function alertSettings(): Promise<AlertSettings> {
  const r = await prisma.appSetting.findUnique({ where: { key: ALERTS_KEY } }).catch(() => null);
  const v = (r?.value ?? {}) as Partial<AlertSettings>;
  return { code: v.code, chats: Array.isArray(v.chats) ? v.chats : [] };
}
export async function saveAlertSettings(s: AlertSettings) {
  await prisma.appSetting.upsert({ where: { key: ALERTS_KEY }, create: { key: ALERTS_KEY, value: s as object }, update: { value: s as object } });
}

async function alert(text: string) {
  if (!telegramReady()) return;
  const chats = new Set<string>((await alertSettings()).chats.map((c) => String(c.id)));
  if (process.env.FL_ALERT_CHAT_ID) chats.add(process.env.FL_ALERT_CHAT_ID);
  for (const id of chats) await sendTelegram(id, text).catch(() => undefined);
}

export async function recordError(e: ErrorInput): Promise<void> {
  try {
    const message = cut(e.message, 2000) || "Ошибка без описания";
    if (isNoise(message, e.stack)) return;
    const fp = fingerprint(e.source, message, e.stack, e.url);
    const old = await prisma.errorEvent.findUnique({ where: { fingerprint: fp }, select: { count: true, resolved: true } });
    const row = old
      ? await prisma.errorEvent.update({ where: { fingerprint: fp }, data: { count: { increment: 1 }, lastAt: new Date(), resolved: false, url: cut(e.url, 500), digest: cut(e.digest, 100) ?? undefined, userAgent: cut(e.userAgent, 300) } })
      : await prisma.errorEvent.create({ data: { fingerprint: fp, source: e.source, message, stack: cut(e.stack, 8000), url: cut(e.url, 500), digest: cut(e.digest, 100), userAgent: cut(e.userAgent, 300), userId: e.userId ?? null } });
    const reopened = !!old?.resolved;
    if (shouldAlert(row.count, !old || reopened)) {
      const where = { client: "в браузере", server: "на сервере", api: "в API" }[e.source];
      await alert([
        `${!old ? "Новая ошибка" : reopened ? "Ошибка вернулась" : `Ошибка повторилась ${row.count} раз`} ${where} FinLite`,
        routeOf(e.url) || "—",
        message.slice(0, 400),
        "Подробности: Админка → Ошибки",
      ].join("\n"));
    }
  } catch { /* журнал ошибок не должен ломать запрос */ }
}
