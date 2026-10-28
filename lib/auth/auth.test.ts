// Run: npm test — session tokens and password rules (no database needed).
import { test } from "node:test";
import assert from "node:assert/strict";
import { signSession, verifySession } from "./session";
import { checkPassword, hashPassword, passwordProblem, tempPassword } from "./password";

test("session token: round trip, tampering and garbage are rejected", async () => {
  const t = await signSession("user_123");
  assert.equal(await verifySession(t), "user_123");
  const [h, p, s] = t.split(".");
  const forged = Buffer.from(JSON.stringify({ sub: "admin_1" })).toString("base64url");
  assert.equal(await verifySession(`${h}.${forged}.${s}`), null, "payload swapped");
  assert.equal(await verifySession(`${h}.${p}.${s.slice(0, -2)}xx`), null, "signature changed");
  assert.equal(await verifySession("nonsense"), null);
  assert.equal(await verifySession(undefined), null);
});

test("passwords: hashing, rules, temporary passwords", async () => {
  const h = await hashPassword("secret123");
  assert.ok(await checkPassword("secret123", h));
  assert.ok(!(await checkPassword("secret124", h)));
  assert.ok(!(await checkPassword("anything", null)), "unknown user never matches");
  assert.ok(passwordProblem("short1"));
  assert.ok(passwordProblem("onlyletters"));
  assert.ok(passwordProblem("12345678"));
  assert.equal(passwordProblem("secret123"), null);
  assert.equal(passwordProblem(tempPassword()), null, "temp password passes the rules");
});
