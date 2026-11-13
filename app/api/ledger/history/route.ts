import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireCompany, route } from "@/lib/auth/server";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const ACTIONS = new Set(["create", "update", "delete", "import", "lock", "unlock", "attach", "detach"]);

/**
 * GET /api/ledger/history?companyId=…&from=…&to=…[&action=…][&before=<id>]
 * Журнал изменений компании: когда сделано изменение (не дата проводки), новые сверху, по 200.
 */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  await requireCompany(companyId, "view");
  const from = sp.get("from"), to = sp.get("to"), action = sp.get("action"), before = sp.get("before");
  if ((from && !ISO.test(from)) || (to && !ISO.test(to))) throw new HttpError(400, "Неверный период");
  const cursor = before ? await prisma.entryEvent.findUnique({ where: { id: before }, select: { createdAt: true } }) : null;
  const rows = await prisma.entryEvent.findMany({
    where: {
      companyId: companyId!,
      ...(action && ACTIONS.has(action) ? { action } : {}),
      createdAt: {
        ...(from ? { gte: new Date(`${from}T00:00:00+06:00`) } : {}),
        ...(to ? { lte: new Date(`${to}T23:59:59.999+06:00`) } : {}),
        ...(cursor ? { lt: cursor.createdAt } : {}),
      },
    },
    orderBy: { createdAt: "desc" },
    take: 201,
  });
  return NextResponse.json({ events: rows.slice(0, 200), more: rows.length > 200 });
});
