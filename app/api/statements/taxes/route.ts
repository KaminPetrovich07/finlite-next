import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { buildStatements } from "@/lib/ledger/engine";
import { companyRegime, createEntry, loadEntries, toLedgerEntry } from "@/lib/ledger/repo";
import { taxSourceRef } from "@/lib/ledger/taxes";

const Schema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

/**
 * POST /api/statements/taxes — (re)accrues taxes for the period.
 * Idempotent: the previous tax entry for the same period is replaced, so it
 * can be re-run after new transactions arrive.
 */
export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  const { companyId, from, to } = parsed.data;
  if (from > to) return NextResponse.json({ error: "Период задан неверно" }, { status: 400 });

  try {
    const { regime, patentAmount } = await companyRegime(companyId);
    if (!regime) return NextResponse.json({ error: "Сначала выберите налоговый режим компании" }, { status: 400 });

    const ref = taxSourceRef(from, to);
    // compute WITHOUT the old accrual for this period, so it never feeds into itself
    const entries = (await loadEntries(companyId, to)).filter((e) => !(e.source === "tax" && e.sourceRef === ref));
    const s = buildStatements(entries, { from, to }, { regime, patentMonthly: patentAmount });
    const accrual = s.taxes.computed!;

    const created = await prisma.$transaction(async (db) => {
      await db.journalEntry.deleteMany({ where: { companyId, source: "tax", sourceRef: ref } });
      if (accrual.total <= 0) return null;
      return createEntry(db, {
        companyId,
        date: to,
        description: `Начисление налогов за ${from} — ${to} · ${accrual.regimeName}`,
        source: "tax",
        sourceRef: ref,
        lines: accrual.entryLines,
      });
    });

    return NextResponse.json({ accrual, entry: created ? toLedgerEntry(created) : null });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
