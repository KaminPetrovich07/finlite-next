import { NextRequest, NextResponse } from "next/server";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { prisma } from "@/lib/db";
import { updateBuildDoc } from "@/lib/build/server";
import { BuildDocSchema } from "@/lib/build/schema";
import type { BuildDoc } from "@/lib/build/model";

type Ctx = { params: Promise<{ id: string }> };

/** PUT /api/build/docs/:id { doc, version } — изменить документ; проводка пересчитывается */
export const PUT = route(async (req: NextRequest, { params }: Ctx) => {
  const { id } = await params;
  const e = await prisma.journalEntry.findUnique({ where: { id }, select: { companyId: true, source: true } });
  if (!e || e.source !== "build") throw new HttpError(404, "Документ не найден");
  await requireCompany(e.companyId, "edit");
  const b = await req.json().catch(() => null);
  const parsed = BuildDocSchema.safeParse(b?.doc);
  if (!parsed.success) throw new HttpError(400, parsed.error.issues[0].message);
  const r = await updateBuildDoc(e.companyId, id, parsed.data as BuildDoc, typeof b?.version === "string" ? b.version : undefined);
  await logActivity("build_doc_update", e.companyId, { type: parsed.data.type });
  return NextResponse.json({ ok: true, ...r });
});
