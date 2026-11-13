// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { compare, forStudent, gradesCsv, joinCode, turnovers } from "./check";
import { PRESETS } from "./presets";
import { payrollLines } from "@/lib/ledger/payroll";
import { fillTemplate, TEMPLATES } from "@/lib/ledger/templates";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

const tpl = (key: string, total: number, date: string, swap?: [string, string]): LedgerEntry => {
  const t = TEMPLATES.find((x) => x.key === key)!;
  const lines: LedgerLine[] = fillTemplate(t, { total, vat: false }).lines.map((l) => ({ account: swap && l.account === swap[0] ? swap[1] : l.account, debit: Number(l.debit.replace(",", ".") || 0), credit: Number(l.credit.replace(",", ".") || 0) }));
  return { id: key + date, date, description: t.label, source: "manual", lines };
};

/** Решение задания из пособия так, как его вводит студент: шаблонами и формой зарплаты. */
function solution(): LedgerEntry[] {
  const pay = payrollLines({ production: 180000, sales: 60000, admin: 90000 });
  return [
    tpl("sale-credit", 280000, "2026-10-01"),
    tpl("sale-cash", 165000, "2026-10-03"),
    tpl("buy-goods", 192000, "2026-10-06", ["1610", "1620"]),
    tpl("customer-pays", 280000, "2026-10-08"),
    tpl("pay-supplier", 192000, "2026-10-10"),
    tpl("rent", 90000, "2026-10-15"),
    tpl("cash-out", 150000, "2026-10-15"),
    tpl("utilities", 24000, "2026-10-20"),
    tpl("bank-fee", 1500, "2026-10-25"),
    { id: "pay", date: "2026-10-31", description: "Зарплата", source: "payroll", lines: pay.lines },
    tpl("pay-salary", pay.net, "2026-10-31"),
  ];
}

test("учебный режим: решение по пособию шаблонами программы даёт 100 % по эталону", () => {
  const p = PRESETS[0];
  const t = turnovers(solution(), p.periodFrom, p.periodTo);
  const r = compare(p.turnovers, t);
  assert.equal(r.score, 100, JSON.stringify(r.rows.filter((x) => !x.ok)));
  assert.equal(r.total, 18);
  const sum = (k: "d" | "c") => Object.values(p.turnovers).reduce((s, v) => s + v[k], 0);
  assert.equal(sum("d"), 1979225);
  assert.equal(sum("c"), 1979225, "эталон сбалансирован");
});

test("учебный режим: ошибки студента видны по счетам, служебные проводки не мешают", () => {
  const p = PRESETS[0];
  const wrong = solution();
  wrong[2] = tpl("buy-goods", 192000, "2026-10-06"); // забыл заменить 1610 на 1620
  wrong.push({ id: "close", date: "2026-10-31", description: "Закрытие", source: "closing", lines: [{ account: "6110", debit: 445000, credit: 0 }, { account: "5999", debit: 0, credit: 445000 }] });
  wrong.push({ id: "sept", date: "2026-09-30", description: "Сентябрь", source: "manual", lines: [{ account: "1110", debit: 1, credit: 0 }, { account: "6110", debit: 0, credit: 1 }] });
  const r = compare(p.turnovers, turnovers(wrong, p.periodFrom, p.periodTo));
  const bad = r.rows.filter((x) => !x.ok);
  assert.deepEqual(bad.map((x) => [x.account, x.hint]), [["1610", "в задании этого счёта нет"], ["1620", "операций по счёту нет"]]);
  assert.equal(r.matched, 17);
  assert.equal(r.score, 89.5);
  const s = forStudent(r, false);
  assert.ok(Number.isNaN(s.rows.find((x) => x.account === "1620")!.expected!.d), "эталонные суммы скрыты");
  assert.equal(forStudent(r, true), r);
  assert.equal(compare(p.turnovers, {}).verdict, "Операций за период ещё нет");
});

test("учебный режим: код группы и ведомость оценок", () => {
  assert.match(joinCode(), /^[A-HJ-NP-Z2-9]{6}$/);
  assert.equal(joinCode(() => 0), "AAAAAA");
  const csv = gradesCsv([{ name: "Иванов И.", email: "i@x.kg", score: 89.5, checks: 2, checkedAt: new Date("2026-11-13T08:00:00Z"), started: true }, { name: "Петрова", email: "p@x.kg", score: null, checks: 0, checkedAt: null, started: false }]);
  assert.ok(csv.startsWith("﻿Студент;Почта"));
  assert.match(csv, /"Иванов И.";"i@x.kg";89,5;2;2026-11-13 08:00;в работе/);
  assert.match(csv, /"Петрова";"p@x.kg";;0;;не начато/);
});
