import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { buildEntryDoc } from "@/lib/primary/build";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import type { DocBlock, OfficialDoc } from "@/lib/docs/model";
import { sampleDocs, sampleObject, type BuildDoc, type BuildObject } from "@/lib/build/model";
import { listObjects, loadDocs } from "@/lib/build/server";
import { PRINT_FORMS, printAct, printContract, printKs2, printKs3, printMaterials, printReport, printWriteoff, type PrintCtx, type PrintForm } from "@/lib/build/print";

export const runtime = "nodejs";
export const maxDuration = 60;

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Body = z.object({
  companyId: z.string().min(1),
  objectId: z.string().min(1),
  forms: z.array(z.enum(Object.keys(PRINT_FORMS) as [PrintForm, ...PrintForm[]])).min(1).max(8),
  /** документ (акт КС-2 или списание) — id проводки */
  entryId: z.string().optional(),
  from: z.string().regex(ISO).optional(),
  to: z.string().regex(ISO).optional(),
});

/**
 * POST /api/build/print?format=pdf|docx { companyId, objectId, forms, entryId?, from?, to? } — печатные формы по объекту:
 * КС-2, КС-3, акт сдачи-приёмки и счёт — по акту; акт списания — по списанию; отчёты и договор — по объекту.
 */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, objectId, forms, entryId } = parsed.data;
  await requireCompany(companyId, "view");
  const pc = await loadPrimaryCtx(companyId);
  const ctx: PrintCtx = {
    companyName: pc.companyName, inn: pc.inn, city: pc.policy?.city || "Бишкек", director: pc.people.director,
    directorTitle: pc.people.directorTitle || "Руководитель", chief: pc.people.chief, vatPayer: !!pc.policy?.vatPayer,
  };

  let o: BuildObject | undefined;
  let docs: Array<{ entryId: string; doc: BuildDoc }> = [];
  if (companyId === DEMO_COMPANY.id) {
    const so = { ...sampleObject(today()), id: "demo-object", name: "Склад 32 м² и санузел (демо)" };
    if (objectId === so.id) { o = so; docs = sampleDocs(so).map((doc, i) => ({ entryId: `demo-${i}`, doc })); }
  } else {
    o = (await listObjects(companyId)).find((x) => x.id === objectId);
    docs = await loadDocs(companyId, objectId);
  }
  if (!o) throw new HttpError(404, "Объект не найден");
  const all = docs.map((d) => d.doc);
  const doc = entryId ? docs.find((d) => d.entryId === entryId)?.doc : undefined;
  if (entryId && !doc) throw new HttpError(404, "Документ не найден");
  const to = parsed.data.to ?? doc?.to ?? doc?.date ?? today();

  const blocks: DocBlock[] = [];
  let landscape = false;
  for (const f of forms) {
    let part: DocBlock[];
    if (f === "ks2" || f === "ks3" || f === "act" || f === "invoice") {
      if (doc?.type !== "ks2") throw new HttpError(400, "Выберите акт КС-2");
      if (f === "ks2") { part = printKs2(ctx, o, doc); landscape = true; }
      else if (f === "ks3") { part = printKs3(ctx, o, doc, all); landscape = true; }
      else if (f === "act") part = printAct(ctx, o, doc, all);
      else {
        const e = pc.entries.find((x) => x.id === entryId);
        if (!e) throw new HttpError(404, "Проводка акта не найдена");
        part = buildEntryDoc("invoice", e, Number(doc.number) || 1, pc, { party: `${o.customer}${o.customerInn ? `, ИНН ${o.customerInn}` : ""}`, attachment: `договор подряда № ${o.contractNo || "___"}${o.contractDate ? ` от ${o.contractDate.split("-").reverse().join(".")}` : ""}, акт КС-2 № ${doc.number}` });
      }
    } else if (f === "writeoff") {
      if (doc?.type !== "writeoff") throw new HttpError(400, "Выберите документ списания");
      part = printWriteoff(ctx, o, doc);
    } else if (f === "materials") part = printMaterials(ctx, o, all, parsed.data.from ?? doc?.from, to);
    else if (f === "report") { part = printReport(ctx, o, all, to); landscape = true; }
    else part = printContract(ctx, o);
    if (blocks.length) blocks.push({ t: "pagebreak" });
    blocks.push(...part);
  }
  await logActivity("build_print", companyId, { forms, format });
  const title = `${forms.map((f) => PRINT_FORMS[f].split(" — ")[0]).join(", ")} — ${o.name}${doc ? ` № ${doc.number}` : ""}`;
  // бланки (КС-2, КС-3, акт, счёт, списание) — бланковой вёрсткой; договор и отчёты — обычным документом
  const compact = forms.every((f) => ["ks2", "ks3", "act", "invoice", "writeoff"].includes(f));
  const out: OfficialDoc = { title, fileName: title.slice(0, 120), org: pc.companyName, landscape, blocks, compact };
  return sendDoc(out, format);
});
