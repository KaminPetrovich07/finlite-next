// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { findDate, findTotal, parseQr, parseReceipt, suggestAccount } from "./parse";

const TODAY = new Date("2026-11-13T00:00:00Z");
const RECEIPT = `ОсОО «Канцлер Плюс»
ИНН 02104201010123
г. Бишкек, ул. Киевская 95
ЧЕК № 1234   Смена 15
Кассир: Асанова А.
Бумага А4 SvetoCopy 2 x 450,00 = 9OO,00
Ручка шариковая 10 x 25,00 = 250,00
ИТОГО: 1 15O,00
в т.ч. НДС 12%: 123,21
НАЛИЧНЫМИ 2 000,00
СДАЧА 850,00
13.11.2026 14:05
kkm.salyk.kg`;

test("чек: итог, дата, продавец, ИНН, НДС и счёт расходов из текста", () => {
  const r = parseReceipt(RECEIPT, null, TODAY);
  assert.equal(r.total, 1150, "ИТОГО важнее суммы наличными, буква О в цифрах исправлена");
  assert.equal(r.date, "2026-11-13");
  assert.equal(r.seller, "ОсОО «Канцлер Плюс»");
  assert.equal(r.inn, "02104201010123");
  assert.equal(r.vat, 123.21);
  assert.equal(r.account, "8060");
});

test("чек: QR-ссылка ГНС важнее распознанного текста", () => {
  const r = parseReceipt("ИТОГО 99,00\n01.01.2025", "https://kkm.salyk.kg/kkm/check?date=20261112T1830&sum=4560.50&tin=00512199900123&fn=123", TODAY);
  assert.equal(r.total, 4560.5);
  assert.equal(r.date, "2026-11-12");
  assert.equal(r.inn, "00512199900123");
  assert.match(r.checkUrl!, /^https:\/\/kkm\.salyk\.kg\//);
  assert.equal(parseQr("https://evil.example/?sum=1").checkUrl, undefined, "ссылки не на сайты ГНС не показываем");
});

test("чек: распознавание дат, сумм и подсказка счёта", () => {
  assert.equal(findDate("Дата: 05/09/26 10:00", TODAY), "2026-09-05");
  assert.equal(findDate("99.99.2026", TODAY), null);
  assert.equal(findDate("12.12.2035", TODAY), null, "дата из будущего");
  assert.equal(findTotal("Сумма 1 250-00"), 1250);
  assert.equal(findTotal("Хлеб 45,00\nМолоко 89,50"), 89.5, "без слова ИТОГО — наибольшая сумма");
  assert.equal(findTotal("нет сумм"), null);
  assert.equal(suggestAccount("АИ-92 40 л").account, "7540");
  assert.equal(suggestAccount("ЛДСП 16 мм белая").account, "1620");
  assert.equal(suggestAccount("что-то").account, "8490");
  assert.equal(parseReceipt("0с00 «Канцлер Плюс»\nИТОГО 10,00", null, TODAY).seller, "ОсОО «Канцлер Плюс»", "ноль вместо О в форме собственности");
  assert.equal(parseReceipt("0A0 «Северэлектро»", null, TODAY).seller, "ОАО «Северэлектро»");
  const ocr = parseReceipt("| ИНН ©2104201010123\nИТОГО: 1 150,00\nНАЛИЧНЫМИ 2 ©00, 60", null, TODAY);
  assert.equal(ocr.inn, "02104201010123", "© вместо нуля — как в реальном распознавании");
  assert.equal(ocr.total, 1150);
});
