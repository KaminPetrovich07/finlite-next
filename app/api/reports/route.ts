import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { calculate, REGIMES, type RegimeKey } from "@/lib/tax-engine";
import { HttpError, requireCompany } from "@/lib/auth/server";

const ReportInputSchema = z.object({
  companyId: z.string().min(1),
  periodLabel: z.string().min(1),
  periodFrom: z.coerce.date(),
  periodTo: z.coerce.date(),
  regimeKey: z.string().refine((k): k is RegimeKey => k in REGIMES, "Неизвестный налоговый режим"),
  revenue: z.number().min(0),
  otherIncome: z.number().min(0),
  cogs: z.number().min(0),
  salaries: z.number().min(0),
  rent: z.number().min(0),
  sellingExp: z.number().min(0),
  adminExp: z.number().min(0),
  otherOpExp: z.number().min(0),
  interestExp: z.number().min(0),
  otherNonOp: z.number(),
  investInc: z.number().min(0),
  cashPct: z.number().min(0).max(100),
  patentAmount: z.number().min(0),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = ReportInputSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }
  const input = parsed.data;
  const fr = calculate({ ...input, regimeKey: input.regimeKey as RegimeKey });

  try {
    await requireCompany(input.companyId, "edit");
    const report = await prisma.report.create({
      data: {
        companyId: input.companyId,
        periodLabel: input.periodLabel,
        periodFrom: input.periodFrom,
        periodTo: input.periodTo,
        regimeKey: input.regimeKey,
        regimeName: fr.regimeName,
        revenue: input.revenue,
        otherIncome: input.otherIncome,
        cogs: input.cogs,
        salaries: input.salaries,
        rent: input.rent,
        sellingExp: input.sellingExp,
        adminExp: input.adminExp,
        otherOpExp: input.otherOpExp,
        interestExp: input.interestExp,
        otherNonOp: input.otherNonOp,
        investInc: input.investInc,
        cashPct: input.cashPct,
        patentAmount: input.patentAmount,
        totalRevenue: fr.totalRevenue,
        grossProfit: fr.grossProfit,
        ebit: fr.ebit,
        ebt: fr.ebt,
        netProfit: fr.netProfit,
        profitability: fr.profitability,
        social: fr.social,
        vat: fr.vat,
        salesTax: fr.salesTax,
        incomeTax: fr.incomeTax,
        totalDirect: fr.totalDirect,
        totalIndirect: fr.totalIndirect,
        details: fr.details,
      },
    });
    return NextResponse.json({ report, result: fr }, { status: 201 });
  } catch (e) {
    if (e instanceof HttpError && e.status !== 403) return NextResponse.json({ error: e.message }, { status: e.status });
    // DB not connected — return calculation result only (no persistence)
    return NextResponse.json({ report: null, result: fr }, { status: 201 });
  }
}

export async function GET(req: NextRequest) {
  try {
    const companyId = req.nextUrl.searchParams.get("companyId");
    const limit = Math.min(Number(req.nextUrl.searchParams.get("limit") ?? 50), 200);
    let where: { companyId: string } | { companyId: { in: string[] } } | undefined;
    if (companyId) {
      await requireCompany(companyId, "view");
      where = { companyId };
    }
    const reports = await prisma.report.findMany({
      where,
      orderBy: { createdAt: "desc" },
      take: limit,
      include: { company: { select: { name: true } } },
    });
    return NextResponse.json(reports);
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json([]);
  }
}
