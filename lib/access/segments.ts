// ════════════════════════════════════════════════════════════════════════
// lib/access/segments.ts — доступ «ведомства»: пользователь получает право
// на все компании группы (сегмента портфеля), включая те, что появятся в
// группе позже. Реализовано через обычные записи доступа CompanyAccess —
// проверка прав в каждом запросе остаётся той же, что уже проверена:
// с правом «просмотр» ведомство видит портфель, диагностику и отчёты, но
// ничего не может изменить.
// Правила хранятся в AppSetting "segmentGrants"; выдаёт и снимает только администратор.
// ════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db";
import { putRecord } from "@/lib/records";

export type GrantLevel = "view" | "edit";
export interface SegmentGrant { segment: string; userId: string; level: GrantLevel; at: string; by: string | null }

const KEY = "segmentGrants";

export async function listGrants(): Promise<SegmentGrant[]> {
  const row = await prisma.appSetting.findUnique({ where: { key: KEY } }).catch(() => null);
  return Array.isArray(row?.value) ? (row!.value as unknown as SegmentGrant[]) : [];
}

async function saveGrants(list: SegmentGrant[]) {
  await prisma.appSetting.upsert({ where: { key: KEY }, create: { key: KEY, value: list as never }, update: { value: list as never } });
}

/** id компаний группы. */
export async function companiesOfSegment(segment: string): Promise<string[]> {
  const rows = await prisma.companyRecord.findMany({ where: { kind: "profile", key: "main", data: { path: ["segment"], equals: segment } }, select: { companyId: true } });
  return rows.map((r) => r.companyId);
}

/** Выдать доступ по правилу на одну компанию: владельцу не нужно, «изменение» не понижается до «просмотра». */
async function applyOne(companyId: string, g: Pick<SegmentGrant, "userId" | "level">) {
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { ownerId: true, access: { where: { userId: g.userId }, select: { level: true } } } });
  if (!c || c.ownerId === g.userId) return false;
  const cur = c.access[0]?.level;
  if (cur === "edit" || cur === g.level) return false;
  await prisma.companyAccess.upsert({ where: { companyId_userId: { companyId, userId: g.userId } }, create: { companyId, userId: g.userId, level: g.level }, update: { level: g.level } });
  return true;
}

/** Компания попала в группу (или сменила группу): применить правила этой группы. */
export async function applySegmentGrants(companyId: string, segment: string): Promise<number> {
  if (!segment) return 0;
  let n = 0;
  for (const g of (await listGrants()).filter((x) => x.segment === segment)) if (await applyOne(companyId, g)) n++;
  return n;
}

/** Записать группу компании и сразу открыть доступ ведомствам этой группы. */
export async function setCompanySegment(companyId: string, segment: string) {
  const seg = segment.trim().slice(0, 80);
  const cur = await prisma.companyRecord.findUnique({ where: { companyId_kind_key: { companyId, kind: "profile", key: "main" } }, select: { data: true } });
  await putRecord(companyId, "profile", "main", { ...((cur?.data as object) ?? {}), segment: seg });
  await applySegmentGrants(companyId, seg);
}

/** Правило «пользователь видит группу»: сохраняется и сразу применяется ко всем её компаниям. */
export async function grantSegment(segment: string, userId: string, level: GrantLevel, by: string | null): Promise<number> {
  const list = (await listGrants()).filter((g) => !(g.segment === segment && g.userId === userId));
  list.push({ segment, userId, level, at: new Date().toISOString(), by });
  await saveGrants(list);
  let n = 0;
  for (const id of await companiesOfSegment(segment)) if (await applyOne(id, { userId, level })) n++;
  return n;
}

/** Снять правило и доступ пользователя к компаниям группы (владельцем он не становился, своё не теряет). */
export async function revokeSegment(segment: string, userId: string): Promise<number> {
  await saveGrants((await listGrants()).filter((g) => !(g.segment === segment && g.userId === userId)));
  const ids = await companiesOfSegment(segment);
  const r = await prisma.companyAccess.deleteMany({ where: { userId, companyId: { in: ids } } });
  return r.count;
}
