import type { Metadata } from "next";
import "@fontsource/manrope/500.css";
import "@fontsource/manrope/600.css";
import "@fontsource/manrope/700.css";
import "@fontsource/manrope/800.css";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "./globals.css";
import { Nav } from "@/components/Nav";
import { ThemeScript } from "@/components/ThemeScript";

export const metadata: Metadata = {
  title: "FinLite KG",
  description: "Учёт, налоги и отчётность для бизнеса в Кыргызстане",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-body min-h-screen antialiased">
        <Nav />
        {children}
      </body>
    </html>
  );
}
