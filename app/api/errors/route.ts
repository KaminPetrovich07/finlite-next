import { NextRequest, NextResponse } from "next/server";
import { getCurrentUser } from "@/lib/auth/session";
import { limit, clean } from "@/lib/community/owner";
import { route } from "@/lib/auth/server";
import { recordError } from "@/lib/monitor/errors";

export const runtime = "nodejs";

/** POST /api/errors — браузер сообщает о сбое на странице. Без входа, но не чаще 20 раз за 10 минут с адреса. */
export const POST = route(async (req: NextRequest) => {
  await limit("errors", 20, 10);
  const len = Number(req.headers.get("content-length") ?? 0);
  if (len > 20_000) return NextResponse.json({ ok: false }, { status: 413 });
  const b = await req.json().catch(() => null);
  if (!b || typeof b.message !== "string") return NextResponse.json({ ok: false }, { status: 400 });
  const user = await getCurrentUser().catch(() => null);
  await recordError({
    source: "client", message: clean(b.message, 2000), stack: clean(b.stack, 8000) || null, url: clean(b.url, 500) || null,
    digest: clean(b.digest, 100) || null, userAgent: clean(req.headers.get("user-agent"), 300) || null, userId: user?.id ?? null,
  });
  return NextResponse.json({ ok: true });
});
