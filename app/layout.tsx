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

const NAV_LINKS = [
  { href: "/", label: "🧮 Калькулятор" },
  { href: "/compare", label: "💡 Режимы" },
  { href: "/balance", label: "🏦 Баланс" },
  { href: "/cashflow", label: "💸 ОДДС" },
  { href: "/equity", label: "📈 Капитал" },
  { href: "/executive", label: "🎯 Big 4" },
  { href: "/leanops", label: "🏭 LeanOps" },
  { href: "/transactions", label: "🏧 Выписки" },
];

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body className="font-body min-h-screen">
        <nav className="border-b border-fl-gold/10 bg-fl-charcoal-2/60 px-4 py-3 sm:px-6">
          <div className="mx-auto flex max-w-5xl flex-wrap gap-x-5 gap-y-1 text-sm">
            {NAV_LINKS.map((link) => (
              <a key={link.href} href={link.href} className="font-medium text-fl-cream/70 hover:text-fl-gold-bright hover:underline">
                {link.label}
              </a>
            ))}
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
