// Налоговые риски: склад, цена ниже себестоимости, НДС, ЕАЭС, валютные закупки, ИНН.
import { test } from "node:test";
import assert from "node:assert/strict";
import { taxRisks, RISK_TEXTS } from "./check";
import { calcImport } from "@/lib/import-goods/calc";
import type { LedgerEntry } from "@/lib/ledger/types";

let n = 0;
const E = (date: string, lines: LedgerEntry["lines"], o: Partial<LedgerEntry> = {}): LedgerEntry => ({ id: `e${++n}`, date, description: "", source: "manual", lines, ...o });
const kinds = (r: ReturnType<typeof taxRisks>) => {
  for (const x of r.risks) for (const t of [x.title, x.detail]) assert.ok(RISK_TEXTS.includes(t), `нет в RISK_TEXTS: ${t}`);
  return r.risks.map((x) => x.kind).sort();
};

test("продажа без остатка и ниже средней себестоимости", () => {
  const es = [
    E("2026-09-01", [{ account: "1610", debit: 10_000, credit: 0, item: "Чай", qty: 100 }, { account: "1540", debit: 1_200, credit: 0 }, { account: "3110", debit: 0, credit: 11_200, party: "ОсОО Дан", partyInn: "01234567890123" }]),
    E("2026-09-10", [{ account: "1410", debit: 8_960, credit: 0, party: "ИП Асанов", partyInn: "11234567890123" }, { account: "6110", debit: 0, credit: 8_000, item: "Чай", qty: 100 }, { account: "3430", debit: 0, credit: 960 }]),
    E("2026-09-10", [{ account: "7200", debit: 10_000, credit: 0 }, { account: "1610", debit: 0, credit: 10_000, item: "Чай", qty: 100 }], { source: "cogs" }),
    E("2026-09-15", [{ account: "1410", debit: 2_240, credit: 0, party: "ИП Асанов", partyInn: "11234567890123" }, { account: "6110", debit: 0, credit: 2_000, item: "Чай", qty: 10 }, { account: "3430", debit: 0, credit: 240 }]),
    E("2026-09-15", [{ account: "7200", debit: 1_000, credit: 0 }, { account: "1610", debit: 0, credit: 1_000, item: "Чай", qty: 10 }], { source: "cogs" }),
  ];
  const r = taxRisks(es, "2026-09-01", "2026-09-30");
  assert.ok(r.vatPayer);
  assert.deepEqual(kinds(r), ["below-cost", "negative-stock", "vat-share"], "вычеты 1 200 при начисленном 1 200 — 100 %");
  const b = r.risks.find((x) => x.kind === "below-cost")!;
  assert.equal(b.amount, 2_000); assert.equal(b.severity, "high");
});

test("НДС: возмещение три месяца подряд, высокая доля вычетов, реализация без НДС", () => {
  const es: LedgerEntry[] = [];
  for (const [m, inp, out] of [["07", 1_200, 600], ["08", 1_500, 900], ["09", 2_000, 1_100], ["10", 950, 1_000]] as const) {
    es.push(E(`2026-${m}-05`, [{ account: "1610", debit: inp / 0.12, credit: 0 }, { account: "1540", debit: inp, credit: 0 }, { account: "3110", debit: 0, credit: inp / 0.12 + inp, party: "ОсОО Дан", partyInn: "01234567890123" }]));
    es.push(E(`2026-${m}-20`, [{ account: "1210", debit: out / 0.12 + out, credit: 0 }, { account: "6110", debit: 0, credit: out / 0.12 }, { account: "3430", debit: 0, credit: out }]));
  }
  es.push(E("2026-10-25", [{ account: "1110", debit: 50_000, credit: 0 }, { account: "6110", debit: 0, credit: 50_000 }]));
  const r = taxRisks(es, "2026-07-01", "2026-10-31");
  assert.ok(r.risks.some((x) => x.kind === "vat-refund"));
  assert.ok(r.risks.some((x) => x.kind === "vat-share" && x.vars?.month === "2026-10"));
  assert.equal(r.risks.find((x) => x.kind === "sale-no-vat")!.amount, 50_000);
  assert.equal(r.vat.length, 4);
});

test("ЕАЭС: НДС при ввозе не уплачен к 20-му; закупка в валюте без ввоза; крупный контрагент без ИНН", () => {
  const imp = calcImport({ number: "1", date: "2026-09-12", origin: "eaeu", country: "Казахстан", supplier: "ТОО Астык", currency: "KGS", rate: 1,
    rows: [{ item: "Мука", hs: "1101001100", unit: "кг", qty: 1000, price: 30 }], delivery: 0, deliveryInCustomsValue: false, fees: 0, other: 0, vatPayer: true, paidNow: false });
  const es = [
    E("2026-09-12", imp.lines, { sourceRef: "import:1" }),
    E("2026-09-20", [{ account: "1610", debit: 87_500, credit: 0, item: "Кофе", qty: 50 }, { account: "3110", debit: 0, credit: 87_500, party: "Lavazza SpA", currency: "EUR", amountCur: 900 }]),
    E("2026-09-25", [{ account: "1810", debit: 300_000, credit: 0, party: "ОсОО Бета" }, { account: "1210", debit: 0, credit: 300_000 }]),
  ];
  const r = taxRisks(es, "2026-09-01", "2026-11-15", { today: "2026-11-15" });
  assert.deepEqual(kinds(r), ["eaeu-vat", "fx-purchase", "no-inn"]);
  assert.equal(r.risks.find((x) => x.kind === "eaeu-vat")!.amount, 3_600);
  const paid = taxRisks([...es, E("2026-10-15", [{ account: "3490", debit: 3_600, credit: 0, party: "НДС при ввозе из ЕАЭС" }, { account: "1210", debit: 0, credit: 3_600 }])], "2026-09-01", "2026-11-15", { today: "2026-11-15" });
  assert.ok(!paid.risks.some((x) => x.kind === "eaeu-vat"));
});
