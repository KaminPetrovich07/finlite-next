// Место в базе: пороги, сроки хранения служебного, лишние редакции законов.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fmtBytes, levelOf, limitBytes, MB } from "./storage";
import { cutoffs, extraEditions, RETENTION } from "./retention";
import { isRealChange } from "@/lib/law/store";
import { compareEditions } from "@/lib/law/text";

test("лимит из FL_DB_LIMIT_MB и пороги 80 % / 92 %", () => {
  assert.equal(limitBytes(undefined), 1024 * MB);
  assert.equal(limitBytes("500"), 500 * MB);
  assert.equal(limitBytes("abc"), 1024 * MB);
  assert.equal(levelOf(700 * MB, 1024 * MB).level, "ok");
  assert.equal(levelOf(830 * MB, 1024 * MB).level, "warn");
  assert.equal(levelOf(950 * MB, 1024 * MB).level, "full");
  assert.equal(fmtBytes(300 * MB), "300 МБ");
  assert.equal(fmtBytes(1.5 * 1024 * MB), "1.50 ГБ");
});

test("сроки хранения: метрикам хватает 120 дней входов", () => {
  const now = new Date("2026-11-15T00:00:00Z");
  const c = cutoffs(now);
  assert.ok(RETENTION.visitsDays >= 120);
  assert.equal(c.visits.toISOString().slice(0, 10), "2026-06-18");
  assert.ok(c.resolvedErrors > c.errors);
});

test("редакции законов: у каждого документа три самые новые", () => {
  const d = (id: string, docId: string, day: number) => ({ id, docId, createdAt: new Date(Date.UTC(2026, 10, day)) });
  const rows = [d("a1", "A", 1), d("a2", "A", 2), d("a3", "A", 3), d("a4", "A", 4), d("a5", "A", 5), d("b1", "B", 1), d("b2", "B", 2)];
  assert.deepEqual(extraEditions(rows).sort(), ["a1", "a2"]);
  assert.deepEqual(extraEditions(rows, 1).sort(), ["a1", "a2", "a3", "a4", "b1"]);
});

test("оформление на сайте-источнике — не новая редакция", () => {
  const before = "Статья 1. Общие положения\nНалог  платится «вовремя».\nСтатья 2. Ставки\nСтавка 12 процентов.";
  const spaces = "Статья 1. Общие положения\nНалог платится \"вовремя\".\n\nСтатья 2. Ставки\nСтавка 12 процентов. ";
  const changed = "Статья 1. Общие положения\nНалог платится вовремя.\nСтатья 2. Ставки\nСтавка 10 процентов.";
  assert.equal(isRealChange(compareEditions(before, spaces)), false);
  assert.equal(isRealChange(compareEditions(before, changed)), true);
  assert.equal(isRealChange({ changed: [], added: [], removed: [], whole: true }), true);
});
