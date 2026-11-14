// Переход из открытого режима ко входу по паролю.
//  • Пилот: пока он идёт, каждый новый пользователь получает тариф «Пилот» до даты окончания.
//  • Передача компаний: администратор назначает владельца по e-mail, даже если человек ещё не
//    зарегистрирован, — компании переходят к нему при регистрации или следующем входе.
// Обе настройки хранятся в AppSetting, схема базы не меняется.
import { prisma } from "@/lib/db";
import { normalizeEmail } from "@/lib/auth/tokens";

const PILOT_KEY = "auth:pilot";
const PENDING_KEY = "auth:pendingOwners";

export type PilotSettings = { until: string | null };

async function read<T>(key: string, fallback: T): Promise<T> {
  const r = await prisma.appSetting.findUnique({ where: { key } }).catch(() => null);
  return r ? (r.value as T) : fallback;
}
async function write(key: string, value: unknown) {
  await prisma.appSetting.upsert({ where: { key }, create: { key, value: value as object }, update: { value: value as object } });
}

/** End of the given day in Bishkek (UTC+6), as a Date. */
export function endOfDayBishkek(day: string): Date {
  return new Date(`${day}T23:59:59.999+06:00`);
}

export async function pilotSettings(): Promise<PilotSettings> {
  const v = await read<Partial<PilotSettings>>(PILOT_KEY, {});
  return { until: typeof v.until === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v.until) ? v.until : null };
}
export async function savePilot(until: string | null) {
  await write(PILOT_KEY, { until });
}
/** The plan a new account gets: «Пилот» until the pilot's end, otherwise free. */
export function planForNewUser(p: PilotSettings, now = new Date()): { plan: string; paidUntil: Date | null; planNote: string | null } {
  if (!p.until) return { plan: "free", paidUntil: null, planNote: null };
  const end = endOfDayBishkek(p.until);
  if (end.getTime() < now.getTime()) return { plan: "free", paidUntil: null, planNote: null };
  return { plan: "pilot", paidUntil: end, planNote: `Пилот до ${p.until.split("-").reverse().join(".")} — выдан при регистрации` };
}

/** companyId → e-mail of the future owner */
export async function pendingOwners(): Promise<Record<string, string>> {
  const v = await read<Record<string, unknown>>(PENDING_KEY, {});
  return Object.fromEntries(Object.entries(v ?? {}).filter((e): e is [string, string] => typeof e[1] === "string"));
}
async function savePending(p: Record<string, string>) { await write(PENDING_KEY, p); }

/**
 * Assigns companies to the owner with this e-mail: at once if the account exists, otherwise on registration.
 * Returns how many were moved now and how many wait.
 */
export async function assignOwners(companyIds: string[], rawEmail: string): Promise<{ now: number; pending: number; email: string }> {
  const email = normalizeEmail(rawEmail);
  const ids = [...new Set(companyIds)];
  const existing = (await prisma.company.findMany({ where: { id: { in: ids } }, select: { id: true } })).map((c) => c.id);
  const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  const pending = await pendingOwners();
  if (user) {
    await prisma.company.updateMany({ where: { id: { in: existing } }, data: { ownerId: user.id } });
    await prisma.companyAccess.deleteMany({ where: { companyId: { in: existing }, userId: user.id } });
    for (const id of existing) delete pending[id];
    await savePending(pending);
    return { now: existing.length, pending: 0, email };
  }
  for (const id of existing) pending[id] = email;
  await savePending(pending);
  return { now: 0, pending: existing.length, email };
}

/** Drops a waiting assignment (the owner was set directly). */
export async function clearPending(companyIds: string[]) {
  const p = await pendingOwners();
  let changed = false;
  for (const id of companyIds) if (id in p) { delete p[id]; changed = true; }
  if (changed) await savePending(p);
}

/** On registration and sign-in: companies waiting for this e-mail become the user's. */
export async function claimPending(user: { id: string; email: string }): Promise<number> {
  const p = await pendingOwners();
  const email = normalizeEmail(user.email);
  const ids = Object.entries(p).filter(([, e]) => e === email).map(([id]) => id);
  if (!ids.length) return 0;
  const r = await prisma.company.updateMany({ where: { id: { in: ids } }, data: { ownerId: user.id } });
  await prisma.companyAccess.deleteMany({ where: { companyId: { in: ids }, userId: user.id } });
  for (const id of ids) delete p[id];
  await savePending(p);
  await prisma.activityLog.create({ data: { userId: user.id, action: "companies_claimed", details: { count: r.count } } }).catch(() => undefined);
  return r.count;
}
