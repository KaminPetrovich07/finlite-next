"use client";

// Язык интерфейса в браузере: выбор хранится в localStorage (и cookie для сервера),
// все компоненты с useT() перерисовываются сразу, без перезагрузки страницы.
import { useCallback, useSyncExternalStore } from "react";
import { isLang, LANG_COOKIE, LANG_KEY, LANG_NAME, LANG_SHORT, translate, type Lang } from "@/lib/i18n";

const listeners = new Set<() => void>();
let current: Lang | null = null;

function read(): Lang {
  try { const v = localStorage.getItem(LANG_KEY); return isLang(v) ? v : "ru"; } catch { return "ru"; }
}
function subscribe(f: () => void) {
  listeners.add(f);
  const onStorage = (e: StorageEvent) => { if (e.key === LANG_KEY) { current = read(); listeners.forEach((g) => g()); } };
  window.addEventListener("storage", onStorage);
  return () => { listeners.delete(f); window.removeEventListener("storage", onStorage); };
}

export function setLang(lang: Lang) {
  current = lang;
  try { localStorage.setItem(LANG_KEY, lang); } catch { /* storage blocked */ }
  document.cookie = `${LANG_COOKIE}=${lang}; path=/; max-age=31536000; samesite=lax`;
  document.documentElement.lang = lang;
  listeners.forEach((f) => f());
}

/** The current language; the server render (and the first hydration pass) is Russian. */
export function useLang(): Lang {
  return useSyncExternalStore(subscribe, () => (current ??= read()), () => "ru");
}

export type TFn = (ru: string, vars?: Record<string, string | number>) => string;

export function useT(): TFn {
  const lang = useLang();
  return useCallback((ru, vars) => translate(lang, ru, vars), [lang]);
}

/** Translated text inside server components: <T>Тарифы</T>. */
export function T({ children, vars }: { children: string; vars?: Record<string, string | number> }) {
  const t = useT();
  return <>{t(children, vars)}</>;
}

/** РУ | КЫ switch. */
export function LangSwitch({ className = "" }: { className?: string }) {
  const lang = useLang();
  return (
    <div role="group" aria-label="Тил / Язык" className={`flex h-9 flex-shrink-0 items-center overflow-hidden rounded-md border border-fl-line text-xs ${className}`}>
      {(["ru", "ky"] as Lang[]).map((l) => (
        <button key={l} onClick={() => setLang(l)} aria-pressed={lang === l} title={LANG_NAME[l]}
          className={`h-full px-2 ${lang === l ? "bg-fl-gold/15 font-semibold text-fl-cream" : "text-fl-cream/55 hover:text-fl-cream"}`}>
          {LANG_SHORT[l]}
        </button>
      ))}
    </div>
  );
}
