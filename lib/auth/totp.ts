// Двухфакторный вход: одноразовые коды из приложения (Google Authenticator, Microsoft Authenticator,
// 1Password и др.), RFC 6238 — HMAC-SHA1, шаг 30 с, 6 цифр. Плюс 10 резервных кодов на случай потери
// телефона; в базе хранятся только их SHA-256.
import { createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { sha256 } from "./tokens";

const B32 = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const STEP = 30;

export function base32Encode(buf: Uint8Array): string {
  let bits = 0, value = 0, out = "";
  for (const byte of buf) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}
export function base32Decode(s: string): Buffer {
  const clean = s.toUpperCase().replace(/[^A-Z2-7]/g, "");
  let bits = 0, value = 0; const out: number[] = [];
  for (const ch of clean) {
    value = (value << 5) | B32.indexOf(ch); bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
}

export const newSecret = () => base32Encode(randomBytes(20));

/** The code for a time step (counter). */
export function hotp(secret: string, counter: number, digits = 6): string {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = createHmac("sha1", base32Decode(secret)).update(msg).digest();
  const o = h[h.length - 1] & 15;
  const n = ((h[o] & 127) << 24) | (h[o + 1] << 16) | (h[o + 2] << 8) | h[o + 3];
  return String(n % 10 ** digits).padStart(digits, "0");
}
export const stepAt = (ms = Date.now()) => Math.floor(ms / 1000 / STEP);

/**
 * Checks a code with ±1 step for clock drift. Returns the matched step, or null.
 * A step at or before `lastStep` is refused — the same code cannot be used twice.
 */
export function verifyTotp(secret: string, code: string, lastStep: number | null | undefined, ms = Date.now()): number | null {
  const c = code.replace(/\s/g, "");
  if (!/^\d{6}$/.test(c)) return null;
  const now = stepAt(ms);
  for (const s of [now, now - 1, now + 1]) {
    if (lastStep !== null && lastStep !== undefined && s <= lastStep) continue;
    const want = Buffer.from(hotp(secret, s));
    if (timingSafeEqual(want, Buffer.from(c))) return s;
  }
  return null;
}

export function otpauthUri(secret: string, email: string, issuer = "FinLite KG"): string {
  return `otpauth://totp/${encodeURIComponent(issuer)}:${encodeURIComponent(email)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=${STEP}`;
}

/** 10 backup codes «xxxx-xxxx» (shown once) and their hashes (stored). */
export function newBackupCodes(n = 10): { codes: string[]; hashes: string[] } {
  const codes = Array.from({ length: n }, () => {
    const s = randomBytes(5).toString("hex"); // 10 hex chars
    return `${s.slice(0, 5)}-${s.slice(5)}`;
  });
  return { codes, hashes: codes.map(hashBackup) };
}
export const hashBackup = (code: string) => sha256(code.toLowerCase().replace(/[^0-9a-f]/g, ""));

/** Index of the matching backup code hash, or -1. */
export function matchBackup(code: string, hashes: string[]): number {
  const h = hashBackup(code);
  return h.length && code.replace(/[^0-9a-f]/gi, "").length === 10 ? hashes.indexOf(h) : -1;
}
