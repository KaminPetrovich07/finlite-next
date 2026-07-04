"use client";

import { useState } from "react";

interface CollapsibleProps {
  title: string;
  subtitle?: string;
  defaultOpen?: boolean;
  children: React.ReactNode;
  badge?: string; // e.g. total value shown when collapsed
}

export function Collapsible({ title, subtitle, defaultOpen = false, children, badge }: CollapsibleProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="rounded-xl border border-fl-gold/15 bg-fl-charcoal-2 overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-4 py-3.5 sm:px-5 text-left
                   hover:bg-fl-gold/5 transition-colors focus-visible:ring-1 focus-visible:ring-fl-gold/50"
      >
        <div>
          <span className="font-display text-sm font-semibold uppercase tracking-widest text-fl-cream/70">
            {title}
          </span>
          {subtitle && <p className="text-xs text-fl-cream/40 mt-0.5">{subtitle}</p>}
        </div>
        <div className="flex items-center gap-3 flex-shrink-0 ml-4">
          {badge && !open && (
            <span className="font-mono text-sm tabular-nums text-fl-cream/60">{badge}</span>
          )}
          <svg
            className={`w-4 h-4 text-fl-gold/60 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
            fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
          >
            <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      <div className={`transition-all duration-200 ${open ? "max-h-[9999px] opacity-100" : "max-h-0 opacity-0 overflow-hidden"}`}>
        <div className="px-4 pb-4 pt-1 sm:px-5 sm:pb-5 border-t border-fl-gold/10">
          {children}
        </div>
      </div>
    </div>
  );
}
