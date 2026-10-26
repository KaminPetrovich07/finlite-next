import type { Metadata } from "next";
import { Source_Serif_4, IBM_Plex_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const display = Source_Serif_4({
  subsets: ["latin", "cyrillic"],
  weight: ["600", "700"],
  variable: "--font-display",
});
const body = IBM_Plex_Sans({
  subsets: ["latin", "cyrillic"],
  weight: ["400", "500", "600"],
  variable: "--font-body",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "FinLite KG",
  description: "Финансовая аналитика и налоговые режимы НК КР",
};

// Баланс / ОДДС / Капитал as separate hand-filled forms (/balance, /cashflow,
// /equity) are superseded by /reports, where they are derived from the
// journal. The routes still exist; they are just no longer in the menu.
const NAV_LINKS = [
  { href: "/reports",     label: "Отчётность" },
  { href: "/ledger",      label: "Журнал" },
  { href: "/transactions",label: "Выписки" },
  { href: "/",            label: "Калькулятор" },
  { href: "/compare",     label: "Режимы" },
  { href: "/executive",   label: "Big 4" },
  { href: "/leanops",     label: "LeanOps" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body min-h-screen">
        <nav className="sticky top-0 z-30 border-b border-fl-gold/10 bg-fl-charcoal/90 backdrop-blur-md px-4 sm:px-6">
          <div className="mx-auto flex max-w-5xl items-center justify-between py-3">
            <span className="font-display text-sm font-bold tracking-tight text-fl-gold">
              FinLite KG
            </span>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {NAV_LINKS.map((link) => (
                <a
                  key={link.href}
                  href={link.href}
                  className="label-caps text-fl-cream/50 hover:text-fl-gold-bright transition-colors"
                >
                  {link.label}
                </a>
              ))}
            </div>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
