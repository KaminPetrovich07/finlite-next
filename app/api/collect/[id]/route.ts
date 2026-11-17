import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import ExcelJS from "exceljs";
import { HttpError, logActivity, route } from "@/lib/auth/server";
import { board, closeCampaign, demoFill } from "@/lib/collect/server";
import { STATUS_LABEL, isOverdue } from "@/lib/collect/collect";

export const runtime = "nodejs";
type Ctx = { params: Promise<{ id: string }> };
const dmy = (d: string) => d.split("-").reverse().join(".");

/** GET /api/collect/:id[?format=xlsx] — сводная таблица сбора (ведомство). */
export const GET = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const b = await board(id);
  if (req.nextUrl.searchParams.get("format") !== "xlsx") return NextResponse.json(b);
  const wb = new ExcelJS.Workbook(); wb.creator = "FinLite KG";
  const ws = wb.addWorksheet("Сбор отчётности");
  ws.addRow([`${b.campaign.title}: ${b.campaign.segment}`]).font = { bold: true, size: 13 };
  ws.addRow([`Срок сдачи ${dmy(b.campaign.deadline)}. Сдали ${b.stats.in} из ${b.stats.total}, просрочили ${b.stats.overdue}. Состояние на ${dmy(b.today)}.`]);
  ws.addRow([]);
  const h = ws.addRow(["Предприятие", "ИНН", "Статус", "Сдан", "Подписант", "Балл риска", "Оценка", "Вывод", "Замечание ведомства"]); h.font = { bold: true };
  const band = { ok: "устойчиво", watch: "внимание", risk: "высокий риск" } as const;
  for (const r of b.rows) ws.addRow([r.name, r.inn ?? "", STATUS_LABEL[r.status] + (isOverdue(r.status, b.campaign.deadline, b.today) ? " (просрочен)" : ""), r.submittedAt ? new Date(r.submittedAt).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) : "", r.signer ?? "", r.score ?? "", r.band ? band[r.band] : "", r.verdict ?? "", r.returnReason ?? ""]);
  ws.columns.forEach((c, i) => { c.width = [40, 16, 22, 20, 34, 12, 14, 50, 40][i]; });
  await logActivity("collect_export", null, { id });
  return new NextResponse(new Uint8Array(await wb.xlsx.writeBuffer()), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="sbor-otchetnosti-${b.campaign.periodEnd}.xlsx"` } });
});

/** POST /api/collect/:id { action: "close" | "reopen" | "demo" } */
export const POST = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const p = z.object({ action: z.enum(["close", "reopen", "demo"]) }).safeParse(await req.json().catch(() => null));
  if (!p.success) throw new HttpError(400, "Неизвестное действие");
  if (p.data.action === "demo") await demoFill(id);
  else await closeCampaign(id, p.data.action === "close");
  await logActivity(`collect_${p.data.action}`, null, { id });
  return NextResponse.json({ ok: true });
});
