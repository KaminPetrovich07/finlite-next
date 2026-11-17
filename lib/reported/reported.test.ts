// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import * as XLSX from "xlsx";
import { cellDate, cellNumber, diagnoseReported, parseSheet, toQuarterly } from "./reported";
import { demoCompanies } from "./demo";
import { buildTemplate, lastQuarters } from "./template";
import { scoreCompany } from "@/lib/portfolio/score";

const grids = async (buf: Buffer) => {
  const wb = XLSX.read(buf, { type: "buffer", cellDates: false });
  return wb.SheetNames.map((n) => ({ name: n, grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" }) }));
};

test("отчётность: даты и числа из ячеек", () => {
  assert.equal(cellDate("30.09.2026"), "2026-09-30");
  assert.equal(cellDate("2026-06-30"), "2026-06-30");
  assert.equal(cellDate("3 кв. 2026"), "2026-09-30");
  assert.equal(cellDate(46295), "2026-09-30");
  assert.equal(cellDate("Показатель"), null);
  assert.equal(cellNumber("1 234 567,5"), 1234567.5);
  assert.equal(cellNumber("(1 200)"), -1200);
  assert.equal(cellNumber("−5"), -5);
  assert.equal(cellNumber(""), null);
  assert.equal(cellNumber("н/д"), null);
});

test("отчётность: пример → Excel → разбор возвращает те же цифры без расхождений", async () => {
  const demo = demoCompanies();
  const sheets = (await grids(await buildTemplate({ companies: demo, today: "2026-11-16" }))).filter((s) => s.name !== "Как заполнить");
  assert.equal(sheets.length, demo.length);
  sheets.forEach((s, i) => {
    const c = parseSheet(s.grid, s.name);
    assert.deepEqual(c.errors, [], s.name);
    assert.deepEqual(c.warnings, [], `${s.name}: ${JSON.stringify(c.warnings)}`);
    assert.equal(c.name, demo[i].name);
    assert.equal(c.inn, demo[i].inn);
    assert.equal(c.periods.length, 6);
    // тыс. сом нарастающим итогом пересчитаны обратно в сомы за квартал
    for (const [j, p] of c.periods.entries()) {
      const want = demo[i].periods[j].values;
      for (const key of ["cash", "revenue", "netProfit", "odStaff", "currentLiabilities"] as const) {
        assert.ok(Math.abs((p.values[key] ?? 0) - (want[key] ?? 0)) < 1, `${s.name} ${p.date} ${key}: ${p.values[key]} ≠ ${want[key]}`);
      }
    }
  });
});

test("отчётность: пустой шаблон — 4 последних квартала, без данных — понятная ошибка", async () => {
  assert.deepEqual(lastQuarters("2026-11-16", 4), ["2025-12-31", "2026-03-31", "2026-06-30", "2026-09-30"]);
  assert.deepEqual(lastQuarters("2026-01-10", 2), ["2025-09-30", "2025-12-31"]);
  const [s] = await grids(await buildTemplate({ today: "2026-11-16" }));
  const c = parseSheet(s.grid);
  assert.ok(c.errors.some((e) => e.text === "Не заполнено наименование предприятия"));
  assert.ok(c.errors.some((e) => e.text === "Не заполнено ни одного периода"));
});

test("отчётность: самопроверка ловит несходящийся баланс и просрочку больше долга", () => {
  const grid = [
    ["Наименование предприятия", "", "ГП Тест"], ["ИНН", "", "123"], ["Единица измерения", "", "сом"], ["Доходы и расходы указаны", "", "за квартал"],
    ["Код", "Показатель", "30.09.2026"],
    ["Б1", "", 100], ["Б7", "", 900], ["Б8", "", 1500], ["Б9", "", 300], ["Б10", "", 50], ["П1", "", 80], ["Д1", "", 1000], ["Д7", "", 10], ["Б3", "", "много"],
  ];
  const c = parseSheet(grid);
  const texts = c.warnings.map((w) => w.text);
  assert.ok(texts.includes("{at}: итого активы {a}, по строкам — {b}"));
  assert.ok(texts.includes("{at}: просрочено по строке {code} {a} — больше, чем весь долг {b}"));
  assert.ok(texts.includes("ИНН {inn}: ожидается 14 цифр"));
  assert.ok(texts.includes("{code}, {at}: «{value}» — не число, пропущено"));
});

test("отчётность: нарастающий итог пересчитывается в кварталы внутри года", () => {
  const q = toQuarterly([
    { date: "2025-12-31", values: { revenue: 400 } }, { date: "2026-03-31", values: { revenue: 100 } },
    { date: "2026-06-30", values: { revenue: 250 } }, { date: "2026-09-30", values: { revenue: 420 } },
  ]);
  assert.deepEqual(q.map((p) => p.values.revenue), [400, 100, 150, 170]);
});

test("отчётность: диагностика и балл — устойчивое, внимание, риск", () => {
  const [a, b, c, d] = demoCompanies().map((x) => diagnoseReported(x.periods, "2026-11-16")!);
  assert.equal(a.granularity, "quarter");
  assert.equal(a.asOf, "2026-09-30");
  assert.equal(a.verdict.level, "ok");
  assert.equal(scoreCompany(a, null).band, "ok");
  assert.equal(c.verdict.level, "risk");
  assert.ok(c.balance.equity < 0);
  assert.ok(c.signals.some((s) => s.title === "Задержка зарплаты" && s.detail.startsWith("По отчёту")));
  assert.equal(scoreCompany(c, null).band, "risk");
  const sb = scoreCompany(b, null);
  assert.equal(sb.band, "watch", JSON.stringify(sb.parts));
  assert.ok(sb.parts.some((p) => p.key === "falling" && p.label === "Ликвидность падает 3 квартала подряд"));
  assert.notEqual(d.verdict.level, "risk");
  // на дату до первого отчёта — нет данных; на середину 2026 — берётся 30.06.2026
  assert.equal(diagnoseReported(demoCompanies()[0].periods, "2025-01-01"), null);
  assert.equal(diagnoseReported(demoCompanies()[0].periods, "2026-08-01")!.asOf, "2026-06-30");
});
