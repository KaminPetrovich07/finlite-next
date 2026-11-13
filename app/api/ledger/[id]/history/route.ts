import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireCompany, route } from "@/lib/auth/server";

/** GET /api/ledger/:id/history — кто и когда вводил, менял и удалял эту проводку */
export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  const events = await prisma.entryEvent.findMany({ where: { companyId: companyId!, entryId: id }, orderBy: { createdAt: "asc" }, take: 200 });
  if (!events.length) {
    const e = await prisma.journalEntry.findFirst({ where: { id, companyId: companyId! }, select: { id: true } });
    if (!e) throw new HttpError(404, "Проводка не найдена");
  }
  return NextResponse.json(events);
});
