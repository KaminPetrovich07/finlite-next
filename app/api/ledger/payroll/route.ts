import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany } from "@/lib/auth/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { payrollLines } from "@/lib/ledger/payroll";
import { createEntry, toLedgerEntry } from "@/lib/ledger/repo";

const Schema = z.object({
  companyId: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  production: z.number().min(0).default(0),
  sales: z.number().min(0).default(0),
  admin: z.number().min(0).default(0),
});

/** POST /api/ledger/payroll — начисление зарплаты с удержаниями и взносами одной проводкой */
export async function POST(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Неверные параметры" }, { status: 400 });
  const { companyId, date, production, sales, admin } = parsed.data;
  const p = payrollLines({ production, sales, admin });
  if (p.gross <= 0) return NextResponse.json({ error: "Укажите сумму начисленной зарплаты" }, { status: 400 });
  try {
    await requireCompany(companyId, "edit");
    const row = await createEntry(prisma, {
      companyId, date, source: "payroll", lines: p.lines,
      description: `Начисление заработной платы за ${date.slice(5, 7)}.${date.slice(0, 4)}`,
    });
    return NextResponse.json({ payroll: p, entry: toLedgerEntry(row) }, { status: 201 });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
