import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { putRecord } from "@/lib/records";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { validateEntry } from "@/lib/ledger/engine";
import { emptyGroup, loadGroup, validAdjustment, type GroupSettings } from "@/lib/consolidation/server";

/** GET /api/consolidation/group?parentId=… — настройки группы (участники, доли, корректировки) */
export const GET = route(async (req: NextRequest) => {
  const parentId = req.nextUrl.searchParams.get("parentId");
  await requireCompany(parentId, "view");
  return NextResponse.json((await loadGroup(parentId!)) ?? emptyGroup());
});

const Line = z.object({ account: z.string().min(4).max(8), debit: z.number().min(0), credit: z.number().min(0), memo: z.string().max(200).optional().nullable() });
const Body = z.object({
  parentId: z.string().min(1),
  name: z.string().trim().max(200),
  members: z.array(z.object({
    companyId: z.string().min(1),
    role: z.enum(["common", "subsidiary"]),
    share: z.number().gt(0).max(100).optional(),          // проценты
    acquiredAt: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    investmentCost: z.number().min(0).nullable().optional(),
  })).max(49),
  adjustments: z.array(z.object({
    id: z.string().max(40).optional(),
    date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    description: z.string().trim().min(1).max(300),
    lines: z.array(Line).min(2).max(20),
  })).max(200).default([]),
});

/** PUT /api/consolidation/group — сохранить группу. Нужен доступ к изменению материнской и к просмотру каждого участника. */
export const PUT = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Проверьте настройки группы");
  const d = p.data;
  if (d.parentId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию нельзя сделать материнской — создайте свою компанию или копию демо");
  await requireCompany(d.parentId, "edit");
  const ids = new Set<string>();
  for (const m of d.members) {
    if (m.companyId === d.parentId) throw new HttpError(400, "Материнская компания уже в группе — уберите её из списка участников");
    if (ids.has(m.companyId)) throw new HttpError(400, "Компания добавлена в группу дважды");
    ids.add(m.companyId);
    try { await requireCompany(m.companyId, "view"); } catch { throw new HttpError(403, "Нет доступа к одной из выбранных компаний"); }
  }
  for (const a of d.adjustments) {
    const lines = a.lines.filter((l) => l.debit > 0 || l.credit > 0);
    if (!validAdjustment(lines) || validateEntry({ date: a.date, lines }).length) throw new HttpError(400, `Корректировка «${a.description}»: дебет должен равняться кредиту, счета — из плана счетов`);
  }
  const settings: GroupSettings = {
    name: d.name,
    members: d.members.map((m) => m.role === "subsidiary"
      ? { companyId: m.companyId, role: "subsidiary", share: Math.round((m.share ?? 100) * 100) / 10000, acquiredAt: m.acquiredAt ?? null, investmentCost: m.investmentCost ?? null }
      : { companyId: m.companyId, role: "common" }),
    adjustments: d.adjustments.map((a) => ({ id: a.id || randomUUID().slice(0, 8), date: a.date, description: a.description, lines: a.lines.filter((l) => l.debit > 0 || l.credit > 0) })),
  };
  await putRecord(d.parentId, "group", "main", settings);
  await logActivity("group_save", d.parentId, { members: settings.members.length, adjustments: settings.adjustments.length });
  return NextResponse.json(settings);
});
