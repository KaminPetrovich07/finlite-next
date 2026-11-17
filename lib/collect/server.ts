// Server side of report collection (сбор отчётности): права, сборы, отчёты предприятий, напоминания.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { isAdmin } from "@/lib/auth/access";
import { requireCompany } from "@/lib/auth/server";
import { companiesOfSegment, listGrants } from "@/lib/access/segments";
import { putRecord } from "@/lib/records";
import { diagnoseReported, type Values } from "@/lib/reported/reported";
import { scoreCompany, type Band } from "@/lib/portfolio/score";
import { emailReady, sendEmail } from "@/lib/notify/send";
import { blockingIssues, campaignStats, cleanValues, isIn, reminderKind, type RowStatus, type SubStatus } from "./collect";

export const todayKg = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);

export async function me(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Войдите в систему");
  return u;
}

/** Группы, по которым пользователь может объявлять сбор: администратор — все, ведомство — свои. */
export async function organizerSegments(u: CurrentUser): Promise<string[]> {
  if (isAdmin(u)) {
    const rows = await prisma.companyRecord.findMany({ where: { kind: "profile", key: "main" }, select: { data: true } });
    return [...new Set(rows.map((r) => String((r.data as { segment?: string })?.segment ?? "").trim()).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru"));
  }
  return [...new Set((await listGrants()).filter((g) => g.userId === u.id).map((g) => g.segment))].sort((a, b) => a.localeCompare(b, "ru"));
}

export async function requireOrganizer(segment: string): Promise<CurrentUser> {
  const u = await me();
  if (!(await organizerSegments(u)).includes(segment)) throw new HttpError(403, "Сбор по этой группе может вести только ведомство группы или администратор");
  return u;
}

async function campaignOr404(id: string) {
  const c = await prisma.reportCampaign.findUnique({ where: { id } });
  if (!c) throw new HttpError(404, "Сбор не найден");
  return c;
}

/** Компании группы с названиями. */
async function segmentCompanies(segment: string) {
  const ids = await companiesOfSegment(segment);
  return prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true, name: true, inn: true }, orderBy: { name: "asc" } });
}

/** Компании, за которые пользователь сдаёт отчёт: свои и с правом изменения. */
async function myEditableIds(u: CurrentUser): Promise<Set<string>> {
  const rows = await prisma.company.findMany({ where: { OR: [{ ownerId: u.id }, { access: { some: { userId: u.id, level: "edit" } } }] }, select: { id: true } });
  return new Set(rows.map((r) => r.id));
}

export async function overview() {
  const u = await me();
  const today = todayKg();
  const segs = await organizerSegments(u);
  const campaigns = await prisma.reportCampaign.findMany({ where: { segment: { in: segs } }, orderBy: [{ closedAt: "asc" }, { deadline: "desc" }], include: { submissions: { select: { companyId: true, status: true } } } });
  const organized = [];
  for (const c of campaigns) {
    const ids = await companiesOfSegment(c.segment);
    const by = new Map(c.submissions.map((s) => [s.companyId, s.status as RowStatus]));
    organized.push({ id: c.id, title: c.title, segment: c.segment, periodEnd: c.periodEnd, deadline: c.deadline, closed: !!c.closedAt, stats: campaignStats(ids.map((id) => ({ status: by.get(id) ?? "none" })), c.deadline, today) });
  }
  // мои отчёты: открытые сборы по группам, где у меня есть компании с правом изменения
  const mine: Array<{ campaignId: string; title: string; deadline: string; periodEnd: string; companyId: string; companyName: string; status: RowStatus; returnReason: string | null }> = [];
  const editable = await myEditableIds(u);
  if (editable.size) {
    const profiles = await prisma.companyRecord.findMany({ where: { kind: "profile", key: "main", companyId: { in: [...editable] } }, select: { companyId: true, data: true } });
    const segOf = new Map(profiles.map((p) => [p.companyId, String((p.data as { segment?: string })?.segment ?? "")]));
    const open = await prisma.reportCampaign.findMany({ where: { closedAt: null, segment: { in: [...new Set(segOf.values())].filter(Boolean) } }, orderBy: { deadline: "asc" } });
    const companies = await prisma.company.findMany({ where: { id: { in: [...editable] } }, select: { id: true, name: true } });
    const subs = await prisma.reportSubmission.findMany({ where: { campaignId: { in: open.map((c) => c.id) }, companyId: { in: [...editable] } }, select: { campaignId: true, companyId: true, status: true, returnReason: true } });
    for (const c of open) for (const co of companies) if (segOf.get(co.id) === c.segment) {
      const s = subs.find((x) => x.campaignId === c.id && x.companyId === co.id);
      mine.push({ campaignId: c.id, title: c.title, deadline: c.deadline, periodEnd: c.periodEnd, companyId: co.id, companyName: co.name, status: (s?.status as RowStatus) ?? "none", returnReason: s?.returnReason ?? null });
    }
  }
  return { segments: segs, campaigns: organized, mine, today };
}

