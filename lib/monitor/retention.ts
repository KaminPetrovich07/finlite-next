// ════════════════════════════════════════════════════════════════════════
// lib/monitor/retention.ts — что и сколько хранить из служебного.
//
// Учёт (проводки, документы, история изменений журнала, сканы) не трогается
// никогда. Чистится только то, что копится само:
//   • журнал входов и «был на сайте» — 150 дней (метрикам нужно 120),
//     остальные действия пользователей — 400 дней;
//   • ошибки сайта: исправленные — 30 дней, любые — 90 дней с последнего раза;
//   • новости из автосбора старше года (кроме закреплённых и новостей о законах);
//   • истёкшие сессии и ссылки сброса пароля;
//   • редакции законов сверх трёх последних на документ.
// ════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db";

const DAY = 24 * 3600 * 1000;
export const KEEP_EDITIONS = 3;

export const RETENTION = {
  visitsDays: 150,
  activityDays: 400,
  resolvedErrorsDays: 30,
  errorsDays: 90,
  autoNewsDays: 365,
} as const;

export const VISIT_ACTIONS = ["active_day", "login", "login_failed"];

export function cutoffs(now: Date) {
  const ago = (d: number) => new Date(now.getTime() - d * DAY);
  return {
    visits: ago(RETENTION.visitsDays),
    activity: ago(RETENTION.activityDays),
    resolvedErrors: ago(RETENTION.resolvedErrorsDays),
    errors: ago(RETENTION.errorsDays),
    autoNews: ago(RETENTION.autoNewsDays),
  };
}

/** id редакций, которые лишние: у каждого документа остаются KEEP самых новых. */
export function extraEditions(rows: Array<{ id: string; docId: string; createdAt: Date }>, keep = KEEP_EDITIONS): string[] {
  const byDoc = new Map<string, typeof rows>();
  for (const r of rows) (byDoc.get(r.docId) ?? byDoc.set(r.docId, []).get(r.docId)!).push(r);
  const out: string[] = [];
  for (const list of byDoc.values()) {
    list.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    out.push(...list.slice(keep).map((r) => r.id));
  }
  return out;
}

export interface PruneResult { activity: number; errors: number; news: number; sessions: number; resets: number; editions: number }

export async function pruneOld(now = new Date()): Promise<PruneResult> {
  const c = cutoffs(now);
  const n = async (p: Promise<{ count: number }>) => (await p.catch(() => ({ count: 0 }))).count;
  const activity = await n(prisma.activityLog.deleteMany({ where: { OR: [{ action: { in: VISIT_ACTIONS }, createdAt: { lt: c.visits } }, { createdAt: { lt: c.activity } }] } }));
  const errors = await n(prisma.errorEvent.deleteMany({ where: { OR: [{ resolved: true, lastAt: { lt: c.resolvedErrors } }, { lastAt: { lt: c.errors } }] } }));
  const news = await n(prisma.post.deleteMany({ where: { auto: true, pinned: false, kind: { not: "law" }, createdAt: { lt: c.autoNews } } }));
  const sessions = await n(prisma.session.deleteMany({ where: { expiresAt: { lt: now } } }));
  const resets = await n(prisma.passwordReset.deleteMany({ where: { expiresAt: { lt: now } } }));
  let editions = 0;
  const eds = await prisma.legalEdition.findMany({ select: { id: true, docId: true, createdAt: true } }).catch(() => []);
  const extra = extraEditions(eds);
  if (extra.length) editions = await n(prisma.legalEdition.deleteMany({ where: { id: { in: extra } } }));
  return { activity, errors, news, sessions, resets, editions };
}

const TABLE_OF: Record<keyof PruneResult, string> = {
  activity: "ActivityLog", errors: "ErrorEvent", news: "Post", sessions: "Session", resets: "PasswordReset", editions: "LegalEdition",
};

/**
 * После удаления Postgres оставляет место за таблицей (оно переиспользуется новыми записями,
 * но размер базы не уменьшается). VACUUM FULL переписывает таблицу и отдаёт место — только
 * для служебных таблиц, где что-то удалили; таблица на секунды блокируется.
 */
export async function compact(r: PruneResult, extra: string[] = []): Promise<string[]> {
  const tables = new Set<string>(extra);
  for (const [k, v] of Object.entries(r) as Array<[keyof PruneResult, number]>) if (v > 0) tables.add(TABLE_OF[k]);
  const done: string[] = [];
  for (const t of tables) {
    if (!/^[A-Za-z]+$/.test(t)) continue;
    try { await prisma.$executeRawUnsafe(`VACUUM FULL "${t}"`); done.push(t); } catch { /* нет места на копию или нет прав — пропустить */ }
  }
  return done;
}
