"use client";

import type { ReactNode } from "react";

export const field = "mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
export const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";
export const primaryBtn = "w-full rounded-lg bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
export const ghostBtn = "rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream";

export function AuthShell({ title, subtitle, children, footer }: { title: string; subtitle?: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-[calc(100dvh-60px)] max-w-md flex-col justify-center px-4 py-10">
      <div className={`${card} p-6 sm:p-8`}>
        <h1 className="font-display text-2xl font-bold text-fl-cream">{title}</h1>
        {subtitle && <p className="mt-1.5 text-sm text-fl-cream/60">{subtitle}</p>}
        <div className="mt-6">{children}</div>
      </div>
      {footer && <div className="mt-4 text-center text-sm text-fl-cream/60">{footer}</div>}
    </main>
  );
}

export function ErrorNote({ text }: { text: string | null }) {
  if (!text) return null;
  return <p role="alert" className="mt-3 rounded-lg bg-fl-red/10 px-3 py-2 text-sm text-fl-red">{text}</p>;
}

/** Where to go after signing in: ?next= if it is a path on this site. */
export function nextPath(fallback = "/companies"): string {
  try {
    const n = new URLSearchParams(window.location.search).get("next");
    if (n && n.startsWith("/") && !n.startsWith("//")) return n;
  } catch { /* no window */ }
  return fallback;
}
