// Request gate: pages need a valid session cookie, otherwise → /login.
// API routes answer 401 JSON. Real permission checks (role, company access,
// blocked users) happen in the route handlers via lib/auth/server.ts.
import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, verifySession } from "@/lib/auth/session";

const PUBLIC_PAGES = ["/login", "/register"];
const PUBLIC_API = ["/api/auth/login", "/api/auth/register", "/api/auth/logout"];

export async function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  const isApi = pathname.startsWith("/api/");
  if (PUBLIC_API.includes(pathname)) return NextResponse.next();
  const uid = await verifySession(req.cookies.get(SESSION_COOKIE)?.value);

  if (PUBLIC_PAGES.includes(pathname)) {
    // already signed in → straight to the app
    return uid ? NextResponse.redirect(new URL("/reports", req.url)) : NextResponse.next();
  }
  if (uid) return NextResponse.next();
  if (isApi) return NextResponse.json({ error: "Войдите в систему" }, { status: 401 });
  const url = new URL("/login", req.url);
  if (pathname !== "/") url.searchParams.set("next", pathname + search);
  return NextResponse.redirect(url);
}

export const config = {
  // everything except Next internals and static files
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|.*\\.(?:png|jpg|jpeg|svg|webp|ico|woff2?|css|js|map)$).*)"],
};
