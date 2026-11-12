// ════════════════════════════════════════════════════════════════════════
// lib/news/feeds.ts — разбор внешних лент для раздела «Новости и наука»:
// RSS 2.0, Atom и публичные Telegram-каналы (страница t.me/s/<канал>).
//
// Из источника берётся только заголовок, короткий анонс (до 400 знаков),
// дата, картинка-превью и прямая ссылка на оригинал — полный текст не
// копируется. Хэштеги ставятся по словарю тем, вид публикации (новость,
// закон, постановление…) — по заголовку и разделу источника.
// Модуль чистый: ни сети, ни базы — всё это в lib/news/collect.ts.
// ════════════════════════════════════════════════════════════════════════

import type { PostKind } from "./types";

export interface FeedItem {
  /** stable id inside the source: guid, link or t.me post number */
  id: string;
  title: string;
  summary: string;
  url: string;
  image: string | null;
  date: string | null; // ISO
  categories: string[];
}

// ─── текст ───────────────────────────────────────────────────────────────

const ENT: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " ", laquo: "«", raquo: "»", mdash: "—", ndash: "–", hellip: "…", rsquo: "’", lsquo: "‘", ldquo: "“", rdquo: "”", bull: "•", shy: "" };

export function decodeEntities(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === "#") {
      const n = e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10);
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m;
    }
    return ENT[e.toLowerCase()] ?? m;
  });
}

export function stripHtml(html: string): string {
  return decodeEntities(
    html
      .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, " "),
  )
    .replace(/[ \t ]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

/** Up to `max` characters, cut at a sentence or word boundary. */
export function shorten(text: string, max: number): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const dot = Math.max(cut.lastIndexOf(". "), cut.lastIndexOf("! "), cut.lastIndexOf("? "));
  if (dot >= max * 0.5) return cut.slice(0, dot + 1);
  const sp = cut.lastIndexOf(" ");
  return `${cut.slice(0, sp > max * 0.6 ? sp : max).replace(/[,;:—–-]$/, "")}…`;
}

const absUrl = (u: string, base: string) => {
  try { return new URL(decodeEntities(u.trim()), base).toString(); } catch { return ""; }
};
const isoDate = (s: string | null | undefined) => {
  if (!s) return null;
  const t = Date.parse(s.trim());
  return Number.isFinite(t) ? new Date(t).toISOString() : null;
};

// ─── RSS / Atom ──────────────────────────────────────────────────────────

const cdata = (s: string) => s.replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");

function tag(block: string, name: string): string | null {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "i");
  const m = block.match(re);
  return m ? cdata(m[1]) : null;
}
function tags(block: string, name: string): string[] {
  const re = new RegExp(`<${name}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${name}>`, "gi");
  return [...block.matchAll(re)].map((m) => stripHtml(cdata(m[1]))).filter(Boolean);
}
function attr(block: string, name: string, a: string, where?: (el: string) => boolean): string | null {
  const re = new RegExp(`<${name}\\b[^>]*>`, "gi");
  for (const m of block.matchAll(re)) {
    if (where && !where(m[0])) continue;
    const v = m[0].match(new RegExp(`\\s${a}\\s*=\\s*("([^"]*)"|'([^']*)')`, "i"));
    if (v) return v[2] ?? v[3] ?? null;
  }
  return null;
}
const firstImg = (html: string) => {
  const m = cdata(html).match(/<img\b[^>]*\ssrc\s*=\s*("([^"]+)"|'([^']+)')/i);
  return m ? m[2] ?? m[3] : null;
};

