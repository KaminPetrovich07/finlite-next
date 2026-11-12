"use client";

import { useEffect, useRef, useState } from "react";
import { AUTH_ON } from "@/lib/auth/mode";

interface Me { user: { name: string | null; email: string; role: string } | null; plan?: { name: string } }

/** Account button in the top bar: sign-in link when signed out, menu when signed in. */
export function UserMenu() {
  const [me, setMe] = useState<Me | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then(setMe).catch(() => setMe({ user: null }));
  }, []);
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!me) return <span className="h-9 w-9 flex-shrink-0" />;
  if (!me.user) {
    if (!AUTH_ON) return null; // открытый режим: входить не нужно
    return (
      <a href="/login" className="flex h-9 flex-shrink-0 items-center rounded-md bg-fl-accent px-3 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">
        Войти
      </a>
    );
  }
  const u = me.user;
  const initials = (u.name ?? u.email).split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button onClick={() => setOpen((v) => !v)} aria-haspopup="menu" aria-expanded={open} aria-label="Аккаунт"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-fl-gold/20 text-xs font-bold text-fl-cream hover:bg-fl-gold/30">
        {initials}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 p-1.5 shadow-lift">
          <div className="px-3 py-2">
            <p className="truncate text-sm font-semibold text-fl-cream">{u.name ?? u.email}</p>
            <p className="truncate text-xs text-fl-cream/55">{u.email}</p>
            {me.plan && <p className="mt-0.5 text-xs text-fl-gold">Тариф «{me.plan.name}»</p>}
          </div>
          <div className="my-1 border-t border-fl-line" />
          <a role="menuitem" href="/account" className="block rounded-lg px-3 py-2 text-sm text-fl-cream/90 hover:bg-fl-surface-2">Мой аккаунт</a>
          <a role="menuitem" href="/companies" className="block rounded-lg px-3 py-2 text-sm text-fl-cream/90 hover:bg-fl-surface-2">Мои компании</a>
          {u.role === "admin" && <a role="menuitem" href="/admin" className="block rounded-lg px-3 py-2 text-sm text-fl-cream/90 hover:bg-fl-surface-2">Администрирование</a>}
          <a role="menuitem" href="/pricing" className="block rounded-lg px-3 py-2 text-sm text-fl-cream/90 hover:bg-fl-surface-2">Тарифы</a>
          <div className="my-1 border-t border-fl-line" />
          <button role="menuitem" onClick={logout} className="block w-full rounded-lg px-3 py-2 text-left text-sm text-fl-cream/90 hover:bg-fl-surface-2">Выйти</button>
        </div>
      )}
    </div>
  );
}
