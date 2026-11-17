// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { blockingIssues, campaignStats, campaignTitle, cleanValues, daysLeft, isOverdue, reminderKind, withControls } from "./collect";

test("сбор: сводка по статусам и просрочка", () => {
  const rows = [{ status: "accepted" as const }, { status: "submitted" as const }, { status: "draft" as const }, { status: "none" as const }, { status: "returned" as const }];
  const s = campaignStats(rows, "2026-11-10", "2026-11-17");
  assert.equal(s.total, 5); assert.equal(s.in, 2); assert.equal(s.pct, 40); assert.equal(s.overdue, 3);
  assert.equal(campaignStats(rows, "2026-11-30", "2026-11-17").overdue, 0);
  assert.equal(isOverdue("submitted", "2026-01-01", "2026-11-17"), false);
  assert.equal(daysLeft("2026-11-20", "2026-11-17"), 3);
});

test("сбор: итоги формы считаются сами", () => {
  const v = withControls({ cash: 100, receivables: 50, nonCurrent: 850, currentLiabilities: 300, longLiabilities: 200, revenue: 1000, cogs: 600, opex: 300 });
  assert.equal(v.currentTotal, 150); assert.equal(v.assetsTotal, 1000); assert.equal(v.equity, 500); assert.equal(v.operatingProfit, 100);
});

test("сбор: сдать нельзя без обязательных строк и с просрочкой больше долга", () => {
  const empty = blockingIssues({}, "2026-09-30");
  assert.equal(empty.filter((m) => m.text.startsWith("Не заполнена")).length, 6);
  const ok = { cash: 100, receivables: 50, nonCurrent: 850, currentLiabilities: 300, payStaff: 40, revenue: 1000, cogs: 600, opex: 300, otherNet: 0, incomeTax: 10, netProfit: 90 };
  assert.deepEqual(blockingIssues(ok, "2026-09-30"), []);
  const bad = blockingIssues({ ...ok, odStaff: 80 }, "2026-09-30");
  assert.ok(bad.some((m) => m.text.includes("больше, чем весь долг")));
  const net = blockingIssues({ ...ok, netProfit: 500 }, "2026-09-30");
  assert.ok(net.some((m) => m.text.includes("чистая прибыль")));
});

test("сбор: напоминания, название, очистка значений", () => {
  assert.equal(reminderKind("2026-11-20", "2026-11-17"), "soon");
  assert.equal(reminderKind("2026-11-17", "2026-11-17"), "today");
  assert.equal(reminderKind("2026-11-16", "2026-11-17"), "overdue");
  assert.equal(reminderKind("2026-11-25", "2026-11-17"), null);
  assert.equal(campaignTitle("2026-09-30"), "Отчётность за 3 квартал 2026");
  assert.equal(campaignTitle("2026-08-31"), "Отчётность на 31.08.2026");
  assert.deepEqual(cleanValues({ cash: 5, __proto__x: 1, assetsTotal: 9, revenue: "7", netProfit: Infinity, odStaff: -3 }), { cash: 5, odStaff: -3 });
});
