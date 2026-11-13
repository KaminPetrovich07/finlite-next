import { NextRequest, NextResponse } from "next/server";
import { AUTH_ON } from "@/lib/auth/mode";
import { getCurrentUser } from "@/lib/auth/session";
import { HttpError, logActivity, requireUser, route } from "@/lib/auth/server";
import { assertCanCreateCompany } from "@/lib/server/plan-guard";
import { limit } from "@/lib/community/owner";
import { BackupError } from "@/lib/backup/company";
import { importCompany, readBackupBytes } from "@/lib/backup/server";

export const runtime = "nodejs";
export const maxDuration = 60;
const MAX_BYTES = 4 * 1024 * 1024; // предел тела запроса на Vercel ~4,5 МБ; браузер присылает файл сжатым

/** POST /api/companies/import — тело: файл копии (gzip или JSON). Создаёт новую компанию. */
export const POST = route(async (req: NextRequest) => {
  await limit("import", 5, 10);
  const me = AUTH_ON ? await requireUser() : await getCurrentUser();
  await assertCanCreateCompany(me);
  const buf = Buffer.from(await req.arrayBuffer());
  if (!buf.length) throw new HttpError(400, "Файл пустой");
  if (buf.length > MAX_BYTES) throw new HttpError(413, "Файл больше 4 МБ в сжатом виде — напишите в «Отзыв», поможем перенести");
  try {
    const r = await importCompany(readBackupBytes(buf), me?.id ?? null);
    await logActivity("company_import", r.id, r.stats);
    return NextResponse.json({ ok: true, ...r });
  } catch (e) {
    if (e instanceof BackupError) throw new HttpError(400, e.message);
    throw e;
  }
});
