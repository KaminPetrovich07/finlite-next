import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import QRCode from "qrcode";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { verifyPassword } from "@/lib/auth/password";
import { tooMany } from "@/lib/auth/limits";
import { matchBackup, newBackupCodes, newSecret, otpauthUri, verifyTotp } from "@/lib/auth/totp";

export const runtime = "nodejs";

/** GET /api/auth/2fa — включён ли двухфакторный вход и сколько осталось резервных кодов */
export const GET = route(async () => {
  const me = await requireUser();
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { totpEnabledAt: true, totpBackup: true } });
  return NextResponse.json({ enabled: !!u?.totpEnabledAt, since: u?.totpEnabledAt ?? null, backupLeft: u?.totpBackup.length ?? 0 });
});

const Body = z.discriminatedUnion("action", [
  z.object({ action: z.literal("setup") }),
  z.object({ action: z.literal("enable"), code: z.string().max(20) }),
  z.object({ action: z.literal("disable"), password: z.string().max(200), code: z.string().max(20) }),
  z.object({ action: z.literal("backup"), code: z.string().max(20) }),
]);

/**
 * POST /api/auth/2fa
 *   setup   — новый секрет и QR-код для приложения (вход ещё не меняется);
 *   enable  — код из приложения подтверждает настройку → включено, выдаются 10 резервных кодов;
 *   disable — пароль и код → выключено;
 *   backup  — код → новые резервные коды взамен старых.
 */
export const POST = route(async (req: NextRequest) => {
  const me = await requireUser();
  if (tooMany(`2fa:${me.id}`, 10)) throw new HttpError(429, "Слишком много попыток — подождите несколько минут");
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверный запрос");
  const u = await prisma.user.findUnique({ where: { id: me.id }, select: { email: true, passwordHash: true, totpSecret: true, totpEnabledAt: true, totpLastStep: true, totpBackup: true } });
  if (!u) throw new HttpError(404, "Пользователь не найден");
  const d = p.data;

  if (d.action === "setup") {
    if (u.totpEnabledAt) throw new HttpError(409, "Двухфакторный вход уже включён");
    const secret = newSecret();
    await prisma.user.update({ where: { id: me.id }, data: { totpSecret: secret, totpLastStep: null } });
    const uri = otpauthUri(secret, u.email);
    const qr = await QRCode.toString(uri, { type: "svg", margin: 1, errorCorrectionLevel: "M" });
    return NextResponse.json({ secret, uri, qr });
  }

  if (d.action === "enable") {
    if (u.totpEnabledAt) throw new HttpError(409, "Двухфакторный вход уже включён");
    if (!u.totpSecret) throw new HttpError(400, "Сначала отсканируйте QR-код");
    const step = verifyTotp(u.totpSecret, d.code, null);
    if (step === null) throw new HttpError(400, "Код не подошёл. Проверьте, что время на телефоне установлено автоматически, и введите новый код");
    const { codes, hashes } = newBackupCodes();
    await prisma.user.update({ where: { id: me.id }, data: { totpEnabledAt: new Date(), totpLastStep: step, totpBackup: hashes } });
    await logActivity("2fa_enable");
    return NextResponse.json({ ok: true, codes });
  }

  if (!u.totpEnabledAt || !u.totpSecret) throw new HttpError(409, "Двухфакторный вход не включён");
  const step = verifyTotp(u.totpSecret, d.code, u.totpLastStep);
  const backupIdx = step === null ? matchBackup(d.code, u.totpBackup) : -1;
  if (step === null && backupIdx < 0) throw new HttpError(400, "Код неверный или уже использован");

  if (d.action === "disable") {
    if (!verifyPassword(d.password, u.passwordHash)) throw new HttpError(400, "Неверный пароль");
    await prisma.user.update({ where: { id: me.id }, data: { totpSecret: null, totpEnabledAt: null, totpLastStep: null, totpBackup: [] } });
    await logActivity("2fa_disable");
    return NextResponse.json({ ok: true });
  }

  // backup
  const { codes, hashes } = newBackupCodes();
  await prisma.user.update({ where: { id: me.id }, data: { totpBackup: hashes, ...(step !== null ? { totpLastStep: step } : {}) } });
  await logActivity("2fa_backup_codes");
  return NextResponse.json({ ok: true, codes });
});
