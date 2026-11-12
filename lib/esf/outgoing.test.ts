// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { defaultOutSettings, goodsDeadline, itemKey, lineAmounts, missingCatalog, outgoingDocs, populationEarliest, salesXml, servicesDeadline, servicesXml } from "./outgoing";
import type { LedgerEntry } from "@/lib/ledger/types";

test("ЭСФ 2.0: сроки выписки — примеры из руководства ГНС", () => {
  // поставка пт 30.10 → до чт 05.11 (день поставки — день № 1)
  assert.equal(goodsDeadline("2026-10-30"), "2026-11-05");
  // поставка в субботу: день № 1 — понедельник 02.11, пятый — пятница 06.11
  assert.equal(goodsDeadline("2026-10-31"), "2026-11-06");
  // население на 05.11.2026: 31.10 — суббота, 30.10 — день 1, 19.10 — день 10
  assert.equal(populationEarliest("2026-11-05"), "2026-10-19");
  // услуги за октябрь: 10-й рабочий день ноября — 13.11 (01.11 — воскресенье)
  assert.equal(servicesDeadline("2026-10-15"), "2026-11-13");
});

test("ЭСФ 2.0: суммы строки по формулам сервера", () => {
  // цена без налога: 10 × 100, НДС 12 %, НсП 2 %
  assert.deepEqual(lineAmounts(10, 100, 12, 2, true), { net: 1000, vat: 120, nsp: 20, total: 1140 });
  // цена с налогами: итог 1 140 разбивается обратно
  assert.deepEqual(lineAmounts(10, 114, 12, 2, false), { net: 1000, vat: 120, nsp: 20, total: 1140 });
  // округление 0,005 → вверх
  assert.equal(lineAmounts(1, 0.125, 0, 0, true).net, 0.13);
});

const TIN = "01705199710011";
const entries: LedgerEntry[] = [
  { id: "e1", date: "2026-11-10", description: "Отгрузка ОсОО «Покупатель»", source: "manual", lines: [
    { account: "1410", debit: 1120, credit: 0, party: "ОсОО «Покупатель»", partyInn: TIN },
    { account: "6110", debit: 0, credit: 1000, item: "Сахар", qty: 10, unit: "шт" },
    { account: "3430", debit: 0, credit: 120 },
  ] },
  { id: "e2", date: "2026-11-11", description: "Розничная продажа за наличные", source: "manual", lines: [
    { account: "1110", debit: 1120, credit: 0 },
    { account: "6110", debit: 0, credit: 1000, item: "Сахар", qty: 10, unit: "шт" },
    { account: "3430", debit: 0, credit: 120 },
  ] },
  { id: "e3", date: "2026-11-11", description: "Консультация", source: "manual", lines: [
    { account: "1410", debit: 5000, credit: 0, party: "ИП Асанов", partyInn: "21234567890123" },
    { account: "6110", debit: 0, credit: 5000, item: "Консультация бухгалтера" },
  ] },
  { id: "e4", date: "2026-11-11", description: "Оплата от покупателя", source: "bank", lines: [
    { account: "1210", debit: 1120, credit: 0 }, { account: "1410", debit: 0, credit: 1120, partyInn: TIN },
  ] },
];

test("ЭСФ 2.0: продажи из журнала → документы и XML", () => {
  const s = defaultOutSettings(false);
  s.bankName = "Оптима Банк"; s.bankAccount = "1090120000000001";
  let docs = outgoingDocs(entries, "2026-11-01", "2026-11-30", s, "2026-11-12");
  assert.equal(docs.length, 3, "оплата от покупателя — не продажа");
  assert.ok(docs.every((d) => d.problems.some((p) => p.startsWith("нет кода"))));
  assert.deepEqual(missingCatalog(docs).map((m) => [m.name, m.unitCode, m.count]), [["Сахар", "796", 2], ["Консультация бухгалтера", "", 1]]);

  s.catalog[itemKey("Сахар")] = { code: "01234567890123", unitCode: "796", service: false };
  s.catalog[itemKey("Консультация бухгалтера")] = { code: "1000000001", unitCode: "", service: true };
  docs = outgoingDocs(entries, "2026-11-01", "2026-11-30", s, "2026-11-12");
  const [b2b, retail, act] = [docs.find((d) => d.entryId === "e1")!, docs.find((d) => d.entryId === "e2")!, docs.find((d) => d.entryId === "e3")!];
  assert.deepEqual(b2b.problems, []);
  assert.equal(b2b.buyerKind, "Taxpayer"); assert.equal(b2b.payment, "NonCash"); assert.equal(b2b.lines[0].price, 100);
  assert.deepEqual(b2b.esf, { net: 1000, vat: 120, nsp: 0, total: 1120 });
  assert.equal(retail.buyerKind, "Population"); assert.equal(retail.priceWithoutTax, false); assert.equal(retail.lines[0].price, 112);
  assert.equal(retail.esf.total, 1120); assert.deepEqual(retail.notes, []);
  assert.ok(act.service); assert.equal(act.deadline, "2026-12-14");

  const [goods] = salesXml(docs, s, new Date("2026-11-12T04:00:00Z"));
  assert.match(goods, /<SalesBatch xmlns="urn:einvoicing:sales:v1" schemaVersion="1.0">/);
  assert.match(goods, /<GeneratedAt>2026-11-12T10:00:00\+06:00<\/GeneratedAt>/);
  assert.match(goods, /<Buyer kind="Taxpayer">\s*<Tin>01705199710011<\/Tin>\s*<\/Buyer>/);
  assert.match(goods, /<Supplier>\s*<BankName>Оптима Банк<\/BankName>/);
  assert.match(goods, /<Buyer kind="Population"\/>/);
  assert.match(goods, /<UnitPrice>112<\/UnitPrice>\s*<TotalAmount>1120.00<\/TotalAmount>/);
  assert.match(goods, /<Vat category="Vat12" nspCategory="0"\/>/);
  assert.equal((goods.match(/<Invoice /g) ?? []).length, 2);
  const [svc] = servicesXml(docs, s);
  assert.match(svc, /<ServicesBatch xmlns="urn:einvoicing:sales-services:v1"/);
  assert.match(svc, /<ServiceUniqueCode>1000000001<\/ServiceUniqueCode>\s*<Quantity>1<\/Quantity>\s*<Price>5000<\/Price>/);

  // специальный режим: без кода поставки и налоговых полей
  const sp = { ...s, special: true };
  const [g2] = salesXml(outgoingDocs(entries, "2026-11-01", "2026-11-30", sp, "2026-11-12"), sp);
  assert.match(g2, /<Supply kindCode="003"\/>\s*<Vat\/>/);

  // просроченные и ИНН не той длины в файл не попадают
  const late = outgoingDocs(entries, "2026-11-01", "2026-11-30", s, "2026-11-30");
  assert.ok(late.find((d) => d.entryId === "e1")!.problems.some((p) => p.startsWith("срок выписки истёк")));
});
