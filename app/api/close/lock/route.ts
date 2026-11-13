import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { canManage } from "@/lib/auth/access";
import { getCurrentUser } from "@/lib/auth/session";
import { recordEntryEvent } from "@/lib/ledger/guard";
import { dmy, isoDay } from "@/lib/ledger/history";

export const runtime = "nodejs";

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек

const Schema = z.object({
  companyId: z.string().min(1),
  /** YYYY-MM-DD — запретить изменения по этот день включительно; null — снять запрет */
  through: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable(),
  reason: z.string().trim().max(500).optional(),
});

/**
 * POST /api/close/lock — запрет изменений журнала по дату включительно.
 * Сдвинуть запрет вперёд может любой, кто вправе менять компанию. Снять запрет или сдвинуть его
 * назад — только владелец или администратор, с указанием причины: это открывает уже сданную отчётность.
 */
export const POST = route(async (req: NextRequest) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Укажите компанию и дату");
  const { companyId, through, reason } = parsed.data;
  const level = await requireCompany(companyId, "edit");
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } });
  if (!c) throw new HttpError(404, "Компания не найдена");
  const cur = c.lockedThrough ? isoDay(c.lockedThrough) : null;
  if (through && through > today()) throw new HttpError(400, "Нельзя запретить изменения на будущую дату — только по сегодняшний день включительно");
  const opening = !through || (cur !== null && through < cur);
  if (opening) {
    if (!canManage(level)) throw new HttpError(403, "Снять запрет или перенести его на более раннюю дату может только владелец компании");
    if (!reason || reason.length < 5) throw new HttpError(400, "Укажите причину — она сохранится в истории журнала");
  }
  if (through === cur) return NextResponse.json({ ok: true, lockedThrough: cur });
  const me = await getCurrentUser();
  const name = me ? me.name?.trim() || me.email : null;
  await prisma.$transaction(async (tx) => {
    await tx.company.update({
      where: { id: companyId },
      data: through
        ? { lockedThrough: new Date(`${through}T00:00:00.000Z`), lockedAt: new Date(), lockedByName: name }
        : { lockedThrough: null, lockedAt: new Date(), lockedByName: name },
    });
    await recordEntryEvent(tx, {
      companyId, action: through ? "lock" : "unlock", entryDate: through ?? cur,
      note: through
        ? `Запрет изменений по ${dmy(through)}${cur ? ` (был по ${dmy(cur)})` : ""}${reason ? `. Причина: ${reason}` : ""}`
        : `Запрет изменений снят (был по ${dmy(cur!)}). Причина: ${reason}`,
    });
  });
  await logActivity(through ? "period_lock" : "period_unlock", companyId, { through, previous: cur, reason: reason ?? null });
  return NextResponse.json({ ok: true, lockedThrough: through });
});
