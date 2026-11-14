// Документы из 1С: шапка по заголовкам, «Документ» с номером и датой, группировка, НДС в сумме / сверху.
import { test } from "node:test";
import assert from "node:assert/strict";
import { DOC_TEMPLATE, docFromTitle, importOrder, parseDocSheet, shortNumber } from "./import1c";
import { docLines, docTotals, validateDoc } from "./doc";
import { validateEntry } from "@/lib/ledger/engine";
import type { CatalogItem } from "./catalog";

test("вид, номер и дата из колонки «Документ»", () => {
  assert.deepEqual(docFromTitle("Реализация товаров и услуг 0000-000123 от 12.11.2026 10:00:00"), { type: "sale", number: "0000-000123", date: "2026-11-12" });
  assert.deepEqual(docFromTitle("Поступление (акт, накладная) БП-000045 от 01.10.2026"), { type: "purchase", number: "БП-000045", date: "2026-10-01" });
  assert.equal(docFromTitle("Мука"), null);
  assert.equal(shortNumber("0000-000123"), "123");
  assert.equal(shortNumber("БП-000045"), "БП-000045");
});

test("строки товаров собираются в документы, суммы сходятся, проводка балансируется", () => {
  const rows = [
    ["Универсальный отчёт"], [],
    ["Документ", "Контрагент", "ИНН", "Номенклатура", "Количество", "Цена", "Сумма", "Сумма НДС"],
    ["Реализация товаров и услуг 0000-000123 от 12.11.2026 10:00:00", "ОсОО Ак-Нур", "02311200610123", "Мука", 10, 56, 560, 60],
    ["Реализация товаров и услуг 0000-000123 от 12.11.2026 10:00:00", "ОсОО Ак-Нур", "02311200610123", "Сахар", 2, 112, 224, 24],
    ["Реализация товаров и услуг 0000-000124 от 13.11.2026 9:00:00", "ИП Асанов", "", "Мука", 1, 56, 56, 6],
    ["Итого", "", "", "", 13, "", 840, 90],
  ];
  const p = parseDocSheet(rows, "purchase");
  assert.equal(p.docs.length, 2);
  const a = p.docs[0];
  assert.equal(a.type, "sale"); assert.equal(a.number, "123"); assert.equal(a.date, "2026-11-12");
  assert.equal(a.partyInn, "02311200610123"); assert.equal(a.rows.length, 2); assert.equal(a.vatIncluded, true);
  const t = docTotals(a);
  assert.equal(t.gross, 784); assert.equal(t.gross, a.fileTotal); assert.equal(t.vat, 84);
  assert.deepEqual(validateDoc(a), []);
  assert.deepEqual(validateEntry({ date: a.date, lines: docLines(a) }), []);
  assert.equal(p.docs[1].party, "ИП Асанов");
});

test("отчёт с группировкой: документ и контрагент в строке-группе над товарами", () => {
  const rows = [
    ["Регистратор", "Контрагент", "Номенклатура", "Ед.", "Количество", "Сумма"],
    ["Поступление товаров и услуг ПН-000045 от 01.10.2026 12:00:00", "ОсОО Дан", "", "", "", 1120],
    ["", "", "Масло подсолнечное", "л", 5, 560],
    ["", "", "Соль", "кг", 56, 560],
  ];
  const p = parseDocSheet(rows, "sale");
  assert.equal(p.docs.length, 1);
  const d = p.docs[0];
  assert.equal(d.type, "purchase"); assert.equal(d.number, "ПН-000045"); assert.equal(d.party, "ОсОО Дан");
  assert.equal(d.rows[0].unit, "л"); assert.equal(d.rows[1].price, 10);
});

test("отдельные «Дата» и «Номер», НДС сверху, без НДС, вид по справочнику", () => {
  const catalog: CatalogItem[] = [{ id: "s1", name: "Доставка по городу", unit: "усл", kind: "service", vat: "none" }];
  const rows = [
    ["Дата", "Номер", "Поставщик", "Товар", "Ед.", "Кол-во", "Цена", "Сумма", "НДС", "Всего"],
    ["01.11.2026", "15", "ОсОО Дан", "Масло", "л", 5, 100, 500, 60, 560],
    ["02.11.2026", "16", "ОсОО Дан", "Доставка по городу", "", 1, 300, 300, 0, 300],
  ];
  const p = parseDocSheet(rows, "purchase", catalog);
  assert.equal(p.docs.length, 2);
  assert.equal(p.docs[0].vatIncluded, false);
  assert.equal(p.docs[0].rows[0].price, 100);
  assert.equal(docTotals(p.docs[0]).gross, 560);
  const svc = p.docs[1].rows[0];
  assert.equal(svc.kind, "service"); assert.equal(svc.itemId, "s1"); assert.equal(svc.vat, "none");
  assert.ok(docLines(p.docs[1]).some((l) => l.account === "8040"));
});

test("шаблон: вид документа словом, порядок загрузки — покупки раньше продаж", () => {
  const p = parseDocSheet(DOC_TEMPLATE, "sale");
  assert.equal(p.docs.length, 2);
  assert.deepEqual(p.docs.map((d) => d.type).sort(), ["purchase", "sale"]);
  const ord = importOrder([{ date: "2026-11-12", type: "sale" }, { date: "2026-11-12", type: "purchase" }, { date: "2026-11-01", type: "sale" }]);
  assert.deepEqual(ord.map((d) => `${d.date}:${d.type}`), ["2026-11-01:sale", "2026-11-12:purchase", "2026-11-12:sale"]);
});

test("без шапки — понятная ошибка", () => {
  const p = parseDocSheet([["a", "b"], [1, 2]], "sale");
  assert.equal(p.docs.length, 0);
  assert.match(p.problems[0], /Номенклатура/);
});
