import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { loadEntries } from "@/lib/ledger/repo";
import { demoEntries } from "@/lib/ledger/demo";
import { findAnomalies } from "@/lib/audit/anomalies";
import { loadSettings } from "@/lib/hr/server";
import type { LedgerEntry } from "@/lib/ledger/types";

export const runtime = "nodejs";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/audit?companyId=&from=&to= — подозрительные операции периода и проверка по Бенфорду. */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!companyId || !DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(400, "Укажите компанию и период");
  let entries: LedgerEntry[], holidays: string[] = [];
  if (companyId === "demo") entries = demoEntries() as LedgerEntry[];
  else {
    await requireCompany(companyId, "view");
    entries = await loadEntries(companyId, to);
    const years = [...new Set([Number(from.slice(0, 4)), Number(to.slice(0, 4))])];
    for (const y of years) holidays.push(...(await loadSettings(companyId, y)).holidays);
  }
  return NextResponse.json(findAnomalies(entries, from, to, holidays));
});
