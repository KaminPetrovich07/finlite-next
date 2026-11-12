"use client";

// How accounts are shown everywhere in the app: with codes of the KR chart
// («1210 Счета в национальной валюте») or as IFRS articles without codes
// («Расчётный счёт в банке (сом)»). A per-browser preference; every open
// component switches at once.

import { useEffect, useState } from "react";
import { accountLabel, type AccountView } from "@/lib/ledger/ifrs";

const KEY = "finlite:accountView";
const EVENT = "finlite:accountView";

function read(): AccountView {
  try { return localStorage.getItem(KEY) === "ifrs" ? "ifrs" : "codes"; } catch { return "codes"; }
}

export function useAccountView(): [AccountView, (v: AccountView) => void] {
  const [view, setView] = useState<AccountView>("codes");
  useEffect(() => {
    setView(read());
    const on = () => setView(read());
    window.addEventListener(EVENT, on);
    window.addEventListener("storage", on);
    return () => { window.removeEventListener(EVENT, on); window.removeEventListener("storage", on); };
  }, []);
  const set = (v: AccountView) => {
    try { localStorage.setItem(KEY, v); } catch { /* storage blocked: still switch for this page */ }
    setView(v);
    window.dispatchEvent(new Event(EVENT));
  };
  return [view, set];
}

/** Label of an account in the current view. */
export function useAccountLabel(): (code: string) => string {
  const [view] = useAccountView();
  return (code: string) => accountLabel(code, view);
}

export function AccountViewToggle({ className = "" }: { className?: string }) {
  const [view, setView] = useAccountView();
  const btn = (v: AccountView, label: string, title: string) => (
    <button
      type="button"
      title={title}
      onClick={() => setView(v)}
      aria-pressed={view === v}
      className={`rounded-md px-2.5 py-1 text-xs font-medium ${view === v ? "bg-fl-gold/20 text-fl-gold" : "text-fl-cream/60 hover:text-fl-cream"}`}
    >
      {label}
    </button>
  );
  return (
    <div className={`inline-flex items-center gap-0.5 rounded-lg border border-fl-line bg-fl-charcoal p-0.5 ${className}`} role="group" aria-label="Как показывать счета">
      {btn("ifrs", "Статьи МСФО", "Названия статей по МСФО, без кодов счетов")}
      {btn("codes", "План счетов", "Коды и названия по плану счетов КР (Пост. № 231)")}
    </div>
  );
}
