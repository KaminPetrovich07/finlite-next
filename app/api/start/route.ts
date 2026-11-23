import { NextRequest, NextResponse } from "next/server";
import { requireCompany, route } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

/** GET /api/start?companyId= — что уже сделано в компании: для мастера подключения клиента. */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId") ?? "";
  await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ demo: true });
  const [company, bySource, catalog, bank, policy] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, inn: true, activity: true, defaultRegime: true, lockedThrough: true } }),
    prisma.journalEntry.groupBy({ by: ["source"], where: { companyId }, _count: { _all: true } }),
    prisma.companyRecord.count({ where: { companyId, kind: "nomenclature" } }),
    prisma.bankTransaction.count({ where: { companyId } }),
    prisma.companyRecord.count({ where: { companyId, kind: "policy" } }),
  ]);
  const n = (s: string) => bySource.find((x) => x.source === s)?._count._all ?? 0;
  const total = bySource.reduce((a, x) => a + x._count._all, 0);
  return NextResponse.json({
    demo: false,
    company,
    opening: n("opening"), import1c: n("import1c"), entries: total, catalog, bank, policy: policy > 0,
    closed: !!company?.lockedThrough,
  });
});
