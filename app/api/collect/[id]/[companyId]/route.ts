import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { getReport, review, saveDraft, submitReport } from "@/lib/collect/server";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string; companyId: string }> };

/** GET — отчёт предприятия в сборе (ведомство или само предприятие). */
export const GET = route(async (_req: NextRequest, { params }: Ctx) => {
  const { id, companyId } = await params;
  return NextResponse.json(await getReport(id, companyId));
});

/** PUT { values } — сохранить черновик. */
export const PUT = route(async (req: NextRequest, { params }: Ctx) => {
  const { id, companyId } = await params;
  const b = await req.json().catch(() => null);
  const values = await saveDraft(id, companyId, b?.values);
  return NextResponse.json({ ok: true, values });
});

const Submit = z.object({ values: z.record(z.string(), z.unknown()), signerName: z.string().trim().min(3, "Укажите ФИО подписанта").max(120), signerTitle: z.string().trim().min(2, "Укажите должность подписанта").max(120) });

/** POST { values, signerName, signerTitle } — сдать отчёт. */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id, companyId } = await params;
  const p = Submit.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Неверные данные");
  const r = await submitReport(id, companyId, p.data.values, { name: p.data.signerName, title: p.data.signerTitle });
  if (!r.ok) return NextResponse.json({ error: "Отчёт не сдан: исправьте отмеченное", issues: r.issues }, { status: 422 });
  await logActivity("collect_submit", companyId, { campaign: id, signer: p.data.signerName });
  return NextResponse.json({ ok: true });
});

/** PATCH { action: "return" | "accept", reason } — решение ведомства. */
export const PATCH = route(async (req: NextRequest, { params }: Ctx) => {
  const { id, companyId } = await params;
  const p = z.object({ action: z.enum(["return", "accept"]), reason: z.string().max(1000).default("") }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неизвестное действие");
  await review(id, companyId, p.data.action, p.data.reason);
  await logActivity(p.data.action === "return" ? "collect_return" : "collect_accept", companyId, { campaign: id, reason: p.data.reason || null });
  return NextResponse.json({ ok: true });
});
