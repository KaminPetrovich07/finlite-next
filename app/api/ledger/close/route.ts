import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany } from "@/lib/auth/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { closingEntryLines } from "@/lib/ledger/engine";
import { createEntry, loadEntries, toLedgerEntry } from "@/lib/ledger/repo";

const Schema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/ledger/close — закрытие периода (реформация): счета 6000–9900
 * закрываются на 5999 «Свод доходов и расходов», результат — на 5300.
 * Idempotent: the previous closing entry for the same period is replaced.
 */
export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  const { companyId, from, to } = parsed.data;
  if (from > to) return NextResponse.json({ error: "Период задан неверно" }, { status: 400 });
  const ref = `${from}..${to}`;
  try {
    await requireCompany(companyId, "edit");
    const entries = (await loadEntries(companyId, to)).filter((e) => !(e.source === "closing" && e.sourceRef === ref));
    const lines = closingEntryLines(entries, { from, to });
    const created = await prisma.$transaction(async (db) => {
      await db.journalEntry.deleteMany({ where: { companyId, source: "closing", sourceRef: ref } });
      if (lines.length === 0) return null;
      return createEntry(db, {
        companyId, date: to, source: "closing", sourceRef: ref, lines,
        description: `Закрытие счетов доходов и расходов за ${from} — ${to} (через 5999 на 5300)`,
      });
    });
    return NextResponse.json({ entry: created ? toLedgerEntry(created) : null });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
