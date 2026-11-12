// Server-side: the legal library in the database — first fill from the
// catalogue, saving a new text (old one goes to the history of editions),
// the daily check of every act that has a source link, and a news item in
// «Новости и наука» when an act changes.
import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";
import { LAW_CATALOG } from "./catalog";
import { compareEditions, lastAmendment, outline, requisites, textHash, type Changes } from "./text";
import { LoadError, textFromUrl } from "./load";

const KEEP_EDITIONS = 5;

export function missingTables(e: unknown): never {
  if (/LegalDoc|LegalEdition|does not exist|P2021/i.test(String(e))) throw new HttpError(503, "В базе ещё нет таблиц правовой базы. Выполните один раз: npx prisma db push");
  throw e;
}

export async function ensureCatalog() {
  if (await prisma.legalDoc.count()) return;
  await prisma.legalDoc.createMany({ data: LAW_CATALOG.map((d) => ({ slug: d.slug, title: d.title, category: d.category, kind: d.kind })), skipDuplicates: true });
}

export interface SaveResult { status: "same" | "first" | "changed"; changes?: Changes; chars: number }

const list = (xs: string[], n = 12) => (xs.length > n ? `${xs.slice(0, n).join(", ")} и ещё ${xs.length - n}` : xs.join(", "));

export function describeChanges(c: Changes): string {
  if (c.whole) return "Текст документа изменён.";
  const parts: string[] = [];
  if (c.changed.length) parts.push(`Изменены: ${list(c.changed)}.`);
  if (c.added.length) parts.push(`Добавлены: ${list(c.added)}.`);
  if (c.removed.length) parts.push(`Исключены: ${list(c.removed)}.`);
  return parts.join(" ") || "Изменения в тексте без изменения статей (оформление, приложения).";
}

/** Store a text; when it differs from the stored one, keep the old edition and announce the change. */
export async function saveText(docId: string, text: string, origin: "url" | "file", sourceUrl?: string | null): Promise<SaveResult> {
  const doc = await prisma.legalDoc.findUnique({ where: { id: docId } });
  if (!doc) throw new HttpError(404, "Документ не найден");
  const hash = textHash(text);
  const now = new Date();
  if (doc.hash === hash) {
    await prisma.legalDoc.update({ where: { id: docId }, data: { checkedAt: now, lastError: null, ...(sourceUrl ? { sourceUrl } : {}) } });
    return { status: "same", chars: text.length };
  }
  const changes = doc.text ? compareEditions(doc.text, text) : undefined;
  const amendedAt = lastAmendment(text);
  await prisma.$transaction(async (tx) => {
    if (doc.text && doc.hash) {
      await tx.legalEdition.create({ data: { docId, hash: doc.hash, text: doc.text, amendedAt: doc.amendedAt, changes: changes as object } });
      const old = await tx.legalEdition.findMany({ where: { docId }, orderBy: { createdAt: "desc" }, skip: KEEP_EDITIONS, select: { id: true } });
      if (old.length) await tx.legalEdition.deleteMany({ where: { id: { in: old.map((o) => o.id) } } });
    }
    await tx.legalDoc.update({
      where: { id: docId },
      data: {
        text, hash, toc: outline(text) as object, chars: text.length, origin, requisites: requisites(text) ?? doc.requisites, amendedAt,
        loadedAt: doc.loadedAt ?? now, checkedAt: now, changedAt: doc.text ? now : doc.changedAt, lastError: null, ...(sourceUrl ? { sourceUrl } : {}),
      },
    });
  });
  if (doc.text && changes) {
    // новость о новой редакции — один раз на каждую редакцию
    await prisma.post.create({
      data: {
        kind: "law", title: `Новая редакция: ${doc.title}`, summary: `${amendedAt ? `Изменения от ${amendedAt}. ` : ""}${describeChanges(changes)}`.slice(0, 600),
        body: `${describeChanges(changes)}\n\nПолный текст в правовой базе FinLite: /law/${doc.slug}`, sourceUrl: sourceUrl ?? doc.sourceUrl, sourceName: "Правовая база FinLite",
        externalId: `law:${doc.id}:${hash}`, auto: true, docDate: now, tags: ["законодательство", ...(doc.category === "Налоги" ? ["налоги"] : [])], authorName: "Правовая база FinLite", authorOrg: "автопроверка редакций",
      },
    }).catch((e) => { if (!/P2002|Unique constraint/.test(String(e))) throw e; });
  }
  return { status: doc.text ? "changed" : "first", changes, chars: text.length };
}

export interface CheckResult { slug: string; title: string; status: SaveResult["status"] | "error"; error?: string }

/** Daily: download every act with a source link and store new editions. */
export async function checkAll(): Promise<CheckResult[]> {
  try {
    await ensureCatalog();
    const docs = await prisma.legalDoc.findMany({ where: { autoUpdate: true, sourceUrl: { not: null } }, select: { id: true, slug: true, title: true, sourceUrl: true }, orderBy: { checkedAt: { sort: "asc", nulls: "first" } } });
    const out: CheckResult[] = [];
    const started = Date.now();
    // по три документа одновременно, и не дольше 50 секунд на весь запуск — остальные проверятся завтра первыми
    for (let i = 0; i < docs.length && Date.now() - started < 50_000; i += 3) {
      out.push(...await Promise.all(docs.slice(i, i + 3).map(async (d): Promise<CheckResult> => {
        try {
          const r = await saveText(d.id, await textFromUrl(d.sourceUrl!, d.title), "url");
          return { slug: d.slug, title: d.title, status: r.status };
        } catch (e) {
          const error = e instanceof LoadError ? e.message : e instanceof Error ? e.message : String(e);
          await prisma.legalDoc.update({ where: { id: d.id }, data: { checkedAt: new Date(), lastError: error.slice(0, 300) } }).catch(() => {});
          return { slug: d.slug, title: d.title, status: "error", error };
        }
      })));
    }
    return out;
  } catch (e) { missingTables(e); }
}
