// Финансовая диагностика: остатки, возраст долгов по FIFO, признаки неплатёжеспособности.
import { test } from "node:test";
import assert from "node:assert/strict";
import { diagnose, groups, balancesAt, openDebts, monthsBack, whatIf, altmanZ, DIAG_TEXTS } from "./diagnose";
import { demoEntries } from "@/lib/ledger/demo";
import type { LedgerEntry } from "@/lib/ledger/types";

let n = 0;
const E = (date: string, lines: LedgerEntry["lines"], o: Partial<LedgerEntry> = {}): LedgerEntry => ({ id: `e${++n}`, date, description: "", source: "manual", lines, ...o });
const L = (account: string, debit: number, credit: number, party?: string) => ({ account, debit, credit, ...(party ? { party } : {}) });

test("месяцы назад и группы баланса", () => {
  assert.deepEqual(monthsBack("2026-11-15", 3), ["2026-09", "2026-10", "2026-11"]);
  const g = groups(balancesAt([E("2026-01-01", [L("1210", 100, 0), L("1610", 50, 0), L("2110", 30, 0), L("3110", 0, 120), L("5110", 0, 60)], { source: "opening" })], "2026-01-31"));
  assert.equal(g.cash, 100); assert.equal(g.inventory, 50); assert.equal(g.currentAssets, 150); assert.equal(g.totalAssets, 180);
  assert.equal(g.currentLiabilities, 120); assert.equal(g.equity, 60); assert.equal(g.liquid, 100);
});

test("долги по FIFO: частичная оплата закрывает самую старую часть; кредиты без графика не просрочены", () => {
  const es = [
    E("2026-06-01", [L("1610", 1000, 0), L("3110", 0, 1000, "ОсОО Дан")]),
    E("2026-08-01", [L("1610", 500, 0), L("3110", 0, 500, "Дан ОсОО")]),
    E("2026-08-10", [L("3110", 700, 0, "ОсОО «Дан»"), L("1210", 0, 700)]),
    E("2026-09-01", [L("8010", 300, 0), L("3520", 0, 300, "Асанов")]),
    E("2026-03-01", [L("1210", 5000, 0), L("3310", 0, 5000, "Банк")]),
    E("2026-10-05", [L("7210", 0, 0), L("3430", 0, 200)]),
  ];
  const d = openDebts(es, "2026-11-15");
  const dan = d.find((x) => x.kind === "suppliers")!;
  assert.equal(dan.amount, 800); assert.equal(dan.oldest, "2026-06-01"); assert.equal(dan.overdue, 800);
  assert.equal(dan.overdue90, 300, "остаток июньской поставки — просрочен больше чем на 90 дней сверх срока");
  assert.equal(d.find((x) => x.kind === "staff")!.overdue, 300);
  assert.equal(d.find((x) => x.kind === "lenders")!.overdue, 0, "тело кредита гасится по графику — не просрочка");
  assert.equal(d.find((x) => x.kind === "budget")!.overdue, 0, "НДС за октябрь ещё в сроке");
});

test("компания в беде: недостаточность активов и нехватка ликвидности → признаки неплатёжеспособности", () => {
  const es = [
    E("2026-01-01", [L("1210", 10000, 0), L("5110", 0, 10000)], { source: "opening" }),
    E("2026-02-01", [L("1610", 60000, 0), L("3110", 0, 60000, "Поставщик")]),
    E("2026-03-01", [L("1410", 20000, 0, "Покупатель"), L("6110", 0, 20000)]),
    E("2026-03-01", [L("7200", 40000, 0), L("1610", 0, 40000)]),
    E("2026-05-31", [L("8010", 9000, 0), L("3520", 0, 9000, "Работники")]),
    E("2026-06-30", [L("8030", 15000, 0), L("1210", 0, 9000), L("3110", 0, 6000, "Арендодатель")]),
  ];
  const r = diagnose(es, "2026-11-15", { months: 6 });
  assert.equal(r.verdict.level, "risk");
  assert.ok(r.balance.equity < 0);
  assert.ok(r.signals.some((s) => s.title === "Недостаточность активов"));
  assert.ok(r.signals.some((s) => s.title === "Задержка зарплаты"));
  assert.ok(r.signals.some((s) => /Ликвидных активов меньше/.test(s.title)));
  assert.equal(r.months.length, 6);
  const w = whatIf(r.balance, r.totals.overdue, { collect: 100, sell: 100, defer: 50 });
  assert.ok((w.coverage ?? 0) > (r.indicators.find((i) => i.key === "coverage")!.value ?? 0));
});

test("демо-компания: диагностика считается без ошибок, Альтман в разумных пределах", () => {
  const r = diagnose(demoEntries() as LedgerEntry[], "2026-09-30", { months: 3 });
  assert.equal(r.months.length, 3);
  assert.ok(r.balance.totalAssets > 0);
  assert.ok(r.altman && Number.isFinite(r.altman.z));
  assert.equal(altmanZ({ ...r.balance, totalAssets: 0 }, 0, 0), null);
});

test("все тексты диагностики — шаблоны из DIAG_TEXTS (их переводит интерфейс)", () => {
  const es = [
    E("2026-01-01", [L("1210", 1000, 0), L("5110", 0, 1000)], { source: "opening" }),
    E("2026-02-01", [L("1610", 90000, 0), L("3110", 0, 90000, "Поставщик")]),
    E("2026-03-31", [L("8010", 9000, 0), L("3520", 0, 9000, "Работники")]),
    E("2026-04-30", [L("8010", 1000, 0), L("3430", 0, 1000)]),
    E("2026-05-01", [L("9510", 500, 0), L("3550", 0, 500, "Банк")]),
  ];
  for (const r of [diagnose(es, "2026-11-15", { months: 6 }), diagnose(demoEntries() as LedgerEntry[], "2026-09-30", { months: 3 })]) {
    const texts = [r.verdict.title, r.verdict.detail, ...r.signals.flatMap((s) => [s.title, s.detail]), ...r.indicators.flatMap((i) => [i.label, i.norm, i.hint])];
    for (const t of texts) if (t !== "{list}") assert.ok(DIAG_TEXTS.includes(t), `нет в DIAG_TEXTS: ${t}`);
  }
});
