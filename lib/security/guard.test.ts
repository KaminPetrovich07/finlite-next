// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { overLimit, PROBE } from "./guard";

test("защита: адреса сканеров отсекаются, обычные разделы — нет", () => {
  for (const p of ["/.env", "/.git/config", "/wp-admin/", "/wp-login.php", "/index.php", "/x/vendor/phpunit/a", "/cgi-bin/test"]) assert.ok(PROBE.test(p), p);
  for (const p of ["/", "/ledger", "/api/news", "/law/nalogovyy-kodeks", "/reports/env", "/news/123"]) assert.ok(!PROBE.test(p), p);
});

test("защита: общий лимит запросов к API с одного IP", () => {
  const t = 1_000_000;
  for (let i = 0; i < 60; i++) assert.equal(overLimit("1.1.1.1", true, t), false);
  assert.equal(overLimit("1.1.1.1", true, t), true, "61-я запись за минуту — отказ");
  assert.equal(overLimit("2.2.2.2", true, t), false, "другой IP не затронут");
  assert.equal(overLimit("1.1.1.1", true, t + 61_000), false, "через минуту окно сбрасывается");
  for (let i = 0; i < 239; i++) overLimit("3.3.3.3", false, t);
  assert.equal(overLimit("3.3.3.3", false, t), false);
  assert.equal(overLimit("3.3.3.3", false, t), true, "чтение — до 240 в минуту");
});
