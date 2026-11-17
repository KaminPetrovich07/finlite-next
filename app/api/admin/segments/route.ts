import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { normalizeEmail } from "@/lib/auth/tokens";
import { grantSegment, listGrants, revokeSegment } from "@/lib/access/segments";

export const runtime = "nodejs";

/** GET /api/admin/segments — группы компаний, сколько в каждой компаний и кто видит группу целиком. */
export const GET = route(async () => {
  await requireAdmin();
  const profiles = await prisma.companyRecord.findMany({ where: { kind: "profile", key: "main" }, select: { data: true } });
  const counts = new Map<string, number>();
  for (const p of profiles) { const s = String((p.data as { segment?: string })?.segment ?? "").trim(); if (s) counts.set(s, (counts.get(s) ?? 0) + 1); }
  const grants = await listGrants();
  const users = await prisma.user.findMany({ where: { id: { in: [...new Set(grants.map((g) => g.userId))] } }, select: { id: true, email: true, name: true, organization: true } });
  const u = new Map(users.map((x) => [x.id, x]));
  const segments = [...new Set([...counts.keys(), ...grants.map((g) => g.segment)])].sort((a, b) => a.localeCompare(b, "ru")).map((s) => ({
    segment: s, companies: counts.get(s) ?? 0,
    grants: grants.filter((g) => g.segment === s).map((g) => ({ userId: g.userId, level: g.level, at: g.at, email: u.get(g.userId)?.email ?? "(удалён)", name: u.get(g.userId)?.name ?? null, organization: u.get(g.userId)?.organization ?? null })),
  }));
  return NextResponse.json({ segments });
});

const Grant = z.object({ segment: z.string().trim().min(1).max(80), email: z.string().trim().max(200), level: z.enum(["view", "edit"]) });

/** POST /api/admin/segments { segment, email, level } — пользователь видит все компании группы (и будущие). */
export const POST = route(async (req: NextRequest) => {
  const me = await requireAdmin();
  const p = Grant.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Укажите группу, e-mail и уровень доступа");
  const user = await prisma.user.findUnique({ where: { email: normalizeEmail(p.data.email) }, select: { id: true, email: true } });
  if (!user) throw new HttpError(404, "Пользователь с таким e-mail не зарегистрирован — пусть сначала зарегистрируется");
  const n = await grantSegment(p.data.segment, user.id, p.data.level, me.id);
  await logActivity("segment_grant", null, { segment: p.data.segment, email: user.email, level: p.data.level, companies: n });
  return NextResponse.json({ ok: true, companies: n }, { status: 201 });
});

/** DELETE /api/admin/segments { segment, userId } — снять доступ к группе. */
export const DELETE = route(async (req: NextRequest) => {
  await requireAdmin();
  const p = z.object({ segment: z.string().min(1).max(80), userId: z.string().min(1) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Укажите группу и пользователя");
  const n = await revokeSegment(p.data.segment, p.data.userId);
  await logActivity("segment_revoke", null, { segment: p.data.segment, userId: p.data.userId, companies: n });
  return NextResponse.json({ ok: true, companies: n });
});
