// Run: npm test
import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClientIp } from "./ip";

const h = (o: Record<string, string>) => (n: string) => o[n] ?? null;

test("pickClientIp: на Vercel верит X-Real-IP", () => {
  assert.equal(pickClientIp(h({ "x-real-ip": "5.5.5.5", "x-forwarded-for": "1.1.1.1" }), { VERCEL: "1" }), "5.5.5.5");
});
test("pickClientIp: за своим прокси берёт адрес, который дописал прокси, а не клиент", () => {
  // клиент подставил 9.9.9.9, nginx дописал настоящий 7.7.7.7
  assert.equal(pickClientIp(h({ "x-forwarded-for": "9.9.9.9, 7.7.7.7" }), { FL_TRUSTED_PROXIES: "1" }), "7.7.7.7");
  assert.equal(pickClientIp(h({ "x-forwarded-for": "9.9.9.9, 7.7.7.7, 10.0.0.2" }), { FL_TRUSTED_PROXIES: "2" }), "7.7.7.7");
});
test("pickClientIp: X-Real-IP без Vercel не используется — его может прислать клиент", () => {
  assert.equal(pickClientIp(h({ "x-real-ip": "6.6.6.6", "x-forwarded-for": "7.7.7.7" }), {}), "7.7.7.7");
});
test("pickClientIp: без заголовков — unknown", () => {
  assert.equal(pickClientIp(h({}), {}), "unknown");
});
test("pickClientIp: мусорное значение FL_TRUSTED_PROXIES считается нулём", () => {
  assert.equal(pickClientIp(h({ "x-forwarded-for": "1.1.1.1, 2.2.2.2" }), { FL_TRUSTED_PROXIES: "abc" }), "2.2.2.2");
});
