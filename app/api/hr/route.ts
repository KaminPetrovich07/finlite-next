import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { deleteRecord, getRecord, listRecords, putRecord } from "@/lib/records";
import { cleanEmployee, listEmployees, loadSettings, newEmployeeId, saveSettings, type Payrun } from "@/lib/hr/server";
import type { Employee } from "@/lib/hr/payroll";

export const runtime = "nodejs";
const demo = (id: string | null) => { if (!id || id === "demo") throw new HttpError(400, "Кадры ведутся в своей компании — создайте её или копию демо-компании в разделе «Компании»"); return id; };

/** GET /api/hr?companyId=&year= — сотрудники, настройки, рассчитанные месяцы. */
export const GET = route(async (req: NextRequest) => {
  const companyId = demo(req.nextUrl.searchParams.get("companyId"));
  await requireCompany(companyId, "view");
  const year = Number(req.nextUrl.searchParams.get("year")) || new Date().getUTCFullYear();
  const [employees, settings, runs] = await Promise.all([listEmployees(companyId), loadSettings(companyId, year), listRecords<Payrun>(companyId, "payrun")]);
  return NextResponse.json({ employees, settings, months: runs.map((r) => ({ month: r.data.month, posted: !!r.data.postedEntryId, postedAt: r.data.postedAt ?? null })).sort((a, b) => b.month.localeCompare(a.month)) });
});

/** POST /api/hr { companyId, employee } — новый сотрудник или изменение (если есть employee.id). */
export const POST = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => ({}));
  const companyId = demo(b.companyId);
  await requireCompany(companyId, "edit");
  const e = cleanEmployee(b.employee ?? {});
  if (typeof e === "string") throw new HttpError(400, e);
  const id = typeof b.employee?.id === "string" && (await getRecord<Employee>(companyId, "employee", b.employee.id)) ? b.employee.id : newEmployeeId();
  await putRecord<Employee>(companyId, "employee", id, { ...e, id });
  await logActivity("hr_employee", companyId, { id });
  return NextResponse.json({ ok: true, id });
});

/** PUT /api/hr { companyId, year, settings } */
export const PUT = route(async (req: NextRequest) => {
  const b = await req.json().catch(() => ({}));
  const companyId = demo(b.companyId);
  await requireCompany(companyId, "edit");
  await saveSettings(companyId, b.settings ?? {}, Number(b.year) || new Date().getUTCFullYear());
  return NextResponse.json({ ok: true });
});

/** DELETE /api/hr?companyId=&id= — удалить карточку (проведённые месяцы остаются в журнале). */
export const DELETE = route(async (req: NextRequest) => {
  const companyId = demo(req.nextUrl.searchParams.get("companyId"));
  await requireCompany(companyId, "edit");
  const id = req.nextUrl.searchParams.get("id");
  if (!id) throw new HttpError(400, "Не указан сотрудник");
  await deleteRecord(companyId, "employee", id);
  return NextResponse.json({ ok: true });
});
