// Сервер раздела «Торговля»: справочник номенклатуры и документы реализации / поступления.
// Номенклатура — по записи на позицию (CompanyRecord kind «nomenclature»), документ — проводка
// журнала (source «trade») плюс его полная копия (kind «tradeDoc», key = id проводки) для правки.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { quietly, recordEntryEvent, snapshotOf } from "@/lib/ledger/guard";
import { createEntry, fromIsoDate, loadEntries, toIsoDate, toLedgerEntry } from "@/lib/ledger/repo";
import { calcImport, type ImportDoc } from "@/lib/import-goods/calc";
import { stockWithAverage } from "@/lib/stock/cogs";
import { docDues, payRef, type DueStatus } from "./settle";
import { normalizeUnit } from "@/lib/okei";
import { getCurrentUser } from "@/lib/auth/session";
import { autoCogsFor } from "@/lib/stock/auto";
import { validateEntry } from "@/lib/ledger/engine";
import { itemKey } from "@/lib/ledger/stock";
import { KIND_ACCOUNT, mergeCatalog, newId, normalizeItem, type CatalogItem, type MergeResult } from "./catalog";
import {
  DOC_LABEL, docDescription, docFromEntry, docLines, docRef, docTotals, isReturn, isSaleSide, nextNumber, ownNumbering, SETTLE, settleOnDebit, validateDoc,
  type DocType, type TradeDoc,
} from "./doc";

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
  entryId: string; type: DocType; number: string; date: string; party: string; payment: string;
  gross: number; vat: number; rows: number; locked: boolean; editedInJournal: boolean;
  /** документ в долг: оплачено и осталось (FIFO по контрагенту, привязанные оплаты — сначала своему документу) */
  paid?: number; due?: number; dueStatus?: DueStatus;
  /** возврат: по какому документу */
  baseEntryId?: string;
  /** ввоз товара (импорт) — открывается на странице «Ввоз товара», а не здесь */
  importDoc?: boolean;
}

const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек

export async function listDocs(companyId: string, from: string, to: string): Promise<DocSummary[]> {
  const [entries, company, copies] = await Promise.all([
    prisma.journalEntry.findMany({ where: { companyId, source: "trade", date: { gte: fromIsoDate(from), lte: fromIsoDate(to) } }, include: { lines: true }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] }),
    prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } }),
    prisma.companyRecord.findMany({ where: { companyId, kind: DOC }, select: { key: true, data: true, updatedAt: true } }),
  ]);
  const byId = new Map(copies.map((c) => [c.key, c]));
  // долги по документам — по всему журналу (оплата может прийти позже периода списка)
  const links = new Map<string, string>();
  for (const c of copies) { const b = (c.data as { baseEntryId?: string } | null)?.baseEntryId; if (b) links.set(c.key, b); }
  const dues = entries.some((r) => (r.sourceRef ?? "").startsWith("sale:") || (r.sourceRef ?? "").startsWith("purchase:"))
    ? docDues(await loadEntries(companyId), today(), links) : new Map();
  const imports = await importSummaries(companyId, from, to, company?.lockedThrough ?? null);
  const docs = entries.map((row) => {
    const e = toLedgerEntry(row);
    const copy = byId.get(e.id);
    const edited = !!copy && !!row.updatedAt && row.updatedAt.getTime() > copy.updatedAt.getTime() + 1000;
    const doc = (!copy || edited ? docFromEntry(e) : (copy.data as unknown as TradeDoc)) ?? docFromEntry(e)!;
    const t = docTotals(doc);
    const settleAccs = Object.values(SETTLE[doc.type]);
    const onDebit = settleOnDebit(doc.type);
    const due = dues.get(e.id);
    return {
      entryId: e.id, type: doc.type, number: doc.number, date: e.date, party: doc.party, payment: doc.payment,
      gross: e.lines.filter((l) => settleAccs.includes(l.account)).reduce((s, l) => s + (onDebit ? l.debit : l.credit), 0) || t.gross,
      vat: t.vat, rows: doc.rows.length,
      locked: !!company?.lockedThrough && row.date.getTime() <= company.lockedThrough.getTime(),
      editedInJournal: edited,
      ...(due ? { paid: due.paid, due: due.due, dueStatus: due.status } : {}),
      ...(doc.baseEntryId ? { baseEntryId: doc.baseEntryId } : {}),
    };
  });
  return [...docs, ...imports].sort((a, b) => b.date.localeCompare(a.date));
}

