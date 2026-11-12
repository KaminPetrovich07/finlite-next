import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/feedback — messages from users, new first */
export const GET = route(async () => {
  await requireAdmin();
  const rows = await prisma.feedback.findMany({
    orderBy: [{ status: "asc" }, { createdAt: "desc" }], take: 500,
    include: { user: { select: { email: true, name: true, organization: true } } },
  });
  return NextResponse.json(rows);
});
