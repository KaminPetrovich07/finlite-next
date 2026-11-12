import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { logActivity, requireUser, route } from "@/lib/auth/server";

/** GET /api/account/export — everything stored about the user and their companies, as one JSON file */
export const GET = route(async () => {
  const me = await requireUser();
  const [user, companies, feedback, activity] = await Promise.all([
    prisma.user.findUniqueOrThrow({
      where: { id: me.id },
      select: { email: true, name: true, organization: true, phone: true, role: true, plan: true, paidUntil: true, consentAt: true, consentVersion: true, createdAt: true, lastLoginAt: true },
    }),
    prisma.company.findMany({
      where: { ownerId: me.id },
      include: {
        journalEntries: { include: { lines: true }, orderBy: { date: "asc" } },
        bankTransactions: true, records: true, esgReports: true, reports: true,
        access: { select: { level: true, user: { select: { email: true } } } },
      },
    }),
    prisma.feedback.findMany({ where: { userId: me.id } }),
    prisma.activityLog.findMany({ where: { userId: me.id }, orderBy: { createdAt: "desc" }, take: 2000 }),
  ]);
  await logActivity("account_export");
  const body = JSON.stringify({ exportedAt: new Date().toISOString(), service: "FinLite KG", user, companies, feedback, activity }, null, 2);
  return new NextResponse(body, {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="finlite-data-${new Date().toISOString().slice(0, 10)}.json"`,
    },
  });
});
