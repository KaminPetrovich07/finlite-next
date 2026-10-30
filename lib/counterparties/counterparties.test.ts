import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";
import { renderOfficialDocx } from "@/lib/docs/render-docx";
import type { LedgerEntry } from "@/lib/ledger/types";
import { analyze, UNASSIGNED } from "./calc";
import { demoStore } from "./demo";
import { buildInv17, buildReconciliationAct } from "./doc";
import { emptyCounterparty, normalizeStore, type CpStore } from "./types";

const e = (id: string, date: string, description: string, lines: Array<[string, number, number]>, source: LedgerEntry["source"] = "manual"): LedgerEntry =>
  ({ id, date, description, source, lines: lines.map(([account, debit, credit]) => ({ account, debit, credit })) });
const rates = { method: "aging" as const, d90: 25, d180: 50, d365: 100 };
const people = { director: "Иванов И.", directorTitle: "Директор", chief: "Петрова П.", cashier: "", storekeeper: "" };

test("сальдо по контрагентам сходится с журналом, FIFO и просрочка", () => {
  const store: CpStore = { list: [{ ...emptyCounterparty("ОсОО «Альфа»"), id: "alfa", paymentDays: 10, opening: { "1410": 300 }, openingDate: "2025-12-01" }], links: {} };
  const r = analyze([
    e("o", "2026-01-01", "Начальные остатки", [["1410", 500, 0], ["5300", 0, 500]], "opening"),
    e("s1", "2026-01-10", "Отгрузка ОсОО «Альфа»", [["1410", 1000, 0], ["6110", 0, 1000]]),
    e("p1", "2026-01-20", "Оплата ОсОО «Альфа»", [["1210", 800, 0], ["1410", 0, 800]]),
    e("s2", "2026-02-01", "Отгрузка ИП Бекова", [["1410", 200, 0], ["6110", 0, 200]]),
    e("x", "2026-02-02", "Оплата без имени", [["1210", 50, 0], ["1410", 0, 50]]),
  ], store, "2026-01-01", "2026-03-31", rates);
  const alfa = r.rows.find((x) => x.id === "alfa")!;
  assert.equal(alfa.balances["1410"], 500);                // 300 + 1000 − 800
  assert.deepEqual(alfa.openRecv.map((i) => [i.date, i.amount]), [["2026-01-10", 500]]); // opening 300 paid first
  assert.equal(alfa.overdueRecv, 500);
  assert.equal(alfa.sales, 1000);
  const bek = r.rows.find((x) => x.auto)!;
  assert.match(bek.name, /ИП Бекова/);
  // unassigned: 200 of the opening not split + the nameless payment
  assert.equal(r.unassigned.balances["1410"], 150);
  assert.equal(r.unassigned.entries.length, 1);
  const total = r.rows.reduce((s, x) => s + (x.balances["1410"] ?? 0), 0) + r.unassigned.balances["1410"];
  assert.equal(total, r.ledger["1410"]);
});

test("ручная привязка и отвязка операции", () => {
  const base: CpStore = { list: [{ ...emptyCounterparty("ОсОО «Бета»"), id: "beta" }], links: { x: "beta" } };
  const es = [e("x", "2026-02-02", "Оплата без имени", [["1210", 50, 0], ["1410", 0, 50]])];
  assert.equal(analyze(es, base, "2026-01-01", "2026-03-31", rates).rows[0].balances["1410"], -50);
  const off = analyze(es, { ...base, links: { x: UNASSIGNED } }, "2026-01-01", "2026-03-31", rates);
  assert.equal(off.unassigned.balances["1410"], -50);
  assert.ok(!off.advice.some((a) => /распределено больше/.test(a.title)), "оплата без имени — не ошибка ввода остатков");
});

test("демо: просрочка, резерв по политике и рекомендации", () => {
  const r = analyze(demoEntries(), demoStore(), DEMO_PERIOD.from, DEMO_PERIOD.to, rates);
  assert.deepEqual(r.unassigned.balances, {});
  assert.equal(r.totals.receivable, r.ledger["1410"]);
  const dordoi = r.rows.find((x) => x.id === "dordoi-plaza")!;
  assert.ok(dordoi.maxOverdue > 90);
  assert.equal(r.totals.allowance, 85_000);
  assert.ok(r.advice.some((a) => /Дт 7550 Кт 1491/.test(a.detail)));
  assert.ok(r.advice.some((a) => /превышен кредитный лимит/.test(a.title)));
});

test("акт сверки и ИНВ-17 собираются в PDF и Word", async () => {
  const store = demoStore();
  const r = analyze(demoEntries(), store, DEMO_PERIOD.from, DEMO_PERIOD.to, rates);
  const org = { name: "ОсОО «Белес»", inn: "", people };
  const act = buildReconciliationAct(org, r.rows.find((x) => x.id === "ala-too")!, store.list[0], DEMO_PERIOD.from, DEMO_PERIOD.to);
  const text = JSON.stringify(act.blocks);
  assert.match(text, /Сальдо на 01\.07\.2026/);
  assert.match(text, /в пользу ОсОО «Белес» составляет 2 580 000,00/);
  const inv = buildInv17(org, r, store.list, { number: "15", date: "2026-09-25" });
  assert.equal((await renderOfficialPdf(act)).subarray(0, 4).toString(), "%PDF");
  assert.equal((await renderOfficialPdf(inv)).subarray(0, 4).toString(), "%PDF");
  assert.ok((await renderOfficialDocx(inv)).length > 1000);
});

test("normalizeStore отбрасывает мусор", () => {
  const s = normalizeStore({ list: [{ name: "" }, { id: "../x", name: "ОсОО «Гамма»", inn: "12-34", opening: { "9999": 5, "1410": "100" }, recon: { date: "bad" } }], links: { "a b": "x", ok: "gamma" } });
  assert.equal(s.list.length, 1);
  assert.match(s.list[0].id, /^[A-Za-z0-9_-]+$/);
  assert.equal(s.list[0].inn, "1234");
  assert.deepEqual(s.list[0].opening, { "1410": 100 });
  assert.equal(s.list[0].recon, null);
  assert.deepEqual(s.links, { ok: "gamma" });
});

test("поле «контрагент» в строке важнее текста и привязки; ИНН находит карточку", () => {
  const store: CpStore = { list: [{ ...emptyCounterparty("ОсОО «Омега Трейд»"), id: "omega", inn: "01234567890123" }], links: { p: "omega" } };
  const line = (account: string, debit: number, credit: number, party?: string, partyInn?: string) => ({ account, debit, credit, party, partyInn });
  const r = analyze([
    { id: "o", date: "2026-01-01", description: "Начальные остатки", source: "opening", lines: [line("1410", 300, 0, "Омега", "01234567890123"), line("1410", 200, 0), line("5300", 0, 500)] },
    // описание называет другого, но поле строки — главное
    { id: "p", date: "2026-01-15", description: "Оплата от ОсОО «Сигма»", source: "bank", lines: [line("1210", 100, 0), line("1410", 0, 100, "ИП Садыков")] },
  ], store, "2026-01-01", "2026-03-31", rates);
  assert.equal(r.rows.find((x) => x.id === "omega")!.balances["1410"], 300);
  const sad = r.rows.find((x) => /Садыков/.test(x.name))!;
  assert.equal(sad.balances["1410"], -100);
  assert.equal(r.unassigned.balances["1410"], 200);
});
