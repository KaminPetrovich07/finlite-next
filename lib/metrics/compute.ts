// Pilot metrics computed from plain arrays (no database) — the admin API feeds
// it rows, the tests feed it synthetic data. Days and weeks are in Bishkek time.

export interface MetricsInput {
  now: Date;
  users: Array<{ id: string; createdAt: Date; role?: string }>;
  /** one row per user per day the user was active (ActivityLog "active_day", "login", "register" …) */
  activity: Array<{ userId: string; at: Date; action: string }>;
  companies: Array<{ ownerId: string | null; createdAt: Date }>;
  entriesByCompanyOwner: Array<{ ownerId: string | null; count: number }>;
}

export interface Metrics {
  users: number;
  newUsers7: number;
  dau: number;
  wau: number;
  mau: number;
  stickiness: number | null; // DAU/MAU
  daily: Array<{ day: string; active: number; registered: number }>;
  cohorts: Array<{ week: string; size: number; retention: Array<number | null> }>;
  funnel: Array<{ step: string; users: number; share: number }>;
}

const OFFSET = 6 * 3600 * 1000;
const DAY = 24 * 3600 * 1000;
export const OUTPUT_ACTIONS = new Set(["export", "policy_export", "primary_export", "costing_export", "counterparties_export", "taxreports_export", "export1c"]);

export const dayOf = (d: Date) => new Date(d.getTime() + OFFSET).toISOString().slice(0, 10);
/** Monday of the week (Bishkek time) as YYYY-MM-DD */
export function weekOf(d: Date): string {
  const local = new Date(d.getTime() + OFFSET);
  const dow = (local.getUTCDay() + 6) % 7;
  return new Date(Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate() - dow)).toISOString().slice(0, 10);
}
const addDays = (day: string, n: number) => new Date(Date.parse(day + "T00:00:00Z") + n * DAY).toISOString().slice(0, 10);

export function computeMetrics(inp: MetricsInput, cohortWeeks = 8): Metrics {
  const users = inp.users.filter((u) => u.role !== "admin");
  const ids = new Set(users.map((u) => u.id));
  const today = dayOf(inp.now);

  // active days per user (registration counts as activity)
  const days = new Map<string, Set<string>>();
  const mark = (uid: string, d: string) => { if (!ids.has(uid)) return; if (!days.has(uid)) days.set(uid, new Set()); days.get(uid)!.add(d); };
  for (const u of users) mark(u.id, dayOf(u.createdAt));
  for (const a of inp.activity) mark(a.userId, dayOf(a.at));

  const activeWithin = (n: number) => {
    const from = addDays(today, -(n - 1));
    let c = 0;
    for (const set of days.values()) if ([...set].some((d) => d >= from && d <= today)) c++;
    return c;
  };
  const dau = activeWithin(1), wau = activeWithin(7), mau = activeWithin(30);

  const daily: Metrics["daily"] = [];
  for (let i = 29; i >= 0; i--) {
    const d = addDays(today, -i);
    let active = 0;
    for (const set of days.values()) if (set.has(d)) active++;
    daily.push({ day: d, active, registered: users.filter((u) => dayOf(u.createdAt) === d).length });
  }

  // weekly cohorts: share of the cohort active in week k after registration
  const thisWeek = weekOf(inp.now);
  const cohorts: Metrics["cohorts"] = [];
  for (let w = cohortWeeks - 1; w >= 0; w--) {
    const week = addDays(thisWeek, -7 * w);
    const members = users.filter((u) => weekOf(u.createdAt) === week);
    const retention: Array<number | null> = [];
    for (let k = 0; k < cohortWeeks; k++) {
      const start = addDays(week, 7 * k);
      if (start > thisWeek) { retention.push(null); continue; }
      const end = addDays(start, 6);
      const active = members.filter((m) => [...(days.get(m.id) ?? [])].some((d) => d >= start && d <= end)).length;
      retention.push(members.length ? active / members.length : null);
    }
    cohorts.push({ week, size: members.length, retention });
  }

  // funnel
  const withCompany = new Set(inp.companies.map((c) => c.ownerId).filter((x): x is string => !!x && ids.has(x)));
  const entries = new Map<string, number>();
  for (const e of inp.entriesByCompanyOwner) if (e.ownerId && ids.has(e.ownerId)) entries.set(e.ownerId, (entries.get(e.ownerId) ?? 0) + e.count);
  const working = [...entries.entries()].filter(([, n]) => n >= 10).length;
  const output = new Set(inp.activity.filter((a) => OUTPUT_ACTIONS.has(a.action) && ids.has(a.userId)).map((a) => a.userId));
  const returned = [...days.entries()].filter(([uid, set]) => {
    const u = users.find((x) => x.id === uid)!;
    const reg = dayOf(u.createdAt);
    return [...set].some((d) => d >= addDays(reg, 7));
  }).length;
  const total = users.length;
  const share = (n: number) => (total ? n / total : 0);
  const funnel = [
    { step: "Зарегистрировались", users: total },
    { step: "Создали компанию", users: withCompany.size },
    { step: "Внесли 10+ проводок", users: working },
    { step: "Выгрузили отчёт или документ", users: output.size },
    { step: "Вернулись через неделю и позже", users: returned },
  ].map((f) => ({ ...f, share: share(f.users) }));

  const weekAgo = inp.now.getTime() - 7 * DAY;
  return {
    users: total,
    newUsers7: users.filter((u) => u.createdAt.getTime() >= weekAgo).length,
    dau, wau, mau, stickiness: mau ? dau / mau : null,
    daily, cohorts, funnel,
  };
}
