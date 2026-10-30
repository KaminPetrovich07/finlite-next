import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";
import { calculate, costPools, normalizeProducts, type Product } from "./calc";
import { DEMO_PRODUCTS, demoOutputs } from "./demo";
import { buildCostingDoc } from "./doc";
import type { LedgerEntry } from "@/lib/ledger/types";

const e = (id: string, date: string, lines: Array<[string, number, number]>): LedgerEntry =>
  ({ id, date, description: id, source: "manual", lines: lines.map(([account, debit, credit]) => ({ account, debit, credit })) });

test("затраты периода из журнала по статьям", () => {
  const p = costPools([
    e("mat", "2026-03-05", [["1630", 1000, 0], ["1620", 0, 1000]]),
    e("buy", "2026-03-01", [["1620", 5000, 0], ["3110", 0, 5000]]),          // закупка — не затрата производства
    e("wage", "2026-03-31", [["7120", 400, 0], ["3520", 0, 400]]),
    e("soc", "2026-03-31", [["7130", 9, 0], ["3530", 0, 9]]),
    e("dep", "2026-03-31", [["7150", 100, 0], ["2194", 0, 100]]),
    e("adm", "2026-03-31", [["8010", 700, 0], ["3520", 0, 700]]),            // администрация — не в себестоимость
    e("wip", "2026-03-31", [["1630", 50, 0], ["3520", 0, 50]]),              // зарплата прямо на НЗП
    e("out", "2026-03-31", [["1640", 1050, 0], ["1630", 0, 1050]]),          // выпуск из НЗП — не затрата
    e("apr", "2026-04-01", [["7120", 999, 0], ["3520", 0, 999]]),
  ], "2026-03-01", "2026-03-31");
  assert.equal(p.materials, 1000);
  assert.equal(p.labor, 450);
  assert.equal(p.social, 9);
  assert.equal(p.overhead, 100);
  assert.equal(p.outputPosted, 1050);
});

test("распределение: всё до тыйына, по нормам и базе ОПР", () => {
  const products: Product[] = [
    { id: "a", name: "A", unit: "шт.", price: 100, laborPerUnit: 10, machineHours: 1, materials: [{ name: "m", unit: "кг", qty: 2, price: 10 }] },
    { id: "b", name: "B", unit: "шт.", price: 50, laborPerUnit: 5, machineHours: 3, materials: [{ name: "m", unit: "кг", qty: 1, price: 10 }] },
  ];
  const pools = { materials: 1000.01, labor: 300, social: 6.75, overhead: 333.33, overheadBy: {}, outputPosted: 0 };
  for (const base of ["materials", "labor", "machineHours", "output"] as const) {
    const r = calculate(products, { a: 30, b: 40 }, pools, base, "actual");
    assert.equal(r.unallocated, 0, base);
    assert.equal(r.totals.materials, 1000.01);
    assert.equal(r.totals.overhead, 333.33);
  }
  const r = calculate(products, { a: 30, b: 40 }, pools, "machineHours", "actual");
  // машино-часы: A 30, B 120 → B получает 80% ОПР
  assert.ok(Math.abs(r.products[1].overhead - 333.33 * 0.8) < 0.02);
  // материалы: норма A 20×30 = 600, B 10×40 = 400
  assert.ok(Math.abs(r.products[0].materials - 600.006) < 0.02);
});

test("убыточное изделие и перерасход материалов попадают в выводы", () => {
  const products: Product[] = [{ id: "a", name: "A", unit: "шт.", price: 10, laborPerUnit: 1, machineHours: 0, materials: [{ name: "m", unit: "кг", qty: 1, price: 5 }] }];
  const r = calculate(products, { a: 10 }, { materials: 80, labor: 10, social: 0, overhead: 30, overheadBy: {}, outputPosted: 0 }, "labor", "actual");
  assert.ok(r.advice.some((a) => a.level === "error" && /ниже себестоимости/.test(a.title)));
  assert.ok(r.advice.some((a) => /перерасход материалов/.test(a.title)));
});

test("демо: калькуляция квартала сходится, документ собирается", async () => {
  const pools = costPools(demoEntries(), DEMO_PERIOD.from, DEMO_PERIOD.to);
  const r = calculate(DEMO_PRODUCTS, demoOutputs(DEMO_PERIOD.from, DEMO_PERIOD.to), pools, "labor", "actual");
  assert.equal(r.products.length, 3);
  assert.equal(r.unallocated, 0);
  assert.ok(r.products.every((p) => p.margin !== null && p.margin > 20));
  const doc = buildCostingDoc("ОсОО Тест", DEMO_PERIOD.from, DEMO_PERIOD.to, r, { director: "", chief: "" });
  assert.equal((await renderOfficialPdf(doc)).subarray(0, 4).toString(), "%PDF");
});

test("normalizeProducts отбрасывает мусор", () => {
  const p = normalizeProducts([{ id: "../x", name: "", price: -1, materials: [{ name: "", qty: 1 }, { name: "ЛДСП", qty: "2", price: "3" }] }]);
  assert.equal(p.length, 1);
  assert.match(p[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(p[0].price, 0);
  assert.deepEqual(p[0].materials, [{ name: "ЛДСП", unit: "", qty: 2, price: 3 }]);
});
