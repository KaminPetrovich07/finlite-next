// ════════════════════════════════════════════════════════════════════════
// lib/ledger/payroll.ts — проводки начисления зарплаты за месяц.
//
//   Дт 7120 / 7520 / 8010   Кт 3520   начислена зарплата (по подразделению)
//   Дт 3520                 Кт 3530   удержаны страховые взносы работника 10%
//   Дт 3520                 Кт 3420   удержан подоходный налог 10% (ст. 197 НК КР)
//   Дт 7130 / 7530 / 8020   Кт 3530   страховые взносы работодателя 2,25%
//
// Подоходный налог считается с начисленной суммы за вычетом взносов
// работника. Стандартный и социальные вычеты (ст. 194 НК КР) и особые
// тарифы для отдельных отраслей здесь не учитываются — при необходимости
// поправьте сумму в проводке.
// ════════════════════════════════════════════════════════════════════════

import { PIT_RATE, SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER } from "@/lib/tax-engine";
import { round2, type LedgerLine } from "./types";

export type Department = "production" | "sales" | "admin";

export const DEPARTMENTS: Record<Department, { label: string; wages: string; social: string }> = {
  production: { label: "Производственный персонал", wages: "7120", social: "7130" },
  sales: { label: "Отдел продаж", wages: "7520", social: "7530" },
  admin: { label: "Администрация", wages: "8010", social: "8020" },
};

export interface PayrollResult {
  gross: number;
  employeeSocial: number;
  pit: number;
  employerSocial: number;
  net: number;
  lines: LedgerLine[];
}

export function payrollLines(gross: Partial<Record<Department, number>>): PayrollResult {
  const lines: LedgerLine[] = [];
  let total = 0, employerSocial = 0;
  for (const [d, amountRaw] of Object.entries(gross) as Array<[Department, number]>) {
    const amount = round2(amountRaw ?? 0);
    if (amount <= 0) continue;
    const dep = DEPARTMENTS[d];
    const er = round2(amount * SOCIAL_EMPLOYER);
    lines.push({ account: dep.wages, debit: amount, credit: 0, memo: dep.label });
    lines.push({ account: dep.social, debit: er, credit: 0, memo: "взносы работодателя 2,25%" });
    total += amount; employerSocial += er;
  }
  total = round2(total); employerSocial = round2(employerSocial);
  const employeeSocial = round2(total * SOCIAL_EMPLOYEE);
  const pit = round2((total - employeeSocial) * PIT_RATE);
  const net = round2(total - employeeSocial - pit);
  if (total > 0) {
    lines.push({ account: "3520", debit: 0, credit: net, memo: "к выплате на руки" });
    lines.push({ account: "3530", debit: 0, credit: round2(employeeSocial + employerSocial), memo: "взносы работника 10% + работодателя 2,25%" });
    lines.push({ account: "3420", debit: 0, credit: pit, memo: "подоходный налог 10%" });
  }
  return { gross: total, employeeSocial, pit, employerSocial, net, lines };
}
