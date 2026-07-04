import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { createdAt: "desc" },
      select: { id: true, name: true, defaultRegime: true, createdAt: true },
    });
    return NextResponse.json(companies);
  } catch {
    // DB not connected yet — return empty list so UI works in demo mode
    return NextResponse.json([]);
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const name = (body?.name ?? "").trim();
    if (!name) {
      return NextResponse.json({ error: "Название компании обязательно" }, { status: 400 });
    }
    const company = await prisma.company.create({ data: { name } });
    return NextResponse.json(company, { status: 201 });
  } catch {
    // DB not connected — return mock company so UI doesn't crash
    return NextResponse.json(
      { id: "demo-" + Date.now(), name: (await req.json().catch(() => ({}))).name ?? "Компания", defaultRegime: null, createdAt: new Date().toISOString() },
      { status: 201 }
    );
  }
}
