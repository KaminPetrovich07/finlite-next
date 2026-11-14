// ════════════════════════════════════════════════════════════════════════
// lib/i18n — русский и кыргызский интерфейс.
// Ключ перевода — сам русский текст (как в gettext): непереведённая строка
// просто остаётся по-русски, поэтому разделы переводятся постепенно.
// Подстановки: t("Отмечено: {n}", { n: 3 }).
// ════════════════════════════════════════════════════════════════════════

import { KY } from "./ky";

export type Lang = "ru" | "ky";
export const LANG_NAME: Record<Lang, string> = { ru: "Русский", ky: "Кыргызча" };
export const LANG_SHORT: Record<Lang, string> = { ru: "РУ", ky: "КЫ" };
/** localStorage и cookie (cookie — для документов, которые формирует сервер) */
export const LANG_KEY = "finlite:lang";
export const LANG_COOKIE = "fl_lang";

export const isLang = (v: unknown): v is Lang => v === "ru" || v === "ky";

export function translate(lang: Lang, ru: string, vars?: Record<string, string | number>): string {
  let s = lang === "ky" ? KY[ru] ?? ru : ru;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m));
  return s;
}

/** Share of the given Russian strings that have a Kyrgyz translation (for tests and the admin). */
export function coverage(strings: string[]): { total: number; done: number; missing: string[] } {
  const missing = strings.filter((s) => !(s in KY));
  return { total: strings.length, done: strings.length - missing.length, missing };
}
