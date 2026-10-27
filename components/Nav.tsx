"use client";

import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

// Баланс / ОДДС / Капитал as hand-filled forms (/balance, /cashflow, /equity)
// are superseded by /reports, where they are derived from the journal. The
// routes still exist; they are just no longer in the menu.
const GROUPS: Array<{ title: string; links: Array<{ href: string; label: string }> }> = [
  { title: "Учёт", links: [{ href: "/ledger", label: "Журнал" }, { href: "/transactions", label: "Выписки" }] },
  {
    title: "Отчёты",
    links: [
      { href: "/reports", label: "Отчётность" },
      { href: "/packages", label: "Пакеты и выгрузка" },
      { href: "/esg", label: "ESG" },
    ],
  },
  {
    title: "Инструменты",
    links: [
      { href: "/", label: "Калькулятор" },
      { href: "/compare", label: "Режимы" },
      { href: "/executive", label: "Big 4" },
      { href: "/leanops", label: "LeanOps" },
    ],
  },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="sticky top-0 z-30 border-b border-fl-line bg-fl-charcoal-2/90 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 py-2.5 sm:px-6">
        <a href="/reports" className="flex flex-shrink-0 items-center gap-2" aria-label="FinLite KG — на главную">
          <Mark />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fl-cream">
            FinLite<span className="ml-1 text-fl-gold-bright">KG</span>
          </span>
        </a>

        <div className="relative flex min-w-0 flex-1 items-center gap-5 overflow-x-auto [scrollbar-width:none]">
          {GROUPS.map((g, gi) => (
            <div key={g.title} className={`flex flex-shrink-0 items-center gap-1 ${gi > 0 ? "border-l border-fl-line pl-5" : ""}`}>
              <span className="sr-only">{g.title}:</span>
              {g.links.map((l) => {
                const active = l.href === "/" ? path === "/" : path?.startsWith(l.href);
                return (
                  <a
                    key={l.href}
                    href={l.href}
                    aria-current={active ? "page" : undefined}
                    className={`whitespace-nowrap rounded-md px-2.5 py-1.5 text-sm transition-colors ${
                      active
                        ? "bg-fl-gold/15 font-medium text-fl-gold-bright"
                        : "text-fl-cream/65 hover:bg-fl-cream/5 hover:text-fl-cream"
                    }`}
                  >
                    {l.label}
                  </a>
                );
              })}
            </div>
          ))}
        </div>

        <ThemeToggle />
      </div>
    </nav>
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
