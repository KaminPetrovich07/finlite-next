import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireUser, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertUserFeature } from "@/lib/server/plan-guard";
import { runGroup } from "@/lib/consolidation/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/consolidation?parentId=…&from=…&to=… — сводная отчётность группы */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parentId = sp.get("parentId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!parentId) throw new HttpError(400, "Выберите материнскую компанию");
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  if (AUTH_ON) assertUserFeature(await requireUser(), "consolidation");
  const { settings, tables } = await runGroup(parentId, { from, to });
  return NextResponse.json({ name: settings.name, ...tables });
});
