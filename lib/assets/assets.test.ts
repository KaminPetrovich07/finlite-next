// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { accumulatedAt, bookSchedule, depreciationLines, disposalLines, taxChain, defaultTaxSettings } from "./depreciation";
import { normalizeAsset, type FixedAsset } from "./types";
import { pendingCogs, cogsLines, stockWithAverage } from "@/lib/stock/cogs";
import { parseNbkrXml, rateOn, revaluation, isMonetary } from "@/lib/fx/fx";
import { validateEntry } from "@/lib/ledger/engine";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

const near = (a: number, b: number, msg = "") => assert.ok(Math.abs(a - b) < 0.011, `${msg} ${a} ≠ ${b}`);

function asset(over: Partial<FixedAsset> = {}): FixedAsset {
  const { asset, errors } = normalizeAsset({
    name: "Станок", account: "2140", acquiredAt: "2026-01-15", inServiceAt: "2026-01-20", cost: 120000, residual: 0, lifeMonths: 60, method: "straight", ...over,
  }, over.id ?? "a1");
  assert.deepEqual(errors, []);
  return asset!;
}

test("ОС: линейная амортизация с месяца после ввода, сумма ровно равна стоимости", () => {
  const a = asset();
  const s = bookSchedule(a, "2031-12");
  assert.equal(s[0].ym, "2026-02");
  assert.equal(s.length, 60);
  near(s[0].amount, 2000);
  near(s[s.length - 1].accumulated, 120000);
  near(accumulatedAt(a, "2026-12"), 22000);
  // a cost that does not divide evenly still lands exactly
  const b = asset({ cost: 100000, lifeMonths: 36 });
  near(bookSchedule(b, "2030-01").at(-1)!.accumulated, 100000);
});

test("ОС: уменьшаемый остаток не уходит ниже ликвидационной и заканчивается в срок", () => {
  const a = asset({ method: "declining", residual: 10000 });
  const s = bookSchedule(a, "2035-01");
  assert.ok(s[0].amount > 2000, "первые месяцы больше линейных");
  near(s.at(-1)!.accumulated, 110000);
  assert.ok(s.length <= 60);
});

test("ОС: перенесённый объект продолжает с накопленной амортизацией", () => {
  const a = asset({ inServiceAt: "2024-01-10", acquiredAt: "2024-01-05", openingAccumulated: 46000, openingDate: "2025-12-31" });
  const s = bookSchedule(a, "2026-03");
  assert.equal(s[0].ym, "2026-01");
  near(s[0].amount, 2000); // (120000 − 46000) / (60 − 23)
  near(accumulatedAt(a, "2025-12"), 46000);
});

test("ОС: проводки амортизации и выбытия сбалансированы", () => {
  const a = asset(), land = asset({ id: "l", name: "Участок", account: "2110", cost: 500000 });
  const d = depreciationLines([a, land], "2026-03");
  assert.equal(d.rows.length, 1, "земля не амортизируется");
  assert.deepEqual(validateEntry({ date: "2026-03-31", lines: d.lines }), []);
  const sold = { ...a, disposedAt: "2026-06-10", disposalProceeds: 100000 };
  const x = disposalLines(sold);
  near(x.accumulated, 10000); // февраль–июнь
  near(x.carrying, 110000);
  near(x.gain, -10000);
  assert.deepEqual(validateEntry({ date: "2026-06-10", lines: x.lines }), []);
});

test("ОС: налоговая амортизация по группам НК КР", () => {
  const car = asset({ id: "c", name: "Легковой автомобиль", account: "2170", cost: 1000000, acquiredAt: "2025-03-01", inServiceAt: "2025-03-01", taxGroup: 1 });
  const pc = asset({ id: "p", name: "Ноутбук", account: "2150", cost: 8000, acquiredAt: "2025-05-01", taxGroup: 1 }); // < 100 РП
  const bld = asset({ id: "b", name: "Склад", account: "2130", cost: 5000000, acquiredAt: "2025-01-10", inServiceAt: "2025-01-10", taxGroup: 5, lifeMonths: 600 });
  const st = { ...defaultTaxSettings([car, pc, bld]), repairs: { "2026": { 1: 200000 } } };
  const [y25, y26] = taxChain([car, pc, bld], 2026, st);
  const g1 = y25.rows.find((r) => r.group === 1)!;
  near(g1.close, 1000000); near(g1.depreciation, 300000);
  assert.equal(y25.expensed.length, 1, "дешёвый ноутбук — расход в году покупки");
  near(y25.rows.find((r) => r.group === 5)!.depreciation, 500000);
  const g1b = y26.rows.find((r) => r.group === 1)!;
  near(g1b.open, 700000);
  near(g1b.repairDeductible, 105000); // 15 % от 700 000
  near(g1b.repairExcess, 95000);
  near(g1b.close, 795000);
  near(g1b.depreciation, 238500);
  near(y26.deduction, 238500 + 105000 + 450000);
});

