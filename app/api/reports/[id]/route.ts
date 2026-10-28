import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, requireCompany, route } from "@/lib/auth/server";

async function load(id: string, need: "view" | "edit") {
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) throw new HttpError(404, "Не найдено");
  await requireCompany(report.companyId, need);
  return report;
}

export const GET = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  return NextResponse.json(await load(id, "view"));
});

export const PATCH = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  await load(id, "edit");
  const body = await req.json().catch(() => ({}));
  const data: Record<string, unknown> = {};
  if (body.balanceSheet !== undefined) data.balanceSheet = body.balanceSheet;
  if (body.cashFlow !== undefined) data.cashFlow = body.cashFlow;
  if (body.equityStatement !== undefined) data.equityStatement = body.equityStatement;
  if (body.leanResults !== undefined) data.leanResults = body.leanResults;
  if (Object.keys(data).length === 0) throw new HttpError(400, "Нечего обновлять");
  const report = await prisma.report.update({ where: { id }, data });
  return NextResponse.json(report);
});
