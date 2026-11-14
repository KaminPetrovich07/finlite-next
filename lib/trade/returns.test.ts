// Возвраты от покупателя и поставщику, оплата документов (FIFO и привязанные оплаты).
import { test } from "node:test";
import assert from "node:assert/strict";
import { docFromEntry, docLines, docRef, nextNumber, refType, type TradeDoc } from "./doc";
import { docDues, payRef } from "./settle";
import { validateEntry } from "@/lib/ledger/engine";
import type { LedgerEntry } from "@/lib/ledger/types";

const row = (o: Partial<TradeDoc["rows"][number]> = {}) => ({ name: "Мука", unit: "кг", kind: "goods" as const, qty: 10, price: 112, vat: "12" as const, ...o });
const doc = (o: Partial<TradeDoc>): TradeDoc => ({ type: "saleReturn", number: "1", date: "2026-11-20", party: "ОсОО Ак-Нур", partyInn: "02311200610123", payment: "credit", vatIncluded: true, rows: [row()], ...o });
const bal = (ls: { debit: number; credit: number }[]) => Math.round(ls.reduce((s, l) => s + l.debit - l.credit, 0) * 100) / 100;

test("возврат от покупателя: Дт 6120 и 3430 — Кт 1410; обратно из проводки", () => {
  const d = doc({ rows: [row(), row({ name: "Доставка", kind: "service", unit: "усл", qty: 1, price: 300, vat: "none" })] });
  const ls = docLines(d);
  assert.equal(bal(ls), 0);
  assert.deepEqual(validateEntry({ date: d.date, lines: ls }), []);
  assert.deepEqual(ls.map((l) => [l.account, l.debit, l.credit]), [["6120", 1000, 0], ["6120", 300, 0], ["3430", 120, 0], ["1410", 0, 1420]]);
  assert.equal(ls[0].qty, 10); assert.equal(ls[0].item, "Мука");
  assert.equal(ls[1].memo, "Доставка"); assert.equal(ls[1].qty, undefined);
  assert.equal(ls[3].party, "ОсОО Ак-Нур");
  const back = docFromEntry({ date: d.date, description: "", sourceRef: docRef(d), lines: ls })!;
  assert.equal(back.type, "saleReturn"); assert.equal(back.party, "ОсОО Ак-Нур"); assert.equal(back.rows.length, 2);
  assert.equal(back.rows[0].price, 100); assert.equal(back.rows[1].kind, "service");
});

test("возврат поставщику: Дт 3110 — Кт 1610 и 1540; деньгами — Дт 1210", () => {
  const d = doc({ type: "purchaseReturn", party: "ОсОО Дан", rows: [row({ kind: "material" })] });
  const ls = docLines(d);
  assert.equal(bal(ls), 0);
  assert.deepEqual(ls.map((l) => [l.account, l.debit, l.credit]), [["3110", 1120, 0], ["1620", 0, 1000], ["1540", 0, 120]]);
  assert.equal(ls[1].qty, 10);
  assert.equal(docLines({ ...d, payment: "bank" })[0].account, "1210");
  const back = docFromEntry({ date: d.date, description: "", sourceRef: docRef(d), lines: ls })!;
  assert.equal(back.type, "purchaseReturn"); assert.equal(back.rows[0].kind, "material"); assert.equal(back.payment, "credit");
});

test("вид документа по sourceRef и своя нумерация возвратов", () => {
  assert.equal(refType("sale:5"), "sale");
  assert.equal(refType("saleReturn:5"), "saleReturn");
  assert.equal(refType("purchaseReturn:2"), "purchaseReturn");
  assert.equal(refType("pay:abc"), null);
  const refs = [{ ref: "sale:7", date: "2026-03-01" }, { ref: "saleReturn:2", date: "2026-05-01" }, { ref: "saleReturn:9", date: "2025-12-01" }];
  assert.equal(nextNumber(refs, "2026-11-01", "saleReturn"), "3");
  assert.equal(nextNumber(refs, "2026-11-01", "sale"), "8");
  assert.equal(nextNumber(refs, "2026-11-01", "purchaseReturn"), "1");
});

let n = 0;
const E = (date: string, lines: LedgerEntry["lines"], o: Partial<LedgerEntry> = {}): LedgerEntry => ({ id: `e${++n}`, date, description: "", source: "manual", lines, ...o });
const sale = (date: string, amount: number, party = "ОсОО Ак-Нур", ref = `sale:${n + 1}`) =>
  E(date, [{ account: "1410", debit: amount, credit: 0, party }, { account: "6110", debit: 0, credit: amount }], { source: "trade", sourceRef: ref });

test("оплата документов: FIFO по контрагенту, привязанная оплата — своему документу, возврат уменьшает долг", () => {
  const opening = E("2026-10-31", [{ account: "1410", debit: 500, credit: 0, party: "Ак-Нур ОсОО" }, { account: "5110", debit: 0, credit: 500 }], { source: "opening" });
  const s1 = sale("2026-11-01", 1000), s2 = sale("2026-11-05", 2000), s3 = sale("2026-11-06", 700, "ИП Асанов");
  const bank = E("2026-11-10", [{ account: "1210", debit: 1200, credit: 0 }, { account: "1410", debit: 0, credit: 1200, party: "ОсОО «Ак-Нур»" }]);
  const pay2 = E("2026-11-11", [{ account: "1210", debit: 1500, credit: 0 }, { account: "1410", debit: 0, credit: 1500, party: "ОсОО Ак-Нур" }], { sourceRef: payRef(s2.id) });
  const ret = E("2026-11-12", [{ account: "6120", debit: 300, credit: 0 }, { account: "1410", debit: 0, credit: 300, party: "ИП Асанов" }], { source: "trade", sourceRef: "saleReturn:1" });
  const dues = docDues([opening, s1, s2, s3, bank, pay2, ret], "2026-11-30", new Map([[ret.id, s3.id]]));
  // привязанная оплата 1500 → № 2; банк 1200 → начальный долг 500, затем № 1 — 700
  assert.deepEqual(dues.get(s2.id), { entryId: s2.id, amount: 2000, paid: 1500, due: 500, status: "partial" });
  assert.deepEqual(dues.get(s1.id), { entryId: s1.id, amount: 1000, paid: 700, due: 300, status: "partial" });
  assert.deepEqual(dues.get(s3.id), { entryId: s3.id, amount: 700, paid: 300, due: 400, status: "partial" });
  assert.equal(dues.has(opening.id), false, "начальные остатки — не документ");
  const later = docDues([s1, E("2026-12-01", [{ account: "1210", debit: 1000, credit: 0 }, { account: "1410", debit: 0, credit: 1000, party: "ОсОО Ак-Нур" }])], "2026-11-30");
  assert.equal(later.get(s1.id)!.status, "open", "оплата после даты не учитывается");
});
