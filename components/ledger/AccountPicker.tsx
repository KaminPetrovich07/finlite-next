"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { ifrsName, ifrsPickerGroups } from "@/lib/ledger/ifrs";

export interface PickGroup { title: string; accounts: Array<{ code: string; name: string }> }

/** Счета для проводок по группам плана (1100, 1200 …). */
export const CHART_GROUPS: PickGroup[] = (() => {
  const out: PickGroup[] = [];
  let cur: PickGroup | null = null;
  for (const a of ACCOUNTS) {
    if (a.header) {
      if (a.code.endsWith("000") && a.code !== "8000") continue;
      cur = { title: `${a.code} ${a.name}`, accounts: [] };
      out.push(cur);
    } else {
      const key = (c: string) => (c.startsWith("8") ? "8" : c.slice(0, 2));
      if (!cur || (!a.parent && key(a.code) !== key(cur.title))) {
        cur = { title: `${a.code} ${a.name}`, accounts: [] };
        out.push(cur);
      }
      cur.accounts.push({ code: a.code, name: a.name });
    }
  }
  return out.filter((g) => g.accounts.length);
})();
const IFRS_GROUPS: PickGroup[] = ifrsPickerGroups();

const RECENT_KEY = "finlite:recentAccounts";
const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е");
function readRecent(): string[] { try { return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]").slice(0, 6); } catch { return []; } }
function pushRecent(code: string) { try { localStorage.setItem(RECENT_KEY, JSON.stringify([code, ...readRecent().filter((c) => c !== code)].slice(0, 6))); } catch { /* приватный режим */ } }

const nameOf = (code: string, ifrs: boolean) => (ifrs ? ifrsName(code) : ACCOUNTS.find((a) => a.code === code)?.name ?? code);

/**
 * Выбор счёта с поиском: «касса», «1110», «ндс к оплате» — по коду или словам названия.
 * Наверху — счета, выбранные недавно. Стрелки, Enter и Esc работают с клавиатуры.
 */
export function AccountPicker({ value, onChange, ifrs, label, className = "" }: { value: string; onChange: (code: string) => void; ifrs: boolean; label: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [hi, setHi] = useState(0);
  const [recent, setRecent] = useState<string[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setRecent(readRecent()); setQ(""); setHi(0);
    setTimeout(() => input.current?.focus(), 0);
    const close = (e: MouseEvent) => { if (!box.current?.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const groups = ifrs ? IFRS_GROUPS : CHART_GROUPS;
  const flat = useMemo(() => {
    const words = norm(q).split(/\s+/).filter(Boolean);
    const match = (code: string, name: string) => !words.length || words.every((w) => code.startsWith(w) || norm(name).includes(w) || norm(nameOf(code, !ifrs)).includes(w));
    const out: Array<{ code: string; name: string; group: string }> = [];
    if (!words.length && recent.length) for (const c of recent) out.push({ code: c, name: nameOf(c, ifrs), group: "Недавние" });
    for (const g of groups) for (const a of g.accounts) if (match(a.code, a.name)) out.push({ ...a, group: g.title });
    return out;
  }, [q, recent, groups, ifrs]);

  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { list.current?.querySelector<HTMLElement>(`[data-i="${hi}"]`)?.scrollIntoView({ block: "nearest" }); }, [hi]);

  function pick(code: string) { onChange(code); pushRecent(code); setOpen(false); }
  function key(e: React.KeyboardEvent) {
    if (e.key === "ArrowDown") { e.preventDefault(); setHi((h) => Math.min(h + 1, flat.length - 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setHi((h) => Math.max(h - 1, 0)); }
    else if (e.key === "Enter") { e.preventDefault(); if (flat[hi]) pick(flat[hi].code); }
    else if (e.key === "Escape") { e.preventDefault(); setOpen(false); }
  }

  return (
    <div ref={box} className={`relative ${className}`}>
      <button type="button" aria-label={label} aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center gap-2 rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-left text-sm text-fl-cream hover:border-fl-gold/50 focus:border-fl-gold focus:outline-none">
        {value ? (
          <span className="min-w-0 flex-1 truncate">{!ifrs && <span className="num mr-1.5 text-fl-cream/50">{value}</span>}{nameOf(value, ifrs)}</span>
        ) : <span className="flex-1 text-fl-cream/40">{ifrs ? "Статья — начните вводить" : "Счёт — код или название"}</span>}
        <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4 shrink-0 text-fl-cream/40"><path fill="currentColor" d="M5.5 7.5 10 12l4.5-4.5 1 1L10 14 4.5 8.5z" /></svg>
      </button>
      {open && (
        <div className="absolute left-0 right-0 z-40 mt-1 min-w-[min(26rem,calc(100vw-2rem))] overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-2xl sm:right-auto sm:w-[28rem]">
          <div className="border-b border-fl-line p-2">
            <input ref={input} value={q} onChange={(e) => setQ(e.target.value)} onKeyDown={key} placeholder={ifrs ? "Касса, выручка, НДС…" : "1110, касса, ндс к оплате…"}
              role="combobox" aria-expanded aria-controls="fl-acc-list" aria-activedescendant={flat[hi] ? `fl-acc-${hi}` : undefined}
              className="w-full rounded-md bg-fl-surface-2 px-3 py-2 text-sm text-fl-cream placeholder:text-fl-cream/35 focus:outline-none" />
          </div>
          <div ref={list} id="fl-acc-list" role="listbox" className="max-h-72 overflow-y-auto py-1 text-sm">
            {flat.length === 0 && <p className="px-3 py-3 text-fl-cream/50">Ничего не найдено. Попробуйте код (например, 1110) или другое слово.</p>}
            {flat.map((a, i) => (
              <div key={`${a.group}-${a.code}`}>
                {(i === 0 || flat[i - 1].group !== a.group) && <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-fl-cream/40">{a.group}</p>}
                <button type="button" id={`fl-acc-${i}`} data-i={i} role="option" aria-selected={a.code === value} onMouseEnter={() => setHi(i)} onClick={() => pick(a.code)}
                  className={`flex w-full items-baseline gap-2 px-3 py-1.5 text-left ${i === hi ? "bg-fl-gold/15 text-fl-cream" : "text-fl-cream/80"} ${a.code === value ? "font-semibold" : ""}`}>
                  {!ifrs && <span className="num w-10 shrink-0 text-fl-cream/50">{a.code}</span>}
                  <span className="min-w-0 flex-1">{a.name}</span>
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
