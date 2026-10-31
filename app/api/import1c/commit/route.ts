import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { validateEntry } from "@/lib/ledger/engine";
import { fromIsoDate } from "@/lib/ledger/repo";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Line = z.object({
  account: z.string().min(4).max(8),
  debit: z.number().min(0), credit: z.number().min(0),
  memo: z.string().max(200).optional().nullable(),
  party: z.string().max(200).optional().nullable(),
});
const Entry = z.object({
  date: z.string().regex(ISO),
  description: z.string().trim().min(1).max(500),
  source: z.enum(["import1c", "opening", "closing"]),
  sourceRef: z.string().regex(/^1c(-osv)?:[A-Za-z0-9:-]{1,60}$/),
  lines: z.array(Line).min(2).max(200),
});
const Body = z.object({ companyId: z.string().min(1), entries: z.array(Entry).min(1).max(1000), replaceOpening: z.boolean().optional() });

/**
 * POST /api/import1c/commit — записывает в журнал проводки, разобранные из
 * выгрузки 1С (страница шлёт их частями до 1000). Уже загруженные ранее
 * (тот же отпечаток) пропускаются.
 */
export const POST = route(async (req: NextRequest) => {
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные: " + parsed.error.issues.slice(0, 3).map((i) => `${i.path.join(".")} ${i.message}`).join("; "));
  const { companyId, entries, replaceOpening } = parsed.data;
  await requireCompany(companyId, "edit");

  const bad: string[] = [];
  entries.forEach((e, i) => { const errs = validateEntry(e); if (errs.length) bad.push(`№ ${i + 1} (${e.date}): ${errs[0]}`); });
  if (bad.length) throw new HttpError(400, `Проводки не прошли проверку: ${bad.slice(0, 5).join("; ")}${bad.length > 5 ? ` и ещё ${bad.length - 5}` : ""}`);

  const opening = entries.filter((e) => e.source === "opening");
  if (opening.length) {
    const existing = await prisma.journalEntry.count({ where: { companyId, source: "opening" } });
    if (existing && !replaceOpening) throw new HttpError(409, "В журнале уже есть начальные остатки. Отметьте «Заменить начальные остатки», чтобы записать остатки из ведомости вместо них.");
  }

  const refs = entries.map((e) => e.sourceRef);
  const have = new Set((await prisma.journalEntry.findMany({ where: { companyId, sourceRef: { in: refs } }, select: { sourceRef: true } })).map((r) => r.sourceRef));
  const fresh = entries.filter((e) => e.source === "opening" || !have.has(e.sourceRef));

  const rows = fresh.map((e) => ({ id: randomUUID(), e }));
  await prisma.$transaction([
    ...(opening.length && replaceOpening ? [prisma.journalEntry.deleteMany({ where: { companyId, source: "opening" } })] : []),
    prisma.journalEntry.createMany({
      data: rows.map(({ id, e }) => ({ id, companyId, date: fromIsoDate(e.date), description: e.description, source: e.source, sourceRef: e.sourceRef })),
    }),
    prisma.journalLine.createMany({
      data: rows.flatMap(({ id, e }) => e.lines.map((l) => ({
        entryId: id, accountCode: l.account, debit: Math.round(l.debit * 100) / 100, credit: Math.round(l.credit * 100) / 100,
        memo: l.memo ?? null, party: l.party?.trim() || null,
      }))),
    }),
  ]);
  await logActivity("import1c", companyId, { created: rows.length, skipped: entries.length - rows.length });
  return NextResponse.json({ created: rows.length, skipped: entries.length - rows.length });
});
