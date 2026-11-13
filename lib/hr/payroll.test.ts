// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { DEFAULT_HOLIDAYS, lastDay, prevMonth, workingDays } from "./calendar";
import { computeRow, DEFAULT_SETTINGS, emptyTimesheet, payrunLines, sickPercent, socialFundCsv, stazhYears, totals, type Employee } from "./payroll";

const S = DEFAULT_SETTINGS;
const emp: Employee = { id: "e1", name: "Асанов Бакыт", pin: "21505199000123", dept: "production", salary: 44000, hiredAt: "2024-03-01", priorYears: 2 };

test("календарь 2026: рабочие дни с учётом праздников", () => {
  assert.equal(workingDays("2026-10", DEFAULT_HOLIDAYS[2026]).length, 22);
  assert.equal(workingDays("2026-05", DEFAULT_HOLIDAYS[2026]).length, 14, "майские 1–10 и Курман айт 27 мая");
  assert.equal(workingDays("2026-01", DEFAULT_HOLIDAYS[2026]).length, 14, "1–12 января нерабочие");
  assert.equal(workingDays("2026-03", DEFAULT_HOLIDAYS[2026]).length, 21, "8 и 21 марта — выходные, без переноса; 20 марта — Орозо айт");
  assert.equal(prevMonth("2026-01"), "2025-12");
  assert.equal(prevMonth("2026-10", 3), "2026-07");
  assert.equal(lastDay("2026-02"), "2026-02-28");
});

test("зарплата за полный месяц: взносы 10 % + 2,25 %, ПН 10 % от суммы за вычетом взносов", () => {
  const r = computeRow(emp, emptyTimesheet(emp, 22), "2026-10", 22, [], S);
  assert.equal(r.gross, 44000);
  assert.equal(r.employeeSocial, 4400);
  assert.equal(r.employerSocial, 990);
  assert.equal(r.pit, 3960);
  assert.equal(r.net, 35640);
  assert.equal(r.earningsForAverage, 44000);
});

test("отпускные: 3 месяца / 3 / 29,6 × календарные дни; оклад — за отработанные дни", () => {
  const hist = [{ month: "2026-07", earnings: 44000, worked: 23 }, { month: "2026-08", earnings: 50000, worked: 21 }, { month: "2026-09", earnings: 44000, worked: 22 }, { month: "2026-06", earnings: 1e6, worked: 22 }];
  const t = { ...emptyTimesheet(emp, 22), worked: 12, vacationDays: 14 };
  const r = computeRow(emp, t, "2026-10", 22, hist, S);
  assert.equal(r.avgVacation, 1554.05, "138 000 / 88,8");
  assert.equal(r.vacationPay, 21756.7);
  assert.equal(r.salaryPart, 24000);
  assert.equal(r.gross, 45756.7);
  assert.equal(r.earningsForAverage, 24000, "отпускные не входят в средний заработок следующих месяцев");
});

test("больничный: первые 10 рабочих дней за счёт работодателя, процент по стажу", () => {
  assert.deepEqual([0, 4.9, 5, 7.9, 8, 20].map((x) => sickPercent(x)), [0.6, 0.6, 0.8, 0.8, 1, 1]);
  assert.equal(sickPercent(1, true), 1, "трое иждивенцев — 100 %");
  assert.equal(stazhYears(emp, "2026-10-01"), 4.5);
  const hist = [{ month: "2026-07", earnings: 46000, worked: 23 }, { month: "2026-08", earnings: 42000, worked: 21 }, { month: "2026-09", earnings: 44000, worked: 22 }];
  const r = computeRow(emp, { ...emptyTimesheet(emp, 22), worked: 10, sickDays: 12 }, "2026-10", 22, hist, S);
  assert.equal(r.avgSick, 2000, "132 000 / 66 рабочих дней");
  assert.equal(r.sickPct, 0.6);
  assert.equal(r.sickPay, 12000, "2 000 × 10 дней × 60 %");
  assert.ok(r.notes.some((n) => /сверх 10/.test(n)));
  assert.equal(r.socialBase, 20000, "больничный не входит в базу взносов");
  assert.equal(r.pitBase, 30000, "но входит в базу ПН: 32 000 − 2 000");
});

test("предельная и минимальная база", () => {
  const rich = { ...emp, salary: 1_000_000 };
  const r = computeRow(rich, emptyTimesheet(rich, 22), "2026-10", 22, [], S);
  assert.equal(r.socialBase, 632080);
  assert.equal(r.employeeSocial, 63208);
  assert.equal(r.employerSocial, 14221.8);
  assert.equal(r.pit, 93679.2, "(1 000 000 − 63 208) × 10 %");
  const poor = { ...emp, salary: 10000 };
  const m = computeRow(poor, emptyTimesheet(poor, 22), "2026-10", 22, [], { ...S, minBase: 31604 });
  assert.equal(m.socialBase, 31604);
  assert.equal(m.employeeSocial, 3160.4);
  assert.equal(m.pit, 2844.36, "(31 604 − 3 160,40) × 10 %");
  assert.equal(m.net, 3995.24, "удержания от минимальной базы");
});

test("проводка за месяц и свод для Соцфонда сходятся", () => {
  const a = computeRow(emp, emptyTimesheet(emp, 22), "2026-10", 22, [], S);
  const b2: Employee = { ...emp, id: "e2", name: "Иванова Айгуль", dept: "admin", salary: 60000, pin: "" };
  const b = computeRow(b2, emptyTimesheet(b2, 22), "2026-10", 22, [], S);
  const lines = payrunLines([a, b]);
  const dr = lines.reduce((x, l) => x + l.debit, 0), cr = lines.reduce((x, l) => x + l.credit, 0);
  assert.equal(Math.round(dr * 100), Math.round(cr * 100));
  assert.deepEqual(lines.map((l) => l.account), ["7120", "7130", "8010", "8020", "3520", "3530", "3420"]);
  const t = totals([a, b]);
  assert.equal(t.gross, 104000);
  const csv = socialFundCsv([a, b], [emp, b2], "2026-10");
  assert.match(csv, /"Асанов Бакыт";"21505199000123";44000,00;44000,00;4400,00;990,00;5390,00;39600,00;3960,00/);
  assert.match(csv, /Итого;;104000,00/);
});
