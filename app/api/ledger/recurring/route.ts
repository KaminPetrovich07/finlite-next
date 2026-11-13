import { NextRequest, NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { deleteRecord, getRecord, listRecords, putRecord } from "@/lib/records";
import { validateEntry } from "@/lib/ledger/engine";
import { round2 } from "@/lib/ledger/types";
import { dueRuns, nextRun, type RecurringTemplate } from "@/lib/ledger/recurring";
import { bishkekToday, doneRefs, lockedThrough, openRuns } from "@/lib/ledger/recurring-server";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

const YM = /^\d{4}-\d{2}$/;

/** GET /api/ledger/recurring?companyId=… — шаблоны регулярных операций, ближайшая дата и что пора провести */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId");
  await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ templates: [], today: bishkekToday() });
  const today = bishkekToday();
  const done = await doneRefs(companyId!);
  const lock = await lockedThrough(companyId!);
  const templates = (await listRecords<RecurringTemplate>(companyId!, "recurring")).map((r) => r.data)
    .map((t) => ({ ...t, next: nextRun(t, done, today), due: openRuns(dueRuns(t, done, today), lock).length, posted: [...done].filter((x) => x.startsWith(`rec:${t.id}:`)).length }))
    .sort((a, b) => a.description.localeCompare(b.description, "ru"));
  return NextResponse.json({ templates, today });
});

const Line = z.object({
  account: z.string().min(4).max(8), debit: z.number().min(0), credit: z.number().min(0),
  memo: z.string().max(200).optional().nullable(), party: z.string().trim().max(200).optional().nullable(),
  partyInn: z.string().trim().regex(/^\d{0,14}$/).optional().nullable(), item: z.string().trim().max(200).optional().nullable(),
  qty: z.number().min(0).optional().nullable(), unit: z.string().trim().max(20).optional().nullable(),
});
const Create = z.object({
  companyId: z.string().min(1),
  description: z.string().trim().min(1).max(500),
  lines: z.array(Line).min(2),
  day: z.number().int().min(1).max(31),
  from: z.string().regex(YM),
  until: z.string().regex(YM).nullable().optional(),
});

/** POST — новый шаблон. Строки проверяются так же, как обычная проводка (Дт = Кт, счета из плана). */
export const POST = route(async (req: NextRequest) => {
  const p = Create.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Проверьте шаблон: содержание, строки, число месяца");
  const { companyId, description, day, from, until } = p.data;
  await requireCompany(companyId, "edit");
  const lines = p.data.lines.map((l) => ({ ...l, debit: round2(l.debit), credit: round2(l.credit) })).filter((l) => l.debit > 0 || l.credit > 0);
  const errors = validateEntry({ date: `${from}-01`, lines });
  if (errors.length) throw new HttpError(400, errors.join("; "));
  if (until && until < from) throw new HttpError(400, "Последний месяц раньше первого");
  const me = await getCurrentUser();
  const t: RecurringTemplate = {
    id: randomUUID().slice(0, 8), description, lines, day: day > 28 ? 31 : day, from, until: until ?? null, paused: false,
    createdAt: new Date().toISOString(), createdByName: me ? me.name?.trim() || me.email : null,
  };
  await putRecord(companyId, "recurring", t.id, t);
  await logActivity("recurring_create", companyId, { description });
  return NextResponse.json(t, { status: 201 });
});

const Patch = z.object({ companyId: z.string().min(1), id: z.string().min(1), paused: z.boolean().optional(), day: z.number().int().min(1).max(31).optional(), until: z.string().regex(YM).nullable().optional() });

/** PATCH — пауза, другое число месяца, срок окончания */
export const PATCH = route(async (req: NextRequest) => {
  const p = Patch.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, id, ...change } = p.data;
  await requireCompany(companyId, "edit");
  const t = await getRecord<RecurringTemplate>(companyId, "recurring", id);
  if (!t) throw new HttpError(404, "Шаблон не найден");
  const next = { ...t, ...change, ...(change.day ? { day: change.day > 28 ? 31 : change.day } : {}) };
  await putRecord(companyId, "recurring", id, next);
  return NextResponse.json(next);
});

/** DELETE ?companyId=…&id=… — уже проведённые проводки остаются в журнале */
export const DELETE = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), id = sp.get("id");
  await requireCompany(companyId, "edit");
  if (!id) throw new HttpError(400, "id обязателен");
  await deleteRecord(companyId!, "recurring", id);
  await logActivity("recurring_delete", companyId, { id });
  return NextResponse.json({ ok: true });
});
