// Сервер раздела «Стройка»: объекты (CompanyRecord kind «buildObject», key = id объекта) и документы
// по объектам — проводки журнала (source «build», sourceRef «вид:объект:номер») с полной копией
// документа (kind «buildDoc», key = id проводки), как у торговых документов.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/http-error";
import { quietly, recordEntryEvent, snapshotOf } from "@/lib/ledger/guard";
import { createEntry, fromIsoDate, loadEntries, toLedgerEntry } from "@/lib/ledger/repo";
import { validateEntry } from "@/lib/ledger/engine";
import { itemKey } from "@/lib/ledger/stock";
import { stockWithAverage } from "@/lib/stock/cogs";
import { deleteEntries } from "@/lib/ledger/remove";
import { getCurrentUser } from "@/lib/auth/session";
import { normalizeUnit } from "@/lib/okei";
import { getRecord, listRecords, putRecord } from "@/lib/records";
import type { LedgerEntry } from "@/lib/ledger/types";
import {
  bdocDescription, bdocLines, bdocRef, ks2CostByStage, nextNumber, parseRef, r2, validateBuildDoc, validateObject,
  type BDocType, type BRow, type BuildDoc, type BuildObject,
} from "./model";

const OBJ = "buildObject" as const;
const DOC = "buildDoc" as const;
/** откуда списываются материалы: сначала сырьё и материалы, потом товары и продукция */
const STOCK_PREFER = ["1620", "1610", "1640"];

export async function listObjects(companyId: string): Promise<BuildObject[]> {
  const rows = await listRecords<BuildObject>(companyId, OBJ);
  return rows.map((r) => r.data).filter((o) => o && typeof o.id === "string");
}
export async function getObject(companyId: string, id: string): Promise<BuildObject> {
  const o = await getRecord<BuildObject>(companyId, OBJ, id);
  if (!o) throw new HttpError(404, "Объект не найден");
  return o;
}

function cleanObject(o: BuildObject): BuildObject {
  const s = (v?: string) => v?.trim() || undefined;
  return {
    ...o, name: o.name.trim(), address: s(o.address), customer: o.customer.trim(), customerInn: o.customerInn?.replace(/\D/g, "") || undefined,
    investor: s(o.investor), contractNo: s(o.contractNo), contractDate: s(o.contractDate), start: s(o.start), end: s(o.end),
    stages: o.stages.map((x) => ({ ...x, name: x.name.trim() })),
    works: o.works.map((w) => ({ ...w, name: w.name.trim(), code: s(w.code), unit: normalizeUnit(w.unit) || w.unit || "шт" })),
    resources: o.resources.map((r) => ({ ...r, name: r.name.trim(), unit: normalizeUnit(r.unit) || r.unit || "шт" })),
  };
}

export async function saveObject(companyId: string, input: BuildObject): Promise<BuildObject> {
  const o = cleanObject(input);
  const p = validateObject(o);
  if (p.length) throw new HttpError(400, p.join("; "));
  // этап, на который уже есть документы, удалить нельзя — документы потеряли бы место в анализе
  const docs = (await loadDocs(companyId, o.id)).map((d) => d.doc);
  const used = new Set(docs.flatMap((d) => d.rows.map((r) => r.stageId).filter(Boolean)));
  const gone = [...used].filter((id) => !o.stages.some((s) => s.id === id));
  if (gone.length) throw new HttpError(409, "Этап, на который уже оформлены документы, удалить нельзя — сначала перенесите или удалите эти документы");
  await putRecord(companyId, OBJ, o.id, o);
  return o;
}

/** Удаляет объект; с `withDocs` — и все его документы (проводки уходят в «Удалённые»). */
export async function deleteObject(companyId: string, id: string, withDocs: boolean): Promise<{ docs: number; locked: number }> {
  const entries = await prisma.journalEntry.findMany({ where: { companyId, source: "build", sourceRef: { contains: `:${id}:` } }, select: { id: true } });
  if (entries.length && !withDocs) throw new HttpError(409, `По объекту ${entries.length} док. — удалите объект вместе с документами`);
  let res = { deleted: 0, locked: 0 };
  if (entries.length) res = await deleteEntries(companyId, entries.map((e) => e.id));
  if (res.locked) throw new HttpError(409, `${res.locked} док. объекта в закрытом периоде — объект оставлен, остальные документы удалены`);
  await prisma.companyRecord.deleteMany({ where: { companyId, OR: [{ kind: OBJ, key: id }, { kind: DOC, key: { in: entries.map((e) => e.id) } }] } });
  return { docs: res.deleted, locked: res.locked };
}

// ── документы ─────────────────────────────────────────────────────────────

export interface DocItem { entryId: string; doc: BuildDoc; locked: boolean; editedInJournal: boolean; description: string; version: string }

