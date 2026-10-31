import { NextRequest } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { loadCompanyContext } from "@/lib/server/company-context";
import { exportJournalXlsx } from "@/lib/import1c/export";

export const runtime = "nodejs";
export const maxDuration = 60;
const ISO = /^\d{4}-\d{2}-\d{2}$/;

/** GET /api/import1c/export?companyId=…&from=…&to=… — журнал проводок в раскладке 1С (.xlsx) */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const companyId = sp.get("companyId"), from = sp.get("from") ?? "", to = sp.get("to") ?? "";
  if (!ISO.test(from) || !ISO.test(to) || from > to) throw new HttpError(400, "Неверный период");
  await requireCompany(companyId, "view");
  const c = await loadCompanyContext(companyId!);
  const buf = await exportJournalXlsx(c.name, from, to, c.entries);
  await logActivity("export1c", c.demo ? null : c.id, { from, to });
  const name = `Журнал проводок для 1С — ${c.name} — ${from}…${to}.xlsx`;
  return new Response(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export.xlsx"; filename*=UTF-8''${encodeURIComponent(name)}`,
    },
  });
});
