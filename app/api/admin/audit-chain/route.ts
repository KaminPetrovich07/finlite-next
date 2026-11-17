import { NextResponse } from "next/server";
import { logActivity, requireAdmin, route } from "@/lib/auth/server";
import { verifyActivityChain } from "@/lib/monitor/audit";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/admin/audit-chain — проверить цепочку хэшей журнала действий (только администратор). */
export const GET = route(async () => {
  await requireAdmin();
  const report = await verifyActivityChain();
  await logActivity("audit_verify", null, { checked: report.checked, breaks: report.breaks.length, head: report.head?.slice(0, 16) ?? null });
  return NextResponse.json(report);
});
