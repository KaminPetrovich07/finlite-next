// Управленческий учёт: правила разметки, объекты стройки, отчёт по сегментам и распределение общих затрат.
import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import type { LedgerEntry } from "@/lib/ledger/types";
import { buildValueId, demoSettings, effectiveTags, ruleMatches, segmentReport, validateSettings, type MgmtSettings, type Tags } from "./model";

const E = (id: string, date: string, description: string, lines: LedgerEntry["lines"], extra: Partial<LedgerEntry> = {}): LedgerEntry => ({ id, date, description, source: "manual", lines, ...extra });
const entries: LedgerEntry[] = [
  E("s1", "2026-10-05", "Продажа в магазине № 1", [{ account: "1110", debit: 100000, credit: 0 }, { account: "6110", debit: 0, credit: 100000 }]),
  E("s2", "2026-10-06", "Продажа оптом ОсОО «Сеть»", [{ account: "1410", debit: 300000, credit: 0, party: "ОсОО «Сеть»" }, { account: "6110", debit: 0, credit: 300000, party: "ОсОО «Сеть»" }]),
  E("c1", "2026-10-07", "Себестоимость магазин", [{ account: "7200", debit: 60000, credit: 0 }, { account: "1610", debit: 0, credit: 60000 }]),
  E("c2", "2026-10-07", "Себестоимость опт", [{ account: "7200", debit: 240000, credit: 0 }, { account: "1610", debit: 0, credit: 240000 }]),
  E("a1", "2026-10-10", "Аренда магазина", [{ account: "8030", debit: 20000, credit: 0 }, { account: "1210", debit: 0, credit: 20000 }]),
  E("a2", "2026-10-31", "Зарплата администрации", [{ account: "8010", debit: 40000, credit: 0 }, { account: "3150", debit: 0, credit: 40000 }]),
  E("i1", "2026-10-31", "Проценты по кредиту", [{ account: "9510", debit: 5000, credit: 0 }, { account: "1210", debit: 0, credit: 5000 }]),
  E("b1", "2026-10-20", "Акт КС-2", [{ account: "1410", debit: 50000, credit: 0 }, { account: "6140", debit: 0, credit: 50000 }, { account: "7400", debit: 30000, credit: 0 }, { account: "1630", debit: 0, credit: 30000 }], { source: "build", sourceRef: "ks2:obj1:1" }),
  E("x", "2026-11-01", "Вне периода", [{ account: "6110", debit: 0, credit: 999 }, { account: "1110", debit: 999, credit: 0 }]),
];
const S: MgmtSettings = {
  dims: [
    { id: "shop", kind: "line", name: "Розница", role: "profit" }, { id: "opt", kind: "line", name: "Опт", role: "profit" },
    { id: buildValueId("obj1"), kind: "project", name: "Склад 32 м²", auto: true },
  ],
  rules: [{ id: "r1", text: "магазин", set: { line: "shop" } }, { id: "r2", party: "сеть", set: { line: "opt" } }, { id: "r3", text: "опт", set: { line: "opt" } }],
  alloc: { line: { base: "revenue" } },
};

test("правила: счёт, контрагент, текст, источник; явная разметка важнее правил; стройка — по объекту", () => {
  assert.ok(ruleMatches({ id: "a", account: "80", set: {} }, entries[4]));
  assert.ok(!ruleMatches({ id: "a", account: "71", set: {} }, entries[4]));
  assert.ok(ruleMatches({ id: "a", party: "сеть", set: {} }, entries[1]));
  assert.ok(ruleMatches({ id: "a", text: "МАГАЗИН", set: {} }, entries[0]));
  assert.ok(!ruleMatches({ id: "a", set: {} }, entries[0]));
  assert.ok(!ruleMatches({ id: "a", text: "магазин", source: "bank", set: {} }, entries[0]));
  assert.deepEqual(effectiveTags(entries[0], undefined, S).tags, { line: "shop" });
  const t = effectiveTags(entries[0], { line: "opt" }, S);
  assert.deepEqual([t.tags.line, t.origin.line], ["opt", "manual"]);
  const b = effectiveTags(entries[7], undefined, S);
  assert.deepEqual([b.tags.project, b.origin.project], ["build:obj1", "build"]);
  // удалённое значение аналитики не применяется
  assert.equal(effectiveTags(entries[0], { line: "gone" }, S, new Set(S.dims.map((d) => d.id))).tags.line, "shop");
});

