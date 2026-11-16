// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { ACTION_GROUPS, ACTION_LABELS, activityCsv, csvCell } from "./actions";
import { auditDays } from "./retention";

test("журнал: CSV не даёт Excel выполнить формулу из данных", () => {
  assert.equal(csvCell("=HYPERLINK(\"http://x\")"), "\"'=HYPERLINK(\"\"http://x\"\")\"");
  assert.equal(csvCell("+7 700"), "'+7 700");
  assert.equal(csvCell("@cmd"), "'@cmd");
  assert.equal(csvCell("обычный; текст"), "\"обычный; текст\"");
});

test("журнал: CSV с BOM, временем Бишкека и понятным названием действия", () => {
  const csv = activityCsv([{ id: "1", createdAt: "2026-11-15T20:30:00.000Z", action: "entry_delete", userEmail: "a@b.kg", companyId: "c1", companyName: "ОсОО Тест", details: { n: 2 } }]);
  assert.ok(csv.startsWith("\uFEFF"));
  const line = csv.split("\r\n")[1];
  assert.ok(line.startsWith("2026-11-16 02:30:00;a@b.kg;Удаление проводки;entry_delete;ОсОО Тест;c1;"));
});

test("журнал: у каждого действия в группах есть название", () => {
  for (const list of Object.values(ACTION_GROUPS)) for (const a of list) assert.ok(ACTION_LABELS[a], a);
});

test("журнал: срок хранения из FL_AUDIT_DAYS, не меньше 90 и не больше 10 лет", () => {
  assert.equal(auditDays({}), 400);
  assert.equal(auditDays({ FL_AUDIT_DAYS: "1825" }), 1825);
  assert.equal(auditDays({ FL_AUDIT_DAYS: "10" }), 400);
  assert.equal(auditDays({ FL_AUDIT_DAYS: "99999" }), 3650);
});
