// Удаление проводок (по одной и списком), строки выписки и «Удалённые» — на базе (FL_TEST_PG_URL).
import { test } from "node:test";
import assert from "node:assert/strict";

const PG = process.env.FL_TEST_PG_URL;

test("database: удаление списком, закрытый период, выписка, себестоимость и восстановление", { skip: !PG && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { createEntry } = await import("./repo");
  const { deleteEntries, listTrash, restoreEntries } = await import("./remove");
  const company = await prisma.company.create({ data: { name: `remove-test-${Date.now()}` } });
  const companyId = company.id;
  try {
    const sale = (date: string, amount = 1000) => createEntry(prisma, {
      companyId, date, description: `Продажа ${date}`, source: "manual",
      lines: [{ account: "1110", debit: amount, credit: 0 }, { account: "6110", debit: 0, credit: amount, item: "Чай", qty: 2, unit: "шт" }],
    });
    const a = await sale("2026-09-10");
    const b = await sale("2026-10-10", 500);
    const c = await sale("2026-10-12", 700);
    // автоматическая себестоимость по продаже b
    const cogs = await createEntry(prisma, { companyId, date: "2026-10-10", description: "Списание себестоимости", source: "cogs", sourceRef: `${b.id}:1`, lines: [{ account: "7200", debit: 300, credit: 0 }, { account: "1610", debit: 0, credit: 300 }] });
    // строка выписки со своей проводкой
    const bt = await prisma.bankTransaction.create({ data: { companyId, bank: "mbank", txDate: new Date("2026-10-15T00:00:00Z"), amount: -200, description: "Комиссия банка", category: "Банковские комиссии", importBatch: "mbank-1" } });
    const bankEntry = await createEntry(prisma, { companyId, date: "2026-10-15", description: "Комиссия банка", source: "bank", bankTransactionId: bt.id, lines: [{ account: "7590", debit: 200, credit: 0 }, { account: "1210", debit: 0, credit: 200 }] });

    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: new Date("2026-09-30T00:00:00Z") } });

    // сентябрь закрыт — пропускается, остальное удаляется; себестоимость уходит вместе с продажей; строка выписки — вместе с проводкой
    const r = await deleteEntries(companyId, [a.id, b.id, bankEntry.id, "чужая"]);
    assert.deepEqual(r, { deleted: 2, locked: 1, bankRows: 1, cogs: 1 });
    assert.ok(await prisma.journalEntry.findUnique({ where: { id: a.id } }), "закрытый период не тронут");
    assert.equal(await prisma.journalEntry.findUnique({ where: { id: cogs.id } }), null);
    assert.equal(await prisma.bankTransaction.findUnique({ where: { id: bt.id } }), null);
    assert.ok(await prisma.journalEntry.findUnique({ where: { id: c.id } }), "неотмеченная осталась");

    // «Удалённые»: три проводки, свежие сверху
    const trash = await listTrash(companyId);
    assert.deepEqual(new Set(trash.map((t) => t.entryId)), new Set([b.id, cogs.id, bankEntry.id]));
    assert.equal(trash.find((t) => t.entryId === b.id)?.total, 500);

    // восстановление: продажа — с прежним номером и строками; проводка выписки — как ручная
    const ev = (id: string) => trash.find((t) => t.entryId === id)!.eventId;
    const rr = await restoreEntries(companyId, [ev(b.id), ev(bankEntry.id)]);
    assert.deepEqual(rr.restored.map((x) => x.entryId).sort(), [b.id, bankEntry.id].sort());
    const back = await prisma.journalEntry.findUnique({ where: { id: b.id }, include: { lines: true } });
    assert.equal(back?.lines.length, 2);
    assert.equal(back?.lines.find((l) => l.accountCode === "6110")?.item, "Чай");
    assert.equal((await prisma.journalEntry.findUnique({ where: { id: bankEntry.id } }))?.source, "manual");
    assert.equal((await prisma.entryEvent.findFirst({ where: { companyId, entryId: b.id, action: "restore" } }))?.note, "восстановлена из удалённых");

    // повтор — пропуск; себестоимость, уже сформированная заново, не задваивается
    const again = await restoreEntries(companyId, [ev(b.id)]);
    assert.deepEqual(again.skipped.map((s) => s.reason), ["уже восстановлена"]);
    await createEntry(prisma, { companyId, date: "2026-10-10", description: "Списание себестоимости", source: "cogs", sourceRef: `${b.id}:1`, lines: [{ account: "7200", debit: 300, credit: 0 }, { account: "1610", debit: 0, credit: 300 }] });
    const dup = await restoreEntries(companyId, [ev(cogs.id)]);
    assert.deepEqual(dup.skipped.map((s) => s.reason), ["раздел уже сформировал её заново"]);
    assert.deepEqual(new Set((await listTrash(companyId)).map((t) => t.entryId)), new Set([cogs.id]), "в «Удалённых» осталась только себестоимость");

    // в закрытый период не восстанавливается
    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: null } });
    await deleteEntries(companyId, [a.id]);
    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: new Date("2026-09-30T00:00:00Z") } });
    const aEv = (await listTrash(companyId)).find((t) => t.entryId === a.id)!.eventId;
    const lockedRes = await restoreEntries(companyId, [aEv]);
    assert.match(lockedRes.skipped[0].reason, /период по 30\.09\.2026 закрыт/);
  } finally {
    await prisma.company.update({ where: { id: companyId }, data: { lockedThrough: null } });
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  }
});
