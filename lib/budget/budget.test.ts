// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { articleOf, defaultBudget, forecast, planFact, planFromLastYear } from "./budget";
import { buildStatements } from "@/lib/ledger/engine";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { dueReminders, selections, toEvents } from "@/lib/calendar/events";
import { taxReports } from "@/lib/taxreports/build";

const near = (a: number, b: number, m = "") => assert.ok(Math.abs(a - b) < 0.02, `${m} ${a} ≠ ${b}`);

test("Бюджет: факт по статьям равен прибыли из ОПиУ", () => {
  const entries = demoEntries();
  const b = defaultBudget(2026);
  const { rows, unassigned } = planFact(b, entries);
  assert.deepEqual(unassigned, []);
  const result = rows.find((r) => r.id === "result")!;
  const q3 = buildStatements(entries, { from: "2026-07-01", to: "2026-09-30" }, { regime: DEMO_COMPANY.regime });
  near(result.fact[6] + result.fact[7] + result.fact[8], q3.incomeStatement.netProfit, "прибыль за III кв.");
});

test("Бюджет: своя статья забирает счёт у статьи по умолчанию", () => {
  const b = defaultBudget(2026);
  b.articles.push({ id: "rent", name: "Аренда", kind: "expense", accounts: ["8030"], plan: Array(12).fill(0) });
  assert.equal(articleOf(b, "8030")?.id, "rent");
  assert.equal(articleOf(b, "8010")?.id, "admin");
  b.articles.push({ id: "mkt", name: "Маркетинг", kind: "expense", accounts: ["75*"], plan: Array(12).fill(0) });
  assert.equal(articleOf(b, "7510")?.id, "mkt");
  const p = planFromLastYear(defaultBudget(2027), demoEntries(), 10);
  assert.ok(p.articles.find((a) => a.id === "revenue")!.plan[7] > 0, "план 2027 из факта 2026 + 10 %");
});

test("Прогноз денег: кассовый разрыв и минимальный остаток", () => {
  const f = forecast({
    cashNow: 250000, start: "2026-12", horizon: 3, method: "average", minCash: 150000,
    history: [{ month: "2026-09", cashIn: 1000000, cashOut: 1100000 }, { month: "2026-10", cashIn: 900000, cashOut: 1050000 }, { month: "2026-11", cashIn: 1100000, cashOut: 1150000 }],
  });
  near(f.avgIn, 1000000); near(f.avgOut, 1100000);
  assert.equal(f.rows[0].closing, 150000);
  assert.equal(f.rows[1].low, true);
  assert.equal(f.firstGap, "2027-02");
  const b = defaultBudget(2026);
  b.articles.find((a) => a.id === "revenue")!.plan[11] = 500000;
  b.articles.find((a) => a.id === "admin")!.plan[11] = 300000;
  const fb = forecast({ cashNow: 0, start: "2026-12", horizon: 1, method: "budget", budget: b, minCash: 0, history: [], depreciation: { "2026-12": 50000 }, debts: { receivable: 100000, payable: 400000 } });
  near(fb.rows[0].inflow, 600000); near(fb.rows[0].outflow, 650000); assert.equal(fb.rows[0].gap, true);
});

test("Календарь: сроки на окно и напоминания", () => {
  const today = "2026-10-17";
  const sels = selections(today);
  assert.equal(sels[0].from, "2026-04-01");
  const reports = sels.flatMap((s) => taxReports(demoEntries(), s, { regime: DEMO_COMPANY.regime, size: "small", today, patentMonthly: 0, vatPayer: false, filed: {} }).reports);
  const ev = toEvents("demo", "Демо", reports, today);
  assert.ok(ev.length > 0);
  assert.ok(ev.every((e) => e.deadline >= "2026-08-18" && e.deadline <= "2027-01-15"));
  assert.equal(new Set(ev.map((e) => e.key)).size, ev.length, "без дублей");
  const due = dueReminders(ev, 3);
  assert.ok(due.every((d) => [3, 1, 0].includes(d.e.daysLeft) || d.e.daysLeft < 0));
  assert.ok(due.some((d) => d.e.deadline === "2026-10-20"), "за 3 дня до 20 октября");
});
