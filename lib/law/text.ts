// ════════════════════════════════════════════════════════════════════════
// lib/law/text.ts — полный текст нормативного акта: выделение из страницы
// сайта, разметка на разделы, главы и статьи (оглавление и ссылки на
// статью), реквизиты из шапки документа и сравнение двух редакций по статьям.
//
// Законы, кодексы и постановления — официальные документы, они не являются
// объектами авторского права (Закон КР «Об авторском праве и смежных
// правах», ст. 8), поэтому хранится полный текст.
// Модуль чистый: сеть, файлы и база — в lib/law/load.ts и lib/law/store.ts.
// ════════════════════════════════════════════════════════════════════════

import { createHash } from "node:crypto";
import { decodeEntities } from "@/lib/news/feeds";

// ─── из HTML в текст ─────────────────────────────────────────────────────

/** Paragraph structure is kept: block tags become line breaks. */
export function htmlToText(html: string): string {
  return decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<(script|style|noscript|svg|template|head)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<(nav|header|footer|aside|form|button|select)\b[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?(p|div|li|tr|h[1-6]|table|section|article|blockquote|pre|dd|dt|ul|ol)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]>/gi, "\t")
      .replace(/<[^>]+>/g, ""),
  )
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n").map((l) => l.trim()).filter(Boolean).join("\n");
}

const HEAD = /^(КОДЕКС|ЗАКОН|ПОСТАНОВЛЕНИЕ|ПОЛОЖЕНИЕ|УКАЗ|РЕШЕНИЕ|ПРИКАЗ|ИНСТРУКЦИЯ|ПРАВИЛА|ПОРЯДОК|РАСПОРЯЖЕНИЕ|МЕЖДУНАРОДН|НАЛОГОВЫЙ КОДЕКС|ТРУДОВОЙ КОДЕКС|ГРАЖДАНСКИЙ КОДЕКС)(?![\p{L}])/u; // \b не видит кириллицу
const UI = /^(скачать|печать|версия для печати|поделиться|в избранное|наверх|главная|поиск|войти|регистрация|меню|©|все права защищены|cookie|подписаться|назад|далее|показать (ещё|все)|ru|kg|en|рус|кыр|eng)$/i;

/**
 * The legal text inside a page: from the first heading line of an act
 * («ЗАКОН КЫРГЫЗСКОЙ РЕСПУБЛИКИ», «НАЛОГОВЫЙ КОДЕКС …») to the end, without
 * menu lines. Falls back to the whole page text when there is no such line.
 */