/** RSS 2.0 or Atom → items. `base` resolves relative links. */
export function parseFeed(xml: string, base: string): FeedItem[] {
  const atom = /<feed\b[^>]*xmlns\s*=\s*["']http:\/\/www\.w3\.org\/2005\/Atom/i.test(xml) || (!/<item\b/i.test(xml) && /<entry\b/i.test(xml));
  const blocks = [...xml.matchAll(atom ? /<entry\b[\s\S]*?<\/entry>/gi : /<item\b[\s\S]*?<\/item>/gi)].map((m) => m[0]);
  const out: FeedItem[] = [];
  for (const b of blocks) {
    const title = stripHtml(tag(b, "title") ?? "");
    let url: string;
    if (atom) url = attr(b, "link", "href", (el) => !/rel\s*=\s*["'](?!alternate)/i.test(el)) ?? "";
    else url = stripHtml(tag(b, "link") ?? "") || (tag(b, "guid") ?? "");
    url = absUrl(url, base);
    if (!title || !url) continue;
    const html = (atom ? tag(b, "summary") ?? tag(b, "content") : tag(b, "description")) ?? "";
    const full = tag(b, "content:encoded") ?? tag(b, "content") ?? "";
    const image =
      attr(b, "media:content", "url", (el) => !/medium\s*=\s*["'](?!image)/i.test(el) && !/type\s*=\s*["'](?!image)/i.test(el)) ??
      attr(b, "media:thumbnail", "url") ??
      attr(b, "enclosure", "url", (el) => /type\s*=\s*["']image\//i.test(el) || /\.(jpe?g|png|webp|gif)(\?|["'])/i.test(el)) ??
      firstImg(html) ?? firstImg(full);
    const guid = stripHtml(tag(b, atom ? "id" : "guid") ?? "") || url;
    out.push({
      id: guid.slice(0, 300),
      title: shorten(title, 300),
      summary: shorten(stripHtml(html || full), 400),
      url,
      image: image ? absUrl(image, base) || null : null,
      date: isoDate(tag(b, "pubDate") ?? tag(b, "published") ?? tag(b, "updated") ?? tag(b, "dc:date")),
      categories: [...tags(b, "category"), ...[...b.matchAll(/<category\b[^>]*\sterm\s*=\s*["']([^"']+)["']/gi)].map((m) => m[1])].slice(0, 10),
    });
  }
  return out;
}

// ─── Telegram: t.me/s/<канал> ────────────────────────────────────────────

/** The inner HTML of the element that starts at `start` (balanced <div>). */
function innerDiv(html: string, start: number): string {
  const open = html.indexOf(">", start) + 1;
  let depth = 1, i = open;
  const re = /<\/?div\b[^>]*>/gi;
  re.lastIndex = open;
  for (let m = re.exec(html); m; m = re.exec(html)) {
    depth += m[0][1] === "/" ? -1 : 1;
    if (depth === 0) return html.slice(open, m.index);
    i = re.lastIndex;
  }
  return html.slice(open, i);
}

const bgUrl = (s: string) => s.match(/background-image\s*:\s*url\(\s*['"]?([^'")]+)['"]?\s*\)/i)?.[1] ?? null;

/** Messages of a public channel page (newest last on the page — returned newest first). */
export function parseTelegram(html: string, channel: string): FeedItem[] {
  const out: FeedItem[] = [];
  const re = /<div\s[^>]*class="[^"]*\btgme_widget_message\b[^"]*"[^>]*data-post="([^"]+)"[^>]*>/gi;
  const starts = [...html.matchAll(re)];
  starts.forEach((m, k) => {
    const end = k + 1 < starts.length ? starts[k + 1].index! : html.length;
    const block = html.slice(m.index!, end);
    const post = m[1];
    const t = block.search(/class="[^"]*\btgme_widget_message_text\b/);
    const textHtml = t >= 0 ? innerDiv(block, block.lastIndexOf("<div", t)) : "";
    const text = stripHtml(textHtml);
    if (!text) return; // photo without caption, service message
    const lines = text.split("\n").map((l) => l.trim()).filter(Boolean);
    let title = lines[0] ?? "";
    // a first line made of emoji or a hashtag row is not a headline
    if (title.replace(/[\p{Extended_Pictographic}\s#\p{P}]/gu, "").length < 8 && lines[1]) title = lines[1];
    const photo = block.match(/class="[^"]*\btgme_widget_message_photo_wrap\b[^"]*"[^>]*style="([^"]+)"/i)?.[1]
      ?? block.match(/style="([^"]+)"[^>]*class="[^"]*\btgme_widget_message_photo_wrap\b/i)?.[1]
      ?? block.match(/class="[^"]*\blink_preview_image\b[^"]*"[^>]*style="([^"]+)"/i)?.[1]
      ?? block.match(/class="[^"]*\btgme_widget_message_video_thumb\b[^"]*"[^>]*style="([^"]+)"/i)?.[1];
    const date = block.match(/<time[^>]*datetime="([^"]+)"/i)?.[1];
    const tagsInText = [...text.matchAll(/#([\p{L}\d_]{2,40})/gu)].map((x) => x[1]);
    out.push({
      id: post,
      title: shorten(title.replace(/^[\p{Extended_Pictographic}\s]+/u, ""), 200),
      // анонс — то, что после заголовка; короткий пост без продолжения анонса не имеет
      summary: shorten(lines.slice(lines.indexOf(title) + 1).join(" "), 400),
      url: `https://t.me/${post}`,
      image: photo ? bgUrl(decodeEntities(photo)) : null,
      date: isoDate(date),
      categories: tagsInText,
    });
  });
  return out.reverse();
}

/** og:image (or twitter:image) of an article page. */
export function ogImage(html: string, base: string): string | null {
  const head = html.slice(0, 200_000);
  for (const p of ["og:image:secure_url", "og:image", "twitter:image"]) {
    const re = new RegExp(`<meta\\b[^>]*(?:property|name)\\s*=\\s*["']${p}["'][^>]*>`, "i");
    const el = head.match(re)?.[0];
    const v = el?.match(/\scontent\s*=\s*("([^"]*)"|'([^']*)')/i);
    const u = v ? v[2] ?? v[3] : null;
    if (u) return absUrl(u, base) || null;
  }
  return null;
}

// ─── темы, вид публикации, отбор ─────────────────────────────────────────

// \b в JavaScript не видит кириллицу как буквы — граница слова для Юникода:
const B = "(?:(?<=[\\p{L}\\d])(?![\\p{L}\\d])|(?<![\\p{L}\\d])(?=[\\p{L}\\d]))";
const U = (re: RegExp) => new RegExp(re.source.replace(/\\b/g, B), re.flags.includes("u") ? re.flags : `${re.flags}u`);

/** Хэштег → признаки в тексте (корни слов, без учёта регистра). */
const TOPICS: Array<[string, RegExp]> = ([
  ["налоги", /налог|гнс\b|налогоплательщ/i],
  ["НДС", /\bндс\b|налог на добавленную/i],
  ["ЭСФ", /\bэсф\b|счет[а-я]*-фактур|счёт[а-я]*-фактур/i],
  ["ККМ", /\bккм\b|контрольно-кассов/i],
  ["прослеживаемость", /прослеживаем/i],
  ["единыйналог", /единого налог|единый налог|упрощённ|упрощенн/i],
  ["патент", /\bпатент/i],
  ["соцфонд", /соцфонд|социальн[а-я]* фонд|страховые взносы|пенсион/i],
  ["зарплата", /заработн[а-я]* плат|зарплат|минимальн[а-я]* размер оплаты/i],
  ["НБКР", /\bнбкр\b|нацбанк|национальн[а-я]* банк/i],
  ["учетнаяставка", /учетн[а-я]* ставк|учётн[а-я]* ставк/i],
  ["курсы", /курс[а-я]* (валют|доллар|рубл|евро|сом)|обменн/i],
  ["инфляция", /инфляц/i],
  ["банки", /(?<!национальн[а-я]* )\bбанк(?!ротств)|коммерческ[а-я]* банк|кредит|депозит|микрофинанс/i],
  ["страхование", /страхов(?!ые взносы)/i],
  ["бюджет", /бюджет/i],
  ["госзакупки", /госзакуп|государственн[а-я]* закуп|тендер/i],
  ["МСФО", /\bмсфо\b|\bifrs\b|\bias\s?\d|международн[а-я]* стандарт[а-я]* финансов/i],
  ["бухучет", /бухгалт|бухучет|бухучёт|финансов[а-я]* отчетност|финансов[а-я]* отчётност/i],
  ["аудит", /аудит/i],
  ["таможня", /таможен|\bдт\b|декларац[а-я]* на товары/i],
  ["ЕАЭС", /\bеаэс\b|евразийск/i],
  ["фондовыйрынок", /фондов[а-я]* (рын|бирж)|ценн[а-я]* бумаг|облигац|акционер/i],
  ["ESG", /\besg\b|устойчив[а-я]* развит|нефинансов[а-я]* отчетн|углерод/i],
  ["цифровизация", /цифров|электронн[а-я]* (подпис|сервис|услуг)|\bэцп\b|түндүк|тундук/i],
  ["законодательство", /\bзакон\b|закона\b|законопроект|кодекс|поправк/i],
  ["постановление", /постановлени|\bуказ(а|ом)?\b|распоряжени|приказ(а|ом)?\b|положени[ея] о/i],
] as Array<[string, RegExp]>).map(([t, re]) => [t, U(re)]);

export function autoTags(text: string, max = 5): string[] {
  const out: string[] = [];
  for (const [t, re] of TOPICS) if (re.test(text) && !out.includes(t)) out.push(t);
  return out.slice(0, max);
}

/** Есть ли в тексте хоть одна тема раздела — для общих новостных лент. */
export const isRelevant = (text: string) => TOPICS.some(([, re]) => re.test(text));

const LAW = U(/(^|\s)(закон\b|закон кыргызской|законопроект|кодекс|изменени[яй] в (закон|налогов|трудов))/i);
const REG = U(/(постановлени|\bуказ\b|распоряжени|приказ\b|решени[ея] правления|положени[ея] о|инструкци|порядок\b|правила\b|утвержден|разъяснени)/i);
const EVENT = /(конференци|семинар|вебинар|форум\b|круглый стол|конкурс\b|олимпиад)/i;

/** Вид публикации: раздел источника задаёт его по умолчанию, заголовок уточняет. */
export function classify(title: string, url: string, fallback: PostKind): PostKind {
  if (["article", "research", "collection"].includes(fallback)) return fallback;
  if (/\/ofitsialno\//i.test(url)) return LAW.test(title) ? "law" : "regulation";
  if (LAW.test(title)) return "law";
  if (REG.test(title)) return "regulation";
  if (EVENT.test(title)) return "event";
  return fallback;
}
