// Plan limits checked on the server.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { isAdmin } from "@/lib/auth/access";
import type { CurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { cheapestWith, effectivePlan, FEATURE_LABEL, hasFeature, type Feature } from "@/lib/plans";

export async function assertCanCreateCompany(user: CurrentUser | null): Promise<void> {
  if (!AUTH_ON || !user || isAdmin(user)) return;
  const plan = effectivePlan(user.plan, user.paidUntil);
  const owned = await prisma.company.count({ where: { ownerId: user.id } });
  if (owned >= plan.companies) {
    throw new HttpError(402, `На тарифе «${plan.name}» можно вести ${plan.companies} ${plan.companies === 1 ? "компанию" : "компании"}. Перейдите на тариф выше — страница «Тарифы».`);
  }
}

/** Journal entries per company per calendar month (Bishkek time), by the owner's plan. */
export async function assertCanPost(companyId: string, adding = 1): Promise<void> {
  if (!AUTH_ON) return;
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { owner: { select: { role: true, plan: true, paidUntil: true } } } });
  if (!c?.owner || c.owner.role === "admin") return;
  const plan = effectivePlan(c.owner.plan, c.owner.paidUntil);
  if (plan.entriesPerMonth == null) return;
  const now = new Date(Date.now() + 6 * 3600 * 1000);
  const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1) - 6 * 3600 * 1000);
  const n = await prisma.journalEntry.count({ where: { companyId, createdAt: { gte: start } } });
  if (n + adding > plan.entriesPerMonth) {
    throw new HttpError(402, `Лимит тарифа «${plan.name}» — ${plan.entriesPerMonth} проводок в месяц на компанию (уже ${n}). Перейдите на тариф выше — страница «Тарифы».`);
  }
}

function denied(f: Feature): HttpError {
  const p = cheapestWith(f);
  return new HttpError(402, `«${FEATURE_LABEL[f]}» — на тарифе ${p ? `«${p.name}» и выше` : "выше текущего"}. Страница «Тарифы».`);
}

/** The signed-in user's plan has the feature (administrators always do). */
export function assertUserFeature(user: CurrentUser, f: Feature): void {
  if (!AUTH_ON || isAdmin(user)) return;
  if (!hasFeature(effectivePlan(user.plan, user.paidUntil), f)) throw denied(f);
}

/** The company owner's plan has the feature. The demo company has everything. */
export async function assertCompanyFeature(companyId: string, f: Feature): Promise<void> {
  if (!AUTH_ON || companyId === "demo") return;
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { owner: { select: { role: true, plan: true, paidUntil: true } } } });
  if (!c?.owner || c.owner.role === "admin") return;
  if (!hasFeature(effectivePlan(c.owner.plan, c.owner.paidUntil), f)) throw denied(f);
}
