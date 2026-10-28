// Session token: a signed JWT in an HttpOnly cookie. Only `jose` here, so the
// same code runs in proxy.ts (request gate) and in route handlers.
import { jwtVerify, SignJWT } from "jose";

export const SESSION_COOKIE = "fl_session";
export const SESSION_DAYS = 30;

export type Role = "admin" | "full" | "limited";
export const ROLE_LABEL: Record<Role, string> = {
  admin: "Администратор",
  full: "Полный доступ",
  limited: "Ограниченный доступ",
};
export const isRole = (v: unknown): v is Role => v === "admin" || v === "full" || v === "limited";

/**
 * Sign-in is optional: without AUTH_ENABLED=1 the app is open to everyone,
 * as before (one shared workspace, no users). Turning it on later needs
 * AUTH_SECRET and ADMIN_EMAIL as well.
 */
export function authEnabled(): boolean {
  return /^(1|true|yes|on)$/i.test(process.env.AUTH_ENABLED ?? "");
}

/** Throws a clear message when sign-in is on but AUTH_SECRET is missing. */
export function assertAuthConfigured(): void {
  secret();
}

function secret(): Uint8Array {
  const s = process.env.AUTH_SECRET;
  if (s && s.length >= 32) return new TextEncoder().encode(s);
  if (process.env.NODE_ENV === "production" && !process.env.FL_TEST_PG_URL) {
    throw new Error("AUTH_SECRET не задан: добавьте переменную окружения длиной не меньше 32 символов");
  }
  return new TextEncoder().encode("finlite-dev-secret-not-for-production-use-0001");
}

export async function signSession(userId: string): Promise<string> {
  return new SignJWT({})
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setIssuedAt()
    .setExpirationTime(`${SESSION_DAYS}d`)
    .sign(secret());
}

/** Returns the user id, or null for a missing / forged / expired token. */
export async function verifySession(token: string | undefined | null): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret(), { algorithms: ["HS256"] });
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production" && !process.env.FL_TEST_PG_URL,
  path: "/",
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
