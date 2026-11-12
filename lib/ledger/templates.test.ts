// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACCOUNTS } from "./accounts";
import { fillTemplate, splitVat, TEMPLATES } from "./templates";

test("шаблоны операций: все счета есть в плане счетов и доступны для проводок", () => {
  for (const t of TEMPLATES) {
    for (const l of t.lines) {
      const a = ACCOUNTS.find((x) => x.code === l.account);
      assert.ok(a && !a.header, `${t.label}: счёт ${l.account}`);
    }
    // без НДС проводка сходится, с НДС — тоже
    for (const vat of [false, true]) {
      const { lines } = fillTemplate(t, { total: 1234.57, vat });
      const n = (s: string) => Number(s.replace(",", ".") || 0);
      const dr = lines.reduce((s, l) => s + n(l.debit), 0), cr = lines.reduce((s, l) => s + n(l.credit), 0);
      assert.equal(Math.round(dr * 100), Math.round(cr * 100), `${t.label}, НДС ${vat}`);
    }
  }
  assert.equal(new Set(TEMPLATES.map((t) => t.key)).size, TEMPLATES.length);
});

test("шаблоны операций: НДС 12 % выделяется из суммы, контрагент и номенклатура — в свои строки", () => {
  assert.deepEqual(splitVat(1120), { net: 1000, vat: 120 });
  assert.deepEqual(splitVat(100), { net: 89.29, vat: 10.71 });
  const sale = TEMPLATES.find((t) => t.key === "sale-credit")!;
  const r = fillTemplate(sale, { total: 11200, vat: true, party: "ОсОО «Ала-Тоо»", item: "Сахар", qty: "60", unit: "кг" });
  assert.equal(r.description, "Реализация ОсОО «Ала-Тоо»");
  assert.deepEqual(r.lines.map((l) => [l.account, l.debit, l.credit, l.party, l.item, l.qty]), [
    ["1410", "11200,00", "", "ОсОО «Ала-Тоо»", "", ""],
    ["6110", "", "10000,00", "", "Сахар", "60"],
    ["3430", "", "1200,00", "", "", ""],
  ]);
  const noVat = fillTemplate(sale, { total: 500, vat: false });
  assert.equal(noVat.lines.length, 2, "без НДС строки НДС нет");
  assert.equal(noVat.description, "Реализация");
  const rent = TEMPLATES.find((t) => t.key === "rent")!;
  assert.equal(fillTemplate(rent, { total: 1, vat: false, party: "ИП Асанов" }).description, "Аренда помещения, ИП Асанов");
  assert.equal(fillTemplate(rent, { total: 1, vat: false }).description, "Аренда помещения");
});
