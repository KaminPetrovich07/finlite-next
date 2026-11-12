import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost, assertCompanyFeature } from "@/lib/server/plan-guard";
import { createEntry } from "@/lib/ledger/repo";
import { validateEntry } from "@/lib/ledger/engine";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { esfLines, esfRef, PURCHASE_ACCOUNTS } from "@/lib/esf/registry";

const Inv = z.object({
  number: z.string().trim().min(1).max(60), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  inn: z.string().max(20), party: z.string().max(300), item: z.string().max(500),
  net: z.number().min(0), vat: z.number().min(0), total: z.number().positive(),
  items: z.array(z.object({ name: z.string().max(300), qty: z.number().min(0).nullable(), unit: z.string().max(20), net: z.number().min(0) })).max(500).default([]),
});
const Body = z.object({
  companyId: z.string().min(1),
  direction: z.enum(["in", "out"]),
  account: z.string().refine((a) => PURCHASE_ACCOUNTS.some((p) => p.code === a) || a === "6110"),
  vatPayer: z.boolean(),
  invoices: z.array(Inv).min(1).max(2000),
});

/** GET /api/esf?companyId=… — numbers of ЭСФ already loaded (to mark duplicates before import) */
export const GET = route(async (req: NextRequest) => {
  const companyId = req.nextUrl.searchParams.get("companyId") ?? "";
  await requireCompany(companyId, "view");
  if (companyId === DEMO_COMPANY.id) return NextResponse.json({ loaded: [] });
  const rows = await prisma.journalEntry.findMany({ where: { companyId, source: "esf" }, select: { sourceRef: true } });
  return NextResponse.json({ loaded: rows.map((r) => r.sourceRef).filter(Boolean) });
});

/** POST /api/esf — one entry per ЭСФ; already loaded ones are skipped */
export const POST = route(async (req: NextRequest) => {
  const p = Body.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, p.error.issues[0]?.message ?? "Неверные данные");
  const { companyId, direction, account, vatPayer, invoices } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  await assertCompanyFeature(companyId, "esf");
  const refs = invoices.map((i) => esfRef(direction, i));
  const existing = new Set((await prisma.journalEntry.findMany({ where: { companyId, source: "esf", sourceRef: { in: refs } }, select: { sourceRef: true } })).map((r) => r.sourceRef));
  const todo = invoices.filter((i) => !existing.has(esfRef(direction, i)));
  for (const i of todo) {
    const errs = validateEntry({ date: i.date, lines: esfLines(i, direction, account, vatPayer) });
    if (errs.length) throw new HttpError(400, `ЭСФ № ${i.number}: ${errs.join("; ")}`);
  }
  if (todo.length) await assertCanPost(companyId, todo.length);
  await prisma.$transaction(async (tx) => {
    for (const i of todo) {
      await createEntry(tx, {
        companyId, date: i.date, source: "esf", sourceRef: esfRef(direction, i),
        description: `${direction === "in" ? "Получен" : "Выписан"} ЭСФ № ${i.number}${i.party ? `, ${i.party}` : ""}`,
        lines: esfLines(i, direction, direction === "in" ? account : "6110", vatPayer),
      });
    }
  }, { timeout: 60000 });
  await logActivity("esf_import", companyId, { direction, count: todo.length, skipped: invoices.length - todo.length });
  return NextResponse.json({ ok: true, created: todo.length, skipped: invoices.length - todo.length });
});
