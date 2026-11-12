"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { usePathname } from "next/navigation";
import { ALL_LINKS, NAV_ACTIONS, NAV_GROUPS, type NavLink } from "@/lib/nav";

const RECENT = "finlite:recentPages";
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
const readRecent = (): string[] => { try { return JSON.parse(localStorage.getItem(RECENT) ?? "[]"); } catch { return []; } };

/** Открыть поиск из любого места: кнопка в меню, нижняя панель телефона. */
export const openSearch = () => window.dispatchEvent(new Event("fl:search"));

const groupOf = new Map<string, string>(NAV_GROUPS.flatMap((g) => g.links.map((l) => [l.href, g.title] as [string, string])));

function score(l: NavLink, words: string[]): number {
  const label = norm(l.label), rest = norm(`${l.desc} ${l.keywords ?? ""} ${groupOf.get(l.href) ?? ""}`);
  let s = 0;
  for (const w of words) {
    if (label.startsWith(w)) s += 5;
    else if (label.split(/\s+/).some((x) => x.startsWith(w))) s += 4;
    else if (label.includes(w)) s += 3;
    else if (rest.includes(w)) s += 1;
    else return 0;
  }
  return s;
}

/**
 * Поиск по разделам и действиям: Ctrl+K (⌘K) или «/» в любом месте.
 * Без запроса — недавно открытые разделы и частые действия.
 */
export function CommandPalette() {
  const path = usePathname();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  // запоминаем открытые разделы
  useEffect(() => {
    if (!path) return;
    const link = ALL_LINKS.find((l) => (l.href === "/" ? path === "/" : path.startsWith(l.href)));
    if (!link) return;
    try { localStorage.setItem(RECENT, JSON.stringify([link.href, ...readRecent().filter((h) => h !== link.href)].slice(0, 5))); } catch { /* приватный режим */ }
  }, [path]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test((e.target as HTMLElement)?.tagName ?? "") || (e.target as HTMLElement)?.isContentEditable;
      if ((e.key === "k" || e.key === "л") && (e.ctrlKey || e.metaKey)) { e.preventDefault(); setOpen((v) => !v); }
      else if (e.key === "/" && !typing) { e.preventDefault(); setOpen(true); }
    };
    const onOpen = () => setOpen(true);
    window.addEventListener("keydown", onKey);
    window.addEventListener("fl:search", onOpen);
    return () => { window.removeEventListener("keydown", onKey); window.removeEventListener("fl:search", onOpen); };
  }, []);

  useEffect(() => {
    if (!open) return;
    setQ(""); setHi(0); setRecent(readRecent());
    setTimeout(() => input.current?.focus(), 0);
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const items = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    if (!words.length) {
      const rec = recent.map((h) => ALL_LINKS.find((l) => l.href === h)).filter(Boolean) as NavLink[];
      return [...rec.map((l) => ({ l, group: "Недавние" })), ...NAV_ACTIONS.map((l) => ({ l, group: "Действия" }))];
    }
    // действие чуть выше раздела с тем же весом; один адрес — один раз
    const found = [...NAV_ACTIONS.map((l) => ({ l, bonus: 0.5 })), ...ALL_LINKS.map((l) => ({ l, bonus: 0 }))]
      .map((x) => ({ l: x.l, s: score(x.l, words), b: x.bonus }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s + b.b - (a.s + a.b));
    const seen = new Set<string>();
    return found.filter((x) => (seen.has(x.l.href.split("?")[0] + x.l.label) ? false : (seen.add(x.l.href.split("?")[0] + x.l.label), true)))
      .slice(0, 12).map(({ l }) => ({ l, group: "Найдено" }));
  }, [q, recent]);

  useEffect(() => { setHi(0); list.current?.scrollTo({ top: 0 }); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  const go = (href: string) => { setOpen(false); window.location.href = href; };
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, items.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter" && items[hi]) { e.preventDefault(); go(items[hi].l.href); }
    else if (e.key === "Escape") setOpen(false);
  }

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center bg-fl-charcoal/60 p-3 pt-[10vh] backdrop-blur-sm" onMouseDown={(e) => { if (e.target === e.currentTarget) setOpen(false); }}>
      <div role="dialog" aria-modal aria-label="Поиск по разделам" className="w-full max-w-xl overflow-hidden rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-fl-line px-4">
          <svg aria-hidden viewBox="0 0 20 20" className="h-5 w-5 shrink-0 text-fl-cream/40"><path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.06 1.06-4.2-4.2A6.5 6.5 0 1 1 8.5 2Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
          <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder="Раздел или действие: проводка, НДС, баланс, зарплата…"
            className="w-full bg-transparent py-4 text-base text-fl-cream placeholder:text-fl-cream/35 focus:outline-none" />
          <kbd className="hidden rounded border border-fl-line px-1.5 py-0.5 text-[11px] text-fl-cream/45 sm:block">Esc</kbd>
        </div>
        <div ref={list} className="max-h-[60vh] overflow-y-auto p-2">
          {items.length === 0 && <p className="px-3 py-6 text-center text-sm text-fl-cream/50">Ничего не нашлось. Попробуйте другое слово: «касса», «отчёт», «налог».</p>}
          {items.map(({ l, group }, i) => (
            <div key={`${group}-${l.href}-${l.label}`}>
              {(i === 0 || items[i - 1].group !== group) && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fl-cream/40">{group}</p>}
              <button type="button" data-i={i} onMouseEnter={() => setHi(i)} onClick={() => go(l.href)}
                className={`flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left ${i === hi ? "bg-fl-gold/15" : ""}`}>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium text-fl-cream">{l.label}</span>
                  <span className="block truncate text-xs text-fl-cream/55">{l.desc}</span>
                </span>
                {i === hi && <span className="text-xs text-fl-cream/40">↵</span>}
              </button>
            </div>
          ))}
        </div>
        <div className="hidden items-center gap-4 border-t border-fl-line px-4 py-2 text-[11px] text-fl-cream/40 sm:flex">
          <span>↑↓ выбрать</span><span>↵ открыть</span><span>Ctrl K или / — открыть поиск в любом месте</span>
        </div>
      </div>
    </div>
  );
}
