// Outgoing messages: Telegram bot and e-mail (Resend). Both are optional —
// without the keys in the environment the reminder simply is not sent.
//   TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME, TELEGRAM_WEBHOOK_SECRET
//   RESEND_API_KEY, FL_MAIL_FROM  (e.g. "FinLite KG <noreply@your-domain.kg>")

export const telegramReady = () => !!process.env.TELEGRAM_BOT_TOKEN;
export const emailReady = () => !!process.env.RESEND_API_KEY && !!process.env.FL_MAIL_FROM;

export async function telegram(method: string, body: Record<string, unknown>): Promise<any> {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("Не задан TELEGRAM_BOT_TOKEN");
  const r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  const b = await r.json().catch(() => ({}));
  if (!b.ok) throw new Error(b.description ?? `Telegram ${r.status}`);
  return b.result;
}

export async function sendTelegram(chatId: number | string, text: string): Promise<void> {
  await telegram("sendMessage", { chat_id: chatId, text, disable_web_page_preview: true });
}

export async function sendEmail(to: string[], subject: string, text: string): Promise<void> {
  if (!emailReady()) throw new Error("Почта не настроена: RESEND_API_KEY и FL_MAIL_FROM");
  const r = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
    body: JSON.stringify({ from: process.env.FL_MAIL_FROM, to, subject, text }),
    signal: AbortSignal.timeout(15000),
  });
  if (!r.ok) throw new Error(`Почта: ${r.status} ${(await r.text()).slice(0, 200)}`);
}
