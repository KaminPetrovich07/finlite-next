import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost, assertCompanyFeature } from "@/lib/server/plan-guard";
import { putRecord } from "@/lib/records";
import { createEntry } from "@/lib/ledger/repo";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadAssets } from "@/lib/assets/store";
import { disposalLines } from "@/lib/assets/depreciation";

const Body = z.object({
  companyId: z.string().min(1),
  id: z.string().min(1),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  proceeds: z.number().min(0).default(0),
  reason: z.string().trim().max(300).default(""),
  buyer: z.string().trim().max(200).default(""),
});

/** POST /api/assets/dispose — sale or write-off: card gets the disposal date, journal gets the entry */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, id, date, proceeds, reason, buyer } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "fixedAssets");
  const a = (await loadAssets(companyId)).find((x) => x.id === id);
  if (!a) throw new HttpError(404, "Карточка не найдена");
  if (date < a.inServiceAt) throw new HttpError(400, "Дата выбытия раньше ввода в эксплуатацию");
  const updated = { ...a, disposedAt: date, disposalProceeds: proceeds, disposalReason: reason };
  const d = disposalLines(updated);
  if (buyer) for (const l of d.lines) if (l.account === "1410") l.party = buyer;
  await assertCanPost(companyId);
  await prisma.$transaction(async (tx) => {
    await tx.journalEntry.deleteMany({ where: { companyId, source: "asset", sourceRef: `disp:${id}` } });
    await createEntry(tx, {
      companyId, date, source: "asset", sourceRef: `disp:${id}`,
      description: `${proceeds > 0 ? "Продажа" : "Списание"} основного средства: ${a.name}, инв. № ${a.inventoryNo}`,
      lines: d.lines,
    });
  });
  await putRecord(companyId, "asset", id, updated);
  await logActivity("asset_dispose", companyId, { id, proceeds });
  return NextResponse.json({ ok: true, accumulated: d.accumulated, carrying: d.carrying, gain: d.gain });
});

/** DELETE /api/assets/dispose?companyId=…&id=… — undo a disposal */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", id = sp.get("id") ?? "";
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  const a = (await loadAssets(companyId)).find((x) => x.id === id);
  if (!a) throw new HttpError(404, "Карточка не найдена");
  await prisma.journalEntry.deleteMany({ where: { companyId, source: "asset", sourceRef: `disp:${id}` } });
  await putRecord(companyId, "asset", id, { ...a, disposedAt: null, disposalProceeds: 0, disposalReason: "" });
  return NextResponse.json({ ok: true });
});
