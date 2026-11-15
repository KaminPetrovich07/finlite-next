// Server side: ввоз товара — проводка в журнале и копия документа (CompanyRecord kind "importDoc").
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { createEntry, toIsoDate } from "@/lib/ledger/repo";
import { deleteEntries } from "@/lib/ledger/remove";
import { validateEntry } from "@/lib/ledger/engine";
import { loadRates } from "@/lib/fx/store";
import { calcImport, importDescription, importRef, type ImportDoc } from "./calc";

const KIND = "importDoc";

export interface ImportSummary { entryId: string; doc: ImportDoc; totals: ReturnType<typeof calcImport>["totals"]; vatDue: string | null; vatPaid: number }

/** Курс НБКР, действовавший на дату (последний известный не позже даты). */
export async function rateOn(date: string, code: string): Promise<number | null> {
  if (code === "KGS") return 1;
  const rates = await loadRates(date, [code]).catch(() => []);
  return rates.length ? rates[rates.length - 1].rate : null;
}

export async function listImports(companyId: string): Promise<ImportSummary[]> {
  const [entries, copies, vatPays] = await Promise.all([
    prisma.journalEntry.findMany({ where: { companyId, sourceRef: { startsWith: "import:" } }, select: { id: true }, orderBy: { date: "desc" } }),
    prisma.companyRecord.findMany({ where: { companyId, kind: KIND }, select: { key: true, data: true } }),
    // уплата НДС по заявлению о ввозе — дебет 3490 с контрагентом «НДС при ввозе из ЕАЭС»
    prisma.journalLine.findMany({ where: { entry: { companyId }, accountCode: "3490", party: "НДС при ввозе из ЕАЭС" }, select: { debit: true } }),
  ]);
  const byId = new Map(copies.map((c) => [c.key, c.data as unknown as ImportDoc]));
  const paid = vatPays.reduce((s, l) => s + Number(l.debit), 0);
  let left = paid;
  const out = entries.flatMap((e) => { const doc = byId.get(e.id); if (!doc) return []; const c = calcImport(doc); return [{ entryId: e.id, doc, totals: c.totals, vatDue: c.vatDue, vatPaid: 0 }]; });
  // оплаты НДС ЕАЭС закрывают самые ранние ввозы
  for (const s of [...out].sort((a, b) => a.doc.date.localeCompare(b.doc.date))) {
    if (!s.vatDue) continue;
    const x = Math.min(left, s.totals.vat); s.vatPaid = Math.round(x * 100) / 100; left -= x;
  }
  return out;
}

export async function createImport(companyId: string, input: ImportDoc): Promise<{ entryId: string }> {
  const doc: ImportDoc = { ...input, number: input.number.trim(), supplier: input.supplier.trim(), rows: input.rows.map((r) => ({ ...r, hs: r.hs.replace(/\s/g, "") })) };
  if (!(doc.rate > 0)) {
    const r = await rateOn(doc.date, doc.currency);
    if (!r) throw new HttpError(400, `Нет курса НБКР ${doc.currency} на ${doc.date.split("-").reverse().join(".")} — введите курс вручную`);
    doc.rate = r;
  }
  const c = calcImport(doc);
  const problems = [...c.problems, ...validateEntry({ date: doc.date, lines: c.lines })];
  if (problems.length) throw new HttpError(400, problems.join("; "));
  const dup = await prisma.journalEntry.findFirst({ where: { companyId, sourceRef: importRef(doc) }, select: { date: true } });
  if (dup) throw new HttpError(409, `Ввоз № ${doc.number} уже есть (от ${toIsoDate(dup.date).split("-").reverse().join(".")})`);
  const row = await createEntry(prisma, { companyId, date: doc.date, description: importDescription(doc), source: "manual", sourceRef: importRef(doc), lines: c.lines });
  await prisma.companyRecord.create({ data: { companyId, kind: KIND, key: row.id, data: JSON.parse(JSON.stringify(doc)) } });
  return { entryId: row.id };
}

export async function deleteImport(companyId: string, entryId: string) {
  const e = await prisma.journalEntry.findFirst({ where: { id: entryId, companyId, sourceRef: { startsWith: "import:" } }, select: { id: true } });
  if (!e) throw new HttpError(404, "Документ не найден");
  const r = await deleteEntries(companyId, [entryId]);
  if (r.deleted) await prisma.companyRecord.deleteMany({ where: { companyId, kind: KIND, key: entryId } });
  return r;
}

/** Следующий номер: наибольший числовой + 1. */
export async function nextImportNumber(companyId: string): Promise<string> {
  const refs = await prisma.journalEntry.findMany({ where: { companyId, sourceRef: { startsWith: "import:" } }, select: { sourceRef: true } });
  const max = refs.reduce((m, r) => Math.max(m, Number((r.sourceRef ?? "").slice(7)) || 0), 0);
  return String(max + 1);
}
