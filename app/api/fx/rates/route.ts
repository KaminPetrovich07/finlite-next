import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireAdmin, requireUser, route } from "@/lib/auth/server";
import { bishkekToday, ensureFresh, fetchNbkr, loadRates, saveRate } from "@/lib/fx/store";
import { AUTH_ON } from "@/lib/auth/mode";
import { rateOn } from "@/lib/fx/fx";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/fx/rates?date=…&code=… — the rate in force on the date (for the entry form)
 * GET /api/fx/rates — latest rate of every currency + the last 90 days of history
 */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const date = sp.get("date"), code = sp.get("code");
  if (date && code) {
    if (!ISO.test(date) || !/^[A-Z]{3}$/.test(code)) throw new HttpError(400, "Неверные параметры");
    const r = rateOn(await loadRates(date, [code]), code, date);
    return NextResponse.json({ rate: r });
  }
  await ensureFresh();
  const today = bishkekToday();
  const ahead = new Date(Date.now() + (6 + 24 * 7) * 3600 * 1000).toISOString().slice(0, 10);
  const all = await loadRates(ahead);
  const since = new Date(Date.now() - 90 * 864e5).toISOString().slice(0, 10);
  // курс, действующий сегодня, и уже опубликованный курс на следующие дни (НБКР объявляет его накануне)
  const latest = new Map<string, { date: string; code: string; rate: number }>();
  const next = new Map<string, { date: string; code: string; rate: number }>();
  for (const r of all) (r.date <= today ? latest : next).set(r.code, r);
  const byCode = (m: typeof latest) => [...m.values()].sort((a, b) => a.code.localeCompare(b.code));
  return NextResponse.json({ today, latest: byCode(latest), next: byCode(next), history: all.filter((r) => r.date >= since && r.date <= today) });
});

const Body = z.union([
  z.object({ action: z.literal("nbkr") }),
  z.object({ action: z.literal("manual"), date: z.string().regex(ISO), code: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive() }),
]);

/** POST /api/fx/rates { action: "nbkr" } — load today's official rates; { action: "manual", … } — administrator only */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  if (p.data.action === "nbkr") {
    if (AUTH_ON) await requireUser();
    const r = await fetchNbkr();
    await logActivity("fx_nbkr", null, { feeds: r });
    return NextResponse.json({ ok: true, loaded: r });
  }
  if (AUTH_ON) await requireAdmin();
  await saveRate(p.data.date, p.data.code, p.data.rate);
  return NextResponse.json({ ok: true });
});
