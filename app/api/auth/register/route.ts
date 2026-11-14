import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { hashPassword, passwordProblem } from "@/lib/auth/password";
import { normalizeEmail } from "@/lib/auth/tokens";
import { clientIp, startSession } from "@/lib/auth/session";
import { tooMany } from "@/lib/auth/limits";
import { CONSENT_VERSION } from "@/lib/auth/consent";
import { claimPending, pilotSettings, planForNewUser } from "@/lib/auth/transition";

const Schema = z.object({
  email: z.string().trim().email("Укажите корректный e-mail").max(200),
  password: z.string().max(200),
  name: z.string().trim().min(2, "Укажите имя").max(120),
  organization: z.string().trim().max(200).optional().or(z.literal("")),
  phone: z.string().trim().regex(/^[+\d][\d\s()-]{6,20}$/, "Телефон в формате +996 …").optional().or(z.literal("")),
  consent: z.literal(true, { errorMap: () => ({ message: "Нужно согласие на обработку персональных данных" }) }),
});

const adminEmails = () => (process.env.FL_ADMIN_EMAILS ?? "").split(",").map((e) => normalizeEmail(e)).filter(Boolean);

/** POST /api/auth/register — new account; signs in right away */
export const POST = route(async (req: NextRequest) => {
  if (tooMany(`reg:${await clientIp()}`, 10, 60 * 60 * 1000)) throw new HttpError(429, "Слишком много регистраций с этого адреса — попробуйте позже");
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const d = parsed.data;
  const email = normalizeEmail(d.email);
  const weak = passwordProblem(d.password, email);
  if (weak) throw new HttpError(400, weak);
  if (await prisma.user.findUnique({ where: { email }, select: { id: true } })) {
    throw new HttpError(409, "Этот e-mail уже зарегистрирован — войдите или попросите администратора сбросить пароль");
  }
  // The administrator: e-mails listed in FL_ADMIN_EMAILS. Only in local
  // development, when the list is empty, the very first account becomes admin —
  // in production a stranger registering first must not get the admin role.
  const first = process.env.NODE_ENV !== "production" && adminEmails().length === 0 && (await prisma.user.count({ where: { role: "admin" } })) === 0;
  const admin = adminEmails().includes(email) || first;
  const plan = admin ? { plan: "free", paidUntil: null, planNote: null } : planForNewUser(await pilotSettings());
  const user = await prisma.user.create({
    data: {
      email, name: d.name, organization: d.organization || null, phone: d.phone || null,
      passwordHash: hashPassword(d.password), role: admin ? "admin" : "user",
      consentAt: new Date(), consentVersion: CONSENT_VERSION, lastLoginAt: new Date(), ...plan,
    },
    select: { id: true, email: true, name: true, role: true },
  });
  await startSession(user.id);
  await prisma.activityLog.create({ data: { userId: user.id, action: "register" } });
  await logActivity("consent", null, { version: CONSENT_VERSION });
  const claimed = await claimPending(user);
  return NextResponse.json({ ...user, plan: plan.plan, claimed }, { status: 201 });
});
