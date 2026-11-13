// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { backupFileName, buildBackup, planImport } from "./company";

const dec = (s: string) => ({ toFixed: () => s, toString: () => s }); // как Prisma.Decimal
const db = {
  company: { name: "ОсОО «Белес»", inn: "01234567890123", activity: "мебель", defaultRegime: "unified_production", patentAmount: 0 },
  bankTransactions: [{ id: "bt1", companyId: "c1", bank: "mbank", txDate: new Date("2026-10-08"), amount: 280000, description: "Оплата", category: "revenue", categorySource: "rule", rawRow: null, importBatch: "b1", createdAt: new Date() }],
  entries: [
    { id: "e1", companyId: "c1", date: new Date("2026-10-01"), description: "Продажа", source: "manual", sourceRef: null, bankTransactionId: null, createdAt: new Date(),
      lines: [{ id: "l1", entryId: "e1", accountCode: "1410", debit: dec("280000.00"), credit: dec("0"), memo: null, party: "ОсОО «Ала-Тоо Отель»", partyInn: null, item: null, qty: null, unit: null, currency: null, amountCur: null },
              { id: "l2", entryId: "e1", accountCode: "6110", debit: dec("0"), credit: dec("280000.00"), memo: null, party: null, partyInn: null, item: "Шкаф-купе", qty: dec("4.000"), unit: "шт", currency: null, amountCur: null }] },
    { id: "e2", companyId: "c1", date: new Date("2026-10-08"), description: "Оплата от покупателя", source: "bank", sourceRef: null, bankTransactionId: "bt1", createdAt: new Date(),
      lines: [{ id: "l3", entryId: "e2", accountCode: "1210", debit: dec("280000"), credit: dec("0") }, { id: "l4", entryId: "e2", accountCode: "1410", debit: dec("0"), credit: dec("280000") }] },
  ],
  records: [{ kind: "policy", key: "main", data: { method: "fifo" } }, { kind: "calendar", key: "main", data: { chats: [{ id: 1 }] } }],
  esgReports: [], reports: [],
};

test("резервная копия: служебные поля убраны, суммы строками, подписки бота не переносятся", () => {
  const f = buildBackup(db as never, new Date("2026-11-13T00:00:00Z"));
  assert.equal(f.format, "finlite-company");
  assert.equal(f.entries.length, 2);
  assert.ok(!("id" in f.entries[0]) && !("companyId" in f.entries[0]));
  assert.equal(f.entries[0].lines[0].debit, "280000.00");
  assert.equal(f.entries[0].lines[1].qty, "4.000");
  assert.equal(f.entries[1].bankRef, "bt1");
  assert.equal(f.bankTransactions[0].ref, "bt1");
  assert.deepEqual(f.records.map((r) => r.kind), ["policy"]);
});

test("резервная копия: загрузка в новую компанию сохраняет проводки и связь с выпиской", () => {
  const json = JSON.parse(JSON.stringify(buildBackup(db as never)));
  let n = 0;
  const p = planImport(json, () => `n${++n}`);
  assert.deepEqual(p.stats, { entries: 2, lines: 4, bank: 1, records: 1 });
  const bank = p.bankTransactions[0];
  assert.equal(p.entries[1].bankTransactionId, bank.id, "проводка ссылается на новую выписку");
  assert.ok(p.entries[0].date instanceof Date);
  assert.equal(p.lines.filter((l) => l.entryId === p.entries[0].id).length, 2);
  assert.equal(p.lines[1].qty, "4.000");
  assert.equal(p.company.name, "ОсОО «Белес»");
});

test("резервная копия: чужой или испорченный файл отклоняется понятным сообщением", () => {
  assert.throws(() => planImport({ hello: 1 }, () => "x"), /не файл резервной копии/);
  const f = JSON.parse(JSON.stringify(buildBackup(db as never)));
  f.version = 99;
  assert.throws(() => planImport(f, () => "x"), /более новой версией/);
  const g = JSON.parse(JSON.stringify(buildBackup(db as never)));
  g.entries[0].lines[0].debit = "1000";
  assert.throws(() => planImport(g, () => "x"), /не сходится/);
  const h = JSON.parse(JSON.stringify(buildBackup(db as never)));
  h.entries[0].date = "вчера";
  assert.throws(() => planImport(h, () => "x"), /Неверная дата/);
  assert.equal(backupFileName("ОсОО «Белес»", new Date("2026-11-13")), "ОсОО_Белес_2026-11-13.finlite.json.gz");
});
