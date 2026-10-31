import { NextRequest, NextResponse } from "next/server";
import { HttpError, requireCompany, route } from "@/lib/auth/server";
import { closeChecklist } from "@/lib/close/checklist";
import { cpContext, runCp } from "@/lib/counterparties/server";
import { costingContext, run } from "@/lib/costing/server";
import { companyRegime, countUnpostedBankTx } from "@/lib/ledger/repo";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { hasProduction } from "@/lib/policy/types";
import { isRegimeKey } from "@/lib/tax-engine";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/close?companyId=…&from=…&to=… — чек-лист закрытия периода по всем модулям */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const demo = companyId === DEMO_COMPANY.id;
  const [cost, cp, reg, unposted] = await Promise.all([
    costingContext(companyId!, from, to),
    cpContext(companyId!),
    demo ? Promise.resolve({ regime: DEMO_COMPANY.regime, patentAmount: DEMO_COMPANY.patentAmount }) : companyRegime(companyId!),
    demo ? Promise.resolve(0) : countUnpostedBankTx(companyId!, from, to),
  ]);
  const { products, outputs, result } = run(cost);
  const res = closeChecklist({
    entries: cost.c.entries,
    period: { from, to },
    regime: isRegimeKey(reg.regime) ? reg.regime : null,
    patentMonthly: reg.patentAmount,
    unpostedBankTx: unposted,
    policySaved: cost.c.policySaved,
    people: cost.c.people,
    cp: runCp(cp, from, to),
    costing: {
      production: cost.c.policy ? hasProduction(cost.c.policy) : false,
      result,
      hasNorms: products.some((p) => p.materials.length > 0 || p.laborPerUnit > 0),
      outputsSet: Object.values(outputs).some((v) => v > 0),
    },
  });
  return NextResponse.json({ ...res, demo });
});
