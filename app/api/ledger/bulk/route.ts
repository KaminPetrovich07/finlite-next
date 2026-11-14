import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { deleteEntries } from "@/lib/ledger/remove";

const Schema = z.object({
  companyId: z.string().min(1),
  action: z.literal("delete"),
  ids: z.array(z.string().min(1)).min(1, "Выберите проводки").max(2000, "За раз — не больше 2000 проводок"),
});

/** POST /api/ledger/bulk { companyId, action: "delete", ids } — удалить отмеченные проводки (закрытый период пропускается) */
export const POST = route(async (req: NextRequest) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { companyId, ids } = parsed.data;
  await requireCompany(companyId, "edit");
  const r = await deleteEntries(companyId, ids);
  await logActivity("entries_delete", companyId, { ...r });
  return NextResponse.json({ ok: true, ...r });
});
