import { NextRequest, NextResponse } from "next/server";
import { logActivity, requireCompany, route } from "@/lib/auth/server";
import { exportCompany } from "@/lib/backup/server";
import { backupFileName } from "@/lib/backup/company";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/companies/[id]/backup — вся компания одним файлом (.finlite.json.gz). */
export const GET = route(async (_req: NextRequest, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  await requireCompany(id, "view");
  const { name, gz } = await exportCompany(id);
  await logActivity("company_backup", id, { bytes: gz.length });
  const file = backupFileName(name);
  return new NextResponse(new Uint8Array(gz), {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": `attachment; filename="company.finlite.json.gz"; filename*=UTF-8''${encodeURIComponent(file)}`,
      "Cache-Control": "no-store",
    },
  });
});
