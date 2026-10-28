import { NextRequest, NextResponse } from "next/server";
import { loadCompanyPeriod, NotFoundError } from "@/lib/ledger/load";
import { BUILDERS } from "@/lib/reports/packages";
import type { FormatKey, PackageKey } from "@/lib/reports/model";
import { renderPdf } from "@/lib/reports/render-pdf";
import { renderDocx } from "@/lib/reports/render-docx";
import { renderXlsx } from "@/lib/reports/render-xlsx";
import { normalizeEsgInput } from "@/lib/esg/input";
import { HttpError, logActivity, requireCompany } from "@/lib/auth/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const MIME: Record<FormatKey, string> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
};
const FILE: Record<PackageKey, string> = {
  full: "Финансовая отчётность",
  executive: "Отчёт для руководителя",
  audit: "Пакет для аудитора",
  management: "Управленческий отчёт",
  esg: "ESG-отчёт",
};

/** GET /api/export?companyId=…&from=…&to=…&package=full|executive|audit|management|esg&format=pdf|docx|xlsx */
export async function GET(req: NextRequest) {
  return build(req.nextUrl.searchParams, null);
}

/**
 * POST /api/export?…same query… with body { esg } — the ESG page sends the
 * inputs currently on screen, so the file matches what the user sees even
 * before saving (and for the demo company, which cannot be saved).
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  return build(req.nextUrl.searchParams, body && typeof body === "object" && "esg" in body ? body.esg : null);
}

async function build(sp: URLSearchParams, esgOverride: unknown) {
  const companyId = sp.get("companyId");
  const from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  const pkg = sp.get("package") as PackageKey | null;
  const format = sp.get("format") as FormatKey | null;
  if (!companyId || !ISO.test(from) || !ISO.test(to) || from > to) return NextResponse.json({ error: "Неверные параметры периода" }, { status: 400 });
  if (!pkg || !(pkg in BUILDERS)) return NextResponse.json({ error: "Неизвестный пакет отчётов" }, { status: 400 });
  if (!format || !(format in MIME)) return NextResponse.json({ error: "Формат: pdf, docx или xlsx" }, { status: 400 });

  try {
    const user = await requireCompany(companyId, "view");
    const data = await loadCompanyPeriod(companyId, { from, to });
    if (esgOverride) data.esg = normalizeEsgInput(esgOverride);
    const doc = BUILDERS[pkg](data);
    const buf = format === "pdf" ? await renderPdf(doc) : format === "docx" ? await renderDocx(doc) : await renderXlsx(doc);
    await logActivity(user.id, "export", companyId === "demo" ? null : companyId, { package: pkg, format, from, to });
    const name = `${FILE[pkg]} — ${data.company.name} — ${doc.period}.${format}`.replace(/[\\/:*?"<>|«»]/g, "");
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        "Content-Type": MIME[format],
        "Content-Disposition": `attachment; filename="report.${format}"; filename*=UTF-8''${encodeURIComponent(name)}`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    if (e instanceof HttpError) return NextResponse.json({ error: e.message }, { status: e.status });
    if (e instanceof NotFoundError) return NextResponse.json({ error: e.message }, { status: 404 });
    console.error(e);
    return NextResponse.json({ error: "Не удалось сформировать отчёт" }, { status: 500 });
  }
}
