"use client";

// «Удалённые»: проводки, удалённые за последние 90 дней, — с возвратом на место под прежним номером.
import { useCallback, useEffect, useState } from "react";
import { Drawer } from "@/components/ledger/Drawer";
import { formatNumber } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/ledger/types";
import type { Snapshot } from "@/lib/ledger/history";

interface Item { eventId: string; entryId: string; deletedAt: string; deletedBy: string | null; note: string | null; snapshot: Snapshot; total: number }

const dmy = (iso: string) => iso.split("-").reverse().join(".");
const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function Trash({ companyId, open, readOnly, onClose, onRestored }: { companyId: string; open: boolean; readOnly: boolean; onClose: () => void; onRestored: (msg: string) => void }) {
  const [items, setItems] = useState<Item[] | null>(null);
  const [days, setDays] = useState(90);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    setItems(null); setPicked(new Set());
    const r = await fetch(`/api/ledger/trash?companyId=${companyId}`);
    const b = await r.json().catch(() => ({}));
    setItems(r.ok ? b.items : []); if (b.days) setDays(b.days);
  }, [companyId]);
  useEffect(() => { if (open) { setMsg(null); load(); } }, [open, load]);

  async function restore(ids: string[]) {
    setBusy(true); setMsg(null);
    const r = await fetch("/api/ledger/trash", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, eventIds: ids }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { setMsg(b.error ?? "Не удалось восстановить"); return; }
    const skipped: Array<{ reason: string }> = b.skipped ?? [];
    const text = `Восстановлено: ${b.restored.length}` + (skipped.length ? `; пропущено ${skipped.length}: ${[...new Set(skipped.map((s) => s.reason))].join(", ")}` : "");
    setMsg(text);
    if (b.restored.length) onRestored(text);
    load();
  }

  // группы: одно удаление списком — одна группа (одна минута, один автор)
  const groups: Array<{ key: string; label: string; items: Item[] }> = [];
  for (const it of items ?? []) {
    const key = `${it.deletedAt.slice(0, 16)}|${it.deletedBy ?? ""}`;
    const g = groups.at(-1);
    if (g && g.key === key) g.items.push(it);
    else groups.push({ key, label: `${when(it.deletedAt)}${it.deletedBy ? ` · ${it.deletedBy}` : ""}`, items: [it] });
  }
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <Drawer open={open} title="Удалённые проводки" subtitle={`За последние ${days} дней. Восстановленная проводка встаёт на место с прежним номером и историей.`} onClose={onClose}>
      {items === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p>
        : items.length === 0 ? <p className="text-sm text-fl-cream/60">Удалённых проводок нет.</p>
        : <>
          {!readOnly && (
            <div className="sticky top-0 z-10 -mx-5 -mt-4 mb-1 flex flex-wrap items-center gap-3 border-b border-fl-line bg-fl-charcoal-2 px-5 py-2.5 text-sm">
              <button disabled={busy || !picked.size} onClick={() => restore([...picked])} className="rounded-md bg-fl-accent px-3 py-1.5 text-xs font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
                Восстановить отмеченные{picked.size ? ` (${picked.size})` : ""}
              </button>
              <button onClick={() => setPicked(picked.size === items.length ? new Set() : new Set(items.map((i) => i.eventId)))} className="text-xs text-fl-cream/60 hover:underline">
                {picked.size === items.length ? "снять отметки" : "отметить все"}
              </button>
              {msg && <span className="text-xs text-fl-cream/70">{msg}</span>}
            </div>
          )}
          {groups.map((g) => (
            <section key={g.key} className="space-y-2">
              <div className="flex items-center justify-between gap-2 pt-2 text-xs text-fl-cream/50">
                <span>Удалено {g.label}{g.items.length > 1 ? ` — ${g.items.length} проводок` : ""}</span>
                {!readOnly && g.items.length > 1 && <button disabled={busy} onClick={() => restore(g.items.map((i) => i.eventId))} className="text-fl-info hover:underline disabled:opacity-40">восстановить все {g.items.length}</button>}
              </div>
              {g.items.map((it) => (
                <article key={it.eventId} className={`rounded-lg border p-3 ${picked.has(it.eventId) ? "border-fl-gold/60 bg-fl-gold/5" : "border-fl-line bg-fl-charcoal/60"}`}>
                  <div className="flex items-start gap-2.5">
                    {!readOnly && <input type="checkbox" checked={picked.has(it.eventId)} onChange={() => toggle(it.eventId)} aria-label={`Отметить «${it.snapshot.description}»`} className="mt-1 h-4 w-4 shrink-0 accent-fl-gold" />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm text-fl-cream">{it.snapshot.description}</p>
                        <span className="num shrink-0 text-sm text-fl-cream/80">{formatNumber(it.total, 2)}</span>
                      </div>
                      <p className="mt-0.5 text-xs text-fl-cream/45">
                        {dmy(it.snapshot.date)} · {SOURCE_LABEL[it.snapshot.source as keyof typeof SOURCE_LABEL] ?? it.snapshot.source}
                        {it.note && <> · {it.note}</>}
                      </p>
                      <p className="mt-1 text-xs text-fl-cream/55">
                        {it.snapshot.lines.map((l, i) => <span key={i} className="mr-2 whitespace-nowrap">{l.debit > 0 ? "Дт" : "Кт"} {l.account} {formatNumber(l.debit || l.credit, 2)}</span>)}
                      </p>
                    </div>
                    {!readOnly && <button disabled={busy} onClick={() => restore([it.eventId])} className="shrink-0 text-xs text-fl-info hover:underline disabled:opacity-40">Восстановить</button>}
                  </div>
                </article>
              ))}
            </section>
          ))}
        </>}
    </Drawer>
  );
}
