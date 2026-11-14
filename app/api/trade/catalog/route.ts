import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getRecord } from "@/lib/records";
import { loadCompanyContext } from "@/lib/server/company-context";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { catalogFromJournal, normalizeItem, type CatalogItem } from "@/lib/trade/catalog";
import { deleteItems, loadCatalog, mergeIntoCatalog, saveItem } from "@/lib/trade/server";

async function vatPayer(companyId: string): Promise<boolean> {
  try { return !!(await getRecord<{ vatPayer?: boolean }>(companyId, "policy"))?.vatPayer; } catch { return false; }
}

/** GET /api/trade/catalog?companyId= — номенклатура компании (у демо — собранная из журнала) */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  const level = await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) {
    return NextResponse.json({ items: catalogFromJournal((await loadCompanyContext(companyId)).entries, "none"), vatPayer: false, readOnly: true });
  }
  return NextResponse.json({ items: await loadCatalog(companyId!), vatPayer: await vatPayer(companyId!), readOnly: level === "view" });
});

const Body = z.union([
  z.object({ companyId: z.string().min(1), item: z.record(z.unknown()) }),
  z.object({ companyId: z.string().min(1), merge: z.array(z.record(z.unknown())).min(1).max(20000) }),
  z.object({ companyId: z.string().min(1), fromJournal: z.literal(true) }),
]);

/**
 * POST /api/trade/catalog
 *  { companyId, item }        — сохранить одну позицию (новую или изменённую);
 *  { companyId, merge: [...] } — загрузка из 1С / Excel: совпадающие по артикулу или названию обновляются;
 *  { companyId, fromJournal }  — добавить позиции, которые уже встречаются в журнале проводок.
 */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные номенклатуры");
  const b = parsed.data;
  await requireCompany(b.companyId, "edit");
  if ("item" in b) {
    const item = normalizeItem(b.item);
    if (!item) throw new HttpError(400, "Укажите наименование");
    const saved = await saveItem(b.companyId, item);
    await logActivity("catalog_save", b.companyId, { name: saved.name });
    return NextResponse.json({ ok: true, item: saved });
  }
  let incoming: CatalogItem[];
  if ("merge" in b) incoming = b.merge.map(normalizeItem).filter((x): x is CatalogItem => !!x);
  else incoming = catalogFromJournal((await loadCompanyContext(b.companyId)).entries, (await vatPayer(b.companyId)) ? "12" : "none");
  const r = await mergeIntoCatalog(b.companyId, incoming);
  await logActivity("catalog_merge", b.companyId, { added: r.added, updated: r.updated, source: "merge" in b ? "file" : "journal" });
  return NextResponse.json({ ok: true, added: r.added, updated: r.updated, unchanged: r.unchanged, total: r.items.length });
});

const Del = z.object({ companyId: z.string().min(1), ids: z.array(z.string().min(1)).min(1).max(20000) });

/** DELETE /api/trade/catalog { companyId, ids } — удалить позиции (проводки и документы не меняются) */
export const DELETE = route(async (req: NextRequest) => {
  const parsed = Del.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Выберите позиции");
  await requireCompany(parsed.data.companyId, "edit");
  const n = await deleteItems(parsed.data.companyId, parsed.data.ids);
  await logActivity("catalog_delete", parsed.data.companyId, { count: n });
  return NextResponse.json({ ok: true, deleted: n });
});
