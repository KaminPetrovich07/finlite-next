import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { assertUserFeature } from "@/lib/server/plan-guard";
import { runGroup } from "@/lib/consolidation/server";
import { groupReport } from "@/lib/consolidation/present";
import { renderPdf } from "@/lib/reports/render-pdf";
import { renderDocx } from "@/lib/reports/render-docx";
import { renderXlsx } from "@/lib/reports/render-xlsx";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MIME = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
} as const;

/** GET /api/consolidation/export?parentId=…&from=…&to=…&format=pdf|docx|xlsx */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const parentId = sp.get("parentId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const format = sp.get("format") as keyof typeof MIME | null;
  if (!parentId || !ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверные параметры");
  if (!format || !(format in MIME)) throw new HttpError(400, "Формат: pdf, docx или xlsx");
  if (AUTH_ON) {
    const me = await requireUser();
    assertUserFeature(me, "consolidation");
    if (format !== "pdf") assertUserFeature(me, "exports");
  }
  const { settings, tables } = await runGroup(parentId, { from, to });
  const doc = groupReport(tables, settings.name || "Группа компаний", { from, to });
  const buf = format === "pdf" ? await renderPdf(doc) : format === "docx" ? await renderDocx(doc) : await renderXlsx(doc);
  await logActivity("export", parentId, { package: "consolidation", format, from, to });
  const name = `Консолидированная отчётность — ${settings.name || "группа"} — ${doc.period}.${format}`.replace(/[\\/:*?"<>|«»]/g, "");
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": MIME[format],
      "Content-Disposition": `attachment; filename="consolidation.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
