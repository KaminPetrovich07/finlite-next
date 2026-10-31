import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import { validateEntry } from "@/lib/ledger/engine";
import { parseRows, periodFromTitle, num, isoDate, type Cell } from "./parse";
import { accountsOf, buildEntries, suggestAccount, toPairs } from "./map";
import { exportJournalXlsx } from "./export";

const mapAll = (p: ReturnType<typeof parseRows>) => Object.fromEntries(accountsOf(p).map((a) => [a.code, a.suggest.target]));

test("числа, даты и период из заголовка 1С", () => {
  assert.equal(num("1 234 567,89"), 1234567.89);
  assert.equal(num("(500,00)"), -500);
  assert.equal(isoDate("03.07.2026 12:00:00"), "2026-07-03");
  assert.deepEqual(periodFromTitle("Оборотно-сальдовая ведомость за 3 квартал 2026 г."), { from: "2026-07-01", to: "2026-09-30" });
  assert.deepEqual(periodFromTitle("Карточка счета 1210 за 01.07.2026 - 31.07.2026"), { from: "2026-07-01", to: "2026-07-31" });
  assert.deepEqual(periodFromTitle("Журнал проводок за Сентябрь 2026 г."), { from: "2026-09-01", to: "2026-09-30" });
  assert.deepEqual(periodFromTitle("за май 2026 г."), { from: "2026-05-01", to: "2026-05-31" });
});

test("журнал проводок 1С: документ с двумя парами — одна проводка, контрагент из субконто", () => {
  const rows: Cell[][] = [
    ["Журнал проводок за 01.07.2026 - 31.07.2026"], ["ОсОО «Белес»"], [],
    ["Период", "Документ", "Содержание", "Счет Дт", "Субконто Дт", "Количество Дт", "Счет Кт", "Субконто Кт", "Сумма"],
    ["20.07.2026 0:00:00", "Реализация 00012 от 20.07.2026", "Реализация товаров", "1410", "ОсОО «Ала-Тоо Отель»\nДоговор № 14/26", 3, "6110", "", "625 000,00"],
    ["", "", "НДС с реализации", "1410", "ОсОО «Ала-Тоо Отель»\nДоговор № 14/26", "", "3430", "", "75 000,00"],
    ["22.07.2026", "Поступление на р/с 00031", "Оплата", "1210.01", "", "", "1410", "Основной договор; ОсОО «Ала-Тоо Отель»", 700000],
    ["Итого", "", "", "", "", "", "", "", 1400000],
  ];
  const p = parseRows(rows);
  assert.equal(p.kind, "journal");
  assert.deepEqual(p.period, { from: "2026-07-01", to: "2026-07-31" });
  assert.equal(p.pairs.length, 3);
  const b = buildEntries(p, { mapping: mapAll(p) });
  assert.deepEqual(b.unmapped, []);
  assert.equal(b.entries.length, 2);
  const sale = b.entries[0];
  assert.equal(sale.lines.length, 4);
  assert.equal(sale.lines[0].party, "ОсОО «Ала-Тоо Отель»");
  assert.equal(b.entries[1].lines[0].account, "1210");
  assert.ok(!sale.lines.some((l) => l.account === "6110" && l.party), "на выручке номенклатура, не контрагент");
  assert.equal(b.entries[1].lines[1].party, "ОсОО «Ала-Тоо Отель»");
  for (const e of b.entries) assert.deepEqual(validateEntry(e), []);
  // повторная загрузка того же файла даёт те же отпечатки
  assert.deepEqual(buildEntries(parseRows(rows), { mapping: mapAll(p) }).entries.map((e) => e.sourceRef), b.entries.map((e) => e.sourceRef));
});

test("карточка счёта: двухстрочная шапка «Дебет | Кредит» над «Счёт | Сумма»", () => {
  const rows: Cell[][] = [
    ["Карточка счета 1210 за 3 квартал 2026 г."],
    ["Период", "Документ", "Аналитика Дт", "Аналитика Кт", "Дебет", "", "Кредит", "", "Текущее сальдо", ""],
    ["", "", "", "", "Счет", "Сумма", "Счет", "Сумма", "", ""],
    ["Сальдо на начало", "", "", "", "", "", "", "", "Д", 6500000],
    ["03.07.2026", "Списание с р/с 00005", "", "ОсОО «ТехноМебель»", "1620", "", "1210", 820000, "Д", 5680000],
    ["22.07.2026", "Поступление на р/с 00031", "", "ОсОО «Ала-Тоо Отель»", "1210", 900000, "1410", "", "Д", 6580000],
    ["Обороты за период", "", "", "", "", 900000, "", 820000, "", ""],
  ];
  const p = parseRows(rows);
  assert.equal(p.pairs.length, 2);
  assert.deepEqual(p.pairs.map((x) => [x.dr, x.cr, x.amount]), [["1620", "1210", 820000], ["1210", "1410", 900000]]);
  const b = buildEntries(p, { mapping: mapAll(p) });
  assert.equal(b.entries[1].lines[1].party, "ОсОО «Ала-Тоо Отель»");
});

