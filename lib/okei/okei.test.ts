import { test } from "node:test";
import assert from "node:assert/strict";
import { OKEI, OKEI_SECTIONS, findUnit, normalizeUnit, okeiByCode, searchOkei, unitWithCode, unitSuggestions } from "./index";

test("классификатор загружен полностью: 4 раздела, коды уникальны", () => {
  assert.equal(OKEI_SECTIONS.length, 4);
  assert.ok(OKEI.length > 480, `единиц: ${OKEI.length}`);
  const codes = OKEI.map((u) => u.code);
  assert.equal(new Set(codes).size, codes.length, "повторяющиеся коды");
  for (const u of OKEI) {
    assert.match(u.code, /^\d{3,4}$/);
    assert.ok(u.names.length > 0 && u.group, `пустая запись ${u.code}`);
  }
});

test("ключевые позиции на месте", () => {
  assert.equal(okeiByCode("796")?.names[0], "Штука");
  assert.equal(okeiByCode("166")?.intlLetter[0], "KGM");
  assert.equal(okeiByCode("055")?.nat[0], "м2");
  assert.equal(okeiByCode("018")?.section, "nat");
  assert.equal(okeiByCode("2553")?.section, "nat4");
  assert.equal(okeiByCode("186")?.section, "intlx");
  assert.equal(okeiByCode("9805")?.names[0], "Доллар за тонну");
});

test("сопоставление ввода с ОКЕИ", () => {
  const code = (s: string) => findUnit(s)?.code;
  assert.equal(code("шт"), "796");
  assert.equal(code("шт."), "796");
  assert.equal(code("кг"), "166");
  assert.equal(code("КГ"), "166");
  assert.equal(code("KGM"), "166");
  assert.equal(code("м²"), "055");
  assert.equal(code("м3"), "113");
  assert.equal(code("л"), "112");
  assert.equal(code("л."), "625");      // лист, не литр
  assert.equal(code("мл"), "111");
  assert.equal(code("Мл"), "126");      // мегалитр
  assert.equal(code("мм"), "003");
  assert.equal(code("Мм"), "009");      // мегаметр
  assert.equal(code("г"), "163");       // грамм, а не год
  assert.equal(code("т"), "168");
  assert.equal(code("кВт.ч"), "245");
  assert.equal(code("квт*ч"), "245");
  assert.equal(code("компл."), "839");
  assert.equal(code("упак."), "778");
  assert.equal(code("пог. м"), "018");
  assert.equal(code("166"), "166");
  assert.equal(code("Килограмм"), "166");
  assert.equal(code("коробка"), "8751");
  assert.equal(findUnit("вязанка"), undefined);
  assert.equal(findUnit(""), undefined);
});

test("нормализация и подпись для документов", () => {
  assert.equal(normalizeUnit("шт."), "шт");
  assert.equal(normalizeUnit("м²"), "м2");
  assert.equal(normalizeUnit("вязанка"), "вязанка");
  assert.equal(unitWithCode("кг"), "кг (166)");
  assert.equal(unitWithCode("вязанка"), "вязанка");
  assert.equal(unitWithCode(""), "");
});

test("поиск как в справочнике", () => {
  assert.equal(searchOkei("166")[0].code, "166");
  assert.equal(searchOkei("кг")[0].code, "166");
  assert.equal(searchOkei("килограмм")[0].code, "166");
  assert.ok(searchOkei("ватт").some((u) => u.code === "212"));
  assert.ok(searchOkei("ед").some((u) => u.code === "642"));
  assert.equal(searchOkei("", { section: "nat4" }).length, 25);
  const s = unitSuggestions();
  assert.equal(s[0].value, "шт");
  assert.equal(new Set(s.map((x) => x.value)).size, s.length);
});
