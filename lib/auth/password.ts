// Password hashing with scrypt from Node's crypto (no native add-ons, works on
// Vercel). Stored format: scrypt$N$r$p$saltB64$hashB64 — parameters travel with
// the hash, so they can be raised later without breaking existing accounts.
import { randomBytes, scryptSync, timingSafeEqual } from "node:crypto";

const N = 16384, R = 8, P = 1, KEYLEN = 64;

export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password.normalize("NFKC"), salt, KEYLEN, { N, r: R, p: P, maxmem: 64 * 1024 * 1024 });
  return `scrypt$${N}$${R}$${P}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPassword(password: string, stored: string | null | undefined): boolean {
  if (!stored) return false;
  const parts = stored.split("$");
  if (parts.length !== 6 || parts[0] !== "scrypt") return false;
  const [, n, r, p, saltB64, hashB64] = parts;
  const expected = Buffer.from(hashB64, "base64");
  let actual: Buffer;
  try {
    actual = scryptSync(password.normalize("NFKC"), Buffer.from(saltB64, "base64"), expected.length, {
      N: Number(n), r: Number(r), p: Number(p), maxmem: 64 * 1024 * 1024,
    });
  } catch {
    return false;
  }
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

/** Returns the first reason the password is too weak, or null. */
export function passwordProblem(password: string, email?: string): string | null {
  if (password.length < 8) return "Пароль — не короче 8 символов";
  if (password.length > 200) return "Пароль слишком длинный";
  if (!/[A-Za-zА-Яа-яЁё]/.test(password) || !/\d/.test(password)) return "В пароле нужны и буквы, и цифры";
  const local = email?.split("@")[0]?.toLowerCase();
  if (local && local.length >= 4 && password.toLowerCase().includes(local)) return "Пароль не должен содержать e-mail";
  if (/^(.)\1+$/.test(password) || /^(12345678|password|qwerty12|11111111)/i.test(password)) return "Слишком простой пароль";
  return null;
}
