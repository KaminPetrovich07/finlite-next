"use client";

// «i» next to a row or indicator: what it means, how it is calculated, how to
// read it. Opens on hover (desktop) and on tap (phone). Rendered in a portal
// with fixed positioning so scrollable tables never clip it.
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { term as lookup, type Term } from "@/lib/glossary";

export function Info({ k, t, label }: { k?: string; t?: Term | null; label?: string }) {
  const data = t ?? (k ? lookup(k) : null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const id = useId();

  const place = useCallback(() => {
    const r = btn.current?.getBoundingClientRect();
    if (!r) return;
    const W = Math.min(320, window.innerWidth - 24);
    const left = Math.max(12, Math.min(r.left + r.width / 2 - W / 2, window.innerWidth - W - 12));
    const above = r.bottom + 220 > window.innerHeight && r.top > 240;
    setPos({ left, top: above ? r.top - 8 : r.bottom + 8, above });
  }, []);

  const show = () => { if (hideTimer.current) clearTimeout(hideTimer.current); place(); setOpen(true); };
  const hideSoon = () => { hideTimer.current = setTimeout(() => setOpen(false), 120); };

  useEffect(() => {
    if (!open) return;
    const close = (e: Event) => { if (e.type === "keydown" && (e as KeyboardEvent).key !== "Escape") return; setOpen(false); };
    const outside = (e: MouseEvent) => { if (!btn.current?.contains(e.target as Node)) setOpen(false); };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", close);
    document.addEventListener("mousedown", outside);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", close);
      document.removeEventListener("mousedown", outside);
    };
  }, [open]);

  if (!data) return null;
  return (
    <>
      <button
        ref={btn}
        type="button"
        aria-label={`Что это: ${label ?? data.title ?? "пояснение"}`}
        aria-describedby={open ? id : undefined}
        onClick={(e) => { e.stopPropagation(); if (open) setOpen(false); else show(); }}
        onMouseEnter={show}
        onMouseLeave={hideSoon}
        onFocus={show}
        onBlur={hideSoon}
        className="ml-1.5 inline-flex h-4 w-4 flex-shrink-0 translate-y-[-1px] items-center justify-center rounded-full border border-fl-cream/25 align-middle text-[10px] font-semibold leading-none text-fl-cream/50 hover:border-fl-info hover:text-fl-info focus:outline-none focus-visible:ring-2 focus-visible:ring-fl-info"
      >
        i
      </button>
      {open && pos && typeof document !== "undefined" && createPortal(
        <div
          id={id}
          role="tooltip"
          onMouseEnter={show}
          onMouseLeave={hideSoon}
          style={{ left: pos.left, top: pos.top, width: Math.min(320, window.innerWidth - 24), transform: pos.above ? "translateY(-100%)" : undefined }}
          className="fixed z-[60] rounded-xl border border-fl-line bg-fl-charcoal-2 px-3.5 py-3 text-left text-[13px] font-normal leading-relaxed text-fl-cream shadow-lift"
        >
          {(data.title || label) && <p className="mb-1 font-semibold">{data.title ?? label}</p>}
          <p className="text-fl-cream/85">{data.what}</p>
          {data.how && <p className="mt-1.5 text-fl-cream/70"><span className="font-medium text-fl-cream/85">Расчёт: </span>{data.how}</p>}
          {data.read && <p className="mt-1.5 text-fl-cream/70"><span className="font-medium text-fl-cream/85">Как читать: </span>{data.read}</p>}
        </div>,
        document.body,
      )}
    </>
  );
}
