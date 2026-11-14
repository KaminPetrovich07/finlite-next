import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireAdmin, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { emailReady, telegramReady } from "@/lib/notify/send";
import { alertSettings } from "@/lib/monitor/errors";
import { endOfDayBishkek, pendingOwners, pilotSettings, savePilot } from "@/lib/auth/transition";

/** GET /api/admin/auth — готовность ко входу по паролю: режим, пользователи, компании без владельца, пилот, почта */
export const GET = route(async () => {
  await requireAdmin();
  const [users, admins, orphans, pending, pilot, onPilot, onFree, twoFa, alerts] = await Promise.all([
    prisma.user.count(), prisma.user.count({ where: { role: "admin" } }),
    prisma.company.count({ where: { ownerId: null } }), pendingOwners(), pilotSettings(),
    prisma.user.count({ where: { plan: "pilot" } }), prisma.user.count({ where: { plan: "free", role: { not: "admin" } } }),
    prisma.user.count({ where: { role: "admin", totpEnabledAt: { not: null } } }), alertSettings(),
  ]);
  return NextResponse.json({
    authOn: AUTH_ON, users, admins, adminsWith2fa: twoFa, orphans, pending: Object.keys(pending).length,
    pilot, onPilot, onFree, mail: emailReady(), telegram: telegramReady() && (alerts.chats.length > 0 || !!process.env.FL_ALERT_CHAT_ID),
  });
});

const Body = z.union([
  z.object({ pilotUntil: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Дата в формате ГГГГ-ММ-ДД").nullable() }),
  z.object({ grantPilot: z.literal(true) }),
]);

/**
 * POST /api/admin/auth { pilotUntil } — дата окончания пилота (null — без пилота);
 * { grantPilot: true } — выдать «Пилот» до этой даты всем пользователям на бесплатном тарифе.
 */
export const POST = route(async (req: Request) => {
  await requireAdmin();
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  if ("pilotUntil" in parsed.data) {
    await savePilot(parsed.data.pilotUntil);
    await logActivity("admin_pilot", null, { until: parsed.data.pilotUntil });
    return NextResponse.json({ ok: true });
  }
  const { until } = await pilotSettings();
  if (!until || endOfDayBishkek(until).getTime() < Date.now()) throw new HttpError(400, "Сначала задайте дату окончания пилота в будущем");
  const r = await prisma.user.updateMany({
    where: { plan: "free", role: { not: "admin" } },
    data: { plan: "pilot", paidUntil: endOfDayBishkek(until), planNote: `Пилот до ${until.split("-").reverse().join(".")}` },
  });
  await logActivity("admin_grant_pilot", null, { count: r.count, until });
  return NextResponse.json({ ok: true, count: r.count });
});
