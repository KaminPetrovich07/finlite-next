import { test } from "node:test";
import assert from "node:assert/strict";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { sumInWords, sum } from "@/lib/docs/model";
import { renderOfficialDocx } from "@/lib/docs/render-docx";
import { renderOfficialPdf } from "@/lib/docs/render-pdf";
import { buildPolicyDoc, workingChart } from "./build";
import { checkPolicy } from "./checks";
import { defaultPolicy, normalizePolicy } from "./types";

test("суммы прописью для кассовых документов", () => {
  assert.equal(sumInWords(1), "Один сом 00 тыйынов");
  assert.equal(sumInWords(2.05), "Два сома 05 тыйынов");
  assert.equal(sumInWords(21_000), "Двадцать одна тысяча сомов 00 тыйынов");
  assert.equal(sumInWords(1_385_000.5), "Один миллион триста восемьдесят пять тысяч сомов 50 тыйынов");
  assert.equal(sumInWords(112), "Сто двенадцать сомов 00 тыйынов");
  assert.equal(sum(1234567.8), "1 234 567,80");
});

test("политика по умолчанию для демо: производство, ПП 609, единый налог", () => {
  const p = defaultPolicy({ name: DEMO_COMPANY.name, regime: DEMO_COMPANY.regime, activity: DEMO_COMPANY.activity });
  assert.equal(p.framework, "sme609");
  assert.ok(p.activities.includes("production"));
  assert.equal(p.vatPayer, false);
});

test("normalizePolicy отбрасывает мусор и неизвестные варианты", () => {
  const base = defaultPolicy({ name: "ОсОО Тест" });
  const p = normalizePolicy({ framework: "xxx", ppeThreshold: -5, activities: ["trade", "hack"], allowance90: 500, orderDate: "вчера", extra: 1 }, base);
  assert.equal(p.framework, base.framework);
  assert.equal(p.ppeThreshold, base.ppeThreshold);
  assert.deepEqual(p.activities, ["trade"]);
  assert.equal(p.allowance90, 100);
  assert.equal(p.orderDate, base.orderDate);
  assert.equal((p as unknown as Record<string, unknown>).extra, undefined);
});

test("рабочий план счетов включает все счета из журнала", () => {
  const entries = demoEntries();
  const p = defaultPolicy({ name: DEMO_COMPANY.name, regime: DEMO_COMPANY.regime, activity: DEMO_COMPANY.activity });
  const chart = workingChart(p, entries);
  const used = new Set(entries.flatMap((e) => e.lines.map((l) => l.account)));
  for (const code of used) assert.ok(chart.some((a) => a.code === code), `нет счёта ${code}`);
});

test("проверки: недоначисленная амортизация и мелкие ОС", () => {
  const p = { ...defaultPolicy({ name: "ОсОО Тест" }), director: "Иванов И.И." };
  const entries = [
    { id: "1", date: "2026-01-10", description: "Принтер", source: "manual" as const, lines: [{ account: "2150", debit: 8000, credit: 0 }, { account: "1210", debit: 0, credit: 8000 }] },
    { id: "2", date: "2026-01-11", description: "Станок", source: "manual" as const, lines: [{ account: "2140", debit: 500000, credit: 0 }, { account: "1210", debit: 0, credit: 500000 }] },
  ];
  const c = checkPolicy(p, "unified_production", entries);
  assert.ok(c.some((x) => x.level === "error" && /Амортизация не начисляется/.test(x.title)));
  assert.ok(c.some((x) => /дешевле порога/.test(x.title)));
});

test("проверки: отрицательная касса", () => {
  const p = { ...defaultPolicy({ name: "ОсОО Тест" }), director: "Иванов И.И." };
  const entries = [{ id: "1", date: "2026-02-01", description: "Выдача", source: "manual" as const, lines: [{ account: "8010", debit: 100, credit: 0 }, { account: "1110", debit: 0, credit: 100 }] }];
  assert.ok(checkPolicy(p, "general", entries).some((x) => /Отрицательный остаток/.test(x.title)));
});

test("документ: приказ, политика, приложения; Word и PDF собираются", async () => {
  const entries = demoEntries();
  const p = defaultPolicy({ name: DEMO_COMPANY.name, regime: DEMO_COMPANY.regime, activity: DEMO_COMPANY.activity });
  const doc = buildPolicyDoc({ name: DEMO_COMPANY.name, regime: DEMO_COMPANY.regime }, p, entries);
  const text = JSON.stringify(doc.blocks);
  for (const s of ["Приказ", "Учётная политика", "Рабочий план счетов", "График документооборота", "Лица, имеющие право подписи", "ПП № 609", "калькул"]) assert.ok(text.includes(s), s);
  const docx = await renderOfficialDocx(doc);
  const pdf = await renderOfficialPdf(doc);
  assert.ok(docx.length > 5000 && pdf.length > 5000);
  assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
});
