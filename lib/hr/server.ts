// Сервер кадров: сотрудники, настройки, табель и расчёт месяца, проводка в журнал.
import { randomUUID } from "node:crypto";
import { prisma } from "@/lib/db";
import { getRecord, listRecords, putRecord } from "@/lib/records";
import { createEntry } from "@/lib/ledger/repo";
import { DEFAULT_HOLIDAYS, lastDay, workingDays } from "./calendar";
import { activeIn, computeRow, DEFAULT_SETTINGS, emptyTimesheet, payrunLines, totals, type Employee, type History, type HrSettings, type PayRow, type TimesheetRow } from "./payroll";

export interface Payrun { month: string; timesheet: TimesheetRow[]; rows?: PayRow[]; postedEntryId?: string | null; postedAt?: string | null }

export async function loadSettings(companyId: string, year?: number): Promise<HrSettings> {
  const saved = await getRecord<Partial<HrSettings> & { holidaysByYear?: Record<string, string[]> }>(companyId, "hr");
  const y = year ?? new Date().getUTCFullYear();
  const holidays = saved?.holidaysByYear?.[String(y)] ?? DEFAULT_HOLIDAYS[y] ?? [];
  const { holidaysByYear: _h, holidays: _x, ...rest } = saved ?? {};
  return { ...DEFAULT_SETTINGS, ...rest, holidays };
}

export async function saveSettings(companyId: string, s: Partial<HrSettings>, year: number) {
  const saved = (await getRecord<Record<string, unknown> & { holidaysByYear?: Record<string, string[]> }>(companyId, "hr")) ?? {};
  const num = (v: unknown, min: number, max: number) => (typeof v === "number" && Number.isFinite(v) && v >= min && v <= max ? v : undefined);
  const next: Record<string, unknown> = { ...saved };
  for (const [k, lim] of Object.entries({ employeeRate: [0, 0.5], employerRate: [0, 0.5], pitRate: [0, 0.5], maxBase: [0, 1e9], minBase: [0, 1e8], sickDaysEmployer: [0, 60], vacationDivisor: [20, 31] } as Record<string, [number, number]>)) {
    const v = num((s as Record<string, unknown>)[k], lim[0], lim[1]); if (v !== undefined) next[k] = v;
  }
  for (const k of ["sickSocialTaxable", "sickPitTaxable"] as const) if (typeof s[k] === "boolean") next[k] = s[k];
  if (Array.isArray(s.holidays)) next.holidaysByYear = { ...(saved.holidaysByYear ?? {}), [String(year)]: [...new Set(s.holidays.filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d) && d.startsWith(String(year))))].sort() };
  await putRecord(companyId, "hr", "main", next);
}

