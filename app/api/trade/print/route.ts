import { NextRequest } from "next/server";
import { z } from "zod";
import { HttpError, logActivity, requireCompany, route } from "@/lib/auth/server";
import { loadPrimaryCtx } from "@/lib/primary/context";
import { buildEntryDoc } from "@/lib/primary/build";
import { DOC_INFO, numberDocs, type DocKind } from "@/lib/primary/detect";
import { docFormat, sendDoc } from "@/lib/server/send-file";
import type { DocBlock } from "@/lib/docs/model";
import { getDoc } from "@/lib/trade/server";

export const runtime = "nodejs";
export const maxDuration = 60;

const Body = z.object({ companyId: z.string().min(1), entryId: z.string().min(1), kinds: z.array(z.enum(["waybill", "invoice", "act", "m4"])).min(1).max(4) });

/**
 * POST /api/trade/print?format=pdf|docx { companyId, entryId, kinds } — печатные формы документа:
 * накладная, счёт на оплату, акт (услуги) — с номером реализации; приходный ордер М-4 — для поступления.
 */
export const POST = route(async (req: NextRequest) => {
  const format = docFormat(req.nextUrl.searchParams.get("format"));
  if (!format) throw new HttpError(400, "Формат: pdf или docx");
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success) throw new HttpError(400, "Неверные данные");
  const { companyId, entryId, kinds } = parsed.data;
  await requireCompany(companyId, "view");
  const c = await loadPrimaryCtx(companyId);
  const e = c.entries.find((x) => x.id === entryId);
  if (!e || e.source !== "trade") throw new HttpError(404, "Документ не найден");
  const own = Number(e.sourceRef?.split(":")[1]);
  const doc = await getDoc(companyId, entryId).then((d) => d.doc).catch(() => null);
  const party = doc?.party ? `${doc.party}${doc.partyInn ? `, ИНН ${doc.partyInn}` : ""}` : undefined;
  const overrides = { ...(doc?.basis ? { attachment: doc.basis } : {}), ...(party ? { party } : {}) };
  const seq = numberDocs(c.entries, c.services).get(entryId) ?? [];
  const blocks: DocBlock[] = [];
  for (const k of kinds as DocKind[]) {
    // номер реализации печатается как есть; у поступления — внутренний номер приходного ордера
    const no = e.sourceRef?.startsWith("sale:") && Number.isInteger(own) && own > 0 ? own : seq.find((d) => d.kind === k)?.number ?? seq[0]?.number ?? 1;
    if (blocks.length) blocks.push({ t: "pagebreak" });
    blocks.push(...buildEntryDoc(k, e, no, c, overrides));
  }
  await logActivity("trade_print", companyId, { kinds, format });
  const title = `${kinds.map((k) => DOC_INFO[k].title).join(", ")} — ${e.description}`;
  return sendDoc({ title, fileName: title.slice(0, 120), org: c.companyName, blocks }, format);
});
