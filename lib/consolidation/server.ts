// Server side of consolidation: the group settings (stored on the parent company) and the
// calculation with access checks — the user must be able to see every member.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { requireCompany } from "@/lib/auth/server";
import { getRecord } from "@/lib/records";
import { loadEntries } from "@/lib/ledger/repo";
import { previousPeriod } from "@/lib/ledger/load";
import { demoEntries, DEMO_COMPANY } from "@/lib/ledger/demo";
import type { LedgerLine, Period } from "@/lib/ledger/types";
import { consolidate, type Adjustment, type GroupMember, type MemberJournal, type MemberRole } from "./consolidate";
import { groupTables, type GroupTables } from "./present";

/** Stored in CompanyRecord (kind «group», key «main») of the parent company. */
export interface GroupSettings {
  name: string;
  members: Array<{ companyId: string; role: Exclude<MemberRole, "parent">; share?: number; acquiredAt?: string | null; investmentCost?: number | null }>;
  adjustments: Adjustment[];
}

export const emptyGroup = (name = ""): GroupSettings => ({ name, members: [], adjustments: [] });

export async function loadGroup(parentId: string): Promise<GroupSettings | null> {
  return getRecord<GroupSettings>(parentId, "group");
}

async function companyInfo(ids: string[]) {
  const rows = await prisma.company.findMany({ where: { id: { in: ids.filter((i) => i !== DEMO_COMPANY.id) } }, select: { id: true, name: true, inn: true } });
  const m = new Map(rows.map((r) => [r.id, r]));
  if (ids.includes(DEMO_COMPANY.id)) m.set(DEMO_COMPANY.id, { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name, inn: null });
  return m;
}

export async function runGroup(parentId: string, period: Period): Promise<{ settings: GroupSettings; tables: GroupTables }> {
  await requireCompany(parentId, "view");
  const settings = await loadGroup(parentId);
  if (!settings || !settings.members.length) throw new HttpError(404, "Группа не настроена: добавьте участников");
  const ids = [parentId, ...settings.members.map((m) => m.companyId)];
  for (const id of ids) {
    try { await requireCompany(id, "view"); }
    catch { throw new HttpError(403, "Нет доступа к одной из компаний группы — попросите владельца открыть вам просмотр всех участников"); }
  }
  const info = await companyInfo(ids);
  const prev = previousPeriod(period);
  const journals: MemberJournal[] = await Promise.all(ids.map(async (id, i) => {
    const c = info.get(id);
    if (!c) throw new HttpError(404, "Одна из компаний группы удалена — уберите её из группы");
    const s = i === 0 ? null : settings.members[i - 1];
    const member: GroupMember = {
      companyId: id, name: c.name, inn: c.inn, role: s ? s.role : "parent",
      ...(s?.role === "subsidiary" ? { share: s.share ?? 1, acquiredAt: s.acquiredAt ?? null, investmentCost: s.investmentCost ?? null } : {}),
    };
    const entries = id === DEMO_COMPANY.id ? demoEntries().filter((e) => e.date <= period.to) : await loadEntries(id, period.to);
    return { member, entries };
  }));
  const result = consolidate(journals, period, prev, settings.adjustments ?? []);
  return { settings, tables: groupTables(result) };
}

export function validAdjustment(lines: LedgerLine[]): boolean {
  const dr = lines.reduce((s, l) => s + l.debit, 0), cr = lines.reduce((s, l) => s + l.credit, 0);
  return lines.length >= 2 && dr > 0 && Math.abs(dr - cr) < 0.005;
}