/** Документ из проводки, если копии нет (например, проводку восстановили или поправили в журнале). */
function docFromEntry(e: LedgerEntry): BuildDoc | null {
  const ref = parseRef(e.sourceRef);
  if (!ref) return null;
  const rows: BRow[] = [];
  let cost = 0, party: string | undefined, partyInn: string | undefined;
  if (ref.type === "writeoff") {
    for (const l of e.lines) if (l.credit > 0 && l.item) { const q = Number(l.qty) || 1; rows.push({ name: l.item, unit: l.unit ?? "шт", qty: q, price: r2(l.credit / q), account: l.account }); }
  } else if (ref.type === "cost") {
    for (const l of e.lines) if (l.account === "1630" && l.debit > 0) rows.push({ name: (l.memo ?? "").split(" · ").pop() || "Затраты", unit: "усл", qty: 1, price: l.debit, costType: "other" });
    const settle = e.lines.find((l) => l.credit > 0 && l.party); party = settle?.party ?? undefined; partyInn = settle?.partyInn ?? undefined;
  } else {
    for (const l of e.lines) if (l.account === "6140" && l.credit > 0) { const q = Number(l.qty) || 1; rows.push({ name: l.item ?? "Работы", unit: l.unit ?? "усл", qty: q, price: r2(l.credit / q) }); }
    cost = e.lines.filter((l) => l.account === "7400").reduce((s, l) => s + l.debit, 0);
  }
  return { type: ref.type, objectId: ref.objectId, number: ref.number, date: e.date, rows, ...(ref.type === "cost" ? { pay: "credit" as const, party, partyInn } : {}), ...(cost ? { cost: r2(cost) } : {}) };
}

export async function loadDocs(companyId: string, objectId?: string): Promise<DocItem[]> {
  const [entries, company, copies] = await Promise.all([
    prisma.journalEntry.findMany({ where: { companyId, source: "build", ...(objectId ? { sourceRef: { contains: `:${objectId}:` } } : {}) }, include: { lines: true }, orderBy: [{ date: "asc" }, { createdAt: "asc" }] }),
    prisma.company.findUnique({ where: { id: companyId }, select: { lockedThrough: true } }),
    prisma.companyRecord.findMany({ where: { companyId, kind: DOC }, select: { key: true, data: true, updatedAt: true } }),
  ]);
  const byId = new Map(copies.map((c) => [c.key, c]));
  const out: DocItem[] = [];
  for (const row of entries) {
    const e = toLedgerEntry(row);
    const copy = byId.get(e.id);
    const edited = !!copy && !!row.updatedAt && row.updatedAt.getTime() > copy.updatedAt.getTime() + 1000;
    const doc = copy && !edited ? (copy.data as unknown as BuildDoc) : docFromEntry(e);
    if (!doc || (objectId && doc.objectId !== objectId)) continue;
    out.push({
      entryId: e.id, doc: { ...doc, date: e.date }, description: e.description, version: (row.updatedAt ?? row.createdAt).toISOString(),
      locked: !!company?.lockedThrough && row.date.getTime() <= company.lockedThrough.getTime(), editedInJournal: edited || !copy,
    });
  }
  return out;
}

export async function suggestNumber(companyId: string, objectId: string, type: BDocType): Promise<string> {
  return nextNumber((await loadDocs(companyId, objectId)).map((d) => d.doc), type, objectId);
}

/** Остатки на складе на дату (без проводки `exceptId`) — наименование → количество, средняя цена и счёт. */
export async function stockAt(companyId: string, date: string, exceptId?: string): Promise<Map<string, { qty: number; avg: number; account: string; unit: string; name: string }>> {
  const entries = (await loadEntries(companyId, date)).filter((e) => e.id !== exceptId);
  const m = new Map<string, { qty: number; avg: number; account: string; unit: string; name: string }>();
  for (const s of stockWithAverage(entries, date).filter((x) => STOCK_PREFER.includes(x.account))) {
    const k = itemKey(s.item);
    const cur = m.get(k);
    const pref = (a: string) => STOCK_PREFER.indexOf(a);
    if (!cur || (cur.qty <= 0 && s.qty > 0) || (s.qty > 0 && pref(s.account) < pref(cur.account))) m.set(k, { qty: s.qty, avg: s.avg, account: s.account, unit: s.unit, name: s.item });
  }
  return m;
}

