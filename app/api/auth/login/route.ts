import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/tokens";
import { clientIp, startSession } from "@/lib/auth/session";
import { LOCK_MINUTES, MAX_FAILED, tooMany } from "@/lib/auth/limits";
import { matchBackup, verifyTotp } from "@/lib/auth/totp";
import { claimPending } from "@/lib/auth/transition";

const Schema = z.object({ email: z.string().trim().max(200), password: z.string().max(200), code: z.string().trim().max(20).optional() });
const WRONG = "Неверный e-mail или пароль";
// Compared against when the e-mail is unknown, so the response time does not reveal which e-mails exist.
const DUMMY = hashPassword("dummy-password-1");

/** POST /api/auth/login */
export const POST = route(async (req: NextRequest) => {
  if (tooMany(`login:${await clientIp()}`, 30)) throw new HttpError(429, "Слишком много попыток входа — подождите несколько минут");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, WRONG);
  const email = normalizeEmail(parsed.data.email);
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) { verifyPassword(parsed.data.password, DUMMY); throw new HttpError(401, WRONG); }
  if (user.blocked) throw new HttpError(403, "Учётная запись заблокирована — свяжитесь с администратором");
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    const min = Math.ceil((user.lockedUntil.getTime() - Date.now()) / 60000);
    throw new HttpError(429, `Слишком много неверных попыток. Вход откроется через ${min} мин.`);
  }
  const passwordOk = verifyPassword(parsed.data.password, user.passwordHash);
  // второй шаг: код из приложения или резервный код — только после верного пароля
  let totp: { step?: number; backup?: string[] } | null = null;
  if (passwordOk && user.totpEnabledAt && user.totpSecret) {
    const code = parsed.data.code ?? "";
    if (!code) return NextResponse.json({ need2fa: true, error: "Введите код из приложения-аутентификатора" }, { status: 401 });
    const step = verifyTotp(user.totpSecret, code, user.totpLastStep);
    const b = step === null ? matchBackup(code, user.totpBackup) : -1;
    if (step !== null) totp = { step };
    else if (b >= 0) totp = { backup: user.totpBackup.filter((_, i) => i !== b) };
  }
  if (!passwordOk || (user.totpEnabledAt && !totp)) {
    const failed = user.failedLogins + 1;
    await prisma.user.update({
      where: { id: user.id },
      data: failed >= MAX_FAILED ? { failedLogins: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60000) } : { failedLogins: failed },
    });
    await prisma.activityLog.create({ data: { userId: user.id, action: "login_failed" } });
    if (failed >= MAX_FAILED) throw new HttpError(401, `Слишком много неверных попыток. Вход закрыт на ${LOCK_MINUTES} мин.`);
    if (passwordOk) return NextResponse.json({ need2fa: true, error: "Код неверный или уже использован — введите новый код из приложения" }, { status: 401 });
    throw new HttpError(401, WRONG);
  }
  // e-mails in FL_ADMIN_EMAILS get the admin role on sign-in (so an existing account can be promoted via the env)
  const promote = (process.env.FL_ADMIN_EMAILS ?? "").split(",").map((e) => normalizeEmail(e)).includes(email) && user.role !== "admin";
  await prisma.user.update({
    where: { id: user.id },
    data: {
      failedLogins: 0, lockedUntil: null, lastLoginAt: new Date(), ...(promote ? { role: "admin" } : {}),
      ...(totp?.step !== undefined ? { totpLastStep: totp.step } : {}), ...(totp?.backup ? { totpBackup: totp.backup } : {}),
    },
  });
  if (totp?.backup) await prisma.activityLog.create({ data: { userId: user.id, action: "login_backup_code", details: { left: totp.backup.length } } });
  await startSession(user.id);
  await prisma.activityLog.create({ data: { userId: user.id, action: "login" } });
  const claimed = await claimPending(user);
  return NextResponse.json({ id: user.id, email: user.email, name: user.name, role: user.role, claimed });
});
