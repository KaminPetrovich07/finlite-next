import { NextResponse } from "next/server";
import { cookieOptions, SESSION_COOKIE } from "@/lib/auth/session";

/** POST /api/auth/logout */
export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, "", { ...cookieOptions, maxAge: 0 });
  return res;
}