export async function listEmployees(companyId: string): Promise<Employee[]> {
  return (await listRecords<Employee>(companyId, "employee")).map((r) => ({ ...r.data, id: r.key })).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

export function cleanEmployee(raw: Record<string, unknown>): Omit<Employee, "id"> | string {
  const s = (v: unknown, n: number) => (typeof v === "string" ? v.trim().slice(0, n) : "");
  const name = s(raw.name, 160);
  if (name.length < 2) return "Укажите ФИО";
  const dept = raw.dept === "sales" || raw.dept === "admin" ? raw.dept : "production";
  const salary = Number(raw.salary);
  if (!Number.isFinite(salary) || salary < 0 || salary > 1e8) return "Укажите оклад";
  const hiredAt = s(raw.hiredAt, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(hiredAt)) return "Укажите дату приёма";
  const firedAt = s(raw.firedAt, 10);
  const pin = s(raw.pin, 20).replace(/\D/g, "");
  if (pin && pin.length !== 14) return "ПИН — 14 цифр";
  return {
    name, dept, salary: Math.round(salary * 100) / 100, hiredAt, firedAt: /^\d{4}-\d{2}-\d{2}$/.test(firedAt) ? firedAt : null,
    pin: pin || undefined, position: s(raw.position, 120) || undefined, priorYears: Math.max(0, Math.min(60, Number(raw.priorYears) || 0)), dependents3: raw.dependents3 === true,
  };
}
export const newEmployeeId = () => randomUUID().slice(0, 12);

async function history(companyId: string): Promise<Map<string, History[]>> {
  const runs = await listRecords<Payrun>(companyId, "payrun");
  const map = new Map<string, History[]>();
  for (const r of runs) {
    if (!r.data.postedEntryId || !r.data.rows) continue; // средний заработок — только по проведённым месяцам
    for (const row of r.data.rows) {
      const list = map.get(row.employeeId) ?? [];
      list.push({ month: r.data.month, earnings: row.earningsForAverage, worked: row.worked });
      map.set(row.employeeId, list);
    }
  }
  return map;
}

/** Расчёт месяца: табель (сохранённый или по умолчанию — все дни отработаны) и строки зарплаты. */
export async function computeMonth(companyId: string, month: string, timesheetOverride?: TimesheetRow[]) {
  const settings = await loadSettings(companyId, Number(month.slice(0, 4)));
  const days = workingDays(month, settings.holidays);
  const norm = days.length;
  const [employees, saved, hist] = await Promise.all([listEmployees(companyId), getRecord<Payrun>(companyId, "payrun", month), history(companyId)]);
  const active = employees.filter((e) => activeIn(e, month, lastDay(month)));
  const source = timesheetOverride ?? saved?.timesheet ?? [];
  const timesheet = active.map((e) => {
    const t = source.find((x) => x.employeeId === e.id);
    const n = (v: unknown) => Math.max(0, Number(v) || 0);
    return t ? { employeeId: e.id, worked: Math.min(n(t.worked), norm), vacationDays: Math.min(n(t.vacationDays), 31), sickDays: Math.min(n(t.sickDays), norm), unpaidDays: Math.min(n(t.unpaidDays), norm), bonus: n(t.bonus), other: n(t.other) } : emptyTimesheet(e, norm);
  });
  const rows = active.map((e, i) => computeRow(e, timesheet[i], month, norm, hist.get(e.id) ?? [], settings));
  return { month, norm, settings, employees: active, timesheet, rows, totals: totals(rows), posted: saved?.postedEntryId ? { entryId: saved.postedEntryId, at: saved.postedAt ?? null } : null };
}

export async function saveTimesheet(companyId: string, month: string, timesheet: TimesheetRow[]) {
  const saved = await getRecord<Payrun>(companyId, "payrun", month);
  const r = await computeMonth(companyId, month, timesheet);
  await putRecord<Payrun>(companyId, "payrun", month, { ...(saved ?? {}), month, timesheet: r.timesheet, rows: saved?.postedEntryId ? saved.rows : undefined });
  return r;
}

/** Провести месяц в журнал: прежняя проводка этого месяца заменяется. */
export async function postMonth(companyId: string, month: string) {
  const r = await computeMonth(companyId, month);
  if (!r.rows.length || r.totals.gross <= 0) throw new Error("Нет начислений за месяц");
  const ref = `payrun:${month}`;
  const entry = await prisma.$transaction(async (db) => {
    await db.journalEntry.deleteMany({ where: { companyId, source: "payroll", sourceRef: ref } });
    return createEntry(db, { companyId, date: lastDay(month), description: `Зарплата за ${month.split("-").reverse().join(".")}: ${r.rows.length} сотр.`, source: "payroll", sourceRef: ref, lines: payrunLines(r.rows) });
  });
  await putRecord<Payrun>(companyId, "payrun", month, { month, timesheet: r.timesheet, rows: r.rows, postedEntryId: entry.id, postedAt: new Date().toISOString() });
  return { ...r, posted: { entryId: entry.id, at: new Date().toISOString() } };
}
