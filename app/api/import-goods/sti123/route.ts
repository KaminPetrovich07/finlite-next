import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { sti123Rows, sti123Xlsx } from "@/lib/import-goods/sti123";
import type { ImportDoc } from "@/lib/import-goods/calc";

export const runtime = "nodejs";

/** GET /api/import-goods/sti123?companyId=&month=YYYY-MM — Excel с данными для раздела 3 STI-123 (ввоз из ЕАЭС за месяц). */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId") ?? "", month = sp.get("month") ?? "";
  if (!/^\d{4}-\d{2}$/.test(month)) throw new HttpError(400, "Укажите месяц");
  await requireCompany(companyId, "view");
  const [company, recs] = await Promise.all([
    prisma.company.findUnique({ where: { id: companyId }, select: { name: true, inn: true } }),
    prisma.companyRecord.findMany({ where: { companyId, kind: "importDoc" }, select: { data: true } }),
  ]);
  if (!company) throw new HttpError(404, "Компания не найдена");
  const rows = sti123Rows(recs.map((r) => r.data as unknown as ImportDoc), month);
  if (!rows.length) throw new HttpError(404, "За этот месяц ввоза из ЕАЭС нет");
  await logActivity("sti123_export", companyId, { month, rows: rows.length });
  const buf = await sti123Xlsx(company.name, company.inn, month, rows);
  const name = `STI-123 раздел 3 — ${month}.xlsx`;
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="sti123.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "no-store",
    },
  });
});
