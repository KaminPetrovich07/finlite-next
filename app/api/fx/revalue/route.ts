import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost, assertCompanyFeature } from "@/lib/server/plan-guard";
import { createEntry } from "@/lib/ledger/repo";
import { loadCompanyContext } from "@/lib/server/company-context";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { revaluation } from "@/lib/fx/fx";
import { loadRates } from "@/lib/fx/store";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

async function compute(companyId: string, date: string) {
  const ctx = await loadCompanyContext(companyId);
  const entries = ctx.entries.filter((e) => e.date <= date);
  const codes = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.currency)).filter((c): c is string => !!c))];
  const rates = codes.length && !ctx.demo ? await loadRates(date, codes) : [];
  return { ctx, ...revaluation(entries, date, rates), posted: entries.some((e) => e.source === "fx" && e.sourceRef === date) };
}

/** GET /api/fx/revalue?companyId=…&date=… — foreign-currency balances and the revaluation at the date */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", date = sp.get("date") ?? "";
  if (!ISO.test(date)) throw new HttpError(400, "Дата в формате ГГГГ-ММ-ДД");
  await requireCompany(companyId, "view");
  const r = await compute(companyId, date);
  return NextResponse.json({ rows: r.rows, missing: r.missing, lines: r.lines, posted: r.posted });
});

/** POST /api/fx/revalue { companyId, date } — post (or re-post) the revaluation entry */
export const POST = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), date: z.string().regex(ISO) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, date } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "fx");
  const r = await compute(companyId, date);
  if (r.missing.length) throw new HttpError(400, `Нет курса НБКР на ${date.split("-").reverse().join(".")} для: ${r.missing.join(", ")}. Загрузите курсы на странице «Валюта».`);
  if (!r.lines.length) throw new HttpError(400, "Курсовых разниц нет: валютные остатки уже пересчитаны по курсу на эту дату");
  if (!r.posted) await assertCanPost(companyId);
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { companyId, source: "fx", sourceRef: date } });
    await createEntry(tx, { companyId, date, source: "fx", sourceRef: date, description: `Переоценка валютных статей на ${date.split("-").reverse().join(".")} по курсу НБКР`, lines: r.lines });
  });
  await logActivity("fx_revalue", companyId, { date, rows: r.rows.length });
  return NextResponse.json({ ok: true, replaced: r.posted });
});
