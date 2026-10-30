import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { buildEntryDoc, buildRegister } from "@/lib/primary/build";
import { DOC_INFO, numberDocs, REGISTER_INFO, type DocKind, type RegisterKind } from "@/lib/primary/detect";
import type { DocBlock } from "@/lib/docs/model";

export const runtime = "nodejs";
export const maxDuration = 60;

const ISO = /^\d{4}-\d{2}-\d{2}$/;
const Item = z.object({
  kind: z.string(),
  entryId: z.string().optional(),
  overrides: z.record(z.string().max(300)).optional(),
});
const Body = z.object({
  companyId: z.string().min(1),
  from: z.string().regex(ISO),
  to: z.string().regex(ISO),
  items: z.array(Item).min(1).max(300),
});

/** POST /api/primary/export?format=pdf|docx — one or many documents/registers in one file */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, from, to, items } = parsed.data;
  await requireCompany(companyId, "view");
  const c = await loadPrimaryCtx(companyId);
  const nums = numberDocs(c.entries, c.services);
  const byId = new Map(c.entries.map((e) => [e.id, e]));

  const blocks: DocBlock[] = [];
  const names: string[] = [];
  for (const it of items) {
    let part: DocBlock[] | null = null;
    if (it.kind in REGISTER_INFO) {
      part = buildRegister(it.kind as RegisterKind, c, { from, to }, c.services);
      names.push(REGISTER_INFO[it.kind as RegisterKind].title);
    } else if (it.kind in DOC_INFO && it.entryId) {
      const e = byId.get(it.entryId);
      const n = nums.get(it.entryId)?.find((d) => d.kind === it.kind);
      if (!e || !n) throw new HttpError(404, "Операция или документ не найдены");
      part = buildEntryDoc(it.kind as DocKind, e, n.number, c, it.overrides ?? {});
      names.push(`${DOC_INFO[it.kind as DocKind].title} № ${n.number}`);
    }
    if (!part) throw new HttpError(400, `Неизвестный документ: ${it.kind}`);
    if (blocks.length) blocks.push({ t: "pagebreak" });
    blocks.push(...part);
  }
  await logActivity("primary_export", c.demo ? null : companyId, { format, count: items.length });
  const fileName = items.length === 1 ? `${names[0]} — ${c.companyName}` : `Первичные документы — ${c.companyName} — ${from}…${to}`;
  return sendDoc({ title: fileName, fileName, org: c.companyName, blocks }, format);
});
