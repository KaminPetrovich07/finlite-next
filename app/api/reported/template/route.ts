import { NextRequest, NextResponse } from "next/server";
import { route } from "@/lib/auth/server";
import { buildTemplate } from "@/lib/reported/template";
import { demoCompanies } from "@/lib/reported/demo";

export const runtime = "nodejs";

/** GET /api/reported/template[?example=1] — пустой шаблон на 4 последних квартала или пример с демо-предприятиями. */
export const GET = route(async (req: NextRequest) => {
  const example = req.nextUrl.searchParams.get("example") === "1";
  const today = new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
  const buf = await buildTemplate({ companies: example ? demoCompanies() : undefined, today });
  const name = example ? "finlite-otchetnost-primer.xlsx" : "finlite-otchetnost-shablon.xlsx";
  return new NextResponse(new Uint8Array(buf), { headers: { "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", "Content-Disposition": `attachment; filename="${name}"` } });
});
