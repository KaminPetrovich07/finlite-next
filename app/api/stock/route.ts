import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { assertCanPost } from "@/lib/server/plan-guard";
import { putRecord } from "@/lib/records";
import { createEntry } from "@/lib/ledger/repo";
import { loadCompanyContext } from "@/lib/server/company-context";
import { DEMO_COMPANY } from "@/lib/ledger/demo";
import { cogsLines, cogsRef, pendingCogs, stockWithAverage } from "@/lib/stock/cogs";
import { cogsMethodFor, stockSettings } from "@/lib/stock/auto";

const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/stock?companyId=…&from=…&to=… — stock with average cost at `to` and unposted write-offs of the period */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Период задан неверно");
  const level = await requireCompany(companyId, "view");
  const ctx = await loadCompanyContext(companyId);
  const entries = ctx.entries.filter((e) => e.date <= to);
  const method = ctx.demo ? "wavg" : await cogsMethodFor(companyId);
  return NextResponse.json({
    stock: stockWithAverage(entries, to),
    pending: pendingCogs(entries, { from, to }, method),
    method,
    settings: ctx.demo ? { auto: false } : await stockSettings(companyId),
    readOnly: ctx.demo || level === "view",
  });
});

const Post = z.object({ companyId: z.string().min(1), from: z.string().regex(ISO), to: z.string().regex(ISO), refs: z.array(z.string()).optional() });

/** POST /api/stock — post the write-offs of the period (all without problems, or the listed ones) */
export const POST = route(async (req: NextRequest) => {
  const p = Post.safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, refs } = p.data;
  if (companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(companyId, "edit");
  const ctx = await loadCompanyContext(companyId);
  const todo = pendingCogs(ctx.entries.filter((e) => e.date <= to), { from, to }, await cogsMethodFor(companyId))
    .filter((x) => !x.problem && x.amount > 0 && (!refs || refs.includes(cogsRef(x.saleEntryId, x.lineIndex))));
  if (!todo.length) throw new HttpError(400, "Нечего списывать: все продажи периода уже списаны или по ним нет остатка");
  await assertCanPost(companyId, todo.length);
  await prisma.$transaction(async (tx) => {
    for (const x of todo) {
      await createEntry(tx, {
        companyId, date: x.date, source: "cogs", sourceRef: cogsRef(x.saleEntryId, x.lineIndex),
        description: `Списание себестоимости: ${x.item}, ${x.qty} ${x.unit}`.trim(), lines: cogsLines(x),
      });
    }
  });
  await logActivity("cogs", companyId, { count: todo.length, from, to });
  return NextResponse.json({ ok: true, count: todo.length, total: Math.round(todo.reduce((s, x) => s + x.amount, 0) * 100) / 100 });
});

/** PUT /api/stock — { companyId, auto } automatic write-off on every sale */
export const PUT = route(async (req: NextRequest) => {
  const p = z.object({ companyId: z.string().min(1), auto: z.boolean() }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неверные данные");
  if (p.data.companyId === DEMO_COMPANY.id) throw new HttpError(403, "Демо-компанию можно только смотреть");
  await requireCompany(p.data.companyId, "edit");
  await putRecord(p.data.companyId, "stock", "main", { auto: p.data.auto });
  return NextResponse.json({ ok: true });
});
