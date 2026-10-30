import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";

const Body = z.object({
  companyId: z.string().min(1),
  entryIds: z.array(z.string().min(1).max(60)).min(1).max(500),
  party: z.string().trim().max(200),
  partyInn: z.string().trim().regex(/^\d{0,14}$/).optional(),
});

/**
 * PATCH /api/ledger/party — проставляет контрагента в строках проводок
 * (кроме кассы, банка и расчётов с бюджетом). Пустое имя — снимает.
 */
export const PATCH = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, entryIds, party, partyInn } = parsed.data;
  await requireCompany(companyId, "edit");
  const lines = await prisma.journalLine.findMany({
    where: { entry: { companyId, id: { in: entryIds } } },
    select: { id: true, accountCode: true },
  });
  const ids = lines.filter((l) => !/^1[12]\d\d/.test(l.accountCode) && !/^34/.test(l.accountCode)).map((l) => l.id);
  if (!ids.length) throw new HttpError(404, "Проводки не найдены");
  const res = await prisma.journalLine.updateMany({ where: { id: { in: ids } }, data: { party: party || null, partyInn: partyInn || null } });
  await logActivity("ledger_party", companyId, { entries: entryIds.length, lines: res.count });
  return NextResponse.json({ ok: true, lines: res.count });
});
