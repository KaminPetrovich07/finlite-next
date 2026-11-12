import { createHash, randomBytes } from "node:crypto";

/** 256-bit random token, URL-safe. Given to the browser; only its hash is stored. */
export function newToken(): string {
  return randomBytes(32).toString("base64url");
}

export function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}
