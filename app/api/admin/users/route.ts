import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";

/** GET /api/admin/users — every user with their companies */
export const GET = route(async () => {
  await requireAdmin();
  const users = await prisma.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, email: true, name: true, role: true, blocked: true, createdAt: true, lastLoginAt: true,
      ownedCompanies: { select: { id: true, name: true } },
      access: { select: { level: true, company: { select: { id: true, name: true } } } },
      _count: { select: { feedback: true, activities: true } },
    },
  });
  return NextResponse.json(users);
});
