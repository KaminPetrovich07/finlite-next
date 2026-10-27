import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { fromIsoDate } from "@/lib/ledger/repo";

const num = z.number().min(0).default(0);
const Schema = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  data: z.object({
    electricityKwh: num, heatGcal: num, dieselL: num, petrolL: num, gasM3: num, coalT: num,
    waterM3: num, wasteT: num, wasteRecycledT: num,
    employees: num, women: num, managers: num, womenManagers: num, hires: num, leavers: num, trainingHours: num, injuries: num,
    boardMembers: num, independentBoard: num, womenBoard: num,
    antiCorruptionPolicy: z.boolean().default(false), codeOfConduct: z.boolean().default(false), dataProtectionPolicy: z.boolean().default(false),
    esgOwner: z.string().max(200).default(""),
    gridFactor: num, dieselFactor: num, petrolFactor: num, gasFactor: num, coalFactor: num,
  }),
});

/** PUT /api/esg — saves the non-financial ESG inputs for one company and period */
export async function PUT(req: NextRequest) {
  const parsed = Schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: parsed.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`).join("; ") }, { status: 400 });
  const { companyId, from, to, data } = parsed.data;
  if (companyId === "demo") return NextResponse.json({ error: "Демо-компанию нельзя изменить" }, { status: 409 });
  const periodFrom = fromIsoDate(from), periodTo = fromIsoDate(to);
  try {
    await prisma.esgReport.upsert({
      where: { companyId_periodFrom_periodTo: { companyId, periodFrom, periodTo } },
      create: { companyId, periodFrom, periodTo, data },
      update: { data },
    });
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ error: "База данных недоступна" }, { status: 503 });
  }
}
