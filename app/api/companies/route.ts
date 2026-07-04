import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";

export async function GET() {
  try {
    const data = await prisma.company.findMany({ orderBy: { createdAt: "desc" }, select: { id: true, name: true } });
    return NextResponse.json(data);
  } catch { return NextResponse.json([]); }
}

export async function POST(req: Request) {
  try {
    const { name } = await req.json();
    if (!name?.trim()) return NextResponse.json({ error: "Нужно название" }, { status: 400 });
    const company = await prisma.company.create({ data: { name: name.trim() } });
    return NextResponse.json(company, { status: 201 });
  } catch { return NextResponse.json({ id: "demo-" + Date.now(), name: "Демо-компания" }, { status: 201 }); }
}
