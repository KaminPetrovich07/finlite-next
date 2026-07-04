import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { parseStatementFile } from "@/lib/bank-parser";
import { categorizeTransactions } from "@/lib/categorize";

export const runtime = "nodejs"; // xlsx parsing needs Node, not Edge

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;
  const companyId = formData.get("companyId") as string | null;
  const bank = (formData.get("bank") as string | null) ?? "unknown";

  if (!file || !companyId) {
    return NextResponse.json({ error: "Нужны file и companyId" }, { status: 400 });
  }

  let parsed;
  try {
    const buffer = await file.arrayBuffer();
    parsed = parseStatementFile(file.name, buffer);
  } catch (e: any) {
    return NextResponse.json({ error: e.message ?? "Не удалось разобрать файл" }, { status: 400 });
  }

  if (parsed.transactions.length === 0) {
    return NextResponse.json(
      { error: "Не найдено ни одной транзакции", warnings: parsed.warnings, detectedColumns: parsed.detectedColumns },
      { status: 422 }
    );
  }

  const categorized = await categorizeTransactions(parsed.transactions);
  const importBatch = `${bank}-${Date.now()}`;

  await prisma.bankTransaction.createMany({
    data: categorized.map((tx) => ({
      companyId,
      bank,
      txDate: tx.date,
      amount: tx.amount,
      description: tx.description,
      category: tx.category,
      categorySource: tx.categorySource,
      rawRow: tx.raw as any,
      importBatch,
    })),
  });

  const summary = categorized.reduce<Record<string, number>>((acc, tx) => {
    acc[tx.category] = (acc[tx.category] ?? 0) + tx.amount;
    return acc;
  }, {});

  return NextResponse.json({
    importBatch,
    count: categorized.length,
    warnings: parsed.warnings,
    detectedColumns: parsed.detectedColumns,
    summary,
  });
}
