// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { detectColumns, esfLines, isoDate, num, parseRegistry } from "./registry";
import { validateEntry } from "@/lib/ledger/engine";

test("ЭСФ: колонки, числа, даты", () => {
  const h = ["№ п/п", "Серия и номер ЭСФ", "Дата выписки", "ИНН поставщика", "Наименование поставщика", "Наименование товара", "Сумма без НДС", "НДС", "Всего с НДС"];
  const c = detectColumns(h);
  assert.equal(c.net, 6); assert.equal(c.total, 8); assert.equal(c.vat, 7); assert.equal(c.inn, 3); assert.equal(c.date, 2); assert.equal(c.party, 4);
  assert.equal(num("12 345,67"), 12345.67); assert.equal(num("1,234.5"), 1234.5);
  assert.equal(isoDate("05.11.2026"), "2026-11-05"); assert.equal(isoDate(46331), "2026-11-05");
});

test("ЭСФ: строки одного документа складываются, проводки сбалансированы", () => {
  const rows = [
    ["Номер", "Дата", "ИНН", "Поставщик", "Товар", "Сумма без НДС", "НДС", "Всего"],
    ["000123", "02.11.2026", "01811201210351", "ОсОО «ТехноМебель»", "ЛДСП", "10000", "1200", "11200"],
    ["000123", "02.11.2026", "01811201210351", "ОсОО «ТехноМебель»", "Кромка", "5000", "600", "5600"],
    ["000124", "03.11.2026", "02108201310044", "ОсОО «Дордой Плаза»", "Аренда", "20000", "2400", "22000"],
    ["", "", "", "Итого", "", "35000", "4200", "38800"],
  ];
  const inv = parseRegistry(rows, detectColumns(rows[0] as string[]));
  assert.equal(inv.length, 2);
  assert.equal(inv[0].total, 16800); assert.equal(inv[0].item, "ЛДСП; Кромка");
  assert.match(inv[1].problem ?? "", /≠/);
  assert.deepEqual(validateEntry({ date: inv[0].date, lines: esfLines(inv[0], "in", "1620", true) }), []);
  assert.deepEqual(validateEntry({ date: inv[0].date, lines: esfLines(inv[0], "in", "1620", false) }), []);
  assert.deepEqual(validateEntry({ date: inv[0].date, lines: esfLines(inv[0], "out", "6110", true) }), []);
  // goods with quantities go to stock line by line
  const q = [["Номер", "Дата", "ИНН", "Поставщик", "Товар", "Кол-во", "Ед. изм.", "Сумма без НДС", "НДС", "Всего"],
    ["7", "02.11.2026", "1", "П", "ЛДСП", "10", "лист", "10000", "1200", "11200"], ["7", "02.11.2026", "1", "П", "Кромка", "200", "м", "5000", "600", "5600"]];
  const [one] = parseRegistry(q, detectColumns(q[0] as string[]));
  const ls = esfLines(one, "in", "1620", false);
  assert.deepEqual(validateEntry({ date: one.date, lines: ls }), []);
  assert.equal(ls.filter((l) => l.account === "1620").length, 2);
  assert.equal(ls[0].qty, 10); assert.equal(ls[0].debit, 11200); // без зачёта НДС стоимость с НДС
});
