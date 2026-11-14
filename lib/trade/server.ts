// Сервер раздела «Торговля»: справочник номенклатуры и документы реализации / поступления.
// Номенклатура — по записи на позицию (CompanyRecord kind «nomenclature»), документ — проводка
// журнала (source «trade») плюс его полная копия (kind «tradeDoc», key = id проводки) для правки.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { quietly, recordEntryEvent, snapshotOf } from "@/lib/ledger/guard";
import { createEntry, fromIsoDate, toLedgerEntry } from "@/lib/ledger/repo";
import { normalizeUnit } from "@/lib/okei";
import { getCurrentUser } from "@/lib/auth/session";
import { autoCogsFor } from "@/lib/stock/auto";
import { validateEntry } from "@/lib/ledger/engine";
import { itemKey } from "@/lib/ledger/stock";
import { mergeCatalog, newId, normalizeItem, type CatalogItem, type MergeResult } from "./catalog";
import { docDescription, docFromEntry, docLines, docRef, docTotals, nextSaleNumber, validateDoc, type TradeDoc } from "./doc";

const CAT = "nomenclature";
const DOC = "tradeDoc";

export async function loadCatalog(companyId: string): Promise<CatalogItem[]> {
  const rows = await prisma.companyRecord.findMany({ where: { companyId, kind: CAT }, select: { data: true } });
  return rows.map((r) => normalizeItem(r.data)).filter((x): x is CatalogItem => !!x).sort((a, b) => a.name.localeCompare(b.name, "ru"));
}

/** Writes the given items (new or changed) — one row each, in chunks. */
async function writeItems(companyId: string, items: CatalogItem[]) {
  for (let i = 0; i < items.length; i += 500) {
    const part = items.slice(i, i + 500);
    await prisma.$transaction([
      prisma.companyRecord.deleteMany({ where: { companyId, kind: CAT, key: { in: part.map((x) => x.id) } } }),
      prisma.companyRecord.createMany({ data: part.map((x) => ({ companyId, kind: CAT, key: x.id, data: JSON.parse(JSON.stringify(x)) })) }),
    ]);
  }
}

/** Adds or updates items (matched by article, then by name); returns counts. */
export async function mergeIntoCatalog(companyId: string, incoming: CatalogItem[]): Promise<MergeResult> {
  const existing = await loadCatalog(companyId);
  const before = new Map(existing.map((x) => [x.id, JSON.stringify(x)]));
  const res = mergeCatalog(existing, incoming);
  await writeItems(companyId, res.items.filter((x) => before.get(x.id) !== JSON.stringify(x)));
  return res;
}

/** Saves one item as given (the editor): its own id, no matching by name. */
export async function saveItem(companyId: string, item: CatalogItem): Promise<CatalogItem> {
  const others = (await loadCatalog(companyId)).filter((x) => x.id !== item.id);
  if (item.article && others.some((x) => x.article && x.article.toLowerCase() === item.article!.toLowerCase())) {
    throw new HttpError(409, `Артикул «${item.article}» уже есть у другой позиции`);
  }
  await writeItems(companyId, [item]);
  return item;
}

export async function deleteItems(companyId: string, ids: string[]): Promise<number> {
  const r = await prisma.companyRecord.deleteMany({ where: { companyId, kind: CAT, key: { in: ids } } });
  return r.count;
}

/** Rows typed by hand that the catalog does not have yet are added to it (with the document's price). */
export async function addMissingToCatalog(companyId: string, doc: TradeDoc): Promise<number> {
  const have = new Set((await loadCatalog(companyId)).map((x) => itemKey(x.name)));
  const fresh: CatalogItem[] = [];
  for (const r of doc.rows) {
    const k = itemKey(r.name);
    if (!k || have.has(k)) continue;
    have.add(k);
    const net = r.vat === "12" && doc.vatIncluded ? Math.round((r.price / 1.12) * 100) / 100 : r.price;
    const it = normalizeItem({ id: newId(), name: r.name, unit: r.unit, kind: r.kind, vat: r.vat, ...(doc.type === "sale" ? { salePrice: r.price } : { purchasePrice: net }) });
    if (it) fresh.push(it);
  }
  if (fresh.length) await writeItems(companyId, fresh);
  return fresh.length;
}

