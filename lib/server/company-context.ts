// Server-side: a company's profile and full journal, for modules that work on
// the whole history (accounting policy, counterparties, primary documents).
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadEntries } from "@/lib/ledger/repo";
import type { LedgerEntry } from "@/lib/ledger/types";
import { isRegimeKey, type RegimeKey } from "@/lib/tax-engine";

export interface CompanyContext {
  id: string;
  name: string;
  inn: string | null;
  activity: string | null;
  regime: RegimeKey | null;
  demo: boolean;
  entries: LedgerEntry[];
}

export async function loadCompanyContext(companyId: string): Promise<CompanyContext> {
  if (companyId === DEMO_COMPANY.id) {
    return { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name, inn: null, activity: DEMO_COMPANY.activity, regime: DEMO_COMPANY.regime, demo: true, entries: demoEntries() };
  }
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, inn: true, activity: true, defaultRegime: true } });
  if (!c) throw new HttpError(404, "Компания не найдена");
  return {
    id: c.id, name: c.name, inn: c.inn, activity: c.activity,
    regime: isRegimeKey(c.defaultRegime) ? (c.defaultRegime as RegimeKey) : null,
    demo: false,
    entries: await loadEntries(companyId),
  };
}
