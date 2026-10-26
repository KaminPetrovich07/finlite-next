import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { createEntry } from "@/lib/ledger/repo";

/**
 * POST /api/demo — creates a real, editable copy of the demo company in the
 * database (unlike companyId=demo, which is read-only and lives in memory).
 */
export async function POST() {
  try {
    const company = await prisma.company.create({
      data: { name: DEMO_COMPANY.name, defaultRegime: DEMO_COMPANY.regime, patentAmount: DEMO_COMPANY.patentAmount },
    });
    await prisma.$transaction(async (db) => {
      for (const e of demoEntries()) {
        await createEntry(db, {
          companyId: company.id,
          date: e.date,
          description: e.description,
          source: e.source === "demo" ? "manual" : e.source,
          sourceRef: e.sourceRef,
          lines: e.lines,
        });
      }
    });
    return NextResponse.json({ id: company.id, name: company.name }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
