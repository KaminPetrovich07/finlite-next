// Номенклатура и торговые документы: разбор выгрузки 1С, слияние справочника, суммы с НДС, проводки.
import { test } from "node:test";
import assert from "node:assert/strict";
import { catalogFromJournal, mergeCatalog, normalizeItem, parseCatalogSheet, type CatalogItem } from "./catalog";
import { docFromEntry, docLines, docTotals, nextSaleNumber, rowTotals, validateDoc, type TradeDoc } from "./doc";
import { validateEntry } from "@/lib/ledger/engine";

test("номенклатура из 1С: шапка, группы-строки, вид, НДС, цены, единицы ОКЕИ", () => {
  const rows = [
    ["Номенклатура"], [],
    ["Наименование", "Артикул", "Единица", "Вид номенклатуры", "Цена", "Ставка НДС"],
    ["Продукты питания", "", "", "", "", ""],
    ["Чай зелёный «Пиала» 100 г", "CH-100", "шт", "Товар", "185,50", "12%"],
    ["Сахар-песок", "SG-1", "килограмм", "Товар", 72, "12%"],
    ["Услуги", "", "", "", "", ""],
    ["Доставка по городу", "", "усл. ед", "Услуга", "300", "Без НДС"],
    ["Итого", "", "", "", "", ""],
    ["Сахар-песок", "SG-1", "кг", "Товар", 72, "12%"],
  ];
  const p = parseCatalogSheet(rows);
  assert.equal(p.items.length, 3, "дубль пропущен");
  assert.equal(p.groups, 2);
  const [tea, sugar, delivery] = p.items;
  assert.deepEqual([tea.group, tea.article, tea.unit, tea.salePrice, tea.vat, tea.kind], ["Продукты питания", "CH-100", "шт", 185.5, "12", "goods"]);
  assert.equal(sugar.unit, "кг", "единица по ОКЕИ");
  assert.deepEqual([delivery.kind, delivery.vat, delivery.group], ["service", "none", "Услуги"]);
  assert.equal(p.columns.sale, "Цена");
  // прайс без шапки: первая колонка — наименование
  const bare = parseCatalogSheet([["Мука в/с"], ["Масло подсолнечное"]], { vat: "none" });
  assert.equal(bare.items.length, 2);
  assert.equal(bare.items[0].vat, "none");
  assert.ok(bare.warnings.length);
});

test("слияние справочника: по артикулу, затем по названию; пустое не стирает", () => {
  const base = [normalizeItem({ id: "a", name: "Чай зелёный", article: "CH-100", unit: "шт", salePrice: 180 })!, normalizeItem({ id: "b", name: "Сахар", unit: "кг", purchasePrice: 60 })!];
  const inc = [
    normalizeItem({ name: "Чай зелёный «Пиала»", article: "ch-100", salePrice: 190 })!,
    normalizeItem({ name: "САХАР", unit: "" })!,
    normalizeItem({ name: "Мука", unit: "кг" })!,
  ];
  const r = mergeCatalog(base, inc);
  assert.deepEqual([r.added, r.updated, r.unchanged], [1, 1, 1]);
  const tea = r.items.find((x) => x.id === "a")!;
  assert.equal(tea.salePrice, 190);
  assert.equal(tea.name, "Чай зелёный", "название не меняется");
  assert.equal(r.items.find((x) => x.id === "b")!.purchasePrice, 60);
  assert.equal(normalizeItem({ name: "  " }), null);
  assert.equal(normalizeItem({ name: "X", kind: "weird", vat: "18" })!.kind, "goods");
});

const sale = (over: Partial<TradeDoc> = {}): TradeDoc => ({
  type: "sale", number: "15", date: "2026-11-14", party: "ОсОО «Бишкек Маркет»", partyInn: "01234567890123", payment: "credit", vatIncluded: true,
  rows: [
    { name: "Чай зелёный", unit: "шт", kind: "goods", qty: 10, price: 112, vat: "12" },
    { name: "Доставка", unit: "усл. ед", kind: "service", qty: 1, price: 300, vat: "none" },
  ], ...over,
});

