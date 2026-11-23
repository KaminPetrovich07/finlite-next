import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { getAccount } from "@/lib/ledger/accounts";
import { DIM_KINDS, effectiveTags, segmentReport, type DimKind, type MgmtSettings } from "@/lib/mgmt/model";
import { mgmtContext, saveSettings } from "@/lib/mgmt/server";
import { marginalReport } from "@/lib/mgmt/marginal";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/**
 * GET /api/mgmt?companyId=&from=&to=&kind=dept|project|line — настройки и отчёт о прибылях по сегментам;
 *     &marginal=1 — маржинальный анализ по тому же разрезу;
 *     &entries=1 — проводки периода с доходами и расходами и их аналитики (для разметки).
 */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Период задан неверно");
  const kind = (DIM_KINDS.includes(sp.get("kind") as DimKind) ? sp.get("kind") : "dept") as DimKind;
  const { ctx, settings, tags } = await mgmtContext(companyId);
  const readOnly = ctx.demo || level === "view";
  if (sp.get("entries") === "1") {
    const valid = new Set(settings.dims.map((d) => d.id));
    const list = ctx.entries
      .filter((e) => e.date >= from && e.date <= to && e.source !== "closing")
      .map((e) => {
        let income = 0, expense = 0;
        for (const l of e.lines) {
          const a = getAccount(l.account) ?? getAccount(l.account.split(".")[0]);
          if (a?.type === "income") income += l.credit - l.debit;
          else if (a?.type === "expense") expense += l.debit - l.credit;
        }
        if (!income && !expense) return null;
        const t = effectiveTags(e, tags.get(e.id), settings, valid);
        return { id: e.id, date: e.date, description: e.description, source: e.source, accounts: [...new Set(e.lines.map((l) => l.account))].filter((a) => /^[6-9]/.test(a)).slice(0, 4), party: e.lines.find((l) => l.party)?.party ?? null, income: Math.round(income * 100) / 100, expense: Math.round(expense * 100) / 100, tags: t.tags, origin: t.origin };
      })
      .filter(Boolean)
      .sort((a, b) => b!.date.localeCompare(a!.date));
    return NextResponse.json({ entries: list, settings, readOnly });
  }
  if (sp.get("marginal") === "1") return NextResponse.json({ settings, marginal: marginalReport(ctx.entries, from, to, kind, settings, tags), readOnly });
  return NextResponse.json({ settings, report: segmentReport(ctx.entries, from, to, kind, settings, tags), readOnly });
});

const Settings = z.object({
  dims: z.array(z.object({ id: z.string().min(1).max(60), kind: z.enum(["dept", "project", "line"]), name: z.string().max(200), code: z.string().max(40).optional(), role: z.enum(["profit", "cost"]).optional(), archived: z.boolean().optional(), auto: z.boolean().optional() })).max(500),
  rules: z.array(z.object({
    id: z.string().min(1).max(60), account: z.string().max(12).optional(), party: z.string().max(200).optional(), text: z.string().max(200).optional(),
    source: z.enum(["opening", "manual", "bank", "tax", "closing", "payroll", "demo", "import1c", "depreciation", "asset", "cogs", "fx", "esf", "trade", "build"]).optional(),
    set: z.object({ dept: z.string().max(60).optional(), project: z.string().max(60).optional(), line: z.string().max(60).optional() }),
  })).max(300),
  alloc: z.object({ dept: z.any().optional(), project: z.any().optional(), line: z.any().optional() }).optional(),
  behavior: z.record(z.string().regex(/^\d{4}(\.\d{1,3})?$/), z.number().min(0).max(100)).optional(),
});
const Alloc = z.object({ base: z.enum(["revenue", "direct", "equal", "manual", "none"]), manual: z.record(z.string(), z.number().min(0).max(100)).optional() });

/** POST /api/mgmt { companyId, settings } — значения аналитик, правила разметки и базы распределения */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => null);
  const companyId = typeof b?.companyId === "string" ? b.companyId : "";
  await requireCompany(companyId, "edit");
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компания только для просмотра — создайте свою компанию");
  const parsed = Settings.safeParse(b?.settings);
  if (!parsed.success) throw new HttpError(400, "Неверные настройки аналитик");
  const alloc: MgmtSettings["alloc"] = {};
  for (const k of DIM_KINDS) { const a = Alloc.safeParse(parsed.data.alloc?.[k]); if (a.success) alloc[k] = a.data; }
  const saved = await saveSettings(companyId, { ...parsed.data, alloc } as MgmtSettings);
  await logActivity("mgmt_settings_save", companyId, { dims: saved.dims.length, rules: saved.rules.length });
  return NextResponse.json({ ok: true, settings: saved });
});
