import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { assertCompanyFeature } from "@/lib/server/plan-guard";
import { getRecord, putRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { buildStatements } from "@/lib/ledger/engine";
import { CASH_ACCOUNTS } from "@/lib/ledger/accounts";
import { defaultBudget, planFact, planFromLastYear, type Budget } from "@/lib/budget/budget";
import { loadAssets } from "@/lib/assets/store";
import { depreciationLines } from "@/lib/assets/depreciation";

const ym = (d: Date) => d.toISOString().slice(0, 7);

function normalize(raw: any, year: number): Budget {
  const base = defaultBudget(year);
  if (!raw || !Array.isArray(raw.articles)) return base;
  return {
    year, minCash: Math.max(0, Number(raw.minCash) || 0),
    articles: raw.articles.slice(0, 100).map((a: any, i: number) => ({
      id: String(a.id ?? `a${i}`).slice(0, 40), name: String(a.name ?? "").slice(0, 120) || "Статья",
      kind: a.kind === "income" ? "income" : "expense",
      accounts: Array.isArray(a.accounts) ? a.accounts.map(String).filter((x: string) => /^\d{2,4}(\.\d{2})?\*?$/.test(x)).slice(0, 200) : [],
      plan: Array.from({ length: 12 }, (_, m) => Math.max(0, Math.round(Number(a.plan?.[m]) || 0))),
    })),
  };
}

/** GET /api/budget?companyId=…&year=…[&fill=growth%] — budget, plan-fact and the inputs of the cash forecast */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId);
  const today = ctx.demo ? "2026-09-30" : new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 10);
  const year = Number(sp.get("year")) || +today.slice(0, 4);
  let budget = ctx.demo ? defaultBudget(year) : normalize(await getRecord(companyId, "budget", String(year)), year);
  if (sp.get("fill")) budget = planFromLastYear(budget, ctx.entries, Number(sp.get("fill")) || 0);
  const pf = planFact(budget, ctx.entries);

  // forecast inputs: cash today, the last 3 complete months, receivables and payables, planned depreciation
  const entries = ctx.entries.filter((e) => e.date <= today);
  const y = +today.slice(0, 4), m = +today.slice(5, 7);
  const from = new Date(Date.UTC(y, m - 4, 1)).toISOString().slice(0, 10);
  const to = new Date(Date.UTC(y, m - 1, 0)).toISOString().slice(0, 10);
  const st = buildStatements(entries, { from, to }, { regime: ctx.regime });
  const months = [0, 1, 2].map((k) => ym(new Date(Date.UTC(y, m - 4 + k, 1))));
  const history = months.map((mm) => { const p = st.monthly.find((x) => x.month === mm); return { month: mm, cashIn: p?.cashIn ?? 0, cashOut: p?.cashOut ?? 0 }; });
  const bal = (re: RegExp) => Math.round(entries.reduce((s, e) => s + e.lines.filter((l) => re.test(l.account)).reduce((t, l) => t + l.debit - l.credit, 0), 0) * 100) / 100;
  const cashNow = Math.round(entries.reduce((s, e) => s + e.lines.filter((l) => CASH_ACCOUNTS.includes(l.account)).reduce((t, l) => t + l.debit - l.credit, 0), 0) * 100) / 100;
  const receivable = Math.max(0, bal(/^1410$/));
  const payable = Math.max(0, -bal(/^(3110|3410|3420|3430|3440|3490|3520|3530)$/));
  const assets = await loadAssets(companyId).catch(() => []);
  // the rest of the current month counts in proportion; near its end the forecast starts from the next month
  const dim = new Date(Date.UTC(y, m, 0)).getUTCDate();
  let share = (dim - +today.slice(8, 10)) / dim;
  let start = ym(new Date(Date.UTC(y, m - 1, 1)));
  if (share < 0.1) { start = ym(new Date(Date.UTC(y, m, 1))); share = 1; }
  const depreciation: Record<string, number> = {};
  for (let k = 0; k < 6; k++) { const mm = ym(new Date(Date.UTC(y, m - 1 + k, 1))); depreciation[mm] = depreciationLines(assets, mm).total; }
  return NextResponse.json({
    budget, planFact: pf, readOnly: ctx.demo || level === "view",
    forecastInput: { today, start, cashNow, history, receivable, payable, depreciation, firstMonthShare: Math.round(share * 100) / 100 },
  });
});

/** PUT /api/budget — { companyId, budget } */
export const PUT = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), budget: z.object({ year: z.number().int().min(2000).max(2100) }).passthrough() }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "budget");
  const b = normalize(p.data.budget, p.data.budget.year);
  await putRecord(companyId, "budget", String(b.year), b);
  return NextResponse.json({ ok: true });
});
