import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { createEntry } from "@/lib/ledger/repo";
import { logActivity } from "@/lib/auth/server";

/**
 * POST /api/demo — creates a real, editable copy of the demo company in the
 * database (unlike companyId=demo, which is read-only and lives in memory).
 */
export async function POST() {
  try {
    const company = await prisma.company.create({
      data: { name: `${DEMO_COMPANY.name} (копия)`, defaultRegime: DEMO_COMPANY.regime, patentAmount: DEMO_COMPANY.patentAmount, activity: DEMO_COMPANY.activity },
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
    await logActivity("demo_copy", company.id);
    return NextResponse.json({ id: company.id, name: company.name }, { status: 201 });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
