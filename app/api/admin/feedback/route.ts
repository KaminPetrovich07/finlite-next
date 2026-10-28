import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/feedback?status=new|in_progress|done */
export const GET = route(async (req: NextRequest) => {
  await requireAdmin();
  const status = req.nextUrl.searchParams.get("status");
  const rows = await prisma.feedback.findMany({
    where: status ? { status } : undefined,
    orderBy: { createdAt: "desc" }, take: 300,
    include: { user: { select: { name: true, email: true, role: true } } },
  });
  return NextResponse.json(rows);
});