/** Цены списания (средняя по складу на дату) и себестоимость акта КС-2. */
async function prepare(companyId: string, input: BuildDoc, o: BuildObject, exceptId?: string): Promise<BuildDoc> {
  const doc: BuildDoc = {
    ...input, number: input.number.trim(), party: input.party?.trim() || undefined, partyInn: input.partyInn?.replace(/\D/g, "") || undefined,
    comment: input.comment?.trim() || undefined,
    rows: input.rows.map((r) => ({ ...r, name: r.name.trim(), unit: normalizeUnit(r.unit) || r.unit || "шт", code: r.code?.trim() || undefined })),
  };
  if (doc.type !== "cost") { delete doc.pay; delete doc.party; delete doc.partyInn; delete doc.reclass; }
  if (doc.type === "writeoff") {
    const stock = await stockAt(companyId, doc.date, exceptId);
    const need = new Map<string, number>();
    for (const r of doc.rows) need.set(itemKey(r.name), (need.get(itemKey(r.name)) ?? 0) + r.qty);
    const problems: string[] = [];
    for (const [k, q] of need) {
      const s = stock.get(k);
      const name = doc.rows.find((r) => itemKey(r.name) === k)!.name;
      if (!s || s.qty <= 0) problems.push(`«${name}» нет на складе на ${doc.date.split("-").reverse().join(".")} — сначала проведите поступление («Продажи и закупки»)`);
      else if (s.qty < q - 1e-9) problems.push(`«${name}»: на складе ${s.qty} ${s.unit}, списываете ${Math.round(q * 1000) / 1000}`);
    }
    if (problems.length) throw new HttpError(400, problems.join("; "));
    doc.rows = doc.rows.map((r) => { const s = stock.get(itemKey(r.name))!; return { ...r, price: s.avg, account: s.account, unit: r.unit || s.unit }; });
  }
  if (doc.type === "ks2") {
    const others = (await loadDocs(companyId, o.id)).filter((d) => d.entryId !== exceptId).map((d) => d.doc);
    doc.costByStage = ks2CostByStage(doc, o, others);
    doc.cost = r2(Object.values(doc.costByStage).reduce((s, x) => s + x, 0));
  }
  return doc;
}

async function assertUnique(companyId: string, doc: BuildDoc, exceptId?: string) {
  const clash = await prisma.journalEntry.findFirst({ where: { companyId, source: "build", sourceRef: bdocRef(doc), ...(exceptId ? { id: { not: exceptId } } : {}) }, select: { id: true } });
  if (clash) throw new HttpError(409, `Документ № ${doc.number} этого вида по объекту уже есть — возьмите другой номер`);
}

export async function createBuildDoc(companyId: string, input: BuildDoc): Promise<{ entryId: string; doc: BuildDoc }> {
  const o = await getObject(companyId, input.objectId);
  const p0 = validateBuildDoc(input, o);
  if (p0.length) throw new HttpError(400, p0.join("; "));
  const doc = await prepare(companyId, input, o);
  const lines = bdocLines(doc, o);
  const p = validateEntry({ date: doc.date, lines });
  if (p.length) throw new HttpError(400, p.join("; "));
  await assertUnique(companyId, doc);
  const row = await createEntry(prisma, { companyId, date: doc.date, description: bdocDescription(doc, o), source: "build", sourceRef: bdocRef(doc), lines });
  await prisma.companyRecord.create({ data: { companyId, kind: DOC, key: row.id, data: JSON.parse(JSON.stringify(doc)) } });
  return { entryId: row.id, doc };
}

export async function updateBuildDoc(companyId: string, entryId: string, input: BuildDoc, version?: string): Promise<{ entryId: string; doc: BuildDoc }> {
  const entry = await prisma.journalEntry.findFirst({ where: { id: entryId, companyId, source: "build" }, include: { lines: true } });
  if (!entry) throw new HttpError(404, "Документ не найден");
  if (version && (entry.updatedAt ?? entry.createdAt).toISOString() !== version) {
    throw new HttpError(409, "Пока вы редактировали, документ изменил другой пользователь. Откройте его заново и внесите правки ещё раз.");
  }
  const o = await getObject(companyId, input.objectId);
  const p0 = validateBuildDoc(input, o);
  if (p0.length) throw new HttpError(400, p0.join("; "));
  const doc = await prepare(companyId, input, o, entryId);
  const lines = bdocLines(doc, o);
  const p = validateEntry({ date: doc.date, lines });
  if (p.length) throw new HttpError(400, p.join("; "));
  await assertUnique(companyId, doc, entryId);
  const me = await getCurrentUser();
  const before = snapshotOf(entry);
  await quietly(() => prisma.$transaction(async (tx) => {
    await tx.journalLine.deleteMany({ where: { entryId } });
    await tx.journalLine.createMany({
      data: lines.map((l) => ({ entryId, accountCode: l.account, debit: l.debit, credit: l.credit, memo: l.memo ?? null, party: l.party ?? null, partyInn: l.partyInn ?? null, item: l.item ?? null, qty: l.qty ?? null, unit: l.unit ?? null })),
    });
    const updated = await tx.journalEntry.update({
      where: { id: entryId },
      data: { date: fromIsoDate(doc.date), description: bdocDescription(doc, o), sourceRef: bdocRef(doc), updatedAt: new Date(), updatedByName: me ? me.name?.trim() || me.email : null },
      include: { lines: true },
    });
    await recordEntryEvent(tx, { companyId, entryId, action: "update", source: "build", entryDate: doc.date, before, after: snapshotOf(updated), note: "изменён документ по объекту" });
    await tx.companyRecord.upsert({
      where: { companyId_kind_key: { companyId, kind: DOC, key: entryId } },
      create: { companyId, kind: DOC, key: entryId, data: JSON.parse(JSON.stringify(doc)) },
      update: { data: JSON.parse(JSON.stringify(doc)) },
    });
  }));
  return { entryId, doc };
}