/** Ввозы товара за период — в общем списке как поступления (суммы и НДС из документа ввоза). */
async function importSummaries(companyId: string, from: string, to: string, lockedThrough: Date | null): Promise<DocSummary[]> {
  const rows = await prisma.journalEntry.findMany({ where: { companyId, sourceRef: { startsWith: "import:" }, date: { gte: fromIsoDate(from), lte: fromIsoDate(to) } }, select: { id: true, date: true } });
  if (!rows.length) return [];
  const copies = await prisma.companyRecord.findMany({ where: { companyId, kind: "importDoc", key: { in: rows.map((r) => r.id) } }, select: { key: true, data: true } });
  const byId = new Map(copies.map((c) => [c.key, c.data as unknown as ImportDoc]));
  return rows.flatMap((r) => {
    const d = byId.get(r.id);
    if (!d) return [];
    const c = calcImport(d);
    return [{
      entryId: r.id, type: "purchase" as const, number: d.number, date: toIsoDate(r.date), party: d.supplier, payment: "credit",
      gross: Math.round((c.totals.cost + (d.vatPayer ? c.totals.vat : 0)) * 100) / 100, vat: c.totals.vat, rows: d.rows.length,
      locked: !!lockedThrough && r.date.getTime() <= lockedThrough.getTime(), editedInJournal: false, importDoc: true,
    }];
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

export async function suggestNumber(companyId: string, date: string, type: DocType = "sale"): Promise<string> {
  const y = date.slice(0, 4);
  const rows = await prisma.journalEntry.findMany({
    where: { companyId, source: "trade", sourceRef: { startsWith: `${type}:` }, date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } },
    select: { sourceRef: true, date: true },
  });
  return nextNumber(rows.map((r) => ({ ref: r.sourceRef, date: r.date.toISOString().slice(0, 10) })), date, type);
}

async function assertUniqueNumber(companyId: string, doc: TradeDoc, exceptId?: string) {
  const y = doc.date.slice(0, 4);
  const same = await prisma.journalEntry.findMany({
    where: { companyId, source: "trade", sourceRef: docRef(doc), ...(exceptId ? { id: { not: exceptId } } : {}), ...(ownNumbering(doc.type) ? { date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } } : {}) },
    include: { lines: true },
  });
  const clash = ownNumbering(doc.type) ? same[0] : same.find((e) => docFromEntry(toLedgerEntry(e))?.party.trim().toLowerCase() === doc.party.trim().toLowerCase());
  if (clash) throw new HttpError(409, ownNumbering(doc.type) ? `${DOC_LABEL[doc.type]} № ${doc.number} за ${y} год уже есть — возьмите другой номер` : `Поступление № ${doc.number} от «${doc.party}» уже введено`);
}

function clean(doc: TradeDoc): TradeDoc {
  return {
    ...doc, number: doc.number.trim(), party: doc.party.trim(), partyInn: doc.partyInn?.replace(/\D/g, "") || undefined,
    basis: doc.basis?.trim() || undefined, comment: doc.comment?.trim() || undefined,
    rows: doc.rows.map((r) => ({ ...r, name: r.name.trim(), unit: normalizeUnit(r.unit) || r.unit || "шт" })),
  };
}

/** Creates the document: its journal entry, then the copy; the cost of goods follows if auto write-off is on. */
export async function createDoc(companyId: string, input: TradeDoc): Promise<{ entryId: string; cogs: number; problems: string[] }> {
  const doc = clean(input);
  const problems = [...validateDoc(doc), ...validateEntry({ date: doc.date, lines: docLines(doc) })];
  if (problems.length) throw new HttpError(400, problems.join("; "));
  await assertUniqueNumber(companyId, doc);
  const row = await createEntry(prisma, { companyId, date: doc.date, description: docDescription(doc), source: "trade", sourceRef: docRef(doc), lines: docLines(doc) });
  await prisma.companyRecord.create({ data: { companyId, kind: DOC, key: row.id, data: JSON.parse(JSON.stringify(doc)) } });
  if (!isReturn(doc.type)) await addMissingToCatalog(companyId, doc).catch(() => 0);
  const cogs = doc.type === "sale" ? await autoCogsFor(companyId, row.id, doc.date) : 0;
  const back = doc.type === "saleReturn" ? await restoreReturnCost(companyId, row.id, doc) : { lines: 0, problems: [] as string[] };
  return { entryId: row.id, cogs: cogs + back.lines, problems: back.problems };
}

/** Rewrites the document and its entry (history keeps the old version); `version` guards against overwriting. */
export async function updateDoc(companyId: string, entryId: string, input: TradeDoc, version?: string): Promise<{ entryId: string; cogs: number; problems: string[] }> {
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
  if (!isReturn(doc.type)) await addMissingToCatalog(companyId, doc).catch(() => 0);
  const cogs = doc.type === "sale" ? await autoCogsFor(companyId, entryId, doc.date) : 0;
  const back = doc.type === "saleReturn" ? await restoreReturnCost(companyId, entryId, doc) : { lines: 0, problems: [] as string[] };
  return { entryId, cogs: cogs + back.lines, problems: back.problems };
}

/**
 * Documents from 1С (see lib/trade/import1c.ts), oldest first, purchases before sales of the same day.
 * A document whose number is already taken (same sale number in the year, same supplier document) is skipped.
 */
export async function importDocs(companyId: string, docs: TradeDoc[]): Promise<{ created: number; duplicates: number; cogs: number; problems: string[] }> {
  let created = 0, duplicates = 0, cogs = 0;
  const problems: string[] = [];
  const ordered = [...docs].sort((a, b) => (a.date === b.date ? (a.type === b.type ? 0 : a.type === "purchase" ? -1 : 1) : a.date < b.date ? -1 : 1));
  for (const d of ordered) {
    const label = `${d.type === "sale" ? "Реализация" : "Поступление"} № ${d.number} от ${d.date.split("-").reverse().join(".")}`;
    try {
      const r = await createDoc(companyId, d);
      created++; cogs += r.cogs;
    } catch (e) {
      if ((e as { status?: number })?.status === 409) {
        // тот же документ (контрагент и сумма совпадают) — повтор; иначе номер занят другим документом
        const same = await sameAsExisting(companyId, d);
        if (same === true) { duplicates++; continue; }
        problems.push(`${label}: номер уже занят другим документом${same ? ` (${same})` : ""} — не загружен, проверьте нумерацию`);
        continue;
      }
      problems.push(`${label}: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
  return { created, duplicates, cogs, problems: problems.slice(0, 100) };
}

/** true — the document with this number is the same (counterparty and total match); otherwise a short description of the one in the way. */
async function sameAsExisting(companyId: string, d: TradeDoc): Promise<true | string> {
  const y = d.date.slice(0, 4);
  const rows = await prisma.journalEntry.findMany({
    where: { companyId, source: "trade", sourceRef: docRef(d), ...(d.type === "sale" ? { date: { gte: fromIsoDate(`${y}-01-01`), lte: fromIsoDate(`${y}-12-31`) } } : {}) },
    include: { lines: true },
  });
  const gross = docTotals(d).gross;
  const party = d.party.trim().toLowerCase();
  let other = "";
  for (const row of rows) {
    const e = toLedgerEntry(row);
    const was = docFromEntry(e);
    if (!was) continue;
    const settle = e.lines.filter((l) => ["1410", "3110", "1110", "1210"].includes(l.account)).reduce((a, l) => a + (d.type === "sale" ? l.debit : l.credit), 0);
    if (was.party.trim().toLowerCase() === party && Math.abs(settle - gross) < 0.01) return true;
    other = `${e.date.split("-").reverse().join(".")}, ${was.party || "без контрагента"}, ${settle.toFixed(2)} сом`;
  }
  return other;
}

/**
 * Возврат от покупателя: товар возвращается на склад по себестоимости — Дт 1610/1620/1640 — Кт 7200 (7000
 * для продукции). Цена — себестоимость, списанная по документу-основанию; без основания — средняя на дату.
 * Отдельная проводка (source «cogs», sourceRef «<id возврата>:ret»): удаляется и пересчитывается вместе с возвратом.
 */
async function restoreReturnCost(companyId: string, entryId: string, doc: TradeDoc): Promise<{ lines: number; problems: string[] }> {
  const goods = doc.rows.filter((r) => r.kind !== "service" && r.qty > 0);
  if (!goods.length) return { lines: 0, problems: [] };
  const entries = await loadEntries(companyId, doc.date);
  // себестоимость единицы по документу-основанию: проводки списания «<id основания>:<строка>»
  const fromBase = new Map<string, number>();
  if (doc.baseEntryId) {
    for (const e of entries) {
      if (e.source !== "cogs" || !e.sourceRef?.startsWith(`${doc.baseEntryId}:`)) continue;
      for (const l of e.lines) if (l.credit > 0 && l.item && l.qty) fromBase.set(itemKey(l.item), Math.round((l.credit / Number(l.qty)) * 100) / 100);
    }
  }
  const avg = new Map(stockWithAverage(entries.filter((e) => e.id !== entryId), doc.date).filter((x) => x.avg > 0).map((x) => [itemKey(x.item), x.avg]));
  const lines: Parameters<typeof createEntry>[1]["lines"] = [];
  const problems: string[] = [];
  let total7200 = 0, total7000 = 0;
  for (const r of goods) {
    const unit = fromBase.get(itemKey(r.name)) ?? avg.get(itemKey(r.name));
    if (!unit) { problems.push(`${r.name}: себестоимость неизвестна — нет списания по документу-основанию и остатка на складе; верните на склад вручную (Дт 1610 — Кт 7200)`); continue; }
    const amount = Math.round(unit * r.qty * 100) / 100;
    lines.push({ account: KIND_ACCOUNT[r.kind] ?? "1610", debit: amount, credit: 0, item: r.name.trim(), qty: Math.round(r.qty * 1000) / 1000, unit: r.unit });
    if (r.kind === "product") total7000 += amount; else total7200 += amount;
  }
  if (total7200 > 0) lines.push({ account: "7200", debit: 0, credit: Math.round(total7200 * 100) / 100 });
  if (total7000 > 0) lines.push({ account: "7000", debit: 0, credit: Math.round(total7000 * 100) / 100 });
  if (lines.some((l) => l.debit > 0)) {
    await createEntry(prisma, { companyId, date: doc.date, source: "cogs", sourceRef: `${entryId}:ret`, description: `Возврат на склад по себестоимости: ${docDescription(doc)}`, lines });
  }
  return { lines: lines.filter((l) => l.debit > 0).length, problems };
}

/**
 * Оплата по документу в долг: Дт 1210/1110 — Кт 1410 (покупатель платит) или Дт 3110 — Кт 1210/1110 (платим
 * поставщику). Проводка привязана к документу (sourceRef «pay:<id>»), поэтому закрывает именно его.
 */
export async function payDoc(companyId: string, entryId: string, p: { amount: number; date: string; via: "bank" | "cash" }): Promise<{ entryId: string }> {
  const { doc } = await getDoc(companyId, entryId);
  if (doc.type !== "sale" && doc.type !== "purchase") throw new HttpError(400, "Оплату записывают по реализации или поступлению");
  if (doc.payment !== "credit") throw new HttpError(400, "Документ оплачен сразу — долга по нему нет");
  if (!(p.amount > 0)) throw new HttpError(400, "Сумма оплаты должна быть больше нуля");
  const money = p.via === "cash" ? "1110" : "1210";
  const party = doc.party.trim() || null, partyInn = doc.partyInn?.replace(/\D/g, "") || null;
  const amount = Math.round(p.amount * 100) / 100;
  const sale = isSaleSide(doc.type);
  const lines = sale
    ? [{ account: money, debit: amount, credit: 0 }, { account: "1410", debit: 0, credit: amount, party, partyInn }]
    : [{ account: "3110", debit: amount, credit: 0, party, partyInn }, { account: money, debit: 0, credit: amount }];
  const description = sale ? `Оплата от покупателя по реализации № ${doc.number}: ${doc.party}` : `Оплата поставщику по поступлению № ${doc.number}: ${doc.party}`;
  const row = await createEntry(prisma, { companyId, date: p.date, source: "manual", sourceRef: payRef(entryId), description, lines });
  return { entryId: row.id };
}
