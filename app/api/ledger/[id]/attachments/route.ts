import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/db";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { getCurrentUser } from "@/lib/auth/session";
import { recordEntryEvent } from "@/lib/ledger/guard";
import { ALLOWED, MAX_BYTES, MAX_PER_ENTRY, sniff } from "@/lib/attachments";

export const runtime = "nodejs";

async function entryOf(id: string) {
  const e = await prisma.journalEntry.findUnique({ where: { id }, select: { id: true, companyId: true, date: true, source: true } });
  if (!e) throw new HttpError(404, "Проводка не найдена");
  return e;
}

/** GET /api/ledger/:id/attachments — список прикреплённых документов (без содержимого) */
export const GET = route(async (_req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const e = await entryOf(id);
  await requireCompany(e.companyId, "view");
  const rows = await prisma.attachment.findMany({ where: { companyId: e.companyId, entryId: id }, select: { id: true, name: true, mime: true, size: true, userName: true, createdAt: true }, orderBy: { createdAt: "asc" } });
  return NextResponse.json(rows);
});

/**
 * POST /api/ledger/:id/attachments — multipart, поле «file». Скан не меняет сумм, поэтому прикрепить
 * его можно и к проводке закрытого периода; удалить — нет.
 */
export const POST = route(async (req: NextRequest, { params }: { params: Promise<{ id: string }> }) => {
  const { id } = await params;
  const e = await entryOf(id);
  await requireCompany(e.companyId, "edit");
  const form = await req.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File)) throw new HttpError(400, "Выберите файл");
  if (!ALLOWED.has(file.type)) throw new HttpError(415, "Можно прикрепить фото (JPEG, PNG, WebP) или PDF");
  if (file.size > MAX_BYTES) throw new HttpError(413, "Файл больше 4 МБ — уменьшите скан или разбейте PDF");
  const buf = new Uint8Array(await file.arrayBuffer());
  if (!sniff(buf, file.type)) throw new HttpError(415, "Содержимое файла не похоже на изображение или PDF");
  const count = await prisma.attachment.count({ where: { companyId: e.companyId, entryId: id } });
  if (count >= MAX_PER_ENTRY) throw new HttpError(409, `К одной проводке можно прикрепить не больше ${MAX_PER_ENTRY} файлов`);
  const me = await getCurrentUser();
  const name = (file.name || "документ").slice(0, 200);
  const row = await prisma.attachment.create({
    data: { companyId: e.companyId, entryId: id, name, mime: file.type, size: buf.byteLength, data: Buffer.from(buf), userName: me ? me.name?.trim() || me.email : null },
    select: { id: true, name: true, mime: true, size: true, userName: true, createdAt: true },
  });
  await recordEntryEvent(prisma, { companyId: e.companyId, entryId: id, action: "attach", source: e.source, entryDate: e.date, note: `Прикреплён документ «${name}»` });
  await logActivity("attachment_add", e.companyId, { entryId: id, size: buf.byteLength });
  return NextResponse.json(row, { status: 201 });
});
