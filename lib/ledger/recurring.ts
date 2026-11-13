// Регулярные операции: аренда, связь, подписки, проценты — одна и та же проводка каждый месяц.
// Шаблон хранится в CompanyRecord (kind «recurring»), проводки создаются ежедневной задачей
// или кнопкой «Провести»; каждая помечается sourceRef «rec:<шаблон>:<ГГГГ-ММ>», поэтому
// повторный запуск ничего не задваивает. Чистые функции — без базы.
import type { LedgerLine } from "./types";

export interface RecurringTemplate {
  id: string;
  description: string;
  lines: LedgerLine[];
  /** число месяца 1–28; 31 — последний день месяца */
  day: number;
  /** первый месяц, ГГГГ-ММ */
  from: string;
  /** последний месяц включительно, ГГГГ-ММ; null — без срока */
  until: string | null;
  paused: boolean;
  createdAt: string;
  createdByName?: string | null;
}

export interface DueRun { templateId: string; month: string; date: string; ref: string }

/** Не больше стольких пропущенных месяцев за один запуск — защита от лавины проводок. */
export const MAX_CATCH_UP = 12;

export const recRef = (templateId: string, month: string) => `rec:${templateId}:${month}`;

const pad = (n: number) => String(n).padStart(2, "0");
export const monthOf = (iso: string) => iso.slice(0, 7);
export function nextMonth(ym: string): string {
  const [y, m] = ym.split("-").map(Number);
  return m === 12 ? `${y + 1}-01` : `${y}-${pad(m + 1)}`;
}
/** Дата проводки в месяце: заданное число или последний день (31). */
export function runDate(month: string, day: number): string {
  const [y, m] = month.split("-").map(Number);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return `${month}-${pad(Math.min(day >= 31 ? last : day, last))}`;
}

/** Месяцы, за которые пора провести операцию и она ещё не проведена (по возрастанию). */
export function dueRuns(t: RecurringTemplate, done: Set<string>, today: string): DueRun[] {
  if (t.paused) return [];
  const out: DueRun[] = [];
  for (let m = t.from, guard = 0; m <= monthOf(today) && guard < 600; m = nextMonth(m), guard++) {
    if (t.until && m > t.until) break;
    const date = runDate(m, t.day);
    if (date > today) break;
    const ref = recRef(t.id, m);
    if (!done.has(ref)) out.push({ templateId: t.id, month: m, date, ref });
  }
  return out.slice(-MAX_CATCH_UP);
}

/** Ближайшая будущая дата проведения (для списка шаблонов). */
export function nextRun(t: RecurringTemplate, done: Set<string>, today: string): string | null {
  if (t.paused) return null;
  for (let m = t.from, guard = 0; guard < 600; m = nextMonth(m), guard++) {
    if (t.until && m > t.until) return null;
    const date = runDate(m, t.day);
    if (date >= today && !done.has(recRef(t.id, m))) return date;
  }
  return null;
}

export const DAY_LABEL = (day: number) => (day >= 31 ? "последний день месяца" : `${day}-го числа`);
