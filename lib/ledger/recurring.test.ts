import { test } from "node:test";
import assert from "node:assert/strict";
import { dueRuns, nextMonth, nextRun, recRef, runDate, type RecurringTemplate } from "./recurring";

const t = (over: Partial<RecurringTemplate> = {}): RecurringTemplate => ({
  id: "rent", description: "Аренда офиса", day: 5, from: "2026-09", until: null, paused: false, createdAt: "",
  lines: [{ account: "7110", debit: 30000, credit: 0 }, { account: "3190", debit: 0, credit: 30000 }], ...over,
});

test("даты: число месяца, последний день, переход года", () => {
  assert.equal(runDate("2026-02", 31), "2026-02-28");
  assert.equal(runDate("2028-02", 31), "2028-02-29");
  assert.equal(runDate("2026-11", 5), "2026-11-05");
  assert.equal(nextMonth("2026-12"), "2027-01");
});

test("к проведению — наступившие и не проведённые месяцы", () => {
  const done = new Set([recRef("rent", "2026-09")]);
  assert.deepEqual(dueRuns(t(), done, "2026-11-04").map((r) => r.month), ["2026-10"]);
  assert.deepEqual(dueRuns(t(), done, "2026-11-05").map((r) => r.date), ["2026-10-05", "2026-11-05"]);
  assert.deepEqual(dueRuns(t({ paused: true }), done, "2026-11-30"), []);
  assert.deepEqual(dueRuns(t({ until: "2026-10" }), done, "2027-03-01").map((r) => r.month), ["2026-10"]);
  // не больше 12 месяцев за раз
  assert.equal(dueRuns(t({ from: "2020-01" }), new Set(), "2026-11-30").length, 12);
  assert.equal(nextRun(t(), done, "2026-11-06"), "2026-12-05");
  assert.equal(nextRun(t({ until: "2026-10" }), new Set(["rec:rent:2026-10"]), "2026-11-06"), null);
});

test("database: регулярные операции проводятся один раз и уважают запрет периода", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { putRecord } = await import("@/lib/records");
  const { runRecurring } = await import("./recurring-server");
  const company = await prisma.company.create({ data: { name: `recurring-${Date.now()}`, lockedThrough: new Date("2026-09-30T00:00:00Z") } });
  try {
    await putRecord(company.id, "recurring", "rent", t({ from: "2026-09" }));
    const r1 = await runRecurring(company.id, "2026-11-10");
    assert.equal(r1.posted, 2); // октябрь и ноябрь; сентябрь в закрытом периоде — не проводится и не считается пропуском
    assert.equal(r1.skipped.length, 0);
    const r2 = await runRecurring(company.id, "2026-11-10");
    assert.equal(r2.posted, 0);
    const rows = await prisma.journalEntry.findMany({ where: { companyId: company.id }, orderBy: { date: "asc" } });
    assert.deepEqual(rows.map((r) => r.sourceRef), ["rec:rent:2026-10", "rec:rent:2026-11"]);
    assert.equal(rows[0].createdByName, "по расписанию");
  } finally {
    await prisma.company.delete({ where: { id: company.id } });
    await prisma.$disconnect();
  }
});
