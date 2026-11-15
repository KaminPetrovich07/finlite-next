// Ввоз товара: распределение расходов, пошлина, НДС при ввозе, проводка.
import { test } from "node:test";
import assert from "node:assert/strict";
import { allocate, calcImport, eaeuDue, type ImportDoc } from "./calc";
import { validateEntry } from "@/lib/ledger/engine";

const base = (o: Partial<ImportDoc> = {}): ImportDoc => ({
  number: "1", date: "2026-11-10", origin: "third", country: "Китай", supplier: "Yiwu Trading Co", currency: "USD", rate: 87.5,
  rows: [
    { item: "Кроссовки", hs: "6404110000", unit: "пар", qty: 100, price: 12, duty: 10 },
    { item: "Рюкзаки", hs: "4202921100", unit: "шт", qty: 50, price: 8, duty: 5 },
  ],
  delivery: 21_000, carrier: "ОсОО Карго", deliveryInCustomsValue: true, fees: 4_000, other: 0, vatPayer: true, paidNow: false, ...o,
});

test("распределение по стоимости без потери тыйынов", () => {
  assert.deepEqual(allocate(100, [1, 1, 1]), [33.34, 33.33, 33.33]);
  assert.deepEqual(allocate(0, [5, 5]), [0, 0]);
  assert.equal(eaeuDue("2026-11-10"), "2026-12-20");
  assert.equal(eaeuDue("2026-12-31"), "2027-01-20");
});

test("из третьей страны: таможенная стоимость с доставкой, пошлина, НДС с (ТС + пошлина), проводка сходится", () => {
  const c = calcImport(base());
  assert.deepEqual(c.problems, []);
  const [a, b] = c.rows;
  assert.equal(a.invoice, 105_000); assert.equal(b.invoice, 35_000);
  assert.equal(a.delivery, 15_750); assert.equal(b.delivery, 5_250);
  assert.equal(a.customsValue, 120_750); assert.equal(a.dutyAmount, 12_075);
  assert.equal(a.vatBase, 132_825); assert.equal(a.vat, 15_939);
  assert.equal(a.cost, 105_000 + 15_750 + 3_000 + 12_075, "НДС у плательщика — к зачёту, не в себестоимость");
  assert.equal(a.unitCost, 1358.25);
  assert.equal(c.totals.duty, 12_075 + 2_012.5);
  assert.deepEqual(validateEntry({ date: "2026-11-10", lines: c.lines }), []);
  const sup = c.lines.find((l) => l.account === "3110" && l.party === "Yiwu Trading Co")!;
  assert.equal(sup.credit, 140_000); assert.equal(sup.currency, "USD"); assert.equal(sup.amountCur, 1600);
  assert.equal(c.lines.find((l) => l.account === "1540")!.debit, c.totals.vat);
  assert.ok(c.lines.every((l) => l.account !== "3430"), "НДС при ввозе — не НДС с реализации");
  assert.equal(c.vatDue, null);
});

test("из ЕАЭС: без пошлины, НДС по договорной стоимости или по базе ГНС для рисковых товаров, срок до 20-го", () => {
  const c = calcImport(base({ origin: "eaeu", country: "Казахстан", currency: "KZT", rate: 0.17, rows: [
    { item: "Мука", hs: "1101001100", unit: "кг", qty: 20_000, price: 180, minBase: 40 },
    { item: "Сахар", hs: "1701999000", unit: "кг", qty: 5_000, price: 300 },
  ], fees: 0, delivery: 0 }));
  assert.equal(c.totals.duty, 0);
  assert.equal(c.rows[0].invoice, 612_000);
  assert.equal(c.rows[0].vatBase, 800_000, "база ГНС 40 сом/кг выше договорной 30,6");
  assert.equal(c.rows[1].vatBase, 255_000);
  assert.equal(c.vatDue, "2026-12-20");
  const vatLine = c.lines.find((l) => l.party === "НДС при ввозе из ЕАЭС")!;
  assert.equal(vatLine.account, "3490"); assert.equal(vatLine.credit, c.totals.vat);
  assert.deepEqual(validateEntry({ date: "2026-11-10", lines: c.lines }), []);
});

test("не плательщик НДС: НДС в себестоимости; оплачено сразу — с расчётного счёта; ошибки в строках", () => {
  const c = calcImport(base({ vatPayer: false, paidNow: true }));
  assert.ok(!c.lines.some((l) => l.account === "1540"));
  assert.equal(c.rows[0].cost, 105_000 + 15_750 + 3_000 + 12_075 + 15_939);
  assert.ok(c.lines.filter((l) => l.account === "1210").length >= 3);
  assert.deepEqual(validateEntry({ date: "2026-11-10", lines: c.lines }), []);
  const bad = calcImport(base({ rows: [{ item: "", hs: "6404", unit: "", qty: 0, price: 1 }] }));
  assert.ok(bad.problems.some((p) => /ТН ВЭД/.test(p)));
  assert.ok(bad.problems.some((p) => /единица/.test(p)));
});
