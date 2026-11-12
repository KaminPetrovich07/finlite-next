import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { bishkekToday, companyEvents, demoEvents, ensureLinkCode, loadCalendarSettings, saveCalendarSettings, visibleCompanies } from "@/lib/calendar/server";
import { emailReady, telegramReady } from "@/lib/notify/send";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

/** GET /api/calendar[?companyId=…] — deadlines of every company (or one) and its reminder settings */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const today = bishkekToday();
  const companies = await visibleCompanies();
  const events = [], problems: Array<{ company: string; problem: string }> = [];
  for (const c of companies) {
    const r = await companyEvents(c.id, c.name, today);
    events.push(...r.events);
    if (r.problem) problems.push({ company: c.name, problem: r.problem });
  }
  if (!companies.length) events.push(...(await demoEvents(today)).events);
  events.sort((a, b) => a.deadline.localeCompare(b.deadline));
  let settings = null;
  if (companyId && companyId !== DEMO_COMPANY.id) {
    await requireCompany(companyId, "view");
    const s = await loadCalendarSettings(companyId);
    const code = await ensureLinkCode(companyId);
    const bot = process.env.TELEGRAM_BOT_USERNAME;
    settings = { daysBefore: s.daysBefore, emails: s.emails, chats: s.chats.map((c) => ({ name: c.name, at: c.at, id: c.id })), botLink: bot ? `https://t.me/${bot.replace(/^@/, "")}?start=${code}` : null };
  }
  return NextResponse.json({ today, events, problems, settings, channels: { telegram: telegramReady(), email: emailReady() } });
});

const Body = z.object({
  companyId: z.string().min(1),
  daysBefore: z.number().int().min(1).max(30),
  emails: z.array(z.string().trim().email("Неверный e-mail")).max(10),
  removeChat: z.number().optional(),
});

/** PUT /api/calendar — reminder settings of a company */
export const PUT = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Неверные данные");
  const { companyId, daysBefore, emails, removeChat } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  const s = await loadCalendarSettings(companyId);
  s.daysBefore = daysBefore;
  s.emails = [...new Set(emails.map((e) => e.toLowerCase()))];
  if (removeChat !== undefined) s.chats = s.chats.filter((c) => c.id !== removeChat);
  await saveCalendarSettings(companyId, s);
  return NextResponse.json({ ok: true });
});
