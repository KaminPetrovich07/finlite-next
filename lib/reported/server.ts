// Server side: сохранение и чтение отчётности предприятий (CompanyRecord kind "reported",
// key = дата окончания периода, data = значения в сомах за квартал).
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertCanCreateCompany } from "@/lib/server/plan-guard";
import { putRecord } from "@/lib/records";
import { setCompanySegment } from "@/lib/access/segments";
import type { ReportedPeriod, Values } from "./reported";

export interface ImportCompany { name: string; inn: string; segment: string; periods: ReportedPeriod[] }
export interface ImportResult { name: string; companyId: string | null; created: boolean; periods: number; error?: string }

/** Отчётные периоды компании, по возрастанию даты. */
export async function reportedPeriods(companyId: string): Promise<ReportedPeriod[]> {
  const rows = await prisma.companyRecord.findMany({ where: { companyId, kind: "reported" }, select: { key: true, data: true } });
  return rows.map((r) => ({ date: r.key, values: (r.data as { values?: Values })?.values ?? {} })).sort((a, b) => a.date.localeCompare(b.date));
}

/** Периоды сразу для многих компаний (портфель). */
export async function reportedByCompany(ids: string[]): Promise<Map<string, ReportedPeriod[]>> {
  const rows = await prisma.companyRecord.findMany({ where: { companyId: { in: ids }, kind: "reported" }, select: { companyId: true, key: true, data: true } });
  const m = new Map<string, ReportedPeriod[]>();
  for (const r of rows) (m.get(r.companyId) ?? m.set(r.companyId, []).get(r.companyId)!).push({ date: r.key, values: (r.data as { values?: Values })?.values ?? {} });
  for (const list of m.values()) list.sort((a, b) => a.date.localeCompare(b.date));
  return m;
}

/** Компании, в которые пользователь может записывать: свои, с правом изменения, у администратора — все. */
async function editable(userId: string | null, admin: boolean) {
  return prisma.company.findMany({
    where: !AUTH_ON || admin ? {} : { OR: [{ ownerId: userId ?? "-" }, { access: { some: { userId: userId ?? "-", level: "edit" } } }] },
    select: { id: true, name: true, inn: true },
  });
}

const nameKey = (s: string) => s.toLowerCase().replace(/[«»"'`]/g, "").replace(/\s+/g, " ").trim();

/**
 * Загрузка: предприятие находится среди доступных пользователю по ИНН, иначе по названию,
 * иначе создаётся (владелец — загрузивший). Периоды с той же датой перезаписываются.
 */
export async function importReported(list: ImportCompany[]): Promise<ImportResult[]> {
  const me = await getCurrentUser();
  if (AUTH_ON && !me) throw new HttpError(401, "Войдите в систему");
  const mine = await editable(me?.id ?? null, !!me && isAdmin(me));
  const out: ImportResult[] = [];
  for (const c of list) {
    try {
      let target = (c.inn && mine.find((x) => x.inn === c.inn)) || mine.find((x) => nameKey(x.name) === nameKey(c.name)) || null;
      let created = false;
      if (!target) {
        await assertCanCreateCompany(me);
        const row = await prisma.company.create({ data: { name: c.name, inn: c.inn || null, ownerId: me?.id ?? null }, select: { id: true, name: true, inn: true } });
        target = row; mine.push(row); created = true;
      }
      for (const p of c.periods) await putRecord(target.id, "reported", p.date, { values: p.values });
      if (c.segment) await setCompanySegment(target.id, c.segment);
      out.push({ name: c.name, companyId: target.id, created, periods: c.periods.length });
    } catch (e) {
      out.push({ name: c.name, companyId: null, created: false, periods: 0, error: e instanceof HttpError ? e.message : "Не удалось сохранить" });
      if (!(e instanceof HttpError)) console.error(e);
    }
  }
  return out;
}
