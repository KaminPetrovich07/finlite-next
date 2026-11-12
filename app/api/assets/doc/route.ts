import { NextRequest } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { loadAssets } from "@/lib/assets/store";
import { depreciationSheet, os1, os6 } from "@/lib/assets/docs";

export const runtime = "nodejs";

/** GET /api/assets/doc?companyId=…&kind=os1|os6|sheet&id=…&ym=…&format=pdf|docx */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const kind = sp.get("kind");
  const format = docFormat(sp.get("format"));
  const ym = /^\d{4}-\d{2}$/.test(sp.get("ym") ?? "") ? sp.get("ym")! : new Date().toISOString().slice(0, 7);
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  await requireCompany(companyId, "view");
  const [c, assets] = await Promise.all([loadPrimaryCtx(companyId), loadAssets(companyId)]);
  const ctx = { companyName: c.companyName, inn: c.inn, people: c.people };
  if (kind === "sheet") {
    await logActivity("asset_doc", c.demo ? null : companyId, { kind, ym });
    const title = `Ведомость амортизации ${ym} — ${c.companyName}`;
    return sendDoc({ title, fileName: title, org: c.companyName, landscape: true, blocks: depreciationSheet(assets, ctx, ym) }, format);
  }
  const a = assets.find((x) => x.id === sp.get("id"));
  if (!a) throw new HttpError(404, "Карточка не найдена");
  if (kind !== "os1" && kind !== "os6") throw new HttpError(400, "Документ: os1, os6 или sheet");
  const title = `${kind === "os1" ? "ОС-1" : "ОС-6"} ${a.name} инв. ${a.inventoryNo}`;
  await logActivity("asset_doc", c.demo ? null : companyId, { kind, id: a.id });
  return sendDoc({ title, fileName: title, org: c.companyName, landscape: kind === "os1", blocks: kind === "os1" ? os1(a, ctx) : os6(a, ctx, ym) }, format);
});