// ── documents ─────────────────────────────────────────────────────────────

export interface DocSummary {
  entryId: string; type: "sale" | "purchase"; number: string; date: string; party: string; payment: string;
  gross: number; vat: number; rows: number; locked: boolean; editedInJournal: boolean;
}

export async function listDocs(companyId: string, from: string, to: string): Promise<DocSummary[]> {
  const [entries, company, copies] = await Promise.all([
    prisma.journalEntry.findMany({ where: { companyId, source: "trade", date: { gte: fromIsoDate(from), lte: fromIsoDate(to) } }, include: { lines: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } }),
    prisma.companyRecord.findMany({ where: { companyId, kind: DOC }, select: { key: true, data: true, updatedAt: true } }),
  ]);
  const byId = new Map(copies.map((c) => [c.key, c]));
  return entries.map((row) => {
    const e = toLedgerEntry(row);
    const copy = byId.get(e.id);
    const edited = !!copy && !!row.updatedAt && row.updatedAt.getTime() > copy.updatedAt.getTime() + 1000;
    const doc = (!copy || edited ? docFromEntry(e) : (copy.data as unknown as TradeDoc)) ?? docFromEntry(e)!;
    const t = docTotals(doc);
    return {
      entryId: e.id, type: doc.type, number: doc.number, date: e.date, party: doc.party, payment: doc.payment,
      gross: e.lines.filter((l) => l.account === (doc.type === "sale" ? "1410" : "3110") || ["1110", "1210"].includes(l.account)).reduce((s, l) => s + (doc.type === "sale" ? l.debit : l.credit), 0) || t.gross,
      vat: t.vat, rows: doc.rows.length,
      locked: !!company?.lockedThrough && row.date.getTime() <= company.lockedThrough.getTime(),
      editedInJournal: edited,
    };
  });
}

export async function getDoc(companyId: string, entryId: string): Promise<{ doc: TradeDoc; version: string; editedInJournal: boolean }> {
  const row = await prisma.journalEntry.findFirst({ where: { id: entryId, companyId, source: "trade" }, include: { lines: true } });
  if (!row) throw new HttpError(404, "Документ не найден");
  const copy = await prisma.companyRecord.findUnique({ where: { companyId_kind_key: { companyId, kind: DOC, key: entryId } } });
  const edited = !!copy && !!row.updatedAt && row.updatedAt.getTime() > copy.updatedAt.getTime() + 1000;
  const doc = copy && !edited ? (copy.data as unknown as TradeDoc) : docFromEntry(toLedgerEntry(row));
  if (!doc) throw new HttpError(404, "Документ не найден");
  return { doc, version: (row.updatedAt ?? row.createdAt).toISOString(), editedInJournal: edited || !copy };
}

export async function suggestNumber(companyId: string, date: string): Promise<string> {
  const y = date.slice(0, 4);
  const rows = await prisma.journalEntry.findMany({
    where: { companyId, source: "trade", sourceRef: { startsWith: "sale:" }, date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } },
    select: { sourceRef: true, date: true },
  });
  return nextSaleNumber(rows.map((r) => ({ ref: r.sourceRef, date: r.date.toISOString().slice(0, 10) })), date);
}

async function assertUniqueNumber(companyId: string, doc: TradeDoc, exceptId?: string) {
  const y = doc.date.slice(0, 4);
  const same = await prisma.journalEntry.findMany({
    where: { companyId, source: "trade", sourceRef: docRef(doc), ...(exceptId ? { id: { not: exceptId } } : {}), ...(doc.type === "sale" ? { date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } } : {}) },
    include: { lines: true },
  });
  const clash = doc.type === "sale" ? same[0] : same.find((e) => docFromEntry(toLedgerEntry(e))?.party.trim().toLowerCase() === doc.party.trim().toLowerCase());
  if (clash) throw new HttpError(409, doc.type === "sale" ? `Реализация № ${doc.number} за ${y} год уже есть — возьмите другой номер` : `Поступление № ${doc.number} от «${doc.party}» уже введено`);
}

