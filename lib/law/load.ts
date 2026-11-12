// Server-side: get the full text of an act from a web page or a file
// (HTML, DOCX, PDF, TXT). A page that only shows a viewer often links the
// document file — then the file is downloaded instead.
import { cleanPlainText, extractLegalText, htmlToText } from "./text";

const UA = "Mozilla/5.0 (compatible; FinLiteKG-LawBot/1.0; +https://finlite.kg)";
const MIN_CHARS = 1500;
const MAX_BYTES = 25 * 1024 * 1024;

export class LoadError extends Error {}

type Kind = "html" | "docx" | "pdf" | "txt" | "doc" | "rtf" | "unknown";

function kindOf(name: string, type: string, buf: Uint8Array): Kind {
  if (buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46) return "pdf"; // %PDF
  if (buf[0] === 0x50 && buf[1] === 0x4b) return "docx"; // ZIP
  if (buf[0] === 0xd0 && buf[1] === 0xcf) return "doc"; // старый Word
  if (buf[0] === 0x7b && buf[1] === 0x5c && buf[2] === 0x72) return "rtf"; // {\rt
  const n = name.toLowerCase();
  if (/html|xml/.test(type) || /\.html?$/.test(n)) return "html";
  if (/text\/plain/.test(type) || /\.txt$/.test(n)) return "txt";
  const head = new TextDecoder("latin1").decode(buf.slice(0, 512)).toLowerCase();
  return /<html|<!doctype|<body|<div/.test(head) ? "html" : "unknown";
}

function decode(buf: Uint8Array, type: string): string {
  const head = new TextDecoder("latin1").decode(buf.slice(0, 2048));
  const cs = (type.match(/charset=([\w-]+)/i)?.[1] ?? head.match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1] ?? head.match(/encoding=["']([\w-]+)["']/i)?.[1] ?? "utf-8").toLowerCase();
  try { return new TextDecoder(cs).decode(buf); } catch { return new TextDecoder("utf-8").decode(buf); }
}

async function docxText(buf: Uint8Array): Promise<string> {
  const mammoth = await import("mammoth");
  const r = await mammoth.extractRawText({ buffer: Buffer.from(buf) });
  return cleanPlainText(r.value);
}

async function pdfText(buf: Uint8Array): Promise<string> {
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), isEvalSupported: false, useSystemFonts: true, verbosity: 0 }).promise;
  const out: string[] = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p);
    const content = await page.getTextContent();
    let line = "";
    for (const it of content.items as Array<{ str?: string; hasEOL?: boolean }>) {
      line += it.str ?? "";
      if (it.hasEOL) { out.push(line); line = ""; }
    }
    if (line) out.push(line);
  }
  await doc.destroy();
  return cleanPlainText(out.join("\n"));
}

/** Text of a file the user uploaded or a page linked. */
export async function textOf(name: string, type: string, buf: Uint8Array, title?: string): Promise<string> {
  const kind = kindOf(name, type, buf);
  if (kind === "pdf") return pdfText(buf);
  if (kind === "docx") return docxText(buf);
  if (kind === "html") return extractLegalText(decode(buf, type), title);
  if (kind === "txt") return cleanPlainText(decode(buf, type));
  if (kind === "doc" || kind === "rtf") throw new LoadError("Старый формат Word (.doc/.rtf) не читается — сохраните файл как .docx или PDF");
  throw new LoadError("Не удалось определить формат: нужен HTML, DOCX, PDF или TXT");
}

async function download(url: string): Promise<{ buf: Uint8Array; type: string; url: string }> {
  let res: Response;
  try {
    res = await fetch(url, { headers: { "User-Agent": UA, Accept: "text/html,application/xhtml+xml,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,*/*;q=0.8" }, redirect: "follow", cache: "no-store", signal: AbortSignal.timeout(25000) });
  } catch (e) {
    throw new LoadError(e instanceof Error && e.name === "TimeoutError" ? "сайт не ответил за 25 секунд" : "сайт недоступен или не принимает подключение");
  }
  if (!res.ok) throw new LoadError(`сайт ответил ${res.status}`);
  const len = Number(res.headers.get("content-length") ?? 0);
  if (len > MAX_BYTES) throw new LoadError("файл больше 25 МБ");
  return { buf: new Uint8Array(await res.arrayBuffer()), type: res.headers.get("content-type") ?? "", url: res.url || url };
}

/** Links to the document file on a viewer page («Скачать», .docx, .pdf). */
export function fileLinks(html: string, base: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1], label = htmlToText(m[2]).toLowerCase();
    if (/\.(docx|pdf)(\?|$)/i.test(href) || /скачать|загрузить|download|docx|pdf/.test(label)) {
      try { out.push(new URL(href, base).toString()); } catch { /* skip */ }
    }
  }
  return [...new Set(out)].sort((a, b) => Number(/\.docx/i.test(b)) - Number(/\.docx/i.test(a))).slice(0, 4);
}

/** Full text of the act at `url`; throws LoadError with a plain reason. */
export async function textFromUrl(url: string, title?: string): Promise<string> {
  const page = await download(url);
  const name = new URL(page.url).pathname;
  let text = await textOf(name, page.type, page.buf, title);
  if (text.length >= MIN_CHARS) return text;
  if (kindOf(name, page.type, page.buf) === "html") {
    const html = decode(page.buf, page.type);
    for (const link of fileLinks(html, page.url)) {
      try {
        const f = await download(link);
        const t = await textOf(new URL(f.url).pathname, f.type, f.buf, title);
        if (t.length >= MIN_CHARS) return t;
      } catch { /* следующая ссылка */ }
    }
    text = htmlToText(html);
  }
  throw new LoadError(text.length < MIN_CHARS
    ? "на странице нет текста документа — сайт показывает его через браузерное приложение. Скачайте документ (DOCX или PDF) и загрузите файлом"
    : "не удалось выделить текст документа");
}
