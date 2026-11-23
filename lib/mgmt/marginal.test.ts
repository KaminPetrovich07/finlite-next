// Маржинальный анализ: доли переменных затрат, МД, точка безубыточности, запас прочности, рычаг, «что если».
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import type { LedgerEntry } from "@/lib/ledger/types";
import { defaultVariable, marginalReport, whatIf } from "./marginal";
import { demoSettings, type MgmtSettings } from "./model";

const E = (id: string, description: string, lines: LedgerEntry["lines"]): LedgerEntry => ({ id, date: "2026-10-10", description, source: "manual", lines });
const entries = [
  E("s1", "Продажа магазин", [{ account: "1110", debit: 400000, credit: 0 }, { account: "6110", debit: 0, credit: 400000 }]),
  E("s2", "Продажа опт", [{ account: "1410", debit: 600000, credit: 0 }, { account: "6110", debit: 0, credit: 600000 }]),
  E("c1", "Себестоимость магазин", [{ account: "7200", debit: 240000, credit: 0 }, { account: "1610", debit: 0, credit: 240000 }]),
  E("c2", "Себестоимость опт", [{ account: "7200", debit: 480000, credit: 0 }, { account: "1610", debit: 0, credit: 480000 }]),
  E("r1", "Аренда магазин", [{ account: "8030", debit: 60000, credit: 0 }, { account: "1210", debit: 0, credit: 60000 }]),
  E("d1", "Доставка опт", [{ account: "7540", debit: 30000, credit: 0 }, { account: "1210", debit: 0, credit: 30000 }]),
  E("a1", "Зарплата офиса", [{ account: "8010", debit: 100000, credit: 0 }, { account: "3190", debit: 0, credit: 100000 }]),
  E("u1", "Электроэнергия цех", [{ account: "7140", debit: 20000, credit: 0 }, { account: "3110", debit: 0, credit: 20000 }]),
];
const S: MgmtSettings = {
  dims: [{ id: "shop", kind: "line", name: "Магазин" }, { id: "opt", kind: "line", name: "Опт" }],
  rules: [{ id: "r1", text: "магазин", set: { line: "shop" } }, { id: "r2", text: "опт", set: { line: "opt" } }],
  alloc: { line: { base: "revenue" } },
};

test("доли по умолчанию: материалы и доставка — переменные, аренда и офис — постоянные, коммунальные — смешанные", () => {
  assert.equal(defaultVariable("7200"), 100);
  assert.equal(defaultVariable("7540"), 100);
  assert.equal(defaultVariable("8030"), 0);
  assert.equal(defaultVariable("8010"), 0);
  assert.equal(defaultVariable("7140"), 50);
  assert.equal(defaultVariable("7150"), 0);
});

test("по компании: МД, коэффициент, точка безубыточности, запас прочности, рычаг", () => {
  const r = marginalReport(entries, "2026-10-01", "2026-10-31", "dept", { ...S, dims: [] }, new Map());
  const t = r.total;
  // переменные: 240+480+30+10 (половина коммунальных) = 760 000; постоянные: 60+100+10 = 170 000
  assert.deepEqual([t.revenue, t.variable, t.fixed, t.contribution, t.cmRatio], [1000000, 760000, 170000, 240000, 24]);
  assert.equal(t.profit, 70000);
  assert.equal(t.breakEven, 708333.33);
  assert.equal(t.safety, 29.17);
  assert.equal(t.leverage, 3.43);
  assert.equal(r.accounts[0].code, "7200");
});

test("по сегментам: свои переменные и постоянные плюс доля общих по выручке", () => {
  const r = marginalReport(entries, "2026-10-01", "2026-10-31", "line", S, new Map());
  const shop = r.columns.find((c) => c.id === "shop")!, opt = r.columns.find((c) => c.id === "opt")!;
  // общее: офис 100 000 (пост.), коммунальные 10 000 перем. + 10 000 пост. → 40 % магазину, 60 % опту
  assert.deepEqual([shop.variable, shop.fixed, shop.fixedOwn], [244000, 104000, 60000]);
  assert.deepEqual([opt.variable, opt.fixed], [516000, 66000]);
  assert.equal(shop.contribution, 156000);
  assert.equal(opt.cmRatio, 14);
  assert.equal(Math.round(shop.profit + opt.profit), r.total.profit);
  assert.ok(!r.columns.some((c) => c.id === ""));
});

test("доли вручную: аренда как переменная меняет маржу; предупреждения о малом запасе прочности", () => {
  const r = marginalReport(entries, "2026-10-01", "2026-10-31", "line", { ...S, behavior: { "8030": 100 } }, new Map());
  assert.equal(r.columns.find((c) => c.id === "shop")!.variable, 304000);
  assert.ok(r.accounts.find((a) => a.code === "8030")!.isDefault === false);
  const thin = marginalReport([...entries, E("x", "Аренда опт склада", [{ account: "8030", debit: 70000, credit: 0 }, { account: "1210", debit: 0, credit: 70000 }])], "2026-10-01", "2026-10-31", "line", S, new Map());
  assert.ok(thin.warnings.some((w) => /«Опт»: (запас прочности|выручка ниже точки безубыточности)/.test(w)));
});

test("«что если»: +10 % объёма при рычаге 3,43 даёт около +34 % прибыли; рост цены идёт в прибыль целиком", () => {
  const t = marginalReport(entries, "2026-10-01", "2026-10-31", "dept", { ...S, dims: [] }, new Map()).total;
  const v = whatIf(t, { volume: 10, price: 0, unitCost: 0, fixed: 0 });
  assert.equal(v.profit, 94000);
  assert.equal(Math.round(((v.profit - t.profit) / t.profit) * 1000) / 10, 34.3);
  assert.equal(whatIf(t, { volume: 0, price: 5, unitCost: 0, fixed: 0 }).profit, 120000);
  assert.equal(whatIf(t, { volume: 0, price: 0, unitCost: 0, fixed: 0 }).profit, t.profit);
});

test("демо-мебельщик: МД по направлениям сходится с итогом", () => {
  const r = marginalReport(demoEntries(), DEMO_PERIOD.from, DEMO_PERIOD.to, "line", demoSettings(), new Map());
  assert.equal(Math.round(r.columns.reduce((a, c) => a + c.contribution, 0)), Math.round(r.total.contribution));
  assert.ok(r.total.breakEven! > 0 && r.total.safety! > 0);
});
