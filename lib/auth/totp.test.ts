import { test } from "node:test";
import assert from "node:assert/strict";
import { base32Decode, base32Encode, hotp, matchBackup, newBackupCodes, newSecret, otpauthUri, stepAt, verifyTotp } from "./totp";

// RFC 6238, приложение B: секрет «12345678901234567890», SHA-1, 8 цифр
const RFC = base32Encode(Buffer.from("12345678901234567890"));

test("RFC 6238 test vectors", () => {
  assert.equal(hotp(RFC, Math.floor(59 / 30), 8), "94287082");
  assert.equal(hotp(RFC, Math.floor(1111111109 / 30), 8), "07081804");
  assert.equal(hotp(RFC, Math.floor(1234567890 / 30), 8), "89005924");
  assert.equal(hotp(RFC, Math.floor(20000000000 / 30), 8), "65353130");
});

test("base32 round-trip", () => {
  const s = newSecret();
  assert.equal(s.length, 32);
  assert.equal(base32Encode(base32Decode(s)), s);
});

test("verify: drift ±1 step, no reuse, wrong code", () => {
  const s = newSecret(); const t = 1_800_000_000_000;
  const now = stepAt(t);
  assert.equal(verifyTotp(s, hotp(s, now), null, t), now);
  assert.equal(verifyTotp(s, hotp(s, now - 1), null, t), now - 1);
  assert.equal(verifyTotp(s, hotp(s, now - 2), null, t), null);
  assert.equal(verifyTotp(s, hotp(s, now), now, t), null, "the same code twice");
  assert.equal(verifyTotp(s, "12 34 5", null, t), null);
  assert.match(otpauthUri(s, "a@b.kg"), /^otpauth:\/\/totp\/FinLite%20KG:a%40b\.kg\?secret=/);
});

test("backup codes", () => {
  const { codes, hashes } = newBackupCodes();
  assert.equal(new Set(codes).size, 10);
  assert.equal(matchBackup(codes[3].toUpperCase(), hashes), 3);
  assert.equal(matchBackup(codes[3].replace("-", " "), hashes), 3);
  assert.equal(matchBackup("00000-00000", hashes), -1);
});