export function extractLegalText(html: string, title?: string): string {
  const lines = htmlToText(html).split("\n").filter((l) => !UI.test(l));
  let start = lines.findIndex((l) => HEAD.test(l) && l === l.toUpperCase());
  if (start < 0 && title) {
    const t = title.toLowerCase().replace(/[«»"]/g, "").slice(0, 40);
    start = lines.findIndex((l) => l.toLowerCase().replace(/[«»"]/g, "").includes(t));
  }
  if (start < 0) start = Math.max(0, lines.findIndex((l) => /^Статья\s+1\b/.test(l)) - 3);
  const body = lines.slice(start);
  // хвост сайта: короткие строки после последней статьи и подписи
  let end = body.length;
  while (end > 0 && body[end - 1].length < 25 && !/^(Президент|Председатель|г\.\s*Бишкек|от\s|№)/.test(body[end - 1])) end--;
  return body.slice(0, end).join("\n");
}

/** Text from DOCX/PDF/TXT: lines trimmed, page numbers and empty runs removed. */
export function cleanPlainText(text: string): string {
  return text
    .replace(/\r/g, "")
    .replace(/[ \t ]+/g, " ")
    .split("\n").map((l) => l.trim())
    .filter((l, i, a) => l && !/^-?\s*\d{1,4}\s*-?$/.test(l) && !(l === a[i - 1] && l.length < 60))
    .join("\n");
}

// ─── структура ───────────────────────────────────────────────────────────

export interface TocItem { level: 1 | 2 | 3; label: string; anchor: string; line: number }

const SECTION = /^(РАЗДЕЛ|Раздел)\s+([IVXLC]+|\d+)\b/;
const CHAPTER = /^(ГЛАВА|Глава)\s+(\d+(?:-\d+)?)\b/;
const ARTICLE = /^Статья\s+(\d+(?:-\d+)?)\.?\s*(.*)$/;

const slug = (s: string) => s.toLowerCase().replace(/[^\p{L}\d]+/gu, "-").replace(/^-|-$/g, "");

/** Разделы, главы и статьи: оглавление и якоря «#st-125», «#gl-3», «#r-ii». */
export function outline(text: string): TocItem[] {
  const out: TocItem[] = [];
  const seen = new Set<string>();
  text.split("\n").forEach((l, line) => {
    let m: RegExpMatchArray | null;
    let item: TocItem | null = null;
    if ((m = l.match(SECTION))) item = { level: 1, label: l.slice(0, 160), anchor: `r-${slug(m[2])}`, line };
    else if ((m = l.match(CHAPTER))) item = { level: 2, label: l.slice(0, 160), anchor: `gl-${m[2]}`, line };
    else if ((m = l.match(ARTICLE))) item = { level: 3, label: l.slice(0, 200), anchor: `st-${m[1]}`, line };
    if (!item) return;
    // одинаковые номера (статья 1 в разных приложениях) получают суффикс
    let a = item.anchor, k = 2;
    while (seen.has(a)) a = `${item.anchor}-${k++}`;
    seen.add(a);
    out.push({ ...item, anchor: a });
  });
  return out;
}

const SIGNATURE = /^(Президент|Председатель|Премьер-министр|Торага|г\.\s*Бишкек|город Бишкек)/;

/** Article label → its text (heading line included), for comparing editions. */
export function articles(text: string): Map<string, string> {
  const lines = text.split("\n");
  const toc = outline(text).filter((t) => t.level === 3);
  const map = new Map<string, string>();
  toc.forEach((t, i) => {
    const next = outline(text).find((x) => x.line > t.line)?.line ?? lines.length;
    const end = i + 1 < toc.length ? Math.min(toc[i + 1].line, next) : next;
    // подпись и место принятия после последней статьи — не часть статьи
    const part = lines.slice(t.line, end);
    const sig = part.findIndex((l, k) => k > 0 && SIGNATURE.test(l));
    map.set(t.anchor, (sig > 0 ? part.slice(0, sig) : part).join("\n"));
  });
  return map;
}

export interface Changes { changed: string[]; added: string[]; removed: string[]; whole: boolean }

/** Which articles differ between two editions (labels like «Статья 125»). */
export function compareEditions(before: string, after: string): Changes {
  const a = articles(before), b = articles(after);
  if (!a.size || !b.size) return { changed: [], added: [], removed: [], whole: normalize(before) !== normalize(after) };
  const label = (k: string, m: Map<string, string>) => (m.get(k) ?? "").split("\n")[0].match(/^Статья\s+\S+?(?=\.|\s|$)/)?.[0] ?? k;
  const changed: string[] = [], added: string[] = [], removed: string[] = [];
  for (const [k, v] of b) {
    if (!a.has(k)) added.push(label(k, b));
    else if (normalize(a.get(k)!) !== normalize(v)) changed.push(label(k, b));
  }
  for (const k of a.keys()) if (!b.has(k)) removed.push(label(k, a));
  return { changed, added, removed, whole: false };
}

export const normalize = (s: string) => s.replace(/\s+/g, " ").replace(/[«»"“”]/g, '"').trim();
export const textHash = (s: string) => createHash("sha256").update(normalize(s)).digest("hex").slice(0, 32);

// ─── реквизиты ───────────────────────────────────────────────────────────

const MONTHS = "января|февраля|марта|апреля|мая|июня|июля|августа|сентября|октября|ноября|декабря";

/** «от 18 января 2022 года № 3» из первых строк документа. */
export function requisites(text: string): string | null {
  const head = text.slice(0, 3000);
  const m = head.match(new RegExp(`от\\s+(\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})\\s*(?:года|г\\.)?\\s*(?:№|N)\\s*([\\w\\-/]+)`, "i"))
    ?? head.match(/(\d{1,2}\.\d{2}\.\d{4})\s*(?:года|г\.)?\s*(?:№|N)\s*([\w\-/]+)/);
  return m ? `от ${m[1]} № ${m[2]}` : null;
}

/** Последняя редакция из пометки «(В редакции Законов КР от …)». */
export function lastAmendment(text: string): string | null {
  const head = text.slice(0, 20000);
  const block = head.match(/\(\s*В\s+редакци[ия][^)]*\)/i)?.[0];
  if (!block) return null;
  const dates = [...block.matchAll(new RegExp(`(\\d{1,2}\\s+(?:${MONTHS})\\s+\\d{4})|(\\d{1,2}\\.\\d{2}\\.\\d{4})`, "gi"))].map((m) => m[0]);
  return dates.length ? dates[dates.length - 1] : null;
}
