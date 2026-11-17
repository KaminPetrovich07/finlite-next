// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { adminTwofaRequired, idleExpired, idleMinutes, touchEveryMs } from "./policy";

test("политика: обязательная 2FA для администраторов включается явно", () => {
  assert.equal(adminTwofaRequired({}), false);
  assert.equal(adminTwofaRequired({ FL_REQUIRE_ADMIN_2FA: "on" }), true);
  assert.equal(adminTwofaRequired({ FL_REQUIRE_ADMIN_2FA: "1" }), true);
  assert.equal(adminTwofaRequired({ FL_REQUIRE_ADMIN_2FA: "off" }), false);
});

test("политика: выход по бездействию", () => {
  assert.equal(idleMinutes({}), 0);
  assert.equal(idleMinutes({ FL_IDLE_MINUTES: "30" }), 30);
  assert.equal(idleMinutes({ FL_IDLE_MINUTES: "1" }), 5);
  assert.equal(idleMinutes({ FL_IDLE_MINUTES: "abc" }), 0);
  const t0 = Date.UTC(2026, 10, 17, 10);
  assert.equal(idleExpired(t0, t0 + 29 * 60e3, 30), false);
  assert.equal(idleExpired(t0, t0 + 31 * 60e3, 30), true);
  assert.equal(idleExpired(t0, t0 + 999 * 3600e3, 0), false);
  // при тайм-ауте 30 мин активность отмечается каждые 5 мин, иначе раз в час
  assert.equal(touchEveryMs(30), 5 * 60e3);
  assert.equal(touchEveryMs(0), 3600e3);
});
