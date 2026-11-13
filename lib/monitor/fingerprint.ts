// Отпечаток ошибки: одинаковые сбои у разных людей и в разное время — одна строка в журнале.
import { createHash } from "node:crypto";

/** Убираем из текста то, что меняется от раза к разу: числа, идентификаторы, хеши сборки. */
export function normalizeMessage(m: string): string {
  return m
    .replace(/https?:\/\/[^\s)'"]+/g, "<url>")
    .replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi, "<uuid>")
    .replace(/\bc[a-z0-9]{20,30}\b/g, "<id>")
    .replace(/\b[0-9a-f]{12,}\b/gi, "<hex>")
    .replace(/\d+/g, "N")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 300);
}

/** Первая строка стека с кодом сайта, без номеров строк и хешей чанков. */
export function topFrame(stack?: string | null): string {
  if (!stack) return "";
  const line = stack.split("\n").map((s) => s.trim()).find((s) => /^at |@/.test(s) && !/node_modules|node:internal|<anonymous>/.test(s)) ?? "";
  return line
    .replace(/\(?(https?:\/\/[^/]+)?\/_next\/static\/chunks\/[^\s)]+\)?/g, "<chunk>")
    .replace(/:\d+:\d+/g, "")
    .replace(/\s+/g, " ")
    .slice(0, 200);
}

/** Путь страницы без запроса и без идентификаторов: /news/abc123 → /news/:id */
export function routeOf(url?: string | null): string {
  if (!url) return "";
  let p = url;
  try { p = new URL(url, "http://x").pathname; } catch { /* оставляем как есть */ }
  return p.split("/").map((s) => (/^(c[a-z0-9]{20,30}|\d+|[0-9a-f-]{16,})$/i.test(s) ? ":id" : s)).join("/").slice(0, 200);
}

export function fingerprint(source: string, message: string, stack?: string | null, url?: string | null): string {
  return createHash("sha256").update([source, normalizeMessage(message), topFrame(stack), routeOf(url)].join("|")).digest("hex").slice(0, 32);
}

/** Шум, который не наша ошибка: расширения браузера, сторонние скрипты, обрыв сети. */
export function isNoise(message: string, stack?: string | null): boolean {
  const s = `${message}\n${stack ?? ""}`;
  return /chrome-extension:|moz-extension:|safari-extension:|ResizeObserver loop|Script error\.?$|Load failed|Failed to fetch|NetworkError when attempting|AbortError|The operation was aborted|NEXT_REDIRECT|NEXT_NOT_FOUND/i.test(s);
}

/** Когда снова писать в Telegram о той же ошибке: первый раз, 10-й, 100-й, 1000-й. */
export const shouldAlert = (count: number, isNew: boolean) => isNew || count === 10 || count === 100 || count === 1000;
