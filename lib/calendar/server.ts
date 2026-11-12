// Server-side: calendar across companies, reminder settings, daily reminders.
import { randomBytes } from "node:crypto";
import { prisma } from "@/lib/db";
import { getRecord, putRecord } from "@/lib/records";
import { AUTH_ON } from "@/lib/auth/mode";
import { isAdmin } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { runTax, taxContext } from "@/lib/taxreports/server";
import type { TaxReport } from "@/lib/taxreports/build";
import { dueReminders, reminderText, selections, toEvents, type CalendarEvent } from "./events";
import { emailReady, sendEmail, sendTelegram, telegramReady } from "@/lib/notify/send";

export interface CalendarSettings {
  daysBefore: number;
  emails: string[];
  chats: Array<{ id: number; name: string; at: string }>;
  /** code for the bot link t.me/<bot>?start=<code> */
  linkCode: string;
  /** reminders already sent: "STI-091|2026-07-01|3" */
  sent: string[];
}

export const bishkekToday = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);

export async function loadCalendarSettings(companyId: string): Promise<CalendarSettings> {
  let s: Partial<CalendarSettings> | null = null;
  try { s = await getRecord<CalendarSettings>(companyId, "calendar"); } catch { s = null; }
  return {
    daysBefore: s?.daysBefore ?? 3, emails: s?.emails ?? [], chats: s?.chats ?? [], sent: s?.sent ?? [],
    linkCode: s?.linkCode ?? "",
  };
}

export async function saveCalendarSettings(companyId: string, s: CalendarSettings): Promise<void> {
  await putRecord(companyId, "calendar", "main", { ...s, sent: s.sent.slice(-500) });
}

/** A stable code for the Telegram deep link, created on first use. */
export async function ensureLinkCode(companyId: string): Promise<string> {
  const s = await loadCalendarSettings(companyId);
  if (s.linkCode) return s.linkCode;
  s.linkCode = randomBytes(9).toString("base64url");
  await saveCalendarSettings(companyId, s);
  return s.linkCode;
}

export async function companyByLinkCode(code: string): Promise<string | null> {
  const r = await prisma.companyRecord.findFirst({ where: { kind: "calendar", data: { path: ["linkCode"], equals: code } }, select: { companyId: true } });
  return r?.companyId ?? null;
}

/** Companies the visitor works with: all in open mode; otherwise own, shared, or all for the administrator. */
export async function visibleCompanies(): Promise<Array<{ id: string; name: string }>> {
  const me = await getCurrentUser();
  if (AUTH_ON && !me) return [];
  const where = !AUTH_ON || (me && isAdmin(me)) ? {} : { OR: [{ ownerId: me!.id }, { access: { some: { userId: me!.id } } }] };
  return prisma.company.findMany({ where, select: { id: true, name: true }, orderBy: { name: "asc" } });
}

export async function companyEvents(companyId: string, name: string, today = bishkekToday()): Promise<{ events: CalendarEvent[]; problem: string | null }> {
  try {
    const ctx = await taxContext(companyId);
    const reports: TaxReport[] = [];
    for (const sel of selections(today)) reports.push(...runTax(ctx, sel.from, sel.to).reports);
    return { events: toEvents(companyId, name, reports, today), problem: null };
  } catch (e) {
    return { events: [], problem: e instanceof Error ? e.message : "Не удалось построить сроки" };
  }
}

export async function demoEvents(today = bishkekToday()) {
  return companyEvents(DEMO_COMPANY.id, DEMO_COMPANY.name, today);
}

/** Daily job: send what is due to every company that has subscribers. */
export async function runReminders(today = bishkekToday()): Promise<{ companies: number; messages: number; errors: string[] }> {
  const rows = await prisma.companyRecord.findMany({ where: { kind: "calendar" }, select: { companyId: true, company: { select: { name: true } } } });
  let messages = 0;
  const errors: string[] = [];
  for (const r of rows) {
    const s = await loadCalendarSettings(r.companyId);
    if (!s.chats.length && !s.emails.length) continue;
    const { events } = await companyEvents(r.companyId, r.company.name, today);
    const due = dueReminders(events, s.daysBefore).filter((x) => !s.sent.includes(x.tag));
    if (!due.length) continue;
    const text = reminderText(due.map((x) => x.e));
    let delivered = false;
    if (telegramReady()) for (const c of s.chats) {
      try { await sendTelegram(c.id, text); delivered = true; messages++; } catch (e) { errors.push(`${r.company.name} → Telegram ${c.name}: ${(e as Error).message}`); }
    }
    if (emailReady() && s.emails.length) {
      try { await sendEmail(s.emails, `Сроки налоговых отчётов: ${r.company.name}`, text); delivered = true; messages++; } catch (e) { errors.push(`${r.company.name} → почта: ${(e as Error).message}`); }
    }
    if (delivered) { s.sent.push(...due.map((x) => x.tag)); await saveCalendarSettings(r.companyId, s); }
  }
  return { companies: rows.length, messages, errors };
}