test("отчёт по направлениям: вклад, распределение общих затрат по выручке, чистая прибыль", () => {
  const r = segmentReport(entries, "2026-10-01", "2026-10-31", "line", S, new Map());
  const shop = r.columns.find((c) => c.id === "shop")!, opt = r.columns.find((c) => c.id === "opt")!, common = r.columns.find((c) => c.id === "")!;
  assert.deepEqual([shop.revenue, shop.cogs, shop.gross, shop.admin, shop.direct], [100000, -60000, 40000, -20000, 20000]);
  assert.deepEqual([opt.revenue, opt.gross, opt.direct], [300000, 60000, 60000]);
  // общее: КС-2 (без направления) + зарплата администрации + проценты
  assert.deepEqual([common.revenue, common.cogs, common.admin, common.nonOp], [50000, -30000, -40000, -5000]);
  assert.equal(r.pool, 70000);
  assert.deepEqual([shop.allocated, opt.allocated], [-17500, -52500]);
  assert.deepEqual([shop.operating, opt.operating], [2500, 7500]);
  assert.equal(common.allocated, 70000);
  assert.equal(common.operating, 50000);
  assert.equal(r.total.net, 400000 + 50000 - 300000 - 30000 - 20000 - 40000 - 5000);
  assert.equal(shop.share, 22.22);
  assert.equal(r.untagged, 3);
  assert.ok(r.warnings.some((w) => /Выручка 50 000 сом не отнесена/.test(w)));
  const sumOp = r.columns.reduce((a, c) => a + c.operating, 0);
  assert.equal(Math.round(sumOp), r.total.operating);
});

test("базы распределения: прямые затраты, поровну, вручную, без распределения", () => {
  const run = (alloc: MgmtSettings["alloc"]) => segmentReport(entries, "2026-10-01", "2026-10-31", "line", { ...S, alloc }, new Map()).columns;
  const direct = run({ line: { base: "direct" } });
  // прямые затраты: розница 80 000, опт 240 000 → 1/4 и 3/4
  assert.deepEqual(direct.filter((c) => c.id).map((c) => c.allocated), [-17500, -52500]);
  assert.deepEqual(run({ line: { base: "equal" } }).filter((c) => c.id).map((c) => c.allocated), [-35000, -35000]);
  assert.deepEqual(run({ line: { base: "manual", manual: { shop: 10, opt: 90 } } }).filter((c) => c.id).map((c) => c.allocated), [-7000, -63000]);
  const none = run({ line: { base: "none" } });
  assert.deepEqual(none.filter((c) => c.id).map((c) => c.allocated), [0, 0]);
  assert.equal(none.find((c) => c.id === "")!.operating, 50000 - 30000 - 40000);
});

test("проект: объект стройки — сам; явная разметка проводок", () => {
  const manual = new Map<string, Tags>([["a1", { project: buildValueId("obj1") }]]);
  const r = segmentReport(entries, "2026-10-01", "2026-10-31", "project", { ...S, alloc: { project: { base: "none" } } }, manual);
  const o = r.columns.find((c) => c.id === "build:obj1")!;
  assert.deepEqual([o.revenue, o.cogs, o.admin, o.direct], [50000, -30000, -20000, 0]);
});

test("демо-мебельщик: цех, салон, администрация; B2B и розница", () => {
  const es = demoEntries();
  const s = demoSettings();
  assert.deepEqual(validateSettings(s), []);
  const line = segmentReport(es, DEMO_PERIOD.from, DEMO_PERIOD.to, "line", s, new Map());
  const b2b = line.columns.find((c) => c.id === "b2b")!, retail = line.columns.find((c) => c.id === "retail")!;
  assert.equal(b2b.revenue + retail.revenue, line.total.revenue);
  assert.ok(b2b.allocated < 0 && retail.allocated < 0);
  assert.equal(Math.round(line.columns.reduce((a, c) => a + c.net, 0)), Math.round(line.total.net));
  const dept = segmentReport(es, DEMO_PERIOD.from, DEMO_PERIOD.to, "dept", s, new Map());
  assert.ok(dept.columns.find((c) => c.id === "ws")!.direct < 0);
  assert.ok(dept.columns.find((c) => c.id === "salon")!.revenue > 0);
  assert.equal(dept.columns.find((c) => c.id === "sales")!.revenue + dept.columns.find((c) => c.id === "salon")!.revenue, dept.total.revenue);
  // у направлений нет своей себестоимости (она общая) — валовую маржу не показываем
  assert.equal(b2b.grossPct, null);
});

test("проверка настроек: пустые и повторяющиеся названия, правила без условий", () => {
  const p = validateSettings({ dims: [{ id: "a", kind: "dept", name: "Цех" }, { id: "b", kind: "dept", name: "цех" }, { id: "c", kind: "line", name: " " }], rules: [{ id: "r", set: { dept: "a" } }, { id: "q", text: "x", set: {} }], alloc: {} });
  assert.equal(p.length, 4);
});
