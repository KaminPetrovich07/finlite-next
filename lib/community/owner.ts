// Who may change a post, comment, profile or review: whoever holds the key
// given when it was created (only its SHA-256 is stored), or the administrator.
import { timingSafeEqual } from "node:crypto";
import { newToken, sha256 } from "@/lib/auth/tokens";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { clientIp } from "@/lib/auth/session";
import { tooMany } from "@/lib/auth/limits";
import { HttpError } from "@/lib/auth/server";

export function issueKey(): { key: string; hash: string } {
  const key = newToken();
  return { key, hash: sha256(key) };
}

export function keyMatches(hash: string | null | undefined, key: string | null | undefined): boolean {
  if (!hash || !key) return false;
  const a = Buffer.from(hash), b = Buffer.from(sha256(key));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function viewerIsAdmin(): Promise<boolean> {
  const u = await getCurrentUser();
  return !!u && isAdmin(u);
}

/** Throws 403 unless the key fits or the visitor is the administrator. */
export async function assertOwner(hash: string | null | undefined, key: string | null | undefined): Promise<void> {
  if (keyMatches(hash, key)) return;
  if (await viewerIsAdmin()) return;
  throw new HttpError(403, "Изменить может только автор (ключ из этого браузера) или администратор");
}

export async function limit(kind: string, max: number, windowMin: number): Promise<void> {
  if (tooMany(`${kind}:${await clientIp()}`, max, windowMin * 60 * 1000)) throw new HttpError(429, "Слишком много запросов подряд — попробуйте позже");
}

export const clean = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\u0000/g, "").trim().slice(0, max) : "");
export const cleanList = (v: unknown, maxItems: number, maxLen: number) =>
  Array.isArray(v) ? [...new Set(v.map((x) => clean(x, maxLen)).filter(Boolean))].slice(0, maxItems) : [];
export const safeUrl = (v: unknown) => {
  const s = clean(v, 500);
  try { const u = new URL(s); return u.protocol === "https:" || u.protocol === "http:" ? u.toString() : null; } catch { return null; }
};
