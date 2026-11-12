// ════════════════════════════════════════════════════════════════════════
// lib/calendar/events.ts — налоговый календарь: сроки отчётов ГНС по
// компании на окно «60 дней назад — 90 дней вперёд». Сроки и суммы берутся из
// модуля налоговых отчётов (lib/taxreports), поэтому календарь и страница
// «Налоговые отчёты» всегда показывают одно и то же.
// ════════════════════════════════════════════════════════════════════════
import type { TaxReport } from "@/lib/taxreports/build";

export interface CalendarEvent {
  key: string;            // form|period.from — один отчёт за один период
  companyId: string;
  companyName: string;
  form: string;
  title: string;
  periodLabel: string;
  deadline: string;
  daysLeft: number;
  status: TaxReport["status"];
  amount: number;
}

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** Selections to run the tax-report builder on, so every deadline in the window is found. */
export function selections(today: string): Array<{ from: string; to: string }> {
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const q = Math.floor((m - 1) / 3);
  // from the start of the quarter that began up to 6 months ago, to the end of the current quarter
  const start = new Date(Date.UTC(y, q * 3 - 6, 1));
  const endM = q * 3 + 3;
  const out = [{ from: start.toISOString().slice(0, 10), to: `${y}-${pad(endM)}-${lastDay(y, endM)}` }];
  // the annual declaration of last year is due on 1 April
  if (m <= 4) out.push({ from: `${y - 1}-01-01`, to: `${y - 1}-12-31` });
  return out;
}

export function toEvents(companyId: string, companyName: string, reports: TaxReport[], today: string, back = 60, ahead = 90): CalendarEvent[] {
  const lo = new Date(Date.parse(today) - back * 864e5).toISOString().slice(0, 10);
  const hi = new Date(Date.parse(today) + ahead * 864e5).toISOString().slice(0, 10);
  const seen = new Set<string>();
  const out: CalendarEvent[] = [];
  for (const r of reports) {
    const key = `${r.form}|${r.period.from}`;
    if (seen.has(key) || r.deadline < lo || r.deadline > hi) continue;
    // a past report that was handed in is history, not a task
    if (r.status === "done" && r.deadline < today) continue;
    seen.add(key);
    const daysLeft = Math.round((Date.parse(r.deadline) - Date.parse(today)) / 864e5);
    out.push({ key, companyId, companyName, form: r.form, title: r.title, periodLabel: r.periodLabel, deadline: r.deadline, daysLeft, status: r.status, amount: Math.round(r.computed * 100) / 100 });
  }
  return out.sort((a, b) => a.deadline.localeCompare(b.deadline));
}

/** Which reminders are due today: N days before, the day before and the day itself, and overdue ones once a week. */
export function dueReminders(events: CalendarEvent[], daysBefore: number): Array<{ e: CalendarEvent; tag: string }> {
  const out: Array<{ e: CalendarEvent; tag: string }> = [];
  for (const e of events) {
    if (e.status === "done") continue;
    if ([daysBefore, 1, 0].includes(e.daysLeft)) out.push({ e, tag: `${e.key}|${e.daysLeft}` });
    else if (e.daysLeft < 0 && -e.daysLeft % 7 === 1) out.push({ e, tag: `${e.key}|${e.daysLeft}` });
  }
  return out;
}

export function reminderText(items: CalendarEvent[]): string {
  const d = (iso: string) => iso.split("-").reverse().join(".");
  const money = (n: number) => n.toLocaleString("ru-RU", { maximumFractionDigits: 0 });
  const lines = items.map((e) => {
    const when = e.daysLeft > 1 ? `через ${e.daysLeft} дн.` : e.daysLeft === 1 ? "завтра" : e.daysLeft === 0 ? "сегодня" : `просрочен на ${-e.daysLeft} дн.`;
    return `• ${e.companyName}: ${e.form} — ${e.title.toLowerCase()} за ${e.periodLabel}. Срок ${d(e.deadline)} (${when})${e.amount ? `, по расчёту ${money(e.amount)} сом` : ""}`;
  });
  return `FinLite KG — сроки налоговых отчётов\n\n${lines.join("\n")}\n\nОтметить сдачу: раздел «Налоговые отчёты».`;
}
