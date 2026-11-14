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

test("план счетов: у каждого счёта есть кыргызское название", async () => {
  const { ACCOUNTS } = await import("@/lib/ledger/accounts");
  const { ACCOUNTS_KY } = await import("./accounts-ky");
  const missing = ACCOUNTS.filter((a) => !ACCOUNTS_KY[a.code]).map((a) => `${a.code} ${a.name}`);
  assert.deepEqual(missing, []);
  assert.equal(ACCOUNTS_KY["3430"], "Төлөнүүчү КНС");
  assert.ok(Object.keys(ACCOUNTS_KY).every((c) => ACCOUNTS.some((a) => a.code === c)), "лишних кодов нет");
});

test("периоды отчётов по-кыргызски", () => {
  assert.equal(translate("ky", "3 квартал 2026"), "2026-ж. 3-чейрек");
  assert.equal(translate("ky", "2026 год"), "2026-жыл");
  assert.equal(translate("ru", "3 квартал 2026"), "3 квартал 2026");
});
