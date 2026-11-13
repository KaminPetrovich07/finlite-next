import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** GET /api/health — для внешнего мониторинга доступности (UptimeRobot и т. п.): сайт и база живы. */
export async function GET() {
  const t = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, db: "ok", ms: Date.now() - t }, { headers: { "Cache-Control": "no-store" } });
  } catch {
    return NextResponse.json({ ok: false, db: "down", ms: Date.now() - t }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
}
