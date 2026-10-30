import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany } from "@/lib/auth/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { validateEntry } from "@/lib/ledger/engine";
import { createEntry, fromIsoDate, toLedgerEntry } from "@/lib/ledger/repo";
import { round2 } from "@/lib/ledger/types";

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД");

/** GET /api/ledger?companyId=…&from=…&to=… — entries of the period plus all opening-balance entries */
export async function GET(req: NextRequest) {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId");
  const from = sp.get("from");
  const to = sp.get("to");
  if (!companyId) return NextResponse.json({ error: "companyId обязателен" }, { status: 400 });

  try {
    await requireCompany(companyId, "view");
    const rows = await prisma.journalEntry.findMany({
      where: {
        companyId,
        OR: [
          { source: "opening" },
          { date: { ...(from ? { gte: fromIsoDate(from) } : {}), ...(to ? { lte: fromIsoDate(to) } : {}) } },
        ],
      },
      include: { lines: true },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      take: 2000,
    });
    return NextResponse.json(rows.map(toLedgerEntry));
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}

const LineSchema = z.object({
  account: z.string().min(4).max(8),
  debit: z.number().min(0),
  credit: z.number().min(0),
  memo: z.string().max(200).optional().nullable(),
  party: z.string().trim().max(200).optional().nullable(),
  partyInn: z.string().trim().regex(/^\d{0,14}$/, "ИНН — до 14 цифр").optional().nullable(),
});

const EntrySchema = z.object({
  companyId: z.string().min(1),
  date: isoDate,
  description: z.string().trim().min(1, "Укажите содержание операции").max(500),
  source: z.enum(["manual", "opening"]).default("manual"),
  lines: z.array(LineSchema).min(2),
});

/** POST /api/ledger — manual entry or opening balances; rejected unless Дт = Кт */
export async function POST(req: NextRequest) {
  const parsed = EntrySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => i.message).join("; ") }, { status: 400 });

  const input = parsed.data;
  const lines = input.lines
    .map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) }))
    .filter((l) => l.debit > 0 || l.credit > 0);
  const errors = validateEntry({ date: input.date, lines });
  if (errors.length) return NextResponse.json({ error: errors.join("; ") }, { status: 400 });

  try {
    await requireCompany(input.companyId, "edit");
    const row = await createEntry(prisma, { ...input, lines });
    return NextResponse.json(toLedgerEntry(row), { status: 201 });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "Не удалось сохранить проводку — база данных недоступна" }, { status: 503 });
  }
}
