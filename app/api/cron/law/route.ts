import { NextRequest, NextResponse } from "next/server";
import { checkAll } from "@/lib/law/store";

export const runtime = "nodejs";
export const maxDuration = 60;

/**
 * GET /api/cron/law — run by Vercel Cron once a day (vercel.json): every act
 * of the legal library that has a source link is downloaded again; a new
 * edition is stored, the old one goes to the history, and «Новости и наука»
 * gets a note about which articles changed.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Нет доступа" }, { status: 401 });
  }
  try {
    const results = await checkAll();
    return NextResponse.json({ ok: true, checked: results.length, changed: results.filter((r) => r.status === "changed").length, results });
  } catch (e) {
    return NextResponse.json({ ok: false, error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
