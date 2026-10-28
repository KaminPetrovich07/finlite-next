"use client";

import { useEffect, useRef, useState } from "react";
import { ROLE_LABEL } from "@/lib/auth/session";
import { FeedbackDialog } from "./FeedbackDialog";
import { logout, useMe } from "./useMe";

export function UserMenu() {
  const { me } = useMe();
  const [open, setOpen] = useState(false);
  const [feedback, setFeedback] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (!ref.current?.contains(e.target as Node)) setOpen(false); };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", esc); };
  }, [open]);

  if (!me || me.public) return null;
  const initial = (me.name || me.email).trim().charAt(0).toUpperCase();

  return (
    <div ref={ref} className="relative flex-shrink-0">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Меню пользователя"
        className="flex h-9 w-9 items-center justify-center rounded-full bg-fl-accent font-display text-sm font-bold text-fl-on-accent"
      >
        {initial}
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-11 z-40 w-64 overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-lift">
          <div className="border-b border-fl-line px-4 py-3">
            <p className="truncate text-sm font-semibold text-fl-cream">{me.name || me.email}</p>
            <p className="truncate text-xs text-fl-cream/55">{me.email}</p>
            <p className="mt-1 inline-block rounded-full bg-fl-gold/15 px-2 py-0.5 text-[11px] font-medium text-fl-gold">{ROLE_LABEL[me.role]}</p>
          </div>
          <nav className="py-1 text-sm">
            {me.role === "admin" && <Item href="/admin">Админ-панель</Item>}
            <Item href="/companies">Мои компании</Item>
            <Item href="/account">Профиль и ответы</Item>
            <button role="menuitem" onClick={() => { setOpen(false); setFeedback(true); }} className="block w-full px-4 py-2 text-left text-fl-cream/80 hover:bg-fl-surface-2 hover:text-fl-cream">
              Написать создателю
            </button>
            <button role="menuitem" onClick={logout} className="block w-full border-t border-fl-line px-4 py-2 text-left text-fl-cream/80 hover:bg-fl-surface-2 hover:text-fl-cream">
              Выйти
            </button>
          </nav>
        </div>
      )}
      <FeedbackDialog open={feedback} onClose={() => setFeedback(false)} />
    </div>
  );
}

function Item({ href, children }: { href: string; children: React.ReactNode }) {
  return <a role="menuitem" href={href} className="block px-4 py-2 text-fl-cream/80 hover:bg-fl-surface-2 hover:text-fl-cream">{children}</a>;
}
