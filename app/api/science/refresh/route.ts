import { NextResponse } from "next/server";
import { logActivity, requireAdmin, route } from "@/lib/auth/server";
import { openAlexFetch, refreshSnapshot } from "@/lib/science/server";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * POST /api/science/refresh[?scope=accounting|finance] — обновить сводку сейчас (администратор).
 * Страница обновляет области по одной, чтобы каждая уложилась в лимит времени Vercel.
 */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const scope = new URL(req.url).searchParams.get("scope") || undefined;
  const s = await refreshSnapshot(openAlexFetch, { scope, budgetMs: 45_000 });
  await logActivity("science_refresh", null, { scope: scope ?? "all", scopes: s.scopes.length, errors: s.errors.length });
  return NextResponse.json({ ok: true, updatedAt: s.updatedAt, errors: s.errors });
});
