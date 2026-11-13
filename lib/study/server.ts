// Сервер учебного режима: эталон из компании преподавателя, старт работы студента, проверка.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { loadEntries } from "@/lib/ledger/repo";
import { createDemoCopy } from "@/lib/ledger/demo-copy";
import { exportCompany, importCompany, readBackupBytes } from "@/lib/backup/server";
import { compare, turnovers, type CheckResult, type Turnovers } from "./check";

export async function referenceTurnovers(companyId: string, from: string, to: string): Promise<Turnovers> {
  return turnovers(await loadEntries(companyId, to), from, to);
}

/** Преподаватель — владелец группы (или администратор). */
export async function groupAsTeacher(groupId: string, user: { id: string; role: string }) {
  const g = await prisma.studyGroup.findUnique({ where: { id: groupId } });
  if (!g || (g.ownerId !== user.id && user.role !== "admin")) throw new HttpError(404, "Группа не найдена");
  return g;
}

export async function assignmentFor(id: string, user: { id: string; role: string }) {
  const a = await prisma.assignment.findUnique({ where: { id }, include: { group: { select: { id: true, name: true, ownerId: true } } } });
  if (!a) throw new HttpError(404, "Задание не найдено");
  const teacher = a.group.ownerId === user.id || user.role === "admin";
  const member = teacher || !!(await prisma.studyMember.findUnique({ where: { groupId_userId: { groupId: a.groupId, userId: user.id } } }));
  if (!member) throw new HttpError(404, "Задание не найдено");
  return { a, teacher };
}

/** Студент начинает задание: своя копия стартовой компании, преподаватель получает к ней просмотр. */
export async function startSubmission(assignmentId: string, user: { id: string; name: string | null; email: string }) {
  const existing = await prisma.submission.findUnique({ where: { assignmentId_userId: { assignmentId, userId: user.id } } });
  if (existing) return existing;
  const a = await prisma.assignment.findUniqueOrThrow({ where: { id: assignmentId }, include: { group: true } });
  const who = user.name?.trim() || user.email.split("@")[0];
  const name = `${a.title.slice(0, 60)} — ${who}`;
  const company = a.baseCompanyId
    ? await (async () => { const { gz } = await exportCompany(a.baseCompanyId!); return importCompany(readBackupBytes(gz), user.id, name); })()
    : await createDemoCopy(user.id, name);
  if (a.group.ownerId !== user.id) {
    await prisma.companyAccess.upsert({ where: { companyId_userId: { companyId: company.id, userId: a.group.ownerId } }, create: { companyId: company.id, userId: a.group.ownerId, level: "view" }, update: {} });
  }
  return prisma.submission.create({ data: { assignmentId, userId: user.id, companyId: company.id } });
}

export async function checkSubmission(submissionId: string): Promise<CheckResult> {
  const s = await prisma.submission.findUniqueOrThrow({ where: { id: submissionId }, include: { assignment: true } });
  const a = s.assignment;
  const result = compare(a.key as Turnovers, await referenceTurnovers(s.companyId, a.periodFrom, a.periodTo));
  await prisma.submission.update({ where: { id: s.id }, data: { score: result.score, result: result as object, checks: { increment: 1 }, checkedAt: new Date() } });
  return result;
}
