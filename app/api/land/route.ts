import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { deleteRecord, listRecords, putRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { AGRI_TYPE, CATEGORY, landIssues, landSummary, parcelTax, RIGHT, type Parcel } from "@/lib/land/land";
import { demoParcels } from "@/lib/land/demo";

export const runtime = "nodejs";

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const ISO = z.union([z.literal(""), z.string().regex(/^\d{4}-\d{2}-\d{2}$/)]);
const txt = (n: number) => z.string().trim().max(n).default("");
const num = z.number().finite().min(0).max(1e12).nullable().optional();
const ParcelZ = z.object({
  id: z.string().max(60).optional(), eni: txt(60), name: z.string().trim().min(1, "Укажите название участка").max(120),
  category: z.enum(["agri", "settlement", "nonagri"]), agriType: z.enum(["irrigated", "rainfed", "perennial", "hay", "pasture", "other"]).optional(),
  region: txt(80), district: txt(80), address: txt(200), areaM2: z.number().finite().positive("Площадь должна быть больше нуля").max(1e11),
  purpose: txt(200), right: z.enum(["own", "lease", "use"]), docKind: txt(80), docNumber: txt(80), docDate: ISO.default(""),
  leaseTo: ISO.optional(), leaseRentYear: num, bns: num, ki: num, ratePct: z.number().finite().min(0).max(100).nullable().optional(),
  taxNote: txt(300), exempt: z.boolean().optional(), notes: txt(500),
});

async function load(companyId: string): Promise<Parcel[]> {
  return (await listRecords<Parcel>(companyId, "landParcel")).map((r) => r.data).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

async function guard(companyId: string) {
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть. Создайте свою компанию.");
  await requireCompany(companyId, "edit");
}

/** GET /api/land?companyId=…[&format=xlsx] — реестр участков, сводка, что проверить; xlsx — выгрузка реестра. */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId") ?? "";
  const level = await requireCompany(companyId, "view");
  const parcels = await load(companyId);
  if (req.nextUrl.searchParams.get("format") === "xlsx") {
    const company = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, inn: true } });
    const wb = new ExcelJS.Workbook(); wb.creator = "FinLite KG";
    const ws = wb.addWorksheet("Реестр участков");
    ws.addRow([`Реестр земельных участков: ${company?.name ?? ""}${company?.inn ? `, ИНН ${company.inn}` : ""}`]).font = { bold: true, size: 13 };
    ws.addRow([`На ${today().split("-").reverse().join(".")}. Налоговая стоимость = площадь × БНС × Ки (ст. 400–401 НК КР); значения БНС, Ки и ставки введены пользователем.`]).font = { italic: true, color: { argb: "FF666666" } };
    ws.addRow([]);
    const head = ["Код ЕНИ", "Участок", "Категория", "Вид угодий", "Область", "Район", "Адрес", "Площадь, м²", "Площадь, га", "Целевое назначение", "Право", "Документ", "Номер", "Дата", "Аренда до", "Аренда в год, сом", "БНС, сом/м²", "Ки", "Ставка, %", "Налоговая стоимость, сом", "Налог, сом", "Основание значений"];
    const hr = ws.addRow(head); hr.font = { bold: true }; hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFE8ECF2" } }; });
    for (const p of parcels) {
      const t = parcelTax(p);
      ws.addRow([p.eni, p.name, CATEGORY[p.category], p.agriType ? AGRI_TYPE[p.agriType] : "", p.region, p.district, p.address, p.areaM2, p.areaM2 / 10_000, p.purpose, RIGHT[p.right], p.docKind, p.docNumber, p.docDate ? p.docDate.split("-").reverse().join(".") : "", p.leaseTo ? p.leaseTo.split("-").reverse().join(".") : "", p.leaseRentYear ?? null, p.bns ?? null, p.ki ?? null, p.ratePct ?? null, t.taxValue, p.exempt ? "освобождён" : t.tax, p.taxNote ?? ""]);
    }
    ws.columns.forEach((c, i) => { c.width = [22, 26, 28, 18, 18, 20, 28, 14, 12, 28, 18, 22, 14, 12, 12, 16, 12, 8, 10, 20, 14, 30][i] ?? 14; });
    [8, 16, 20, 21].forEach((i) => { ws.getColumn(i).numFmt = "#,##0"; }); ws.getColumn(9).numFmt = "#,##0.0000";
    await logActivity("land_export", companyId, { parcels: parcels.length });
    return new NextResponse(new Uint8Array(await wb.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="zemelnye-uchastki-${today()}.xlsx"` } });
  }
  return NextResponse.json({
    parcels: parcels.map((p) => ({ ...p, ...parcelTax(p) })), summary: landSummary(parcels), issues: landIssues(parcels, today()),
    readOnly: companyId === DEMO_COMPANY.id || level === "view",
  });
});

/** POST /api/land { companyId, parcel } — добавить или изменить участок; { companyId, demo: true } — пример участков. */
export const POST = route(async (req: NextRequest) => {
  const body = await req.json().catch(() => null);
  const companyId = String(body?.companyId ?? "");
  await guard(companyId);
  if (body?.demo === true) {
    const list = demoParcels(today());
    for (const p of list) await putRecord(companyId, "landParcel", p.id, p);
    await logActivity("land_save", companyId, { demo: true, parcels: list.length });
    return NextResponse.json({ ok: true, added: list.length }, { status: 201 });
  }
  const p = ParcelZ.safeParse(body?.parcel);
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Неверные данные участка");
  const parcel: Parcel = { ...p.data, id: p.data.id || `land_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}` };
  if (parcel.category !== "agri") delete parcel.agriType;
  if (parcel.right !== "lease") { delete parcel.leaseTo; delete parcel.leaseRentYear; }
  await putRecord(companyId, "landParcel", parcel.id, parcel);
  await logActivity("land_save", companyId, { id: parcel.id, eni: parcel.eni, name: parcel.name, areaM2: parcel.areaM2 });
  return NextResponse.json({ ok: true, parcel }, { status: 201 });
});

/** DELETE /api/land { companyId, id } */
export const DELETE = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), id: z.string().min(1).max(60) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Укажите участок");
  await guard(p.data.companyId);
  await deleteRecord(p.data.companyId, "landParcel", p.data.id);
  await logActivity("land_delete", p.data.companyId, { id: p.data.id });
  return NextResponse.json({ ok: true });
});
