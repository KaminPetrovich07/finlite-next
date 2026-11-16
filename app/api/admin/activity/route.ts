import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { ACTION_GROUPS, activityCsv, type ActivityRow } from "@/lib/monitor/actions";

export const runtime = "nodejs";

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Q = z.object({
  user: z.string().max(200).optional(), action: z.string().max(60).optional(), group: z.string().max(80).optional(),
  companyId: z.string().max(60).optional(), from: z.string().regex(ISO).optional(), to: z.string().regex(ISO).optional(),
  before: z.string().max(40).optional(), format: z.enum(["json", "csv"]).optional(),
});

/**
 * GET /api/admin/activity?user=&action=&group=&companyId=&from=&to=&before=&format=csv
 * Журнал действий пользователей (только администратор). JSON — по 100 записей
 * с курсором `before` (id последней строки); CSV — до 50 000 записей по фильтру.
 * Выгрузка журнала сама записывается в журнал.
 */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const p = Q.safeParse(Object.fromEntries(req.nextUrl.searchParams));
  if (!p.success) throw new HttpError(400, "Неверный фильтр");
  const q = p.data;
  const where: Prisma.ActivityLogWhereInput = {};
  // по умолчанию без «был на сайте» — это шум для проверки
  if (q.action) where.action = q.action;
  else if (q.group && ACTION_GROUPS[q.group]) where.action = { in: ACTION_GROUPS[q.group] };
  else where.action = { not: "active_day" };
  if (q.companyId) where.companyId = q.companyId;
  if (q.user) where.user = { email: { contains: q.user.trim().toLowerCase() } };
  // даты — по времени Бишкека (UTC+6)
  const day = (d: string, end = false) => new Date(Date.parse(`${d}T00:00:00Z`) - 6 * 3600e3 + (end ? 24 * 3600e3 : 0));
  if (q.from || q.to) where.createdAt = { ...(q.from ? { gte: day(q.from) } : {}), ...(q.to ? { lt: day(q.to, true) } : {}) };
  const csv = q.format === "csv";
  const take = csv ? 50_000 : 101;
  const rows = await prisma.activityLog.findMany({
    where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], take,
    ...(q.before && !csv ? { cursor: { id: q.before }, skip: 1 } : {}),
    select: { id: true, createdAt: true, action: true, companyId: true, details: true, user: { select: { email: true } } },
  });
  const ids = [...new Set(rows.map((r) => r.companyId).filter((x): x is string => !!x))];
  const names = new Map((await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true } })).map((c) => [c.id, c.name]));
  const out: ActivityRow[] = rows.slice(0, csv ? take : 100).map((r) => ({
    id: r.id, createdAt: r.createdAt.toISOString(), action: r.action, userEmail: r.user?.email ?? null,
    companyId: r.companyId, companyName: r.companyId ? names.get(r.companyId) ?? "(удалена)" : null, details: r.details,
  }));
  if (csv) {
    await logActivity("audit_export", null, { rows: out.length, filter: { ...q, format: undefined } });
    return new NextResponse(activityCsv(out), { headers: { "Content-Type": "text/csv; charset=utf-8", "Content-Disposition": `attachment; filename="activity-${new Date().toISOString().slice(0, 10)}.csv"` } });
  }
  return NextResponse.json({ rows: out, more: rows.length > 100 ? out[out.length - 1].id : null, groups: Object.keys(ACTION_GROUPS) });
});
