import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";

/** DELETE /api/ledger/:id — bank-generated entries are changed via the statement category, not deleted */
export const DELETE = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const entry = await prisma.journalEntry.findUnique({ where: { id }, select: { source: true, companyId: true, description: true } });
  if (!entry) throw new HttpError(404, "Проводка не найдена");
  await requireCompany(entry.companyId, "edit");
  if (entry.source === "bank") {
    throw new HttpError(409, "Эта проводка создана из банковской выписки — измените категорию операции на странице «Выписки»");
  }
  await prisma.journalEntry.delete({ where: { id } });
  await logActivity("entry_delete", entry.companyId, { description: entry.description });
  return NextResponse.json({ ok: true });
});
