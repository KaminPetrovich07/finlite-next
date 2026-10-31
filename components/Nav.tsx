"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { FeedbackDialog } from "@/components/auth/FeedbackDialog";

// Three groups, each a dropdown on desktop and a section of the menu on
// phones — so every page stays one click away and nothing is pushed off-screen.
interface NavLink { href: string; label: string; desc: string }
const GROUPS: Array<{ title: string; links: NavLink[] }> = [
  {
    title: "Учёт",
    links: [
      { href: "/companies", label: "Компании", desc: "Создать компанию, режим, ИНН, копия демо" },
      { href: "/ledger", label: "Журнал проводок", desc: "Операции, начальные остатки, зарплата, закрытие периода" },
      { href: "/transactions", label: "Банковские выписки", desc: "Загрузка выписки и разноска по счетам" },
      { href: "/import1c", label: "Обмен с 1С", desc: "Загрузка журнала, карточек счетов и ОСВ из 1С, выгрузка проводок" },
      { href: "/close", label: "Закрытие месяца", desc: "Проверка всех разделов, исправления и закрытие периода" },
    ],
  },
  {
    title: "Документы",
    links: [
      { href: "/policy", label: "Учётная политика", desc: "Приказ, политика, план счетов, документооборот" },
      { href: "/documents", label: "Первичные документы", desc: "Кассовые ордера, накладные, акты, ведомости, описи" },
      { href: "/costing", label: "Калькуляция", desc: "Себестоимость изделий по нормам и данным журнала" },
      { href: "/counterparties", label: "Контрагенты", desc: "Долги, просрочка, акты сверки, инвентаризация ИНВ-17" },
    ],
  },
  {
    title: "Отчёты",
    links: [
      { href: "/reports", label: "Финансовая отчётность", desc: "Баланс, ОПиУ, ОДДС, капитал, ОСВ, налоги" },
      { href: "/taxreports", label: "Налоговые отчёты ГНС", desc: "Единый налог, STI-161, налог с продаж, НДС, ЕНД — суммы и сроки" },
      { href: "/packages", label: "Пакеты и выгрузка", desc: "PDF, Word, Excel: полный, руководителю, аудитору" },
      { href: "/esg", label: "ESG-отчёт", desc: "Устойчивое развитие по GRI и IFRS S2" },
    ],
  },
  {
    title: "Анализ",
    links: [
      { href: "/", label: "Налоговый калькулятор", desc: "Налоги и прибыль по любому режиму НК КР" },
      { href: "/compare", label: "Выбор налогового режима", desc: "Сравнение режимов на ваших цифрах" },
      { href: "/executive", label: "Сводка для руководителя", desc: "Риски, безубыточность, сценарии, рекомендации" },
      { href: "/leanops", label: "Бережливое производство", desc: "Потери, аудит муда, юнит-экономика" },
    ],
  },
];

const isActive = (href: string, path: string | null) => (href === "/" ? path === "/" : !!path?.startsWith(href));

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

  const current = GROUPS.flatMap((g) => g.links).find((l) => isActive(l.href, path));

  return (
    <nav ref={ref} className="sticky top-0 z-30 border-b border-fl-line bg-fl-charcoal-2/95 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-2.5 sm:px-6">
        <a href="/reports" className="flex flex-shrink-0 items-center gap-2" aria-label="FinLite KG — на главную">
          <Mark />
          <span className="font-display text-[15px] font-semibold tracking-tight text-fl-cream">
            FinLite<span className="ml-1 text-fl-gold">KG</span>
          </span>
        </a>

        {/* desktop: three dropdown groups */}
        <div className="ml-2 hidden items-center gap-1 md:flex">
          {GROUPS.map((g) => {
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
        <div className="max-h-[calc(100vh-60px)] overflow-y-auto border-t border-fl-line bg-fl-charcoal-2 px-4 pb-4 md:hidden">
          {GROUPS.map((g) => (
            <div key={g.title} className="pt-3">
              <p className="label-caps px-2 pb-1">{g.title}</p>
              {g.links.map((l) => <MenuLink key={l.href} l={l} active={isActive(l.href, path)} />)}
            </div>
          ))}
          <button onClick={() => { setMobile(false); setFeedback(true); }} className="mt-3 w-full rounded-lg border border-fl-line px-3 py-2.5 text-left text-sm text-fl-cream/80">
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
