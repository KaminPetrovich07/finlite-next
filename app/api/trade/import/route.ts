import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { importDocs } from "@/lib/trade/server";
import { Doc } from "@/lib/trade/schema";

export const maxDuration = 300;

const Body = z.object({ companyId: z.string().min(1), docs: z.array(Doc).min(1).max(300) });

/** POST /api/trade/import { companyId, docs } — документы из 1С; уже введённые (тот же номер) пропускаются */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    const i = parsed.error.issues[0];
    throw new HttpError(400, i.path[0] === "docs" && typeof i.path[1] === "number" ? `Документ ${Number(i.path[1]) + 1}: ${i.message}` : i.message);
  }
  const { companyId, docs } = parsed.data;
  await requireCompany(companyId, "edit");
  await assertCanPost(companyId, docs.length);
  const r = await importDocs(companyId, docs);
  await logActivity("trade_doc_import", companyId, { created: r.created, duplicates: r.duplicates, failed: r.problems.length });
  return NextResponse.json(r);
});
