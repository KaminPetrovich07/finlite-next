"use client";

import { useEffect, useState } from "react";
import { Drawer } from "@/components/ledger/Drawer";
import { describeChange, type Snapshot } from "@/lib/ledger/history";
import { formatNumber } from "@/lib/format";
import { SOURCE_LABEL } from "@/lib/ledger/types";

export interface EntryEventRow {
  id: string; entryId: string | null; action: string; source: string | null; entryDate: string | null;
  userName: string | null; before: Snapshot | null; after: Snapshot | null; note: string | null; createdAt: string;
}

export const ACTION_LABEL: Record<string, string> = {
  create: "Введена", update: "Изменена", delete: "Удалена", restore: "Восстановлена", import: "Загрузка", lock: "Запрет изменений", unlock: "Запрет снят",
  attach: "Документ прикреплён", detach: "Документ удалён",
};
export const ACTION_TONE: Record<string, string> = {
  create: "bg-fl-green/15 text-fl-green", restore: "bg-fl-green/15 text-fl-green", update: "bg-fl-amber/20 text-fl-amber", delete: "bg-fl-red/15 text-fl-red",
  import: "bg-sky-400/15 text-sky-300", lock: "bg-fl-gold/20 text-fl-gold", unlock: "bg-fl-red/15 text-fl-red",
  attach: "bg-fl-info/15 text-fl-info", detach: "bg-fl-red/15 text-fl-red",
};

export const when = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const sum = (s: Snapshot | null) => (s ? s.lines.reduce((a, l) => a + l.debit, 0) : 0);

/** One history event: who, when, what — with the list of changes for edits. */
export function EventItem({ e, showEntry = false, href }: { e: EntryEventRow; showEntry?: boolean; href?: string }) {
  const ok = (x: Snapshot | null) => (x && typeof x.date === "string" && Array.isArray(x.lines) ? x : null);
  const snap = ok(e.after) ?? ok(e.before);
  const changes = e.action === "update" ? describeChange(ok(e.before), ok(e.after)) : [];
  return (
    <li className="rounded-lg border border-fl-line bg-fl-charcoal/60 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
        <span className={`rounded px-1.5 py-px text-[11px] font-semibold ${ACTION_TONE[e.action] ?? "bg-fl-line text-fl-cream/70"}`}>{ACTION_LABEL[e.action] ?? e.action}</span>
        <span className="text-fl-cream/80">{e.userName ?? (snap?.sourceRef?.startsWith("rec:") ? "по расписанию" : e.source && e.source !== "manual" && e.source !== "opening" ? "программа" : "без входа")}</span>
        <span className="text-xs text-fl-cream/45">{when(e.createdAt)}</span>
        {href && <a href={href} className="ml-auto text-xs text-fl-gold underline">в журнале</a>}
      </div>
      {showEntry && snap && (
        <p className="mt-1.5 text-fl-cream/85">
          {snap.description}
          <span className="ml-2 text-xs text-fl-cream/45">{snap.date.split("-").reverse().join(".")} · {SOURCE_LABEL[snap.source as keyof typeof SOURCE_LABEL] ?? snap.source} · <span className="num">{formatNumber(sum(snap), 2)}</span></span>
        </p>
      )}
      {e.note && <p className="mt-1.5 text-xs text-fl-cream/65">{e.note}</p>}
      {changes.length > 0 && (
        <ul className="mt-1.5 space-y-0.5 text-xs text-fl-cream/70">
          {changes.map((c, i) => <li key={i} className="num">— {c}</li>)}
        </ul>
      )}
      {e.action === "update" && changes.length === 0 && <p className="mt-1.5 text-xs text-fl-cream/50">Суммы и счета не изменились.</p>}
    </li>
  );
}

/** Drawer with the history of one entry. */
export function EntryHistory({ companyId, entryId, title, onClose }: { companyId: string; entryId: string | null; title?: string; onClose: () => void }) {
  const [events, setEvents] = useState<EntryEventRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!entryId) return;
    setEvents(null); setError(null);
    fetch(`/api/ledger/${entryId}/history?companyId=${encodeURIComponent(companyId)}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить историю"); setEvents(b); })
      .catch((e) => setError(e.message));
  }, [companyId, entryId]);
  return (
    <Drawer open={!!entryId} title="История проводки" subtitle={title} onClose={onClose}>
      {error && <p className="text-sm text-fl-red">{error}</p>}
      {!events && !error && <p className="text-sm text-fl-cream/50">Загрузка…</p>}
      {events && events.length === 0 && (
        <p className="text-sm text-fl-cream/60">Проводка введена до того, как появилась история изменений, и с тех пор не менялась.</p>
      )}
      {events && events.length > 0 && <ul className="space-y-2.5">{events.map((e) => <EventItem key={e.id} e={e} />)}</ul>}
    </Drawer>
  );
}