export async function createCampaign(input: { title: string; segment: string; periodEnd: string; deadline: string; note?: string }) {
  const u = await requireOrganizer(input.segment);
  if (input.deadline < input.periodEnd) throw new HttpError(400, "Срок сдачи не может быть раньше окончания периода");
  const dup = await prisma.reportCampaign.findFirst({ where: { segment: input.segment, periodEnd: input.periodEnd, closedAt: null } });
  if (dup) throw new HttpError(409, "Сбор за этот период по этой группе уже идёт");
  return prisma.reportCampaign.create({ data: { ...input, note: input.note || null, createdBy: u.id } });
}

/** Сводная таблица сбора для ведомства: каждое предприятие группы, статус, подписант, оценка по сданным цифрам. */
export async function board(id: string) {
  const c = await campaignOr404(id);
  await requireOrganizer(c.segment);
  const today = todayKg();
  const companies = await segmentCompanies(c.segment);
  const subs = await prisma.reportSubmission.findMany({ where: { campaignId: id } });
  const rows = companies.map((co) => {
    const s = subs.find((x) => x.companyId === co.id);
    const status = (s?.status as RowStatus) ?? "none";
    let band: Band | null = null, score: number | null = null, verdict: string | null = null;
    if (s && isIn(status) && s.values) {
      const d = diagnoseReported([{ date: c.periodEnd, values: s.values as Values }], c.periodEnd, 2);
      if (d) { const sc = scoreCompany(d, null); score = sc.score; const rank = { ok: 0, watch: 1, risk: 2 }; band = rank[d.verdict.level] > rank[sc.band] ? d.verdict.level : sc.band; verdict = d.verdict.title; }
    }
    return { companyId: co.id, name: co.name, inn: co.inn, status, submittedAt: s?.submittedAt ?? null, signer: s?.signerName ? `${s.signerName}${s.signerTitle ? `, ${s.signerTitle}` : ""}` : null, returnReason: s?.returnReason ?? null, updatedAt: s?.updatedAt ?? null, score, band, verdict };
  });
  return { campaign: c, rows, stats: campaignStats(rows, c.deadline, today), today };
}

/** Отчёт предприятия: ведомство видит любой отчёт группы, предприятие — свой. */
export async function getReport(id: string, companyId: string) {
  const c = await campaignOr404(id);
  const u = await me();
  const organizer = (await organizerSegments(u)).includes(c.segment);
  if (!(await companiesOfSegment(c.segment)).includes(companyId)) throw new HttpError(404, "Предприятие не входит в группу этого сбора");
  let level: string = "none";
  try { level = await requireCompany(companyId, "view"); } catch (e) { if (!organizer) throw e; }
  const canEdit = level === "owner" || level === "edit";
  const company = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true, name: true, inn: true } });
  const s = await prisma.reportSubmission.findUnique({ where: { campaignId_companyId: { campaignId: id, companyId } } });
  // прошлый период — для сравнения при заполнении
  const prev = await prisma.companyRecord.findFirst({ where: { companyId, kind: "reported", key: { lt: c.periodEnd } }, orderBy: { key: "desc" }, select: { key: true, data: true } });
  const status = (s?.status as RowStatus) ?? "none";
  return {
    campaign: c, company, organizer, status,
    values: (s?.values as Values) ?? {}, signerName: s?.signerName ?? "", signerTitle: s?.signerTitle ?? "",
    submittedAt: s?.submittedAt ?? null, returnReason: s?.returnReason ?? null,
    previous: prev ? { date: prev.key, values: ((prev.data as { values?: Values })?.values ?? {}) } : null,
    canFill: canEdit && !c.closedAt && (status === "none" || status === "draft" || status === "returned"),
    canReview: organizer && (status === "submitted" || status === "accepted"),
  };
}

