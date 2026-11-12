import { NextResponse } from "next/server";
import { route } from "@/lib/auth/server";
import { endSession } from "@/lib/auth/session";

/** POST /api/auth/logout */
export const POST = route(async () => {
  await endSession();
  return NextResponse.json({ ok: true });
});
