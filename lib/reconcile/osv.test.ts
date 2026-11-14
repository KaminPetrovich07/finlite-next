// Сверка с 1С: ОСВ из 1С против журнала FinLite.
import { test } from "node:test";
import assert from "node:assert/strict";
import { entriesFor, reconcile, targetOf } from "./osv";
import { parseRows, type Cell } from "@/lib/import1c/parse";
import { osvRows } from "@/lib/import1c/map";
import type { LedgerEntry } from "@/lib/ledger/types";
import type { OsvRow } from "@/lib/import1c/parse";

const P = { from: "2026-11-01", to: "2026-11-30" };
let n = 0;
const E = (date: string, lines: LedgerEntry["lines"], source: LedgerEntry["source"] = "manual"): LedgerEntry => ({ id: `e${++n}`, date, description: "", source, lines });
const L = (account: string, debit: number, credit: number, extra: Partial<LedgerEntry["lines"][number]> = {}) => ({ account, debit, credit, ...extra });
const O = (account: string, v: Partial<OsvRow>): OsvRow => ({ row: 0, account, name: "", sub: "", openDr: 0, openCr: 0, turnDr: 0, turnCr: 0, closeDr: 0, closeCr: 0, ...v });

const journal: LedgerEntry[] = [
  E("2026-10-31", [L("1210", 100000, 0), L("5110", 0, 100000)], "opening"),
  E("2026-11-02", [L("1610", 50000, 0, { item: "Мука", qty: 100, unit: "кг" }), L("1540", 6000, 0), L("3110", 0, 56000, { party: "ОсОО «Дан»" })]),
  E("2026-11-10", [L("1410", 33600, 0, { party: "ОсОО Ак-Нур" }), L("6110", 0, 30000, { item: "Мука", qty: 50 }), L("3430", 0, 3600)]),
  E("2026-11-10", [L("7200", 25000, 0), L("1610", 0, 25000, { item: "Мука", qty: 50 })], "cogs"),
  E("2026-11-20", [L("1210", 20000, 0), L("1410", 0, 20000, { party: "Ак-Нур" })]),
];

test("всё сходится, включая расчёты по контрагентам и закрытие доходов в 1С", () => {
  const one: OsvRow[] = [
    O("1210", { openDr: 100000, turnDr: 20000, closeDr: 120000 }),
    O("1410", { sub: "Ак-Нур ОсОО", turnDr: 33600, turnCr: 20000, closeDr: 13600 }),
    O("1540", { turnDr: 6000, closeDr: 6000 }),
    O("1610", { sub: "Мука", turnDr: 50000, turnCr: 25000, closeDr: 25000 }),
    O("3110", { sub: "Дан", turnCr: 56000, closeCr: 56000 }),
    O("3430", { turnCr: 3600, closeCr: 3600 }),
    O("5110", { openCr: 100000, closeCr: 100000 }),
    // 1С закрыла месяц: выручка и себестоимость ушли на 5999
    O("6110", { turnDr: 30000, turnCr: 30000 }),
    O("7200", { turnDr: 25000, turnCr: 25000 }),
    O("5999", { turnDr: 25000, turnCr: 30000, closeCr: 5000 }),
  ];
  const r = reconcile(journal, one, P);
  const bad = r.rows.filter((x) => x.status === "diff" || x.status === "only1c" || x.status === "onlyOurs");
  assert.deepEqual(bad.map((x) => `${x.account}:${x.status}`), []);
  assert.equal(r.rows.find((x) => x.account === "5999")!.status, "info", "прибыль текущего года — справочно");
  assert.deepEqual(r.profit, { one: 5000, ours: 5000 });
  assert.equal(r.rows.find((x) => x.account === "1410")!.subs.length, 0, "контрагенты совпали, несмотря на «ОсОО» и порядок слов");
});