async function requireFill(id: string, companyId: string) {
  const c = await campaignOr404(id);
  if (c.closedAt) throw new HttpError(409, "Сбор закрыт");
  if (!(await companiesOfSegment(c.segment)).includes(companyId)) throw new HttpError(404, "Предприятие не входит в группу этого сбора");
  await requireCompany(companyId, "edit");
  const s = await prisma.reportSubmission.findUnique({ where: { campaignId_companyId: { campaignId: id, companyId } } });
  if (s && (s.status === "submitted" || s.status === "accepted")) throw new HttpError(409, "Отчёт уже сдан. Изменить его можно, только если ведомство вернёт его на доработку");
  return { c, s };
}

export async function saveDraft(id: string, companyId: string, raw: unknown) {
  const { s } = await requireFill(id, companyId);
  const values = cleanValues(raw);
  await prisma.reportSubmission.upsert({
    where: { campaignId_companyId: { campaignId: id, companyId } },
    create: { campaignId: id, companyId, status: "draft", values: values as object },
    update: { values: values as object, status: s?.status === "returned" ? "returned" : "draft" },
  });
  return values;
}

export async function submitReport(id: string, companyId: string, raw: unknown, signer: { name: string; title: string }) {
  const { c } = await requireFill(id, companyId);
  const u = await me();
  const values = cleanValues(raw);
  const issues = blockingIssues(values, c.periodEnd);
  if (issues.length) return { ok: false as const, issues };
  await prisma.reportSubmission.upsert({
    where: { campaignId_companyId: { campaignId: id, companyId } },
    create: { campaignId: id, companyId, status: "submitted", values: values as object, signerName: signer.name, signerTitle: signer.title, submittedAt: new Date(), submittedBy: u.id },
    update: { status: "submitted", values: values as object, signerName: signer.name, signerTitle: signer.title, submittedAt: new Date(), submittedBy: u.id, returnReason: null },
  });
  // сданные цифры — в отчётность компании: портфель и диагностика видят их сразу
  await putRecord(companyId, "reported", c.periodEnd, { values, source: `collect:${id}` });
  return { ok: true as const, issues: [] };
}

export async function review(id: string, companyId: string, action: "return" | "accept", reason: string) {
  const c = await campaignOr404(id);
  const u = await requireOrganizer(c.segment);
  const s = await prisma.reportSubmission.findUnique({ where: { campaignId_companyId: { campaignId: id, companyId } } });
  if (!s || !isIn(s.status as RowStatus)) throw new HttpError(409, "Отчёт ещё не сдан");
  if (action === "return" && !reason.trim()) throw new HttpError(400, "Укажите, что исправить");
  await prisma.reportSubmission.update({ where: { id: s.id }, data: { status: (action === "return" ? "returned" : "accepted") as SubStatus, returnReason: action === "return" ? reason.trim() : null, reviewedAt: new Date(), reviewedBy: u.id } });
  if (action === "return") await notifyCompany(companyId, `FinLite: отчёт возвращён на доработку — ${c.title}`, `Ведомство вернуло отчёт на доработку.\n\nЧто исправить: ${reason.trim()}\n\nСрок сдачи: ${c.deadline.split("-").reverse().join(".")}.`);
}

