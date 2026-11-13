import { NextResponse } from "next/server";
import { logActivity, requireAdmin, route } from "@/lib/auth/server";
import { refreshSnapshot } from "@/lib/science/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/** POST /api/science/refresh — обновить сводку сейчас (администратор) */
export const POST = route(async () => {
  await requireAdmin();
  const s = await refreshSnapshot();
  await logActivity("science_refresh", null, { scopes: s.scopes.length, errors: s.errors.length });
  return NextResponse.json({ ok: true, updatedAt: s.updatedAt, errors: s.errors });
});
