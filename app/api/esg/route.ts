import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromIsoDate } from "@/lib/ledger/repo";
import { EMPTY_ESG, INDUSTRY_LABEL, type EsgInput } from "@/lib/esg/input";
import { FUELS } from "@/lib/esg/factors";
import { TOPICS } from "@/lib/esg/materiality";
import { HttpError, logActivity, requireCompany } from "@/lib/auth/server";

const Schema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data: z.record(z.unknown()),
});

const TEXT_MAX: Partial<Record<keyof EsgInput, number>> = { region: 200, esgOwner: 200, companyDescription: 6000, ceoMessage: 6000 };

/**
 * Keeps only known fields and coerces each to the type it has in EMPTY_ESG,
 * so the stored JSON always matches the current EsgInput shape.
 */
function sanitize(raw: Record<string, unknown>): { data?: EsgInput; error?: string } {
  const out = { ...EMPTY_ESG, materiality: {} } as EsgInput;
  const rec = out as unknown as Record<string, unknown>;
  for (const [k, def] of Object.entries(EMPTY_ESG)) {
    const v = raw[k];
    if (v === undefined || k === "materiality") continue;
    if (typeof def === "number") {
      const n = Number(v);
      if (!Number.isFinite(n) || n < 0) return { error: `${k}: нужно неотрицательное число` };
      rec[k] = n;
    } else if (typeof def === "boolean") {
      rec[k] = Boolean(v);
    } else if (typeof def === "string") {
      const s = String(v);
      if (s.length > (TEXT_MAX[k as keyof EsgInput] ?? 200)) return { error: `${k}: слишком длинный текст` };
      rec[k] = s;
    }
  }
  if (!(out.industry in INDUSTRY_LABEL)) out.industry = EMPTY_ESG.industry;
  if (!(out.coalType in FUELS) || !out.coalType.startsWith("coal")) out.coalType = EMPTY_ESG.coalType;
  for (const pctKey of ["commuteShareCar", "commuteSharePublic", "localSuppliersPct", "emissionTargetPct"] as const) {
    if (out[pctKey] > 100) return { error: `${pctKey}: не больше 100%` };
  }
  const m = raw.materiality;
  if (m && typeof m === "object") {
    for (const t of TOPICS) {
      const s = (m as Record<string, { impact?: unknown; financial?: unknown }>)[t.key];
      const impact = Number(s?.impact), financial = Number(s?.financial);
      if (impact >= 1 && impact <= 5 && financial >= 1 && financial <= 5) out.materiality[t.key] = { impact: Math.round(impact), financial: Math.round(financial) };
    }
  }
  return { data: out };
}

/** PUT /api/esg — saves the non-financial ESG inputs for one company and period */
export async function PUT(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const { companyId, from, to } = parsed.data;
  if (companyId === "demo") return NextResponse.json({ error: "Демо-компанию нельзя изменить" }, { status: 409 });
  let userId: string;
  try {
    userId = (await requireCompany(companyId, "edit")).id;
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
  const { data, error } = sanitize(parsed.data.data);
  if (!data) return NextResponse.json({ error }, { status: 400 });
  const periodFrom = fromIsoDate(from), periodTo = fromIsoDate(to);
  const json = JSON.parse(JSON.stringify(data));
  try {
    await prisma.esgReport.upsert({
      where: { companyId_periodFrom_periodTo: { companyId, periodFrom, periodTo } },
      create: { companyId, periodFrom, periodTo, data: json },
      update: { data: json },
    });
    await logActivity(userId, "esg_save", companyId, { from, to });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
