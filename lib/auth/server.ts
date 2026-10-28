// Server-side auth: who is calling, what may they do with a company.
// Every API route goes through these helpers; proxy.ts only does the quick
// "is there a valid cookie" redirect for pages.
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { authEnabled, isRole, SESSION_COOKIE, verifySession, type Role } from "./session";

export interface SessionUser {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  /** sign-in is switched off: one shared workspace, everything open */
  public?: boolean;
}

/** The caller when sign-in is off (AUTH_ENABLED not set). */
export const PUBLIC_USER: SessionUser = { id: "public", email: "", name: null, role: "full", public: true };

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Access = "edit" | "view";

/** The signed-in user, re-read from the database (role and block apply at once). */
export async function currentUser(): Promise<SessionUser | null> {
  if (!authEnabled()) return PUBLIC_USER;
  const jar = await cookies();
  const id = await verifySession(jar.get(SESSION_COOKIE)?.value);
  if (!id) return null;
  const u = await prisma.user.findUnique({ where: { id }, select: { id: true, email: true, name: true, role: true, blocked: true } });
  if (!u || u.blocked) return null;
  return { id: u.id, email: u.email, name: u.name, role: isRole(u.role) ? u.role : "limited" };
}

export async function requireUser(): Promise<SessionUser> {
  const u = await currentUser();
  if (!u) throw new HttpError(401, "Войдите в систему");
  return u;
}

export async function requireAdmin(): Promise<SessionUser> {
  const u = await requireUser();
  if (u.public) throw new HttpError(403, "Вход в систему отключён — админ-панель недоступна");
  if (u.role !== "admin") throw new HttpError(403, "Доступно только администратору");
  return u;
}

/** Users with limited access never edit, whatever a company share says. */
export async function companyAccess(user: SessionUser, companyId: string): Promise<Access | null> {
  if (companyId === DEMO_COMPANY.id) return "view";
  if (user.public) {
    const exists = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
    return exists ? "edit" : null;
  }
  if (user.role === "admin") return "edit";
  const c = await prisma.company.findUnique({
    where: { id: companyId },
    select: { ownerId: true, access: { where: { userId: user.id }, select: { level: true } } },
  });
  if (!c) return null;
  const level: Access | null = c.ownerId === user.id ? "edit" : c.access[0]?.level === "edit" ? "edit" : c.access[0] ? "view" : null;
  if (level === "edit" && user.role === "limited") return "view";
  return level;
}

/**
 * Throws 401/403/404 unless the user may `need` the company. Unknown and
 * foreign companies both answer 404, so ids of others' companies leak nothing.
 */
export async function requireCompany(companyId: string | null | undefined, need: Access): Promise<SessionUser> {
  const user = await requireUser();
  if (!companyId) throw new HttpError(400, "companyId обязателен");
  const access = await companyAccess(user, companyId);
  if (!access) throw new HttpError(404, "Компания не найдена");
  if (need === "edit" && access !== "edit") {
    throw new HttpError(403, companyId === DEMO_COMPANY.id
      ? "Демо-компанию нельзя изменить — создайте свою компанию или копию демо"
      : user.role === "limited" ? "У вас доступ только для просмотра" : "У вас доступ к этой компании только для просмотра");
  }
  return user;
}

/** Ids the user can open (for lists); null = all (admin). */
export async function visibleCompanyIds(user: SessionUser): Promise<string[] | null> {
  if (user.role === "admin" || user.public) return null;
  const rows = await prisma.company.findMany({
    where: { OR: [{ ownerId: user.id }, { access: { some: { userId: user.id } } }] },
    select: { id: true },
  });
  return rows.map((r) => r.id);
}

/** Wraps a route handler: HttpError → JSON with its status; anything else → 503/500. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      if (e instanceof Error && e.message.startsWith("AUTH_SECRET")) return NextResponse.json({ error: e.message }, { status: 500 });
      const msg = e instanceof Error && /prisma|database|connect|ECONN/i.test(e.message + e.constructor.name)
        ? "База данных недоступна"
        : "Внутренняя ошибка сервера";
      return NextResponse.json({ error: msg }, { status: msg === "База данных недоступна" ? 503 : 500 });
    }
  };
}

export async function logActivity(userId: string | null, action: string, companyId?: string | null, details?: Record<string, unknown>) {
  try {
    if (userId === PUBLIC_USER.id) userId = null;
    await prisma.activityLog.create({ data: { userId, action, companyId: companyId ?? null, details: (details ?? undefined) as object | undefined } });
  } catch {
    /* logging never breaks the request */
  }
}

export function isAdminEmail(email: string): boolean {
  const list = (process.env.ADMIN_EMAIL ?? "").split(/[,;\s]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email.trim().toLowerCase());
}
