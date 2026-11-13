import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireUser, route } from "@/lib/auth/server";
import { clean } from "@/lib/community/owner";
import { groupAsTeacher, referenceTurnovers } from "@/lib/study/server";
import { presetByKey } from "@/lib/study/presets";
import { companyLevel } from "@/lib/auth/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const DATE = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/study/groups/[id] — участники группы (для преподавателя). */
export const GET = route(async (_req: NextRequest, ctx: Ctx) => {
  const me = await requireUser();
  const g = await groupAsTeacher((await ctx.params).id, me);
  const members = await prisma.studyMember.findMany({ where: { groupId: g.id }, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: { createdAt: "asc" } });
  return NextResponse.json({ group: g, members: members.map((m) => m.user) });
});

/**
 * POST /api/study/groups/[id]
 *   { assignment: { preset } } — задание из пособия
 *   { assignment: { title, text, baseCompanyId?, referenceCompanyId, periodFrom, periodTo, showAnswers?, dueAt? } } — своё задание
 *   { removeMember: userId } | { deleteGroup: true } | { deleteAssignment: id } | { refreshKey: assignmentId, referenceCompanyId }
 */
export const POST = route(async (req: NextRequest, ctx: Ctx) => {
  const me = await requireUser();
  const g = await groupAsTeacher((await ctx.params).id, me);
  const b = await req.json().catch(() => ({}));
  if (b.deleteGroup === true) { await prisma.studyGroup.delete({ where: { id: g.id } }); return NextResponse.json({ ok: true }); }
  if (typeof b.removeMember === "string") { await prisma.studyMember.deleteMany({ where: { groupId: g.id, userId: b.removeMember } }); return NextResponse.json({ ok: true }); }
  if (typeof b.deleteAssignment === "string") { await prisma.assignment.deleteMany({ where: { id: b.deleteAssignment, groupId: g.id } }); return NextResponse.json({ ok: true }); }

  const mine = async (companyId: unknown, what: string) => {
    if (typeof companyId !== "string" || !companyId) throw new HttpError(400, `Выберите ${what}`);
    if ((await companyLevel(companyId)) !== "edit") throw new HttpError(403, `Нет доступа к компании: ${what}`);
    return companyId;
  };
  if (typeof b.refreshKey === "string") {
    const a = await prisma.assignment.findFirst({ where: { id: b.refreshKey, groupId: g.id } });
    if (!a || a.preset) throw new HttpError(400, "Эталон встроенного задания обновлять не нужно");
    const key = await referenceTurnovers(await mine(b.referenceCompanyId, "эталонную компанию"), a.periodFrom, a.periodTo);
    await prisma.assignment.update({ where: { id: a.id }, data: { key } });
    return NextResponse.json({ ok: true, accounts: Object.keys(key).length });
  }
  const x = b.assignment;
  if (!x || typeof x !== "object") throw new HttpError(400, "Неизвестное действие");
  const dueAt = typeof x.dueAt === "string" && DATE.test(x.dueAt) ? new Date(`${x.dueAt}T23:59:00+06:00`) : null;
  const preset = presetByKey(x.preset);
  if (preset) {
    const a = await prisma.assignment.create({ data: { groupId: g.id, title: preset.title, text: preset.text, preset: preset.key, periodFrom: preset.periodFrom, periodTo: preset.periodTo, key: preset.turnovers, showAnswers: x.showAnswers === true, dueAt } });
    return NextResponse.json(a, { status: 201 });
  }
  const title = clean(x.title, 160), text = clean(x.text, 8000);
  if (!title || !text) throw new HttpError(400, "Укажите название и текст задания");
  if (!DATE.test(x.periodFrom ?? "") || !DATE.test(x.periodTo ?? "") || x.periodFrom > x.periodTo) throw new HttpError(400, "Укажите период проверки");
  const base = x.baseCompanyId ? await mine(x.baseCompanyId, "стартовую компанию") : null;
  const key = await referenceTurnovers(await mine(x.referenceCompanyId, "эталонную компанию"), x.periodFrom, x.periodTo);
  if (!Object.keys(key).length) throw new HttpError(400, "В эталонной компании нет операций за этот период — сначала решите задание в ней сами");
  const a = await prisma.assignment.create({ data: { groupId: g.id, title, text, baseCompanyId: base, periodFrom: x.periodFrom, periodTo: x.periodTo, key, showAnswers: x.showAnswers === true, dueAt } });
  return NextResponse.json(a, { status: 201 });
});
