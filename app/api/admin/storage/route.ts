import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { requireAdmin, route } from "@/lib/auth/server";
import { compact, pruneOld, RETENTION, KEEP_EDITIONS } from "@/lib/monitor/retention";
import { resetStorageCache, storageState, tableSizes } from "@/lib/monitor/storage";

export const runtime = "nodejs";
export const maxDuration = 60;

/** GET /api/admin/storage — размер базы, лимит, самые большие таблицы и что из них можно чистить. */
export const GET = route(async () => {
  await requireAdmin();
  const [state, tables, editions, attachments] = await Promise.all([
    storageState(true),
    tableSizes(20),
    prisma.legalEdition.count().catch(() => 0),
    prisma.attachment.aggregate({ _sum: { size: true }, _count: true }).catch(() => ({ _sum: { size: 0 }, _count: 0 })),
  ]);
  return NextResponse.json({ ...state, tables, editions, attachments: { count: attachments._count, bytes: attachments._sum.size ?? 0 }, retention: { ...RETENTION, keepEditions: KEEP_EDITIONS } });
});

/** POST /api/admin/storage { action: "prune" } — удалить служебное старьё и сжать эти таблицы. */
export const POST = route(async (req: NextRequest) => {
  await requireAdmin();
  const body = await req.json().catch(() => ({}));
  const before = await storageState(true);
  const pruned = await pruneOld();
  // правовая база переписывается целиком при каждой новой редакции — её таблицы сжимаем всегда
  const compacted = body?.compactLaw === false ? await compact(pruned) : await compact(pruned, ["LegalDoc", "LegalEdition"]);
  resetStorageCache();
  const after = await storageState(true);
  return NextResponse.json({ pruned, compacted, before: before.bytes, after: after.bytes });
});
