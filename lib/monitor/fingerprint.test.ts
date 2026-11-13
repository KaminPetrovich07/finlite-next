// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { fingerprint, isNoise, normalizeMessage, routeOf, shouldAlert, topFrame } from "./fingerprint";

test("ошибки: одинаковый сбой у разных пользователей — один отпечаток", () => {
  const a = fingerprint("client", "Cannot read properties of null (reading 'total') at row 12", "TypeError: x\n    at Home (https://site.vercel.app/_next/static/chunks/3l23ocx.js:1:2345)", "https://site/?companyId=cmwdxyzz400bhpu624u0ei2vb");
  const b = fingerprint("client", "Cannot read properties of null (reading 'total') at row 7", "TypeError: x\n    at Home (https://site.vercel.app/_next/static/chunks/9zz11aa.js:1:999)", "https://site/");
  assert.equal(a, b);
  assert.notEqual(a, fingerprint("server", "Cannot read properties of null (reading 'total')", null, "/"));
  assert.notEqual(a, fingerprint("client", "Cannot read properties of null (reading 'total')", null, "/reports"));
});

test("ошибки: нормализация текста, стека и адреса", () => {
  assert.equal(normalizeMessage("Компания cmwdxyzz400bhpu624u0ei2vb не найдена, код 404"), "Компания <id> не найдена, код N");
  assert.equal(topFrame("Error\n    at node:internal/x\n    at Dash (webpack:///app/page.tsx:12:5)"), "at Dash (webpack:///app/page.tsx)");
  assert.equal(topFrame(null), "");
  assert.equal(routeOf("https://a.b/news/cmwdxyzz400bhpu624u0ei2vb?x=1"), "/news/:id");
  assert.equal(routeOf("/law/nalogovyj-kodeks"), "/law/nalogovyj-kodeks");
});

test("ошибки: шум расширений и сети не записывается; оповещение — 1-й, 10-й, 100-й раз", () => {
  assert.ok(isNoise("Uncaught Error", "at chrome-extension://abc/content.js:1:1"));
  assert.ok(isNoise("ResizeObserver loop completed with undelivered notifications."));
  assert.ok(isNoise("TypeError: Failed to fetch"));
  assert.ok(!isNoise("Cannot read properties of null (reading 'total')"));
  assert.deepEqual([1, 2, 10, 11, 100, 1000].map((n) => shouldAlert(n, n === 1)), [true, false, true, false, true, true]);
});
