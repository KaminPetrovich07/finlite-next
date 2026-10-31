import { getRecord } from "@/lib/records";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { companyRegime } from "@/lib/ledger/repo";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { isRegimeKey } from "@/lib/tax-engine";
import { HttpError } from "@/lib/auth/server";
import { taxReports, type Size } from "./build";

export interface Settings { size: Size; filed: Record<string, string> }

export function normalizeSettings(raw: unknown): Settings {
  const o = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const size = ["small", "medium", "large"].includes(String(o.size)) ? (o.size as Size) : "small";
  const filed: Record<string, string> = {};
  if (o.filed && typeof o.filed === "object") for (const [k, v] of Object.entries(o.filed as Record<string, unknown>).slice(0, 2000)) {
    if (/^STI-\d{3}\|\d{4}-\d{2}-\d{2}$/.test(k) && typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v)) filed[k] = v;
  }
  return { size, filed };
}

export async function taxContext(companyId: string) {
  const c = await loadPrimaryCtx(companyId);
  const reg = c.demo ? { regime: DEMO_COMPANY.regime, patentAmount: DEMO_COMPANY.patentAmount } : await companyRegime(companyId);
  if (!reg.regime || !isRegimeKey(reg.regime)) throw new HttpError(400, "Выберите налоговый режим компании в разделе «Компании» — от него зависят отчёты.");
  let settings: Settings = { size: "small", filed: {} };
  if (!c.demo) { try { settings = normalizeSettings(await getRecord<Settings>(companyId, "taxreports", "main")); } catch { /* table missing: defaults */ } }
  return { c, regime: reg.regime, patent: reg.patentAmount, settings };
}

export function runTax(ctx: Awaited<ReturnType<typeof taxContext>>, from: string, to: string, size?: Size) {
  const today = new Date().toISOString().slice(0, 10);
  return taxReports(ctx.c.entries, { from, to }, {
    regime: ctx.regime, size: size ?? ctx.settings.size, today, patentMonthly: ctx.patent,
    vatPayer: ctx.c.policy ? ctx.c.policy.vatPayer : true, filed: ctx.settings.filed,
  });
}
