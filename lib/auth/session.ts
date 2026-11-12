// Server-side sessions: an httpOnly cookie holds a random token; the database
// keeps only its SHA-256. Sessions slide: each visit after an hour updates
// lastSeenAt, and a session with less than half its life left is extended.
import { cookies, headers } from "next/headers";
import { prisma } from "@/lib/db";
import { newToken, sha256 } from "@/lib/auth/tokens";

export const SESSION_COOKIE = "fl_session";
export const DEMO_COOKIE = "fl_demo";
const TTL_DAYS = 30;
const DAY = 24 * 3600 * 1000;

export interface CurrentUser {
  id: string;
  email: string;
  name: string | null;
  organization: string | null;
  role: string;
  plan: string;
  paidUntil: Date | null;
  sessionId: string;
}

const secure = () => process.env.NODE_ENV === "production";

async function requestMeta() {
  try {
    const h = await headers();
    const ip = (h.get("x-forwarded-for") ?? "").split(",")[0].trim() || h.get("x-real-ip") || null;
    return { ip, userAgent: h.get("user-agent")?.slice(0, 300) ?? null };
  } catch {
    return { ip: null, userAgent: null };
  }
}

export async function clientIp(): Promise<string> {
  return (await requestMeta()).ip ?? "unknown";
}

/** Creates a session and sets the cookie. */
export async function startSession(userId: string): Promise<void> {
  const token = newToken();
  const meta = await requestMeta();
  await prisma.session.create({
    data: { id: sha256(token), userId, expiresAt: new Date(Date.now() + TTL_DAYS * DAY), ip: meta.ip, userAgent: meta.userAgent },
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, { httpOnly: true, secure: secure(), sameSite: "lax", path: "/", maxAge: TTL_DAYS * 24 * 3600 });
  jar.delete(DEMO_COOKIE);
}

export async function endSession(): Promise<void> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await prisma.session.deleteMany({ where: { id: sha256(token) } }).catch(() => undefined);
  jar.delete(SESSION_COOKIE);
}

// One lookup per request even when several helpers ask for the user.
const cache = new WeakMap<object, Promise<CurrentUser | null>>();

/** The signed-in user, or null. Never throws (no database → null). */
export async function getCurrentUser(): Promise<CurrentUser | null> {
  let jar: Awaited<ReturnType<typeof cookies>>;
  try { jar = await cookies(); } catch { return null; }
  const hit = cache.get(jar);
  if (hit) return hit;
  const p = lookup(jar.get(SESSION_COOKIE)?.value);
  cache.set(jar, p);
  return p;
}

async function lookup(token: string | undefined): Promise<CurrentUser | null> {
  if (!token || token.length < 20) return null;
  try {
    const id = sha256(token);
    const s = await prisma.session.findUnique({
      where: { id },
      include: { user: { select: { id: true, email: true, name: true, organization: true, role: true, blocked: true, plan: true, paidUntil: true } } },
    });
    if (!s || s.expiresAt.getTime() < Date.now() || s.user.blocked) return null;
    const now = Date.now();
    if (now - s.lastSeenAt.getTime() > 3600 * 1000) {
      const extend = s.expiresAt.getTime() - now < (TTL_DAYS / 2) * DAY;
      const newDay = dayKey(s.lastSeenAt) !== dayKey(new Date(now));
      await prisma.session.update({
        where: { id },
        data: { lastSeenAt: new Date(now), ...(extend ? { expiresAt: new Date(now + TTL_DAYS * DAY) } : {}) },
      }).catch(() => undefined);
      // one "active day" mark per user per day — the basis of DAU/WAU and retention
      if (newDay) await prisma.activityLog.create({ data: { userId: s.user.id, action: "active_day" } }).catch(() => undefined);
    }
    const { blocked: _b, ...u } = s.user;
    return { ...u, sessionId: id };
  } catch {
    return null;
  }
}

/** Calendar day in Bishkek time (UTC+6), e.g. "2026-11-11". */
export function dayKey(d: Date): string {
  return new Date(d.getTime() + 6 * 3600 * 1000).toISOString().slice(0, 10);
}
