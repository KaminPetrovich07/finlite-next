import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { validateEntry } from "@/lib/ledger/engine";
import { fromIsoDate, toLedgerEntry } from "@/lib/ledger/repo";
import { isoDay, PeriodLockedError, quietly, recordEntryEvent } from "@/lib/ledger/guard";
import { deleteEntries, SOURCE_NOTE } from "@/lib/ledger/remove";
import { snapshotOf } from "@/lib/ledger/history";
import { round2 } from "@/lib/ledger/types";
import { normalizeUnit } from "@/lib/okei";
import { autoCogsFor } from "@/lib/stock/auto";

/** DELETE /api/ledger/:id — любая проводка; из выписки — вместе со строкой выписки, продажа — с её себестоимостью */
export const DELETE = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const entry = await prisma.journalEntry.findUnique({ where: { id }, select: { source: true, companyId: true, description: true, date: true } });
  if (!entry) throw new HttpError(404, "Проводка не найдена");
  await requireCompany(entry.companyId, "edit");
  const r = await deleteEntries(entry.companyId, [id]);
  if (r.locked) throw new PeriodLockedError(isoDay((await prisma.company.findUniqueOrThrow({ where: { id: entry.companyId }, select: { lockedThrough: true } })).lockedThrough!), isoDay(entry.date));
  await logActivity("entry_delete", entry.companyId, { description: entry.description, source: entry.source });
  return NextResponse.json({ ok: true, ...r });
});

const LineSchema = z.object({
  account: z.string().min(4).max(8),
  debit: z.number().min(0),
  credit: z.number().min(0),
  memo: z.string().max(200).optional().nullable(),
  party: z.string().trim().max(200).optional().nullable(),
  partyInn: z.string().trim().regex(/^\d{0,14}$/, "ИНН — до 14 цифр").optional().nullable(),
  item: z.string().trim().max(200).optional().nullable(),
  qty: z.number().min(0).max(1e12).optional().nullable(),
  unit: z.string().trim().max(20).optional().nullable(),
  currency: z.string().trim().regex(/^[A-Z]{3}$/, "Код валюты — три латинские буквы").optional().nullable(),
  amountCur: z.number().min(0).max(1e13).optional().nullable(),
});
const EditSchema = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД"),
  description: z.string().trim().min(1, "Укажите содержание операции").max(500),
  lines: z.array(LineSchema).min(2),
});

/**
 * PUT /api/ledger/:id — изменить любую проводку (у сформированных разделами программы остаётся их источник,
 * повторный расчёт в разделе может заменить ручные правки — об этом говорит поле note). Запрет периода проверяется
 * и для старой, и для новой даты; в историю пишется одна запись «изменено» со снимком до и после.
 */
export const PUT = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const parsed = EditSchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues.map((i) => i.message).join("; "));
  const entry = await prisma.journalEntry.findUnique({ where: { id }, include: { lines: true } });
  if (!entry) throw new HttpError(404, "Проводка не найдена");
  await requireCompany(entry.companyId, "edit");

  const input = parsed.data;
  const lines = input.lines.map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) })).filter((l) => l.debit > 0 || l.credit > 0);
  const errors = validateEntry({ date: input.date, lines });
  if (errors.length) throw new HttpError(400, errors.join("; "));

  const me = await getCurrentUser();
  const before = snapshotOf(entry);
  const row = await quietly(() => prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { entryId: id } });
    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        entryId: id, accountCode: l.account, debit: l.debit, credit: l.credit, memo: l.memo ?? null,
        party: l.party?.trim() || null, partyInn: l.partyInn?.replace(/\D/g, "") || null,
        item: l.item?.trim() || null,
        qty: typeof l.qty === "number" && l.qty > 0 ? Math.round(l.qty * 1000) / 1000 : null,
        unit: normalizeUnit(l.unit ?? undefined) || null,
        currency: l.currency && l.currency !== "KGS" ? l.currency : null,
        amountCur: l.currency && typeof l.amountCur === "number" ? Math.round(l.amountCur * 100) / 100 : null,
      })),
    });
    const updated = await tx.journalEntry.update({
      where: { id },
      data: { date: fromIsoDate(input.date), description: input.description, updatedAt: new Date(), updatedByName: me ? me.name?.trim() || me.email : null },
      include: { lines: true },
    });
    // автоматическое списание себестоимости по старой версии продажи больше не верно
    await tx.journalEntry.deleteMany({ where: { companyId: entry.companyId, source: "cogs", sourceRef: { startsWith: `${id}:` } } });
    await recordEntryEvent(tx, { companyId: entry.companyId, entryId: id, action: "update", source: entry.source, entryDate: input.date, before, after: snapshotOf(updated) });
    return updated;
  }));
  const cogs = entry.source !== "cogs" ? await autoCogsFor(entry.companyId, id, input.date) : 0;
  await logActivity("entry_update", entry.companyId, { description: input.description, source: entry.source });
  return NextResponse.json({ ...toLedgerEntry(row), cogsPosted: cogs, note: SOURCE_NOTE[entry.source] ?? null });
});