test("Склад: списание по скользящей средней", () => {
  const e = (id: string, date: string, lines: LedgerEntry["lines"]): LedgerEntry => ({ id, date, description: id, source: "manual", lines });
  const entries: LedgerEntry[] = [
    e("p1", "2026-10-01", [{ account: "1610", debit: 10000, credit: 0, item: "Мука 1 с", qty: 100, unit: "кг" }, { account: "3110", debit: 0, credit: 10000 }]),
    e("p2", "2026-10-05", [{ account: "1610", debit: 14000, credit: 0, item: "мука 1 с", qty: 100, unit: "кг" }, { account: "3110", debit: 0, credit: 14000 }]),
    e("s1", "2026-10-10", [{ account: "1410", debit: 30000, credit: 0 }, { account: "6110", debit: 0, credit: 30000, item: "Мука 1 с", qty: 150, unit: "кг" }]),
    e("s2", "2026-10-20", [{ account: "1410", debit: 9000, credit: 0 }, { account: "6110", debit: 0, credit: 9000, item: "Мука 1 с", qty: 80, unit: "кг" }]),
  ];
  const p = pendingCogs(entries, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(p.length, 2);
  near(p[0].avgCost, 120); near(p[0].amount, 18000);
  assert.equal(p[0].cogsAccount, "7200");
  assert.ok(p[1].problem, "на остатке 50, продано 80");
  assert.deepEqual(validateEntry({ date: p[0].date, lines: cogsLines(p[0]) }), []);
  // after posting the first write-off it is not proposed again
  const posted = [...entries, { ...e("c1", "2026-10-10", cogsLines(p[0])), source: "cogs" as const, sourceRef: `${p[0].saleEntryId}:${p[0].lineIndex}` }];
  assert.equal(pendingCogs(posted, { from: "2026-10-01", to: "2026-10-31" }).filter((x) => !x.problem).length, 0);
  const st = stockWithAverage(posted, "2026-10-31");
  near(st[0].qty, 50); near(st[0].amount, 6000); near(st[0].avg, 120);
});

test("Валюта: курсы НБКР и переоценка по IAS 21", () => {
  const xml = `<?xml version="1.0" encoding="windows-1251" ?><CurrencyRates Name="Daily Exchange Rates" Date="11.11.2026"><Currency ISOCode="USD"><Nominal>1</Nominal><Value>87,4498</Value></Currency><Currency ISOCode="KZT"><Nominal>100</Nominal><Value>19,54</Value></Currency></CurrencyRates>`;
  const r = parseNbkrXml(xml);
  assert.equal(r.date, "2026-11-11");
  near(r.rates[0].rate, 87.4498);
  near(r.rates[1].rate, 0.1954);
  const rates = [{ date: "2026-10-01", code: "USD", rate: 87 }, { date: "2026-10-31", code: "USD", rate: 88 }];
  assert.equal(rateOn(rates, "USD", "2026-10-15")?.rate, 87);
  assert.ok(!isMonetary("1810") && isMonetary("1220") && isMonetary("3110"));
  const entries: LedgerEntry[] = [
    { id: "a", date: "2026-10-01", description: "Покупка валюты", source: "manual", lines: [{ account: "1220", debit: 87000, credit: 0, currency: "USD", amountCur: 1000 }, { account: "1210", debit: 0, credit: 87000 }] },
    { id: "b", date: "2026-10-02", description: "Долг поставщику", source: "manual", lines: [{ account: "1610", debit: 43500, credit: 0 }, { account: "3110", debit: 0, credit: 43500, currency: "USD", amountCur: 500 }] },
  ];
  const v = revaluation(entries, "2026-10-31", rates);
  near(v.rows.find((x) => x.account === "1220")!.diff, 1000);
  near(v.rows.find((x) => x.account === "3110")!.diff, -500);
  assert.deepEqual(validateEntry({ date: "2026-10-31", lines: v.lines }), []);
  near(v.lines.find((l) => l.account === "9140")!.credit, 1000);
  near(v.lines.find((l) => l.account === "9520")!.debit, 500);
  // after posting, the next revaluation at the same rate finds nothing
  const after = [...entries, { id: "fx", date: "2026-10-31", description: "fx", source: "fx" as const, sourceRef: "2026-10-31", lines: v.lines }];
  const again = revaluation(after, "2026-11-30", rates);
  assert.equal(again.lines.length, 0);
});

test("FIFO: продажа списывает сначала ранние партии", async () => {
  const { pendingCogs: pc, cogsLines: cl } = await import("@/lib/stock/cogs");
  const mk = (id: string, date: string, lines: LedgerLine[]): LedgerEntry => ({ id, date, description: id, source: "manual", lines });
  const entries: LedgerEntry[] = [
    mk("p1", "2026-10-01", [{ account: "1610", debit: 1000, credit: 0, item: "Кофе", qty: 10, unit: "кг" }, { account: "3110", debit: 0, credit: 1000 }]),
    mk("p2", "2026-10-05", [{ account: "1610", debit: 1500, credit: 0, item: "Кофе", qty: 10, unit: "кг" }, { account: "3110", debit: 0, credit: 1500 }]),
    mk("s1", "2026-10-10", [{ account: "1210", debit: 3000, credit: 0 }, { account: "6110", debit: 0, credit: 3000, item: "Кофе", qty: 12, unit: "кг" }]),
  ];
  const [avg] = pc(entries, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(avg.method, "wavg");
  assert.equal(avg.amount, 1500); // 12 × 125
  const [fifo] = pc(entries, { from: "2026-10-01", to: "2026-10-31" }, "fifo");
  assert.equal(fifo.method, "fifo");
  assert.equal(fifo.amount, 1300); // 10 × 100 + 2 × 150
  assert.match(cl(fifo)[0].memo ?? "", /ФИФО/);
  // the second sale after posting the first takes the rest of the second batch
  const posted = [...entries, { ...mk("c1", "2026-10-10", cl(fifo)), source: "cogs" as const, sourceRef: "s1:1" },
    mk("s2", "2026-10-20", [{ account: "1210", debit: 2000, credit: 0 }, { account: "6110", debit: 0, credit: 2000, item: "Кофе", qty: 8, unit: "кг" }])];
  const [second] = pc(posted, { from: "2026-10-01", to: "2026-10-31" }, "fifo");
  assert.equal(second.saleEntryId, "s2");
  assert.equal(second.amount, 1200); // остаток 8 × 150 — весь остаток, сходится с балансом
});
