// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { articles, cleanPlainText, compareEditions, extractLegalText, lastAmendment, outline, requisites, textHash } from "./text";

const PAGE = `<html><head><title>ЦБД</title><script>var x=1</script></head><body>
<header><a>Главная</a><a>Поиск</a></header>
<nav>Меню</nav>
<div class="toolbar"><button>Скачать</button><span>Печать</span></div>
<div id="doc">
<p>ЗАКОН КЫРГЫЗСКОЙ РЕСПУБЛИКИ</p>
<p>от 29 апреля 2002 года № 76</p>
<p>О бухгалтерском учете</p>
<p>(В редакции Законов КР от 5 января 2018 года № 1, 6 августа 2026 года № 120)</p>
<p>Глава 1</p><p>Общие положения</p>
<p>Статья 1. Цель Закона</p>
<p>Настоящий Закон определяет правовые основы бухгалтерского учета.</p>
<p>Статья 2. Сфера применения</p>
<p>Закон распространяется на все организации&nbsp;и индивидуальных предпринимателей.</p>
<p>Глава 2</p><p>Учетная политика</p>
<p>Статья 3. Учетная политика</p>
<p>Субъект самостоятельно формирует учетную политику.</p>
<p>Президент Кыргызской Республики</p>
</div>
<footer>© 2026 Министерство юстиции. Все права защищены</footer>
</body></html>`;

test("правовая база: текст акта выделяется из страницы без меню и подвала", () => {
  const t = extractLegalText(PAGE, "О бухгалтерском учете");
  const lines = t.split("\n");
  assert.equal(lines[0], "ЗАКОН КЫРГЫЗСКОЙ РЕСПУБЛИКИ");
  assert.ok(!/Скачать|Печать|Главная|права защищены|var x/.test(t));
  assert.ok(t.includes("организации и индивидуальных"), "&nbsp; → пробел");
  assert.equal(lines[lines.length - 1], "Президент Кыргызской Республики");
  assert.equal(requisites(t), "от 29 апреля 2002 № 76");
  assert.equal(lastAmendment(t), "6 августа 2026");
});

test("правовая база: оглавление и якоря статей, повторы номеров", () => {
  const t = extractLegalText(PAGE);
  const toc = outline(t);
  assert.deepEqual(toc.map((x) => [x.level, x.anchor]), [[2, "gl-1"], [3, "st-1"], [3, "st-2"], [2, "gl-2"], [3, "st-3"]]);
  assert.equal(toc[1].label, "Статья 1. Цель Закона");
  const dup = outline("Статья 1. А\nтекст\nПриложение\nСтатья 1. Б\nРАЗДЕЛ II\nСтатья 12-1. В");
  assert.deepEqual(dup.map((x) => x.anchor), ["st-1", "st-1-2", "r-ii", "st-12-1"]);
  assert.equal(articles(t).get("st-2"), "Статья 2. Сфера применения\nЗакон распространяется на все организации и индивидуальных предпринимателей.");
});

test("правовая база: сравнение редакций по статьям", () => {
  const a = extractLegalText(PAGE);
  const b = a
    .replace("Субъект самостоятельно формирует учетную политику.", "Субъект формирует учетную политику и утверждает её приказом.")
    .replace("Президент Кыргызской Республики", "Статья 4. Переходные положения\nНастоящий Закон вступает в силу.\nПрезидент Кыргызской Республики")
    .replace("Статья 1. Цель Закона\nНастоящий Закон определяет правовые основы бухгалтерского учета.\n", "");
  assert.deepEqual(compareEditions(a, b), { changed: ["Статья 3"], added: ["Статья 4"], removed: ["Статья 1"], whole: false });
  // новая статья в конце: подпись «уезжает» от прежней последней статьи — это не её изменение
  const c = a.replace("Президент Кыргызской Республики", "Статья 4. Новая\nТекст.\nПрезидент Кыргызской Республики");
  assert.deepEqual(compareEditions(a, c), { changed: [], added: ["Статья 4"], removed: [], whole: false });
  assert.deepEqual(compareEditions(a, a.replace(/ /g, "  ")), { changed: [], added: [], removed: [], whole: false }, "пробелы не считаются изменением");
  assert.equal(textHash(a), textHash(a.replace(/\n/g, " \n ")));
});

test("правовая база: текст из файла — номера страниц и пустые строки уходят", () => {
  assert.equal(cleanPlainText("Статья 1.  Цель\r\n\r\n- 2 -\n12\nтекст статьи\n"), "Статья 1. Цель\nтекст статьи");
});
