"use client";

import { useEffect, useRef } from "react";

interface Props {
  open: boolean;
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Right-hand panel for drill-down: «из каких проводок сложилась эта строка». */
export function Drawer({ open, title, subtitle, onClose, children }: Props) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  return (
    <div aria-hidden={!open} inert={!open} className={`fixed inset-0 z-50 overflow-hidden ${open ? "" : "pointer-events-none invisible"}`}>
      <div
        onClick={onClose}
        className={`absolute inset-0 bg-black/50 transition-opacity duration-200 ${open ? "opacity-100" : "opacity-0"}`}
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-fl-line bg-fl-charcoal-2
                    shadow-2xl transition-transform duration-200 ease-out ${open ? "translate-x-0" : "translate-x-full"}`}
      >
        <header className="flex items-start justify-between gap-4 border-b border-fl-line px-5 py-4">
          <div>
            <h2 className="font-display text-lg font-semibold text-fl-cream">{title}</h2>
            {subtitle && <p className="mt-0.5 text-sm text-fl-cream/50">{subtitle}</p>}
          </div>
          <button ref={closeRef} onClick={onClose} className="rounded px-2 py-1 text-sm text-fl-cream/60 hover:text-fl-cream">
            Закрыть
          </button>
        </header>
        <div className="flex-1 space-y-2.5 overflow-y-auto px-5 py-4">{children}</div>
      </aside>
    </div>
  );
}