export async function closeCampaign(id: string, close: boolean) {
  const c = await campaignOr404(id);
  await requireOrganizer(c.segment);
  await prisma.reportCampaign.update({ where: { id }, data: { closedAt: close ? new Date() : null } });
}

/** E-mail владельцу и пользователям с правом изменения (если почта настроена). */
async function notifyCompany(companyId: string, subject: string, text: string): Promise<number> {
  if (!emailReady()) return 0;
  const co = await prisma.company.findUnique({ where: { id: companyId }, select: { name: true, owner: { select: { email: true } }, access: { where: { level: "edit" }, select: { user: { select: { email: true } } } } } });
  const to = [...new Set([co?.owner?.email, ...(co?.access ?? []).map((a) => a.user.email)].filter((x): x is string => !!x))];
  if (!to.length) return 0;
  const site = process.env.FL_SITE_URL ? `\n\nОткрыть: ${process.env.FL_SITE_URL.replace(/\/$/, "")}/collect` : "";
  await sendEmail(to, subject, `${co?.name ?? ""}\n\n${text}${site}`).catch(() => undefined);
  return to.length;
}

/** Ежедневные напоминания (cron): за 3 дня, в день срока и на следующий день — тем, кто не сдал. */
export async function sendReminders(today = todayKg()): Promise<{ campaigns: number; companies: number; emails: number }> {
  const open = await prisma.reportCampaign.findMany({ where: { closedAt: null }, include: { submissions: { select: { companyId: true, status: true } } } });
  let companies = 0, emails = 0, campaigns = 0;
  for (const c of open) {
    const kind = reminderKind(c.deadline, today);
    if (!kind) continue;
    campaigns++;
    const done = new Set(c.submissions.filter((s) => isIn(s.status as RowStatus)).map((s) => s.companyId));
    const when = c.deadline.split("-").reverse().join(".");
    const line = kind === "soon" ? `Срок сдачи — ${when}, осталось 3 дня.` : kind === "today" ? `Сегодня последний день сдачи (${when}).` : `Срок сдачи прошёл ${when}, отчёт не сдан.`;
    for (const id of await companiesOfSegment(c.segment)) if (!done.has(id)) { companies++; emails += await notifyCompany(id, `FinLite: ${c.title}`, `${line}\nОтчёт заполняется в разделе «Сбор отчётности» или загрузкой Excel по шаблону.`); }
  }
  return { campaigns, companies, emails };
}

/** Демо: часть предприятий демо-группы «сдала» отчёт из своих загруженных цифр, одно заполняет, одно не начинало. */
export async function demoFill(id: string) {
  const c = await campaignOr404(id);
  const u = await requireOrganizer(c.segment);
  if (!/\(демо\)/.test(c.segment)) throw new HttpError(400, "Демо-статусы — только для демо-группы");
  const companies = await segmentCompanies(c.segment);
  let i = 0;
  for (const co of companies) {
    const rec = await prisma.companyRecord.findFirst({ where: { companyId: co.id, kind: "reported", key: { lte: c.periodEnd } }, orderBy: { key: "desc" }, select: { data: true } });
    const values = cleanValues((rec?.data as { values?: Values })?.values);
    const mode = i % 4; i++;
    if (!Object.keys(values).length || mode === 3) continue; // не начинало
    if (mode === 2) { await prisma.reportSubmission.upsert({ where: { campaignId_companyId: { campaignId: id, companyId: co.id } }, create: { campaignId: id, companyId: co.id, status: "draft", values: { cash: values.cash ?? 0 } }, update: {} }); continue; }
    const status: SubStatus = mode === 0 ? "accepted" : "submitted";
    await prisma.reportSubmission.upsert({
      where: { campaignId_companyId: { campaignId: id, companyId: co.id } },
      create: { campaignId: id, companyId: co.id, status, values: values as object, signerName: "Асанова А. (демо)", signerTitle: "главный бухгалтер", submittedAt: new Date(), submittedBy: u.id, ...(status === "accepted" ? { reviewedAt: new Date(), reviewedBy: u.id } : {}) },
      update: {},
    });
  }
}
