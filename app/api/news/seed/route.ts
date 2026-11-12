import { NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, route } from "@/lib/auth/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { viewerIsAdmin } from "@/lib/community/owner";
import { EDITORIAL } from "@/lib/news/editorial";

/** POST /api/news/seed — adds the editorial selection (what is not there yet, by source link) */
export const POST = route(async () => {
  if (AUTH_ON && !(await viewerIsAdmin())) throw new HttpError(403, "Только администратор");
  const have = new Set((await prisma.post.findMany({ where: { sourceUrl: { in: EDITORIAL.map((e) => e.sourceUrl) } }, select: { sourceUrl: true } })).map((p) => p.sourceUrl));
  const todo = EDITORIAL.filter((e) => !have.has(e.sourceUrl));
  for (const e of todo) {
    await prisma.post.create({ data: { ...e, docDate: new Date(`${e.docDate}T00:00:00Z`), authorName: "Редакция FinLite", authorOrg: "FinLite KG" } });
  }
  return NextResponse.json({ added: todo.length });
});
