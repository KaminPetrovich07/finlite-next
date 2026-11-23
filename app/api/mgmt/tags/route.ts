import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { setTags } from "@/lib/mgmt/server";

const v = z.union([z.string().max(60), z.null()]).optional();
const Body = z.object({ companyId: z.string().min(1), entryIds: z.array(z.string().min(1).max(40)).min(1).max(5000), tags: z.object({ dept: v, project: v, line: v }) });

/** POST /api/mgmt/tags { companyId, entryIds, tags } — разметить проводки (null — снять значение) */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные разметки");
  const { companyId, entryIds, tags } = parsed.data;
  await requireCompany(companyId, "edit");
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компания только для просмотра");
  const n = await setTags(companyId, entryIds, tags);
  await logActivity("mgmt_tags", companyId, { entries: n });
  return NextResponse.json({ ok: true, updated: n });
});
