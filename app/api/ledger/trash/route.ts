import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { listTrash, restoreEntries, TRASH_DAYS } from "@/lib/ledger/remove";
import { autoCogsFor } from "@/lib/stock/auto";

/** GET /api/ledger/trash?companyId= — проводки, удалённые за последние 90 дней */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  return NextResponse.json({ days: TRASH_DAYS, items: await listTrash(companyId!) });
});

const Schema = z.object({ companyId: z.string().min(1), eventIds: z.array(z.string().min(1)).min(1, "Выберите проводки").max(2000) });

/** POST /api/ledger/trash { companyId, eventIds } — восстановить удалённые проводки с прежними номерами */
export const POST = route(async (req: NextRequest) => {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const { companyId, eventIds } = parsed.data;
  await requireCompany(companyId, "edit");
  const r = await restoreEntries(companyId, eventIds);
  // по восстановленной продаже себестоимость спишется снова (если включено автосписание)
  for (const x of r.restored) if (x.source !== "cogs") await autoCogsFor(companyId, x.entryId, x.date);
  await logActivity("entries_restore", companyId, { restored: r.restored.length, skipped: r.skipped.length });
  return NextResponse.json({ ok: true, ...r });
});
