import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { getRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { defaultPolicy, normalizePolicy, type PolicyInput } from "@/lib/policy/types";
import { defaultOutSettings, isSpecialRegime, outgoingDocs, salesXml, servicesXml, type OutSettings } from "@/lib/esf/outgoing";

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек

/**
 * GET /api/trade/esf?entryId=… — реализация → ЭСФ 2.0: проверка (чего не хватает) и XML для загрузки
 * в кабинет ЭСФ (черновик; номер присваивается после подписи ЭЦП). Настройки и коды товаров — «ЭСФ» → «Продажи → XML».
 */
export const GET = route(async (req: NextRequest) => {
  const entryId = req.nextUrl.searchParams.get("entryId") ?? "";
  const row = await prisma.journalEntry.findUnique({ where: { id: entryId }, select: { companyId: true, source: true, sourceRef: true, date: true } });
  if (!row || row.source !== "trade" || !row.sourceRef?.startsWith("sale:")) throw new HttpError(404, "Реализация не найдена");
  await requireCompany(row.companyId, "view");
  const ctx = await loadCompanyContext(row.companyId);
  const stored = await getRecord<OutSettings>(ctx.id, "esf", "out").catch(() => null);
  const base = defaultOutSettings(isSpecialRegime(ctx.regime));
  const settings: OutSettings = stored ? { ...base, ...stored, catalog: { ...(stored.catalog ?? {}) } } : base;
  const p = await getRecord<PolicyInput>(ctx.id, "policy").catch(() => null);
  const policy = p ? normalizePolicy(p, defaultPolicy(ctx)) : null;
  const services = !!policy && policy.activities.length === 1 && policy.activities[0] === "services";
  const day = row.date.toISOString().slice(0, 10);
  const doc = outgoingDocs(ctx.entries.filter((e) => e.id === entryId), day, day, settings, today(), services)[0];
  if (!doc) throw new HttpError(404, "В проводке реализации нет строк выручки");
  const xml = doc.problems.length ? null : (doc.service ? servicesXml([doc], settings) : salesXml([doc], settings))[0] ?? null;
  return NextResponse.json({ doc, xml, settingsSaved: !!stored });
});
