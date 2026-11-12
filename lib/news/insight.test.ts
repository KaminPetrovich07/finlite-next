// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { actionsFor, fxSeries, fxStat, fxStory, lawsFor, parseBlock, segments, wantsFx } from "./insight";
import { fxArticle } from "./fxpost";
import type { Rate } from "@/lib/fx/fx";

test("разбор: блоки графиков в тексте", () => {
  assert.deepEqual(parseBlock("курсы USD, eur 30"), { type: "fx", codes: ["USD", "EUR"], days: 30 });
  assert.deepEqual(parseBlock("курсы"), { type: "fx", codes: ["USD", "EUR", "RUB", "KZT"], days: 90 });
  assert.equal((parseBlock("курсы USD 5000") as any).days, 730);
  assert.deepEqual(parseBlock("график Инфляция, %: 2023=10,8; 2024=5; 2025 = −7,2"), {
    type: "bars", title: "Инфляция, %", points: [{ label: "2023", value: 10.8 }, { label: "2024", value: 5 }, { label: "2025", value: -7.2 }],
  });
  assert.equal((parseBlock("линия Ставка: янв=9; фев=8,5") as any).type, "line");
  assert.equal(parseBlock("график без данных"), null);
  assert.equal(parseBlock("график Один: 2024=1"), null, "одной точки мало");
  assert.equal(parseBlock("что-то другое"), null);

  const s = segments("Вступление.\n\n{{курсы USD 30}}\n\nДалее {{не блок}} текст.");
  assert.deepEqual(s.map((x) => x.type), ["text", "fx", "text"]);
  assert.match((s[2] as any).text, /\{\{не блок\}\}/, "нераспознанное остаётся текстом");
});

const R = (date: string, code: string, rate: number): Rate => ({ date, code, rate });
const rates: Rate[] = [
  R("2025-12-31", "USD", 87.0), R("2026-10-01", "USD", 87.2), R("2026-10-13", "USD", 87.3),
  R("2026-11-05", "USD", 87.4), R("2026-11-12", "USD", 87.5), R("2026-11-13", "USD", 87.45),
  R("2026-10-13", "RUB", 1.0), R("2026-11-12", "RUB", 1.05), R("2026-11-13", "RUB", 1.06),
];

test("разбор: изменения курса за день, неделю, месяц и с начала года", () => {
  const u = fxStat(rates, "USD", 90)!;
  assert.equal(u.date, "2026-11-13");
  assert.equal(u.rate, 87.45);
  assert.deepEqual(u.day, { abs: -0.05, pct: -0.06, from: "2026-11-12" });
  assert.equal(u.week!.from, "2026-11-05");
  assert.equal(u.month!.from, "2026-10-13");
  assert.deepEqual(u.ytd, { abs: 0.45, pct: 0.52, from: "2025-12-31" });
  assert.equal(u.min, 87.2);
  assert.equal(fxStat(rates, "CNY"), null);

  const series = fxSeries(rates, ["USD", "RUB"], 31);
  assert.equal(series[0].date, "2026-10-13");
  assert.equal(series[0].USD_i, 100);
  assert.equal(series.at(-1)!.RUB_i, 106);
});

test("разбор: текст по числам и ежедневная заметка о курсах", () => {
  const stats = [fxStat(rates, "USD")!, fxStat(rates, "RUB")!];
  const story = fxStory(stats);
  assert.match(story[0], /^Официальные курсы НБКР на 13\.11\.2026: доллар США — 87,4500 сом, российский рубль — 1,0600 сом\.$/);
  assert.match(story[1], /^Доллар за день подешевел на 0,06 %, за месяц подорожал на 0,17 %, с начала года подорожал на 0,52 %\. Сом к доллару с начала года ослаб\.$/);
  assert.match(story[2], /рубля: \+6 %/);
  assert.ok(story.some((x) => /Разброс за период больше 2 % у рубля/.test(x)));

  const a = fxArticle(stats)!;
  assert.equal(a.title, "Курсы НБКР на 13.11.2026: доллар 87,45 сом (−0,06 % за день)");
  assert.match(a.body, /\{\{курсы USD,RUB 90\}\}/);
  assert.match(a.body, /Авансы и запасы/);
  assert.equal(fxArticle([fxStat(rates, "RUB")!]), null, "без доллара заметки нет");
});

test("разбор: что сделать в FinLite и где в законе — по хэштегам", () => {
  assert.deepEqual(actionsFor(["НДС", "ЭСФ"]).map((a) => a.href), ["/esf", "/taxreports"], "без повторов");
  assert.deepEqual(actionsFor(["неизвестный"]), []);
  assert.deepEqual(lawsFor(["НДС", "налоги"]).map((l) => l.slug), ["nalogovyj-kodeks"]);
  assert.ok(wantsFx(["НБКР"], ""));
  assert.ok(wantsFx([], "Официальный курс доллара вырос"));
  assert.ok(!wantsFx(["налоги"], "ГНС напоминает о сроках"));
});
