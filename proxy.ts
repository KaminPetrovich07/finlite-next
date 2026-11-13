import { NextResponse, type NextRequest } from "next/server";
import { overLimit, PROBE } from "@/lib/security/guard";

// Runs before every page and API request.
// 1) API: state-changing requests from another site are rejected (CSRF).
// 2) Pages: without a session (or the "demo" choice made on the login page)
//    the visitor is sent to /login. Whether the session is valid and what it
//    may access is decided by the API on every request — this is only routing.

const PUBLIC = ["/login", "/register", "/reset", "/privacy", "/terms", "/pricing", "/tax-rules", "/manifest.webmanifest"];
const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

const ipOf = (req: NextRequest) => req.headers.get("x-real-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "?";

export function proxy(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (PROBE.test(pathname)) return new NextResponse("Not found", { status: 404 });

  if (pathname.startsWith("/api/")) {
    // крон и вебхук Telegram защищены секретом и не должны упираться в общий лимит
    if (!pathname.startsWith("/api/cron/") && !pathname.startsWith("/api/telegram") && overLimit(ipOf(req), UNSAFE.has(req.method))) {
      return NextResponse.json({ error: "Слишком много запросов — подождите минуту" }, { status: 429, headers: { "Retry-After": "60" } });
    }
    if (UNSAFE.has(req.method)) {
      const origin = req.headers.get("origin");
      const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
      let originHost = "";
      try { originHost = origin ? new URL(origin).host : ""; } catch { /* malformed */ }
      if (req.headers.get("sec-fetch-site") === "cross-site" || (origin && originHost !== host)) {
        return NextResponse.json({ error: "Запрос с другого сайта отклонён" }, { status: 403 });
      }
    }
    return NextResponse.next();
  }

  // открытый режим (NEXT_PUBLIC_FL_AUTH не "on"): страницы доступны без входа
  if (process.env.NEXT_PUBLIC_FL_AUTH !== "on") return NextResponse.next();
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(p + "/"))) return NextResponse.next();
  if (req.cookies.has("fl_session") || req.cookies.has("fl_demo")) return NextResponse.next();

  const url = req.nextUrl.clone();
  url.pathname = "/login";
  url.search = pathname === "/" ? "" : `?next=${encodeURIComponent(pathname + search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon|icon|apple-icon|robots.txt|sitemap.xml|.*\\.(?:png|jpg|jpeg|svg|ico|webp|woff2?|css|js|map|txt|pdf|mjs)$).*)"],
};