test("ОСВ по счёту с контрагентами: начальные остатки, без двойного счёта итогов", () => {
  const rows: Cell[][] = [
    ["Оборотно-сальдовая ведомость за 3 квартал 2026 г."],
    ["Счет", "Наименование", "Сальдо на начало периода", "", "Обороты за период", "", "Сальдо на конец периода", ""],
    ["", "", "Дебет", "Кредит", "Дебет", "Кредит", "Дебет", "Кредит"],
    ["1210", "Счета в национальной валюте", 6500000, "", 1000, 2000, 6499000, ""],
    ["1400", "Счета к получению", 3200000, "", "", "", 3200000, ""],
    ["1410", "Счета к получению за товары", 3200000, "", "", "", 3200000, ""],
    ["ОсОО «Ала-Тоо Отель»", "", 1400000, "", "", "", 1400000, ""],
    ["ОсОО «Дордой Плаза»", "", 1800000, "", "", "", 1800000, ""],
    ["3110", "Счета к оплате", "", 4000000, "", "", "", 4000000],
    ["5130", "Прочий уставный капитал", "", 5000000, "", "", "", 5000000],
    ["7000", "Себестоимость", 300000, "", "", "", 300000, ""],
    ["Итого", "", 10000000, 9000000, 1000, 2000, 9999000, 9000000],
  ];
  const p = parseRows(rows);
  assert.equal(p.kind, "osv");
  const b = buildEntries(p, { mapping: mapAll(p), osvSide: "open" });
  assert.equal(b.entries.length, 1);
  const e = b.entries[0];
  assert.equal(e.date, "2026-07-01");
  assert.equal(e.source, "opening");
  assert.deepEqual(e.lines.filter((l) => l.account === "1410").map((l) => [l.party, l.debit]), [["ОсОО «Ала-Тоо Отель»", 1400000], ["ОсОО «Дордой Плаза»", 1800000]]);
  assert.ok(!e.lines.some((l) => l.account === "1400" || l.account === "7000"));
  // 7000 (расход) свёрнут на 5300; всего Дт 6,5+3,2 = 9,7 млн, Кт 4+5 = 9 млн + 5300 Дт 0,3 → разница видна в предупреждении
  assert.ok(b.warnings.some((w) => /5300/.test(w)));
  assert.ok(b.warnings.some((w) => /не равен кредиту/.test(w)));
});

test("российский план счетов 1С: предложение счетов КР", () => {
  assert.deepEqual(suggestAccount("62.01"), { target: "1410", how: "rf" });
  assert.deepEqual(suggestAccount("60.02"), { target: "1810", how: "rf" });
  assert.deepEqual(suggestAccount("1210.02"), { target: "1210", how: "parent" });
  assert.deepEqual(suggestAccount("1211"), { target: "1210", how: "parent" });
  assert.equal(suggestAccount("1777").how, "none");
});

test("закрытие месяца из 1С помечается как closing", () => {
  const rows: Cell[][] = [["Дата", "Счет Дт", "Счет Кт", "Сумма"], ["30.09.2026", "6110", "5999", 100], ["30.09.2026", "5999", "7000", 60]];
  const b = buildEntries(parseRows(rows), { mapping: { "6110": "6110", "5999": "5999", "7000": "7000" } });
  assert.equal(b.closing, 2);
  assert.ok(b.entries.every((e) => e.source === "closing"));
});

test("выгрузка в формате 1С читается обратно тем же разбором", async () => {
  const entries = demoEntries();
  const buf = await exportJournalXlsx("ОсОО «Белес»", DEMO_PERIOD.from, DEMO_PERIOD.to, entries);
  const wb = XLSX.read(buf, { type: "buffer" });
  const rows = XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: true, defval: "" });
  const p = parseRows(rows);
  const expected = toPairs(entries.filter((e) => e.source !== "opening" && e.date >= DEMO_PERIOD.from && e.date <= DEMO_PERIOD.to));
  assert.equal(p.pairs.length, expected.length);
  assert.equal(Math.round(p.pairs.reduce((s, x) => s + x.amount, 0)), Math.round(expected.reduce((s, x) => s + x.amount, 0)));
  const withParty = p.pairs.filter((x) => x.drSub.length || x.crSub.length).length;
  assert.ok(withParty > 5);
});

test("номенклатура и количество из 1С на счетах запасов", () => {
  const rows: Cell[][] = [
    ["Период", "Документ", "Счет Дт", "Субконто Дт", "Количество Дт", "Счет Кт", "Субконто Кт", "Количество Кт", "Сумма"],
    ["03.07.2026", "Поступление 41", "1620", "ЛДСП 16 мм\nОсновной склад", 40, "3110", "ОсОО «ТехноМебель»\nДоговор П-7", "", 128000],
    ["28.07.2026", "Требование-накладная 9", "1640", "", "", "1620", "ЛДСП 16 мм", "38,5", 123200],
  ];
  const p = parseRows(rows);
  const b = buildEntries(p, { mapping: { "1620": "1620", "3110": "3110", "1640": "1640" } });
  assert.deepEqual([b.entries[0].lines[0].item, b.entries[0].lines[0].qty, b.entries[0].lines[1].party], ["ЛДСП 16 мм", 40, "ОсОО «ТехноМебель»"]);
  assert.deepEqual([b.entries[1].lines[1].item, b.entries[1].lines[1].qty], ["ЛДСП 16 мм", 38.5]);
  assert.equal(b.entries[1].lines[0].item, undefined);
});
