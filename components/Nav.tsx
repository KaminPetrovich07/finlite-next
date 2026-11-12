"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackDialog } from "@/components/auth/FeedbackDialog";
import { UserMenu } from "@/components/auth/UserMenu";
import { ALL_LINKS, HOME_LINK, isActive, NAV_GROUPS, type NavLink } from "@/lib/nav";
import { openSearch } from "@/components/CommandPalette";


export function Nav() {
  const path = usePathname();
  const [feedback, setFeedback] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [mobile, setMobile] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !mobile) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) { setOpen(null); setMobile(false); } };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") { setOpen(null); setMobile(false); } };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open, mobile]);

  const current = ALL_LINKS.find((l) => isActive(l.href, path));

  return (
    <nav ref={ref} className="sticky top-0 z-30 border-b border-fl-line bg-fl-charcoal-2/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <a href="/" className="flex flex-shrink-0 items-center gap-2" aria-label="FinLite KG — рабочий стол">
          <Mark />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fl-cream">
            FinLite<span className="ml-1 text-fl-gold">KG</span>
          </span>
        </a>

        {/* desktop: three dropdown groups */}
        <div className="ml-2 hidden items-center gap-1 md:flex">
          {NAV_GROUPS.map((g) => {
            const activeGroup = g.links.some((l) => isActive(l.href, path));
            const here = g.links.find((l) => isActive(l.href, path));
            return (
              <div key={g.title} className="relative">
                <button
                  onClick={() => setOpen(open === g.title ? null : g.title)}
                  aria-expanded={open === g.title}
                  aria-haspopup="menu"
                  className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-3 py-1.5 text-sm transition-colors ${
                    activeGroup ? "bg-fl-gold/15 font-medium text-fl-cream" : "text-fl-cream/70 hover:bg-fl-cream/5 hover:text-fl-cream"
                  }`}
                >
                  {g.title}
                  {here && <span className="hidden text-fl-cream/55 lg:inline">· {here.label}</span>}
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" aria-hidden className={`transition-transform ${open === g.title ? "rotate-180" : ""}`}>
                    <path d="M6 9l6 6 6-6" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
                {open === g.title && (
                  <div role="menu" className="absolute left-0 top-10 z-40 w-80 overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 p-1.5 shadow-lift">
                    {g.links.map((l) => <MenuLink key={l.href} l={l} active={isActive(l.href, path)} />)}
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* phone: current page name */}
        <span className="min-w-0 flex-1 truncate text-sm text-fl-cream/70 md:hidden">{current?.label}</span>
        <span className="hidden flex-1 md:block" />

        <button
          onClick={openSearch}
          aria-label="Поиск по разделам"
          title="Поиск по разделам (Ctrl+K)"
          className="flex h-9 flex-shrink-0 items-center gap-2 rounded-md border border-fl-line px-2.5 text-sm text-fl-cream/60 hover:border-fl-gold/50 hover:text-fl-cream"
        >
          <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden><path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.06 1.06-4.2-4.2A6.5 6.5 0 1 1 8.5 2Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
          <span className="hidden lg:inline">Найти</span>
          <kbd className="hidden rounded border border-fl-line px-1 text-[10px] text-fl-cream/40 xl:inline">Ctrl K</kbd>
        </button>
        <button
          onClick={() => setFeedback(true)}
          aria-label="Обратная связь создателю"
          title="Обратная связь"
          className="hidden h-9 flex-shrink-0 items-center gap-1.5 rounded-md border border-fl-line px-2.5 text-sm text-fl-cream/75 hover:text-fl-cream sm:flex"
        >
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" strokeLinejoin="round" />
          </svg>
          <span className="hidden lg:inline">Отзыв</span>
        </button>
        <ThemeToggle />
        <UserMenu />
        <button
          onClick={() => setMobile((v) => !v)}
          aria-label="Меню"
          aria-expanded={mobile}
          className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-fl-line text-fl-cream/80 md:hidden"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            {mobile ? <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" /> : <path d="M4 7h16M4 12h16M4 17h16" strokeLinecap="round" />}
          </svg>
        </button>
      </div>

      {mobile && (
        <div className="max-h-[calc(100vh-60px)] overflow-y-auto border-t border-fl-line bg-fl-charcoal-2 px-4 pb-24 md:hidden">
          <button type="button" onClick={() => { setMobile(false); openSearch(); }} className="mt-3 flex w-full items-center gap-2 rounded-xl border border-fl-line bg-fl-surface-2 px-3 py-3 text-left text-sm text-fl-cream/55">
            <svg width="16" height="16" viewBox="0 0 20 20" aria-hidden><path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.06 1.06-4.2-4.2A6.5 6.5 0 1 1 8.5 2Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>
            Найти раздел или действие
          </button>
          <a href="/" className={`mt-2 block rounded-lg px-3 py-2.5 text-sm font-medium ${isActive("/", path) ? "bg-fl-gold/15 text-fl-cream" : "text-fl-cream/85"}`}>{HOME_LINK.label}</a>
          {NAV_GROUPS.map((g) => (
            <div key={g.title} className="pt-3">
              <p className="label-caps px-2 pb-1.5">{g.title}</p>
              <div className="grid grid-cols-2 gap-1">
                {g.links.map((l) => (
                  <a key={l.href} href={l.href} aria-current={isActive(l.href, path) ? "page" : undefined}
                    className={`rounded-lg px-3 py-2.5 text-sm leading-tight ${isActive(l.href, path) ? "bg-fl-gold/15 font-semibold text-fl-cream" : "bg-fl-surface-2/60 text-fl-cream/85 hover:bg-fl-surface-2"}`}>{l.label}</a>
                ))}
              </div>
            </div>
          ))}
          <button onClick={() => { setMobile(false); setFeedback(true); }} className="mt-4 w-full rounded-lg border border-fl-line px-3 py-2.5 text-left text-sm text-fl-cream/80">
            Написать создателю
          </button>
        </div>
      )}
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
    </nav>
  );
}

function MenuLink({ l, active }: { l: NavLink; active: boolean }) {
  return (
    <a
      role="menuitem"
      href={l.href}
      aria-current={active ? "page" : undefined}
      className={`block rounded-lg px-3 py-2 ${active ? "bg-fl-gold/15" : "hover:bg-fl-surface-2"}`}
    >
      <span className={`block text-sm ${active ? "font-semibold text-fl-cream" : "font-medium text-fl-cream/90"}`}>{l.label}</span>
      <span className="block text-xs text-fl-cream/55">{l.desc}</span>
    </a>
  );
}

/** Brand mark: a ledger column with a gold total line. */
function Mark() {
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" aria-hidden className="flex-shrink-0">
      <rect x="1" y="1" width="24" height="24" rx="6" fill="rgb(var(--c-ink))" />
      <rect x="6" y="7" width="9" height="2" rx="1" fill="rgb(var(--c-bg))" opacity="0.75" />
      <rect x="6" y="11" width="12" height="2" rx="1" fill="rgb(var(--c-bg))" opacity="0.75" />
      <rect x="6" y="15" width="7" height="2" rx="1" fill="rgb(var(--c-bg))" opacity="0.75" />
      <rect x="6" y="19" width="14" height="2.5" rx="1.25" fill="rgb(var(--c-gold-fill))" />
    </svg>
  );
}

function ThemeToggle() {
  const [dark, setDark] = useState(false);
  useEffect(() => { setDark(document.documentElement.dataset.theme === "dark"); }, []);

  function toggle() {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = "dark";
    else delete document.documentElement.dataset.theme;
    try { localStorage.setItem("finlite:theme", next ? "dark" : "light"); } catch { /* storage blocked */ }
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Включить светлую тему" : "Включить тёмную тему"}
      title={dark ? "Светлая тема" : "Тёмная тема"}
      className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md border border-fl-line text-fl-cream/70 hover:text-fl-cream"
    >
      {dark ? (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" strokeLinecap="round" />
        </svg>
      ) : (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z" strokeLinejoin="round" />
        </svg>
      )}
    </button>
  );
}