function clean(doc: TradeDoc): TradeDoc {
  return {
    ...doc, number: doc.number.trim(), party: doc.party.trim(), partyInn: doc.partyInn?.replace(/\D/g, "") || undefined,
    basis: doc.basis?.trim() || undefined, comment: doc.comment?.trim() || undefined,
    rows: doc.rows.map((r) => ({ ...r, name: r.name.trim(), unit: normalizeUnit(r.unit) || r.unit || "шт" })),
  };
}

/** Creates the document: its journal entry, then the copy; the cost of goods follows if auto write-off is on. */
export async function createDoc(companyId: string, input: TradeDoc): Promise<{ entryId: string; cogs: number }> {
  const doc = clean(input);
  const problems = [...validateDoc(doc), ...validateEntry({ date: doc.date, lines: docLines(doc) })];
  if (problems.length) throw new HttpError(400, problems.join("; "));
  await assertUniqueNumber(companyId, doc);
  const row = await createEntry(prisma, { companyId, date: doc.date, description: docDescription(doc), source: "trade", sourceRef: docRef(doc), lines: docLines(doc) });
  await prisma.companyRecord.create({ data: { companyId, kind: DOC, key: row.id, data: JSON.parse(JSON.stringify(doc)) } });
  await addMissingToCatalog(companyId, doc).catch(() => 0);
  const cogs = doc.type === "sale" ? await autoCogsFor(companyId, row.id, doc.date) : 0;
  return { entryId: row.id, cogs };
}

/** Rewrites the document and its entry (history keeps the old version); `version` guards against overwriting. */
export async function updateDoc(companyId: string, entryId: string, input: TradeDoc, version?: string): Promise<{ entryId: string; cogs: number }> {
  const doc = clean(input);
  const problems = [...validateDoc(doc), ...validateEntry({ date: doc.date, lines: docLines(doc) })];
  if (problems.length) throw new HttpError(400, problems.join("; "));
  const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, companyId, source: "trade" }, include: { lines: true } });
  if (!entry) throw new HttpError(404, "Документ не найден");
  if (version && (entry.updatedAt ?? entry.createdAt).toISOString() !== version) {
    throw new HttpError(409, "Пока вы редактировали, документ изменил другой пользователь. Откройте его заново и внесите правки ещё раз.");
  }
  await assertUniqueNumber(companyId, doc, entryId);
  const me = await getCurrentUser();
  const lines = docLines(doc);
  const before = snapshotOf(entry);
  await quietly(() => prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { entryId } });
    await tx.journalLine.createMany({
      data: lines.map((l) => ({
        entryId, accountCode: l.account, debit: l.debit, credit: l.credit, memo: l.memo ?? null, party: l.party ?? null, partyInn: l.partyInn ?? null,
        item: l.item ?? null, qty: l.qty ?? null, unit: l.unit ?? null,
      })),
    });
    const updated = await tx.journalEntry.update({
      where: { id: entryId },
      data: { date: fromIsoDate(doc.date), description: docDescription(doc), sourceRef: docRef(doc), updatedAt: new Date(), updatedByName: me ? me.name?.trim() || me.email : null },
      include: { lines: true },
    });
    await tx.journalEntry.deleteMany({ where: { companyId, source: "cogs", sourceRef: { startsWith: `${entryId}:` } } });
    await recordEntryEvent(tx, { companyId, entryId, action: "update", source: "trade", entryDate: doc.date, before, after: snapshotOf(updated), note: "изменён документ" });
    await tx.companyRecord.upsert({
      where: { companyId_kind_key: { companyId, kind: DOC, key: entryId } },
      create: { companyId, kind: DOC, key: entryId, data: JSON.parse(JSON.stringify(doc)) },
      update: { data: JSON.parse(JSON.stringify(doc)) },
    });
  }));
  await addMissingToCatalog(companyId, doc).catch(() => 0);
  const cogs = doc.type === "sale" ? await autoCogsFor(companyId, entryId, doc.date) : 0;
  return { entryId, cogs };
}
