import { ErrorReporter } from "@/components/ErrorReporter";
import { VersionTracker } from "@/components/VersionTracker";
import type { Metadata, Viewport } from "next";
import { InstallApp } from "@/components/InstallApp";
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
import { Footer } from "@/components/Footer";
import { CommandPalette } from "@/components/CommandPalette";
import { MobileTabs } from "@/components/MobileTabs";

export const metadata: Metadata = {
  title: "FinLite KG",
  description: "Учёт, налоги и отчётность для бизнеса в Кыргызстане",
  applicationName: "FinLite KG",
  appleWebApp: { capable: true, title: "FinLite", statusBarStyle: "default" },
  icons: { icon: [{ url: "/icons/icon-192.png", sizes: "192x192" }], apple: "/icons/apple-touch-icon.png" },
};

export const viewport: Viewport = { themeColor: "#12151C" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru" suppressHydrationWarning>
      <head>
        <ThemeScript />
      </head>
      <body className="font-body min-h-screen antialiased">
        <Nav />
        {children}
        <Footer />
        <MobileTabs />
        <CommandPalette />
        <ErrorReporter />
        <VersionTracker />
        <InstallApp />
      </body>
    </html>
  );
}
