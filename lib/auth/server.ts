// Access checks shared by the API routes. Sign-in is not used for now: the
// app is one open workspace, so any existing company may be read and changed;
// only the built-in demo company is read-only.
import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

export class HttpError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export type Access = "edit" | "view";

/** Throws 400/403/404 unless the company exists and may be `need`-ed. */
export async function requireCompany(companyId: string | null | undefined, need: Access): Promise<void> {
  if (!companyId) throw new HttpError(400, "companyId обязателен");
  if (companyId === DEMO_COMPANY.id) {
    if (need === "edit") throw new HttpError(403, "Демо-компанию нельзя изменить — создайте свою компанию или копию демо");
    return;
  }
  const c = await prisma.company.findUnique({ where: { id: companyId }, select: { id: true } });
  if (!c) throw new HttpError(404, "Компания не найдена");
}

/** Wraps a route handler: HttpError → JSON with its status; anything else → 503/500. */
export function route<A extends unknown[]>(fn: (...args: A) => Promise<Response>) {
  return async (...args: A): Promise<Response> => {
    try {
      return await fn(...args);
    } catch (e) {
      if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
      console.error(e);
      const db = e instanceof Error && /prisma|database|connect|ECONN/i.test(e.message + e.constructor.name);
      return NextResponse.json({ error: db ? "База данных недоступна" : "Внутренняя ошибка сервера" }, { status: db ? 503 : 500 });
    }
  };
}

/** Records what happened (kept for a future admin view); never breaks a request. */
export async function logActivity(action: string, companyId?: string | null, details?: Record<string, unknown>) {
  try {
    await prisma.activityLog.create({ data: { action, companyId: companyId ?? null, details: (details ?? undefined) as object | undefined } });
  } catch {
    /* ignore */
  }
}
