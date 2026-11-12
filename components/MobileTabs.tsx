"use client";

import { usePathname } from "next/navigation";
import { openSearch } from "@/components/CommandPalette";

const I = {
  home: <path d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1v-9.5Z" />,
  ledger: <path d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3V4Zm3 5h8M8 13h8M8 17h5" />,
  reports: <path d="M4 20V10m6 10V4m6 16v-7m4 7H2" />,
  search: <path d="M11 4a7 7 0 1 1 0 14 7 7 0 0 1 0-14Zm9 16-4-4" />,
};

/** Нижняя панель на телефоне: главное — под большим пальцем, всё остальное — в поиске. */
export function MobileTabs() {
  const path = usePathname() ?? "";
  if (/^\/(login|register|reset|privacy|terms)/.test(path)) return null;
  const tab = (href: string, label: string, icon: keyof typeof I, active: boolean) => (
    <a href={href} aria-current={active ? "page" : undefined} className={`flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] ${active ? "font-semibold text-fl-gold" : "text-fl-cream/60"}`}>
      <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{I[icon]}</svg>
      {label}
    </a>
  );
  return (
    <>
      <div className="h-16 md:hidden" aria-hidden />
      <nav aria-label="Быстрые разделы" className="fixed inset-x-0 bottom-0 z-40 border-t border-fl-line bg-fl-charcoal-2/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="mx-auto flex max-w-md items-stretch">
          {tab("/", "Главная", "home", path === "/")}
          {tab("/ledger", "Журнал", "ledger", path.startsWith("/ledger"))}
          <a href="/ledger?new=1" aria-label="Новая проводка" className="flex flex-1 items-center justify-center">
            <span className="-mt-5 flex h-12 w-12 items-center justify-center rounded-full bg-fl-accent text-fl-on-accent shadow-lift ring-4 ring-fl-charcoal">
              <svg aria-hidden viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>
            </span>
          </a>
          {tab("/reports", "Отчёты", "reports", path.startsWith("/reports"))}
          <button type="button" onClick={openSearch} className="flex flex-1 flex-col items-center gap-0.5 py-2 text-[11px] text-fl-cream/60">
            <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">{I.search}</svg>
            Найти
          </button>
        </div>
      </nav>
    </>
  );
}
