import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { LINES, type LineKey } from "@/lib/reported/reported";
import { importReported } from "@/lib/reported/server";
import { visibleCompanies } from "@/lib/portfolio/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const KEYS = LINES.map((l) => l.key) as [LineKey, ...LineKey[]];
const Num = z.number().finite().min(-1e13).max(1e13);
const Period = z.object({ date: z.string().regex(ISO), values: z.partialRecord(z.enum(KEYS), Num) });
const Company = z.object({
  name: z.string().trim().min(1).max(200), inn: z.string().regex(/^\d{0,14}$/).default(""), segment: z.string().trim().max(80).default(""),
  periods: z.array(Period).min(1).max(40),
});
const Body = z.object({ companies: z.array(Company).min(1).max(300), file: z.string().max(200).optional() });

/** GET /api/reported — предприятия с загруженной отчётностью (доступные пользователю). */
export const GET = route(async () => {
  const companies = await visibleCompanies();
  const rows = await prisma.companyRecord.findMany({ where: { kind: "reported", companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, key: true, updatedAt: true } });
  const by = new Map<string, { dates: string[]; updatedAt: Date }>();
  for (const r of rows) {
    const x = by.get(r.companyId) ?? { dates: [], updatedAt: r.updatedAt };
    x.dates.push(r.key); if (r.updatedAt > x.updatedAt) x.updatedAt = r.updatedAt;
    by.set(r.companyId, x);
  }
  const list = companies.filter((c) => by.has(c.id)).map((c) => {
    const x = by.get(c.id)!;
    const dates = x.dates.sort();
    return { companyId: c.id, name: c.name, access: c.access, periods: dates, last: dates[dates.length - 1], updatedAt: x.updatedAt };
  }).sort((a, b) => a.name.localeCompare(b.name, "ru"));
  return NextResponse.json({ companies: list });
});

/** POST /api/reported { companies, file } — загрузка разобранной в браузере отчётности. */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверный формат отчётности — используйте шаблон FinLite");
  const results = await importReported(p.data.companies);
  await logActivity("reported_import", null, {
    file: p.data.file ?? null, companies: results.length, created: results.filter((r) => r.created).length,
    periods: results.reduce((s, r) => s + r.periods, 0), failed: results.filter((r) => r.error).length,
  });
  return NextResponse.json({ results });
});

/** DELETE /api/reported { companyId, date? } — удалить период (или всю загруженную отчётность компании). */
export const DELETE = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), date: z.string().regex(ISO).optional() }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Укажите компанию");
  await requireCompany(p.data.companyId, "edit");
  const r = await prisma.companyRecord.deleteMany({ where: { companyId: p.data.companyId, kind: "reported", ...(p.data.date ? { key: p.data.date } : {}) } });
  await logActivity("reported_delete", p.data.companyId, { date: p.data.date ?? "все", periods: r.count });
  return NextResponse.json({ deleted: r.count });
});
