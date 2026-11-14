// Кыргызский интерфейс: у каждой строки переведённых разделов есть перевод, подстановки совпадают.
import { test } from "node:test";
import assert from "node:assert/strict";
import { coverage, translate } from "./index";
import { KY } from "./ky";
import { allKeys } from "./keys";

test("перевод: все строки переведённых разделов есть в словаре", () => {
  const c = coverage(allKeys());
  assert.deepEqual(c.missing, [], `нет перевода: ${c.missing.slice(0, 10).join(" | ")}`);
  assert.ok(c.total > 300);
});

test("перевод: подстановки {n}, {p} … те же, что в русском тексте", () => {
  const vars = (s: string) => [...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).sort();
  for (const [ru, ky] of Object.entries(KY)) assert.deepEqual(vars(ky), vars(ru), `«${ru}»`);
});

test("перевод: подстановка, запасной русский текст, кыргызские буквы", () => {
  assert.equal(translate("ky", "Отмечено: {n}", { n: 3 }), "Белгиленди: 3");
  assert.equal(translate("ru", "Отмечено: {n}", { n: 3 }), "Отмечено: 3");
  assert.equal(translate("ky", "Строка, которой нет в словаре"), "Строка, которой нет в словаре");
  const all = Object.values(KY).join(" ");
  assert.match(all, /[өүң]/, "кыргызские буквы на месте");
  // в кыргызском тексте не должно остаться русских слов-связок
  for (const [ru, ky] of Object.entries(KY)) assert.doesNotMatch(` ${ky} `, /\s(и|или|для|на|по|из|не)\s/, `похоже на непереведённое: «${ru}» → «${ky}»`);
});
