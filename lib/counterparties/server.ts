// Server-side helpers shared by the counterparty routes.
import { getRecord } from "@/lib/records";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { analyze, type AllowanceRates } from "./calc";
import { demoStore } from "./demo";
import { normalizeStore, type CpStore } from "./types";

export async function cpContext(companyId: string) {
  const c = await loadPrimaryCtx(companyId);
  const store: CpStore = c.demo ? demoStore() : normalizeStore(await getRecord<CpStore>(companyId, "counterparty", "main"));
  const p = c.policy;
  const rates: AllowanceRates = p
    ? { method: p.allowanceMethod, d90: p.allowance90, d180: p.allowance180, d365: p.allowance365 }
    : { method: "aging", d90: 25, d180: 50, d365: 100 };
  return { c, store, rates };
}

export function runCp(ctx: Awaited<ReturnType<typeof cpContext>>, from: string, asOf: string, store = ctx.store) {
  return analyze(ctx.c.entries, store, from, asOf, ctx.rates);
}
