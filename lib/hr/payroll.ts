// Кадры и зарплата по сотрудникам: оклад за отработанное время, отпускные и больничные
// по среднему заработку, удержания и взносы с учётом предельной и минимальной базы.
// Чистые функции — расчёт можно проверить тестами и повторить вручную.
import type { Department } from "@/lib/ledger/payroll";
import { DEPARTMENTS } from "@/lib/ledger/payroll";
import type { LedgerLine } from "@/lib/ledger/types";

export interface Employee {
  id: string;
  name: string;
  pin?: string;            // персональный идентификационный номер (14 цифр)
  position?: string;
  dept: Department;
  salary: number;          // оклад в месяц
  hiredAt: string;         // YYYY-MM-DD
  firedAt?: string | null;
  priorYears?: number;     // трудовой стаж до приёма, лет — для процента больничного
  dependents3?: boolean;   // трое и более иждивенцев — больничный 100 % независимо от стажа
}

export interface HrSettings {
  employeeRate: number;    // взносы работника
  employerRate: number;    // взносы работодателя
  pitRate: number;         // подоходный налог
  maxBase: number;         // предельная база взносов в месяц
  minBase: number;         // минимальная база ПН и взносов (СМЗ по региону), 0 — не применять
  sickDaysEmployer: number; // сколько рабочих дней больничного оплачивает работодатель
  sickSocialTaxable: boolean;
  sickPitTaxable: boolean;
  vacationDivisor: number; // среднее число календарных дней в месяце для отпускных
  holidays: string[];
}

/**
 * По умолчанию: взносы 12,25 % = 10 % работник + 2,25 % работодатель (Закон о тарифах, ред. 2024; для
 * отдельных категорий — 27,25 %), подоходный налог 10 % (ст. 197 НК КР), предельная база — 20 средних
 * зарплат прошлого года: 20 × 31 604 = 632 080 сом (постановление Кабмина о расчёте взносов на 2026 год),
 * больничный: работодатель — первые 10 рабочих дней, отпускные — 3 месяца / 3 / 29,6 (ст. 95 ТК КР).
 */
export const DEFAULT_SETTINGS: Omit<HrSettings, "holidays"> = {
  employeeRate: 0.10, employerRate: 0.0225, pitRate: 0.10, maxBase: 632_080, minBase: 0,
  sickDaysEmployer: 10, sickSocialTaxable: false, sickPitTaxable: true, vacationDivisor: 29.6,
};

export interface TimesheetRow {
  employeeId: string;
  worked: number;        // отработано рабочих дней
  vacationDays: number;  // календарных дней отпуска в месяце
  sickDays: number;      // рабочих дней больничного, оплачиваемых работодателем в этом месяце
  unpaidDays: number;    // дни без сохранения зарплаты, прогулы
  bonus: number;         // премия, надбавки
  other: number;         // прочие начисления (входят в средний заработок)
}

/** Прошлые месяцы сотрудника для среднего заработка. */
export interface History { month: string; earnings: number; worked: number }

export interface PayRow {
  employeeId: string; name: string; dept: Department;
  norm: number; worked: number;
  salaryPart: number; vacationPay: number; sickPay: number; bonus: number; other: number; gross: number;
  socialBase: number; employeeSocial: number; employerSocial: number; pitBase: number; pit: number; net: number;
  avgVacation: number; avgSick: number; sickPct: number; stazh: number;
  earningsForAverage: number; // войдёт в средний заработок следующих месяцев
  notes: string[];
}

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

export function stazhYears(e: Employee, monthStart: string): number {
  const years = (Date.parse(monthStart) - Date.parse(e.hiredAt)) / (365.25 * 864e5);
  return Math.max(0, Math.floor(((e.priorYears ?? 0) + Math.max(0, years)) * 10) / 10);
}
export const sickPercent = (stazh: number, dependents3?: boolean) => (dependents3 || stazh >= 8 ? 1 : stazh >= 5 ? 0.8 : 0.6);

export function emptyTimesheet(e: Employee, norm: number): TimesheetRow {
  return { employeeId: e.id, worked: norm, vacationDays: 0, sickDays: 0, unpaidDays: 0, bonus: 0, other: 0 };
}

