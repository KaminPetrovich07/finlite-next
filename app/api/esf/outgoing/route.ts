import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { assertCompanyFeature } from "@/lib/server/plan-guard";
import { loadCompanyContext } from "@/lib/server/company-context";
import { getRecord, putRecord } from "@/lib/records";
import { defaultPolicy, normalizePolicy, type PolicyInput } from "@/lib/policy/types";
import { defaultOutSettings, isSpecialRegime, missingCatalog, outgoingDocs, type OutSettings } from "@/lib/esf/outgoing";

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек
const DATE = /^\d{4}-\d{2}-\d{2}$/;

async function settingsOf(companyId: string, special: boolean, demo: boolean): Promise<{ settings: OutSettings; saved: boolean }> {
  const stored = demo ? null : await getRecord<OutSettings>(companyId, "esf", "out").catch(() => null);
  const base = defaultOutSettings(special);
  return { settings: stored ? { ...base, ...stored, catalog: { ...(stored.catalog ?? {}) } } : base, saved: !!stored };
}

/** GET /api/esf/outgoing?companyId&from&to — продажи периода, собранные в документы ЭСФ 2.0 */
export const GET = route(async (req: NextRequest) => {
  const q = req.nextUrl.searchParams;
  const companyId = q.get("companyId") ?? "";
  const from = q.get("from") ?? "", to = q.get("to") ?? "";
  if (!DATE.test(from) || !DATE.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId);
  const { settings, saved } = await settingsOf(ctx.id, isSpecialRegime(ctx.regime), ctx.demo);
  let services = false;
  if (!ctx.demo) {
    const p = await getRecord<PolicyInput>(ctx.id, "policy").catch(() => null);
    const policy = p ? normalizePolicy(p, defaultPolicy(ctx)) : null;
    services = !!policy && policy.activities.length === 1 && policy.activities[0] === "services";
  }
  const docs = outgoingDocs(ctx.entries, from, to, settings, today(), services);
  return NextResponse.json({ settings, saved, today: today(), docs, missing: missingCatalog(docs) });
});

const Item = z.object({ code: z.string().trim().max(50), unitCode: z.string().trim().max(10), service: z.boolean() });
const Settings = z.object({
  special: z.boolean(),
  warehouseCode: z.string().trim().max(32),
  supplyKind: z.string().trim().regex(/^\d{0,5}$/, "Вид поставки — цифры"),
  supplyCode: z.string().trim().regex(/^\d{0,5}$/, "Код поставки — цифры"),
  vatCategory: z.enum(["Vat12", "ZeroRated", "Exempt", "NonTaxable"]),
  vatRatePercent: z.number().min(0).max(100).nullable(),
  nspRate: z.number().int().min(0).max(5),
  bankName: z.string().trim().max(200),
  bankAccount: z.string().trim().max(50),
  catalog: z.record(z.string().max(300), Item).refine((c) => Object.keys(c).length <= 5000, "Слишком большой каталог"),
});

/** PUT /api/esf/outgoing — настройки выгрузки и каталог кодов компании */
export const PUT = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), settings: Settings }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Неверные данные");
  const { companyId, settings } = p.data;
  await requireCompany(companyId, "edit");
  const ctx = await loadCompanyContext(companyId);
  if (ctx.demo) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await assertCompanyFeature(companyId, "esf");
  // пустые коды не храним — позиция снова попадёт в список «нет кода»
  const catalog = Object.fromEntries(Object.entries(settings.catalog).filter(([, v]) => v.code));
  await putRecord(companyId, "esf", "out", { ...settings, catalog });
  return NextResponse.json({ ok: true });
});
