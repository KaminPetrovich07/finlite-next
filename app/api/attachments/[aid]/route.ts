import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { PeriodLockedError, recordEntryEvent } from "@/lib/ledger/guard";
import { isLocked, isoDay } from "@/lib/ledger/history";
import { disposition } from "@/lib/attachments";

export const runtime = "nodejs";

/** GET /api/attachments/:aid[?download=1] — сам файл; смотреть может любой, кто видит компанию */
export const GET = route(async (req: NextRequest, { params }: { params: Promise<{ aid: string }> }) => {
  const { aid } = await params;
  const a = await prisma.attachment.findUnique({ where: { id: aid } });
  if (!a) throw new HttpError(404, "Файл не найден");
  await requireCompany(a.companyId, "view");
  return new NextResponse(Buffer.from(a.data), {
    headers: {
      "Content-Type": a.mime,
      "Content-Length": String(a.size),
      "Content-Disposition": disposition(a.name, !req.nextUrl.searchParams.get("download")),
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
});

/** DELETE /api/attachments/:aid — нельзя у проводок закрытого периода */
export const DELETE = route(async (_req: NextRequest, { params }: { params: Promise<{ aid: string }> }) => {
  const { aid } = await params;
  const a = await prisma.attachment.findUnique({ where: { id: aid }, select: { id: true, companyId: true, entryId: true, name: true } });
  if (!a) throw new HttpError(404, "Файл не найден");
  await requireCompany(a.companyId, "edit");
  if (a.entryId) {
    const [e, c] = await Promise.all([
      prisma.journalEntry.findUnique({ where: { id: a.entryId }, select: { date: true, source: true } }),
      prisma.company.findUnique({ where: { id: a.companyId }, select: { lockedThrough: true } }),
    ]);
    if (e && isLocked(e.date, c?.lockedThrough)) throw new PeriodLockedError(isoDay(c!.lockedThrough!), isoDay(e.date));
    await recordEntryEvent(prisma, { companyId: a.companyId, entryId: a.entryId, action: "detach", source: e?.source ?? null, entryDate: e?.date ?? null, note: `Удалён документ «${a.name}»` });
  }
  await prisma.attachment.delete({ where: { id: aid } });
  await logActivity("attachment_delete", a.companyId, { entryId: a.entryId });
  return NextResponse.json({ ok: true });
});