test("расхождения: выручка, контрагент, счёт только в 1С, несопоставленный счёт", () => {
  const one: OsvRow[] = [
    O("1210", { openDr: 100000, turnDr: 20000, closeDr: 120000 }),
    O("1410", { sub: "Ак-Нур", turnDr: 33600, turnCr: 15000, closeDr: 18600 }),
    O("1410", { sub: "ИП Асанов", turnCr: 5000, closeCr: 5000 }),
    O("6110", { turnCr: 31000, turnDr: 31000 }),
    O("1110", { turnDr: 700, closeDr: 700 }),
    O("ZZ", { name: "Непонятный счёт", closeDr: 10 }),
  ];
  const r = reconcile(journal, one, P);
  const rev = r.rows.find((x) => x.account === "6110")!;
  assert.equal(rev.status, "diff"); assert.equal(rev.diff.turnCr, -1000); assert.equal(rev.diff.turnDr, null);
  assert.match(rev.hint, /реализации/);
  const ar = r.rows.find((x) => x.account === "1410")!;
  assert.equal(ar.status, "ok", "итог по счёту совпал");
  assert.deepEqual(ar.subs.map((s) => [s.name, s.diff]).sort(), [["Ак-Нур", -5000], ["ИП Асанов", 5000]]);
  assert.equal(r.rows.find((x) => x.account === "1110")!.status, "only1c");
  assert.equal(r.rows.find((x) => x.account === "1610")!.status, "onlyOurs");
  assert.deepEqual(r.unmapped.map((u) => u.code), ["ZZ"]);
});

test("остатки на начало не совпали — подсказка про начальные остатки", () => {
  const r = reconcile(journal, [O("1210", { openDr: 90000, turnDr: 20000, closeDr: 110000 })], P);
  const row = r.rows.find((x) => x.account === "1210")!;
  assert.equal(row.status, "diff"); assert.equal(row.diff.open, 10000);
  assert.match(row.hint, /начальные остатки/);
});

test("счета 1С по плану РФ и сохранённое сопоставление", () => {
  assert.equal(targetOf("62.01", {}), "1410");
  assert.equal(targetOf("41.01", {}), "1610");
  assert.equal(targetOf("1610", {}), "1610");
  assert.equal(targetOf("76.05", { "76.05": "3190" }), "3190");
  const r = reconcile(journal, [O("62.01", { sub: "Ак-Нур", turnDr: 33600, turnCr: 20000, closeDr: 13600 }), O("90.01.1", { turnCr: 30000, turnDr: 30000 })], P);
  assert.equal(r.rows.find((x) => x.account === "1410")!.status, "ok");
  assert.deepEqual(r.rows.find((x) => x.account === "1410")!.from1c, ["62.01"]);
  assert.equal(r.rows.find((x) => x.account === "6110")!.status, "ok");
});

test("ведомость 1С в Excel: шапка в две строки, группы счетов, контрагенты; операции по счёту", () => {
  const sheet: Cell[][] = [
    ["Оборотно-сальдовая ведомость за Ноябрь 2026 г."],
    ["Счет", "Наименование", "Сальдо на начало периода", "", "Обороты за период", "", "Сальдо на конец периода", ""],
    ["", "", "Дебет", "Кредит", "Дебет", "Кредит", "Дебет", "Кредит"],
    ["1210", "Счета в национальной валюте", 100000, "", 20000, "", 120000, ""],
    ["1400", "Счета к получению", "", "", 33600, 20000, 13600, ""],
    ["1410", "Счета к получению за товары", "", "", 33600, 20000, 13600, ""],
    ["ОсОО «Ак-Нур»", "", "", "", 33600, 20000, 13600, ""],
    ["Итого", "", 100000, 0, 53600, 20000, 133600, 0],
  ];
  const p = parseRows(sheet);
  assert.equal(p.kind, "osv");
  assert.deepEqual(p.period, P);
  const r = reconcile(journal, osvRows(p.osv), p.period!);
  assert.equal(r.rows.find((x) => x.account === "1210")!.status, "ok");
  assert.equal(r.rows.find((x) => x.account === "1410")!.status, "ok");
  const ops = entriesFor(journal, "1410", P);
  assert.equal(ops.total, 2);
  assert.deepEqual(ops.list.map((e) => [e.date, e.debit, e.credit]), [["2026-11-10", 33600, 0], ["2026-11-20", 0, 20000]]);
});
