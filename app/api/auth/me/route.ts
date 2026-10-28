import { NextResponse } from "next/server";
import { HttpError, route, currentUser } from "@/lib/auth/server";

/** GET /api/auth/me — the signed-in user or 401 */
export const GET = route(async () => {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Войдите в систему");
  return NextResponse.json(u);
});