export function computeRow(e: Employee, t: TimesheetRow, month: string, norm: number, history: History[], s: Omit<HrSettings, "holidays">): PayRow {
  const notes: string[] = [];
  const monthStart = `${month}-01`;
  const last3 = history.filter((h) => h.month < month).sort((a, b) => b.month.localeCompare(a.month)).slice(0, 3);
  const sumEarn = last3.reduce((x, h) => x + h.earnings, 0), sumWorked = last3.reduce((x, h) => x + h.worked, 0);
  // средний дневной: отпуск — на календарные дни (29,6), больничный — на отработанные рабочие дни
  let avgVacation = last3.length ? sumEarn / (last3.length * s.vacationDivisor) : e.salary / s.vacationDivisor;
  let avgSick = sumWorked > 0 ? sumEarn / sumWorked : e.salary / Math.max(norm, 1);
  if (!last3.length && (t.vacationDays || t.sickDays)) notes.push("Нет начислений за прошлые месяцы — средний заработок взят по окладу");
  else if (last3.length && last3.length < 3 && (t.vacationDays || t.sickDays)) notes.push(`Средний заработок — по ${last3.length} мес. (меньше трёх в программе)`);
  avgVacation = r2(avgVacation); avgSick = r2(avgSick);

  const salaryPart = norm > 0 ? r2((e.salary * Math.min(t.worked, norm)) / norm) : 0;
  const vacationPay = r2(avgVacation * t.vacationDays);
  const stazh = stazhYears(e, monthStart), sickPct = sickPercent(stazh, e.dependents3);
  const sickDays = Math.min(t.sickDays, s.sickDaysEmployer);
  if (t.sickDays > s.sickDaysEmployer) notes.push(`Больничный сверх ${s.sickDaysEmployer} рабочих дней работодатель не оплачивает — пособие назначает Соцфонд`);
  const sickPay = r2(avgSick * sickDays * sickPct);
  const bonus = r2(t.bonus || 0), other = r2(t.other || 0);
  const gross = r2(salaryPart + vacationPay + sickPay + bonus + other);

  let socialBase = gross - (s.sickSocialTaxable ? 0 : sickPay);
  const fullMonth = t.worked + t.vacationDays > 0 && !t.unpaidDays && e.hiredAt <= monthStart;
  let raised = false;
  if (s.minBase > 0 && fullMonth && socialBase < s.minBase) { socialBase = s.minBase; raised = true; notes.push("Начислено меньше минимальной базы — ПН и взносы считаются от минимальной базы"); }
  if (socialBase > s.maxBase) { socialBase = s.maxBase; notes.push("Взносы ограничены предельной базой"); }
  socialBase = r2(socialBase);
  const employeeSocial = r2(socialBase * s.employeeRate);
  const employerSocial = r2(socialBase * s.employerRate);
  let pitBase = gross - (s.sickPitTaxable ? 0 : sickPay) - employeeSocial;
  if (raised) pitBase = Math.max(pitBase, s.minBase - employeeSocial);
  pitBase = r2(Math.max(0, pitBase));
  const pit = r2(pitBase * s.pitRate);
  const net = r2(gross - employeeSocial - pit);
  return {
    employeeId: e.id, name: e.name, dept: e.dept, norm, worked: t.worked,
    salaryPart, vacationPay, sickPay, bonus, other, gross, socialBase, employeeSocial, employerSocial, pitBase, pit, net,
    avgVacation, avgSick, sickPct, stazh, earningsForAverage: r2(salaryPart + bonus + other), notes,
  };
}

export interface PayTotals { gross: number; employeeSocial: number; employerSocial: number; pit: number; net: number }
export function totals(rows: PayRow[]): PayTotals {
  const t = { gross: 0, employeeSocial: 0, employerSocial: 0, pit: 0, net: 0 };
  for (const r of rows) for (const k of Object.keys(t) as Array<keyof PayTotals>) t[k] = r2(t[k] + r[k]);
  return t;
}

/** Проводка за месяц: затраты и взносы по отделам — Дт 7120/7130, 7520/7530, 8010/8020; Кт 3520, 3530, 3420. */
export function payrunLines(rows: PayRow[]): LedgerLine[] {
  const lines: LedgerLine[] = [];
  for (const d of Object.keys(DEPARTMENTS) as Department[]) {
    const rs = rows.filter((r) => r.dept === d);
    const gross = r2(rs.reduce((x, r) => x + r.gross, 0)), er = r2(rs.reduce((x, r) => x + r.employerSocial, 0));
    if (gross > 0) lines.push({ account: DEPARTMENTS[d].wages, debit: gross, credit: 0, memo: `${DEPARTMENTS[d].label}: зарплата, отпускные, больничные` });
    if (er > 0) lines.push({ account: DEPARTMENTS[d].social, debit: er, credit: 0, memo: "взносы работодателя" });
  }
  const t = totals(rows);
  if (t.net > 0) lines.push({ account: "3520", debit: 0, credit: t.net, memo: "к выплате на руки" });
  const soc = r2(t.employeeSocial + t.employerSocial);
  if (soc > 0) lines.push({ account: "3530", debit: 0, credit: soc, memo: "взносы работника и работодателя" });
  if (t.pit > 0) lines.push({ account: "3420", debit: 0, credit: t.pit, memo: "подоходный налог" });
  return lines;
}

/** Свод для отчёта в Соцфонд по каждому сотруднику (CSV для Excel). */
export function socialFundCsv(rows: PayRow[], employees: Employee[], month: string): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const n = (x: number) => x.toFixed(2).replace(".", ",");
  const out = [`Свод по страховым взносам и подоходному налогу за ${month.split("-").reverse().join(".")}`, "ФИО;ПИН;Начислено;База взносов;Взносы работника;Взносы работодателя;Всего взносов;База ПН;Подоходный налог"];
  for (const r of rows) {
    const e = employees.find((x) => x.id === r.employeeId);
    out.push([q(r.name), q(e?.pin ?? ""), n(r.gross), n(r.socialBase), n(r.employeeSocial), n(r.employerSocial), n(r.employeeSocial + r.employerSocial), n(r.pitBase), n(r.pit)].join(";"));
  }
  const t = totals(rows);
  out.push(["Итого", "", n(t.gross), n(rows.reduce((x, r) => x + r.socialBase, 0)), n(t.employeeSocial), n(t.employerSocial), n(t.employeeSocial + t.employerSocial), n(rows.reduce((x, r) => x + r.pitBase, 0)), n(t.pit)].join(";"));
  return "﻿" + out.join("\r\n");
}

/** Сотрудник работает в этом месяце: принят до конца месяца и не уволен до его начала. */
export const activeIn = (e: Employee, month: string, lastDayIso: string) => e.hiredAt <= lastDayIso && (!e.firedAt || e.firedAt >= `${month}-01`);
