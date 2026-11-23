import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { analyze, sampleDocs, sampleObject, type BuildObject } from "@/lib/build/model";
import { deleteObject, listObjects, loadDocs, saveObject, stockAt } from "@/lib/build/server";
import { ObjectSchema } from "@/lib/build/schema";

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);

/** Демо-компания: один объект-пример с документами — посмотреть анализ без ввода данных. */
let demo: { o: BuildObject; docs: ReturnType<typeof sampleDocs>; day: string } | null = null;
function demoData() {
  if (!demo || demo.day !== today()) { const o = { ...sampleObject(today()), id: "demo-object", name: "Склад 32 м² и санузел (демо)" }; demo = { o, docs: sampleDocs(o), day: today() }; }
  return demo;
}

/**
 * GET /api/build/objects?companyId= — объекты с краткими итогами;
 *     &id= — один объект: смета, документы, анализ «смета — факт» и остатки материалов на складе.
 */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const id = sp.get("id");
  const isDemo = companyId === DEMO_COMPANY.id;
  if (id) {
    if (isDemo) {
      const d = demoData();
      if (id !== d.o.id) throw new HttpError(404, "Объект не найден");
      return NextResponse.json({ object: d.o, docs: d.docs.map((doc, i) => ({ entryId: `demo-${i}`, doc, locked: true, editedInJournal: false, description: "", version: "" })), analysis: analyze(d.o, d.docs), readOnly: true });
    }
    const [objects, docs, stock] = await Promise.all([listObjects(companyId), loadDocs(companyId, id), stockAt(companyId, today())]);
    const o = objects.find((x) => x.id === id);
    if (!o) throw new HttpError(404, "Объект не найден");
    const qty = new Map([...stock].map(([k, v]) => [k, v.qty]));
    return NextResponse.json({ object: o, docs, analysis: analyze(o, docs.map((d) => d.doc), qty), readOnly: level === "view" });
  }
  if (isDemo) {
    const d = demoData();
    return NextResponse.json({ objects: [summary(d.o, d.docs)], readOnly: true });
  }
  const [objects, docs] = await Promise.all([listObjects(companyId), loadDocs(companyId)]);
  return NextResponse.json({ objects: objects.map((o) => summary(o, docs.map((d) => d.doc))), readOnly: level === "view" });
});

function summary(o: BuildObject, docs: ReturnType<typeof sampleDocs>) {
  const a = analyze(o, docs);
  return {
    id: o.id, name: o.name, customer: o.customer, status: o.status, start: o.start, end: o.end, stages: o.stages.length,
    planWorks: a.plan.works, planCost: a.plan.cost, accepted: a.accepted, factCost: a.factCost, wip: a.wip, progress: a.progress, docs: docs.filter((d) => d.objectId === o.id).length, warnings: a.warnings.length,
  };
}

const Body = z.union([
  z.object({ companyId: z.string().min(1), sample: z.literal(true) }),
  z.object({ companyId: z.string().min(1), object: z.record(z.string(), z.unknown()) }),
]);

/** POST /api/build/objects { companyId, object } — сохранить объект и смету; { companyId, sample: true } — объект-пример со сметой */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные объекта");
  const b = parsed.data;
  await requireCompany(b.companyId, "edit");
  if (b.companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компания только для просмотра — создайте свою компанию");
  if ("sample" in b) {
    const o = await saveObject(b.companyId, sampleObject(today()));
    await logActivity("build_object_sample", b.companyId, {});
    return NextResponse.json({ ok: true, object: o }, { status: 201 });
  }
  const o = ObjectSchema.safeParse(b.object);
  if (!o.success) throw new HttpError(400, o.error.issues[0].message);
  const saved = await saveObject(b.companyId, o.data as BuildObject);
  await logActivity("build_object_save", b.companyId, { stages: saved.stages.length, works: saved.works.length, resources: saved.resources.length });
  return NextResponse.json({ ok: true, object: saved });
});

/** DELETE /api/build/objects?companyId=&id=&withDocs=1 — удалить объект (с документами — в «Удалённые») */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "";
  await requireCompany(companyId, "edit");
  const id = sp.get("id") ?? "";
  if (!id) throw new HttpError(400, "Не указан объект");
  const r = await deleteObject(companyId, id, sp.get("withDocs") === "1");
  await logActivity("build_object_delete", companyId, r);
  return NextResponse.json({ ok: true, ...r });
});