test("суммы: НДС в т. ч. (12/112) и сверху (12 %), без НДС", () => {
  assert.deepEqual(rowTotals({ name: "x", unit: "шт", kind: "goods", qty: 3, price: 33.33, vat: "12" }, true), { amount: 99.99, net: 89.28, vat: 10.71, gross: 99.99 });
  assert.deepEqual(rowTotals({ name: "x", unit: "шт", kind: "goods", qty: 3, price: 33.33, vat: "12" }, false), { amount: 99.99, net: 99.99, vat: 12, gross: 111.99 });
  const t = docTotals(sale());
  assert.deepEqual([t.net, t.vat, t.gross], [1300, 120, 1420]);
});

test("реализация → проводка: Дт 1410 всего, Кт 6110 по строкам с номенклатурой, Кт 3430 НДС; баланс сходится", () => {
  const lines = docLines(sale());
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [["1410", 1420, 0], ["6110", 0, 1000], ["6110", 0, 300], ["3430", 0, 120]]);
  assert.equal(lines[0].party, "ОсОО «Бишкек Маркет»");
  assert.equal(lines[0].partyInn, "01234567890123");
  assert.deepEqual([lines[1].item, lines[1].qty, lines[1].unit], ["Чай зелёный", 10, "шт"]);
  assert.deepEqual(validateEntry({ date: "2026-11-14", lines }), []);
  assert.equal(docLines(sale({ payment: "cash" }))[0].account, "1110");
});

test("поступление → проводка: запасы по виду, услуги в расходы, Дт 1540 НДС, Кт 3110", () => {
  const p: TradeDoc = { type: "purchase", number: "А-77", date: "2026-11-10", party: "ОсОО «Опт»", payment: "credit", vatIncluded: false, rows: [
    { name: "Чай зелёный", unit: "шт", kind: "goods", qty: 100, price: 80, vat: "12" },
    { name: "Упаковка", unit: "шт", kind: "material", qty: 50, price: 10, vat: "12" },
    { name: "Перевозка", unit: "усл. ед", kind: "service", qty: 1, price: 1000, vat: "none" },
  ] };
  const lines = docLines(p);
  assert.deepEqual(lines.map((l) => [l.account, l.debit, l.credit]), [["1610", 8000, 0], ["1620", 500, 0], ["8040", 1000, 0], ["1540", 1020, 0], ["3110", 0, 10520]]);
  assert.equal(lines[2].memo, "Перевозка");
  assert.deepEqual(validateEntry({ date: p.date, lines }), []);
  // обратно из проводки — те же строки и суммы
  const back = docFromEntry({ date: p.date, description: "", sourceRef: "purchase:А-77", lines })!;
  assert.deepEqual(back.rows.map((r) => [r.name, r.kind, r.qty, r.price, r.vat]), [["Чай зелёный", "goods", 100, 80, "12"], ["Упаковка", "material", 50, 10, "12"], ["Перевозка", "service", 1, 1000, "12"]]);
  assert.equal(back.party, "ОсОО «Опт»");
  assert.equal(back.payment, "credit");
});

test("проверка документа и нумерация реализаций по году", () => {
  assert.deepEqual(validateDoc(sale()), []);
  assert.ok(validateDoc(sale({ party: "" })).some((x) => /покупател/.test(x)), "в долг без покупателя нельзя");
  assert.deepEqual(validateDoc(sale({ party: "", payment: "cash" })), [], "розница за наличные — без покупателя можно");
  assert.ok(validateDoc(sale({ rows: [{ name: "x", unit: "шт", kind: "goods", qty: 0, price: 1, vat: "none" }] })).some((x) => /количество/.test(x)));
  assert.equal(nextSaleNumber([{ ref: "sale:7", date: "2026-03-01" }, { ref: "sale:12", date: "2026-10-01" }, { ref: "sale:40", date: "2025-12-30" }, { ref: "purchase:99", date: "2026-05-05" }], "2026-11-14"), "13");
  assert.equal(nextSaleNumber([], "2027-01-02"), "1");
});

