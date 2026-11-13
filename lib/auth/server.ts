// Access checks shared by the API routes. Every company belongs to a user;
// it is visible to its owner, to users it is shared with ("view" / "edit")
// and to the administrator. The built-in demo company is read-only for all.
import { recordError } from "@/lib/monitor/errors";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { allows, isAdmin, levelFor, type Level } from "@/lib/auth/access";
import { getCurrentUser, type CurrentUser } from "@/lib/auth/session";
import { AUTH_ON } from "@/lib/auth/mode";
import { encodeVersions, requestContext, VERSIONS_HEADER } from "@/lib/request-context";

import { HttpError } from "@/lib/http-error";
export { HttpError };

export type Access = "edit" | "view";

export async function requireUser(): Promise<CurrentUser> {
  const u = await getCurrentUser();
  if (!u) throw new HttpError(401, "Войдите в систему");
  return u;
}

export async function requireAdmin(): Promise<CurrentUser> {
  const u = await requireUser();
  if (!isAdmin(u)) throw new HttpError(403, "Доступно только администратору");
  return u;
}

/** The current user's level for a company ("none" if it does not exist or is not theirs). */
export async function companyLevel(companyId: string): Promise<Level> {
  const user = await getCurrentUser();
  if (companyId === DEMO_COMPANY.id) return levelFor(user, { ownerId: null, demo: true });
  if (!user) return "none";
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ownerId: true, access: { where: { userId: user.id }, select: { level: true } } },
  });
  if (!c) return "none";
  return levelFor(user, { ownerId: c.ownerId, sharedLevel: c.access[0]?.level ?? null });
}

/**
 * Throws unless the company exists and the current user may `need` it.
 * A company that is not the user's answers 404, so ids of other people's
 * companies cannot be probed.
 */
export async function requireCompany(companyId: string | null | undefined, need: Access): Promise<Level> {
  if (!companyId) throw new HttpError(400, "companyId обязателен");
  if (companyId === DEMO_COMPANY.id) {
    if (need === "edit") throw new HttpError(403, "Демо-компанию нельзя изменить — создайте свою компанию или копию демо");
    return "view";
  }
  if (!AUTH_ON) {
    // открытый режим: любая существующая компания доступна полностью
    const exists = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    if (!exists) throw new HttpError(404, "Компания не найдена");
    return "owner";
  }
  const user = await getCurrentUser();
  if (!user) throw new HttpError(401, "Войдите в систему, чтобы работать со своими компаниями");
  const level = await companyLevel(companyId);
  if (level === "none") throw new HttpError(404, "Компания не найдена");
  if (!allows(level, need)) throw new HttpError(403, "У вас доступ только для просмотра этой компании");
  return level;
}

const UNSAFE = new Set(["POST", "PUT", "PATCH", "DELETE"]);

/** Rejects state-changing requests sent from another site (CSRF). */
export function checkOrigin(req: Request): void {
  if (!UNSAFE.has(req.method)) return;
  const site = req.headers.get("sec-fetch-site");
  if (site === "cross-site") throw new HttpError(403, "Запрос с другого сайта отклонён");
  const origin = req.headers.get("origin");
  if (!origin) return;
  const host = req.headers.get("x-forwarded-host") ?? req.headers.get("host");
  let originHost = "";
  try { originHost = new URL(origin).host; } catch { /* malformed */ }
  if (!host || originHost !== host) throw new HttpError(403, "Запрос с другого сайта отклонён");
}

/**
 * Wraps a route handler: CSRF check; HttpError → JSON with its status; anything else → 503/500.
 * Versions of the company records the handler read or wrote go back in the X-FL-Versions header.
 */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return (...args: A): Promise<Response> => requestContext.run({ versions: new Map() }, () => handle(fn, args));
}

async function handle<A extends unknown[]>(fn: (...args: A) => Promise<Response>, args: A): Promise<Response> {
  try {
    if (args[0] instanceof Request) checkOrigin(args[0]);
    const res = await fn(...args);
    const versions = requestContext.getStore()?.versions;
    if (versions?.size) { try { res.headers.set(VERSIONS_HEADER, encodeVersions(versions)); } catch { /* immutable headers */ } }
    return res;
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    console.error(e);
    const req = args[0] instanceof Request ? args[0] : null;
    await recordError({ source: "api", message: e instanceof Error ? `${e.name}: ${e.message}` : String(e), stack: e instanceof Error ? e.stack : null, url: req ? `${req.method} ${new URL(req.url).pathname}` : null });
    const db = e instanceof Error && /prisma|database|connect|ECONN/i.test(e.message + e.constructor.name);
    return NextResponse.json({ error: db ? "База данных недоступна" : "Внутренняя ошибка сервера" }, { status: db ? 503 : 500 });
  }
}

/** Records who did what (admin panel, metrics); never breaks a request. */
export async function logActivity(action: string, companyId?: string | null, details?: Record<string, unknown>) {
  try {
    const user = await getCurrentUser();
    await prisma.activityLog.create({
      data: { action, userId: user?.id ?? null, companyId: companyId ?? null, details: (details ?? undefined) as object | undefined },
    });
  } catch {
    /* ignore */
  }
}
