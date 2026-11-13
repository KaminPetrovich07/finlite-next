// Period lock and journal history.
// Pure helpers always; the database part runs when FL_TEST_PG_URL points at a Postgres
// with the current schema (CI does `prisma db push` first), otherwise it is skipped.
import { test } from "node:test";
import assert from "node:assert/strict";
import { describeChange, isLocked, snapshotOf } from "./history";
import { assertOpen, PeriodLockedError } from "./guard";

test("isLocked: day on or before the lock date", () => {
  assert.equal(isLocked("2026-09-30", "2026-09-30"), true);
  assert.equal(isLocked("2026-09-01", new Date("2026-09-30T00:00:00Z")), true);
  assert.equal(isLocked("2026-10-01", "2026-09-30"), false);
  assert.equal(isLocked("2026-09-30", null), false);
});

test("assertOpen throws a 423 with both dates", () => {
  const locks = new Map([["c1", "2026-09-30"], ["c2", null]]);
  assert.doesNotThrow(() => assertOpen([{ companyId: "c1", date: "2026-10-01" }, { companyId: "c2", date: "2020-01-01" }], locks));
  assert.throws(() => assertOpen([{ companyId: "c1", date: "2026-09-15" }], locks), (e: unknown) =>
    e instanceof PeriodLockedError && e.status === 423 && /30\.09\.2026/.test(e.message) && /15\.09\.2026/.test(e.message));
});

test("snapshot and change description", () => {
  const row = (amount: number, party?: string) => ({
    date: new Date("2026-10-05T00:00:00Z"), description: "Оплата аренды", source: "manual",
    lines: [{ accountCode: "7110", debit: amount, credit: 0, party }, { accountCode: "1210", debit: 0, credit: amount }],
  });
  const a = snapshotOf(row(1000)), b = snapshotOf({ ...row(1200, "ОсОО Ак-Таш"), description: "Аренда за октябрь" });
  assert.equal(a.date, "2026-10-05");
  assert.deepEqual(a.lines[0], { account: "7110", debit: 1000, credit: 0 });
  const d = describeChange(a, b);
  assert.ok(d.some((x) => x.startsWith("содержание:")));
  assert.ok(d.some((x) => x === "убрано: Дт 7110 1 000,00"), d.join(" | "));
  assert.ok(d.some((x) => x === "добавлено: Дт 7110 1 200,00 (ОсОО Ак-Таш)"), d.join(" | "));
  assert.deepEqual(describeChange(a, a), []);
});

const PG = process.env.FL_TEST_PG_URL;

test("database: lock blocks every kind of write and history records them", { skip: !PG && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { createEntry } = await import("./repo");
  const company = await prisma.company.create({ data: { name: `guard-test-${Date.now()}` } });
  const companyId = company.id;
  try {
    const sale = (date: string, amount = 1000) => createEntry(prisma, {
      companyId, date, description: "Продажа", source: "manual",
      lines: [{ account: "1110", debit: amount, credit: 0 }, { account: "6110", debit: 0, credit: amount }],
    });
    const sept = await sale("2026-09-10");
    const oct = await sale("2026-10-10");
    // history: two creates with snapshots
    let events = await prisma.entryEvent.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    assert.equal(events.length, 2);
    assert.equal(events[0].action, "create");
    assert.equal((events[0].after as { lines: unknown[] }).lines.length, 2);

    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: new Date("2026-09-30T00:00:00Z") } });

    // create in the locked month
    await assert.rejects(sale("2026-09-20"), PeriodLockedError);
    // delete, deleteMany, line update of a locked entry
    await assert.rejects(prisma.journalEntry.delete({ where: { id: sept.id } }), PeriodLockedError);
    await assert.rejects(prisma.journalEntry.deleteMany({ where: { companyId, source: "manual" } }), PeriodLockedError);
    await assert.rejects(prisma.journalLine.updateMany({ where: { entryId: sept.id }, data: { party: "x" } }), PeriodLockedError);
    // moving an open entry into the locked month
    await assert.rejects(prisma.journalEntry.update({ where: { id: oct.id }, data: { date: new Date("2026-09-15T00:00:00Z") } }), PeriodLockedError);
    // inside an interactive transaction the whole thing rolls back
    await assert.rejects(prisma.$transaction(async (tx) => {
      await createEntry(tx, { companyId, date: "2026-10-11", description: "в транзакции", source: "manual", lines: [{ account: "1110", debit: 5, credit: 0 }, { account: "6110", debit: 0, credit: 5 }] });
      await tx.journalEntry.delete({ where: { id: sept.id } });
    }), PeriodLockedError);
    assert.equal(await prisma.journalEntry.count({ where: { companyId } }), 2, "rolled back");

    // open period works; changes are in the history with before/after
    await prisma.journalLine.updateMany({ where: { entryId: oct.id, accountCode: "6110" }, data: { party: "ОсОО Тест" } });
    await prisma.$transaction(async (tx) => { await tx.journalEntry.delete({ where: { id: oct.id } }); });
    events = await prisma.entryEvent.findMany({ where: { companyId }, orderBy: { createdAt: "asc" } });
    assert.deepEqual(events.map((e) => e.action), ["create", "create", "update", "delete"]);
    assert.equal(events[3].after, null, "a deleted entry has no «after» snapshot (NULL, not {})");
    assert.equal(events[0].before, null);
    const upd = events[2];
    assert.equal(upd.entryId, oct.id);
    assert.ok((upd.after as { lines: Array<{ party?: string }> }).lines.some((l) => l.party === "ОсОО Тест"));
    // the failed transaction left no "create" for «в транзакции»
    assert.ok(!events.some((e) => (e.after as { description?: string } | null)?.description === "в транзакции"));

    // bank statement row in the locked month cannot be deleted (it would cascade to its entry)
    const tx = await prisma.bankTransaction.create({ data: { companyId, bank: "mbank", txDate: new Date("2026-09-12T00:00:00Z"), amount: 500, description: "оплата", importBatch: "b1" } });
    await assert.rejects(prisma.bankTransaction.deleteMany({ where: { companyId } }), PeriodLockedError);
    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: null } });
    await prisma.bankTransaction.delete({ where: { id: tx.id } });
  } finally {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  }
});