test("номенклатура из журнала: вид по счёту, последние цены закупки и продажи", () => {
  const items: CatalogItem[] = catalogFromJournal([
    { id: "1", date: "2026-10-01", description: "", source: "manual", lines: [{ account: "1610", debit: 800, credit: 0, item: "Чай", qty: 10, unit: "шт" }, { account: "3110", debit: 0, credit: 800 }] },
    { id: "2", date: "2026-10-05", description: "", source: "manual", lines: [{ account: "1410", debit: 600, credit: 0 }, { account: "6110", debit: 0, credit: 600, item: "чай", qty: 5, unit: "шт" }] },
    { id: "3", date: "2026-10-06", description: "", source: "manual", lines: [{ account: "1620", debit: 100, credit: 0, item: "Плёнка", qty: 2, unit: "м" }, { account: "3110", debit: 0, credit: 100 }] },
  ], "12");
  assert.deepEqual(items.map((x) => [x.name, x.kind, x.purchasePrice, x.salePrice]), [["Плёнка", "material", 50, null], ["Чай", "goods", 80, 120]]);
});

test("database: документ проводится, правится, номер не повторяется, новые строки — в номенклатуру", { skip: !process.env.FL_TEST_PG_URL && "FL_TEST_PG_URL не задан" }, async () => {
  const { prisma } = await import("@/lib/db");
  const { createDoc, updateDoc, getDoc, listDocs, loadCatalog, mergeIntoCatalog, suggestNumber } = await import("./server");
  const company = await prisma.company.create({ data: { name: `trade-test-${Date.now()}` } });
  const companyId = company.id;
  try {
    await mergeIntoCatalog(companyId, [normalizeItem({ name: "Чай зелёный", unit: "шт", salePrice: 112, vat: "12" })!]);
    assert.equal(await suggestNumber(companyId, "2026-11-14"), "1");
    const a = await createDoc(companyId, sale({ number: "1" }));
    assert.equal(await suggestNumber(companyId, "2026-11-20"), "2");
    await assert.rejects(createDoc(companyId, sale({ number: "1" })), /уже есть/);
    const entry = await prisma.journalEntry.findUnique({ where: { id: a.entryId }, include: { lines: true } });
    assert.equal(entry?.source, "trade");
    assert.equal(entry?.sourceRef, "sale:1");
    assert.equal(entry?.lines.length, 4);
    // «Доставка» добавилась в номенклатуру как услуга
    const cat = await loadCatalog(companyId);
    assert.deepEqual(cat.map((x) => [x.name, x.kind]), [["Доставка", "service"], ["Чай зелёный", "goods"]]);

    const got = await getDoc(companyId, a.entryId);
    assert.equal(got.doc.rows[0].price, 112, "сохранённая копия — цены как ввели");
    assert.equal(got.editedInJournal, false);
    await updateDoc(companyId, a.entryId, { ...got.doc, rows: [{ ...got.doc.rows[0], qty: 20 }] }, got.version);
    await assert.rejects(updateDoc(companyId, a.entryId, got.doc, got.version), /изменил другой пользователь/);
    const list = await listDocs(companyId, "2026-11-01", "2026-11-30");
    assert.equal(list.length, 1);
    assert.equal(list[0].gross, 2240);
    assert.equal(list[0].vat, 240);
    const ev = await prisma.entryEvent.findFirst({ where: { companyId, entryId: a.entryId, action: "update" } });
    assert.equal(ev?.note, "изменён документ");
  } finally {
    await prisma.company.delete({ where: { id: companyId } });
    await prisma.$disconnect();
  }
});
