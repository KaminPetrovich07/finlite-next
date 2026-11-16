// Server side: портфель — все компании, доступные пользователю, с диагностикой и налоговыми рисками.
import { prisma } from "@/lib/db";
import { loadEntries } from "@/lib/ledger/repo";
import { getCurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { AUTH_ON } from "@/lib/auth/mode";
import { putRecord } from "@/lib/records";
import { diagnose } from "@/lib/insolvency/diagnose";
import { taxRisks } from "@/lib/taxrisk/check";
import { monthsBack } from "@/lib/insolvency/diagnose";
import { portfolioRow, summarize, type PortfolioRow, type PortfolioSummary } from "./score";

export interface Profile { segment?: string; region?: string }

/** Компании, которые видит пользователь (как в /api/companies): владелец, общий доступ, администратор — все. */
async function visibleCompanies(): Promise<Array<{ id: string; name: string; access: "view" | "edit" }>> {
  const me = await getCurrentUser();
  if (!AUTH_ON) return (await prisma.company.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } })).map((c) => ({ ...c, access: "edit" as const }));
  if (!me) return [];
  const admin = isAdmin(me);
  const rows = await prisma.company.findMany({
    where: admin ? {} : { OR: [{ ownerId: me.id }, { access: { some: { userId: me.id } } }] },
    orderBy: { createdAt: "desc" },
    select: { id: true, name: true, ownerId: true, access: { where: { userId: me.id }, select: { level: true } } },
  });
  return rows.map((r) => ({ id: r.id, name: r.name, access: admin || r.ownerId === me.id || r.access[0]?.level === "edit" ? ("edit" as const) : ("view" as const) }));
}

export async function portfolio(asOf: string, months = 6, segment?: string): Promise<{ rows: PortfolioRow[]; summary: PortfolioSummary; segments: string[]; asOf: string }> {
  const companies = await visibleCompanies();
  const profiles = await prisma.companyRecord.findMany({ where: { kind: "profile", key: "main", companyId: { in: companies.map((c) => c.id) } }, select: { companyId: true, data: true } });
  const seg = new Map(profiles.map((p) => [p.companyId, ((p.data as Profile)?.segment ?? "").trim()]));
  const segments = [...new Set([...seg.values()].filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  const chosen = companies.filter((c) => !segment || (segment === "—" ? !seg.get(c.id) : seg.get(c.id) === segment));
  const from = `${monthsBack(asOf, months)[0]}-01`;
  const rows: PortfolioRow[] = [];
  // по 4 компании параллельно: быстрее, но без лавины запросов к базе
  for (let i = 0; i < chosen.length; i += 4) {
    rows.push(...(await Promise.all(chosen.slice(i, i + 4).map(async (c) => {
      const entries = await loadEntries(c.id);
      const d = diagnose(entries, asOf, { months });
      const tax = entries.length ? taxRisks(entries, from, asOf, { today: asOf }) : null;
      return portfolioRow({ id: c.id, name: c.name, segment: seg.get(c.id) ?? "" }, d, tax, entries.length);
    }))));
  }
  rows.sort((a, b) => Number(a.empty) - Number(b.empty) || b.score - a.score || a.name.localeCompare(b.name, "ru"));
  return { rows, summary: summarize(rows), segments, asOf };
}

export async function setSegment(companyId: string, segment: string) {
  const cur = await prisma.companyRecord.findUnique({ where: { companyId_kind_key: { companyId, kind: "profile", key: "main" } }, select: { data: true } });
  await putRecord(companyId, "profile", "main", { ...((cur?.data as Profile) ?? {}), segment: segment.trim().slice(0, 80) });
}
