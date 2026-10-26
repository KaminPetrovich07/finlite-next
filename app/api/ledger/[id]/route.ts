import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

/** DELETE /api/ledger/:id — bank-generated entries are changed via the statement category, not deleted */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const entry = await prisma.journalEntry.findUnique({ where: { id }, select: { source: true } });
  if (!entry) return NextResponse.json({ error: "Проводка не найдена" }, { status: 404 });
  if (entry.source === "bank") {
    return NextResponse.json(
      { error: "Эта проводка создана из банковской выписки — измените категорию операции на странице «Выписки»" },
      { status: 409 }
    );
  }
  await prisma.journalEntry.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
