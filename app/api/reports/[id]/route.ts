import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const report = await prisma.report.findUnique({ where: { id } });
  if (!report) return NextResponse.json({ error: "Не найдено" }, { status: 404 });
  return NextResponse.json(report);
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const data: Record<string, unknown> = {};
  if (body.balanceSheet !== undefined) data.balanceSheet = body.balanceSheet;
  if (body.cashFlow !== undefined) data.cashFlow = body.cashFlow;
  if (body.equityStatement !== undefined) data.equityStatement = body.equityStatement;
  if (body.leanResults !== undefined) data.leanResults = body.leanResults;
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Нечего обновлять" }, { status: 400 });
  }
  const report = await prisma.report.update({ where: { id }, data });
  return NextResponse.json(report);
}
