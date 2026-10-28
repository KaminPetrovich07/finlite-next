import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/activity?userId=…&limit=… — recent actions with user and company names */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const userId = req.nextUrl.searchParams.get("userId");
  const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 100) || 100, 500);
  const rows = await prisma.activityLog.findMany({
    where: userId ? { userId } : undefined,
    orderBy: { createdAt: "desc" }, take: limit,
    include: { user: { select: { name: true, email: true } } },
  });
  const ids = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const companies = ids.length ? await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } }) : [];
  const names = new Map(companies.map((c) => [c.id, c.name]));
  return NextResponse.json(rows.map((r) => ({ ...r, companyName: r.companyId ? names.get(r.companyId) ?? "удалена" : null })));
});
