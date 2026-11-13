"use client";

import { useCallback, useEffect, useState } from "react";
import { ACTION_LABEL, EventItem, type EntryEventRow } from "@/components/ledger/EntryHistory";

const FILTERS: Array<[string, string]> = [["", "Все"], ["create", ACTION_LABEL.create], ["update", ACTION_LABEL.update], ["delete", ACTION_LABEL.delete], ["import", ACTION_LABEL.import], ["lock", "Запреты"]];

/** Журнал изменений компании за период: кто, когда и что вводил, менял, удалял; запреты периода. */
export function ChangeLog({ companyId, from, to }: { companyId: string; from: string; to: string }) {
  const [action, setAction] = useState("");
  const [events, setEvents] = useState<EntryEventRow[]>([]);
  const [more, setMore] = useState(false);
  const [state, setState] = useState<"loading" | "ready" | string>("loading");

  const load = useCallback(async (before?: string) => {
    const q = new URLSearchParams({ companyId, from, to, ...(action && action !== "lock" ? { action } : {}), ...(before ? { before } : {}) });
    const r = await fetch(`/api/ledger/history?${q}`);
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить журнал изменений");
    const list: EntryEventRow[] = action === "lock" ? b.events.filter((e: EntryEventRow) => e.action === "lock" || e.action === "unlock") : b.events;
    setEvents((cur) => (before ? [...cur, ...list] : list));
    setMore(b.more);
  }, [companyId, from, to, action]);

  useEffect(() => {
    setState("loading");
    load().then(() => setState("ready")).catch((e) => setState(e.message));
  }, [load]);

  return (
    <div className="space-y-3">
      <p className="text-sm text-fl-cream/60">
        Все изменения журнала, сделанные в выбранные даты, — вручную и другими разделами программы: кто ввёл, изменил или удалил
        проводку, что было до и после, кто запрещал и открывал период. Записи истории нельзя изменить или удалить.
      </p>
      <div className="flex flex-wrap gap-2 text-sm">
        {FILTERS.map(([k, l]) => (
          <button key={k} onClick={() => setAction(k)} className={`rounded-full border px-3 py-1 ${action === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65 hover:text-fl-cream"}`}>{l}</button>
        ))}
      </div>
      {state === "loading" ? <p className="text-sm text-fl-cream/50">Загрузка…</p>
        : state !== "ready" ? <p className="text-sm text-fl-red">{state}</p>
        : events.length === 0 ? <p className="rounded-xl border border-fl-line px-4 py-3 text-sm text-fl-cream/60">За эти даты изменений не было.</p>
        : (
          <>
            <ul className="space-y-2">
              {events.map((e) => (
                <EventItem key={e.id} e={e} showEntry
                  href={e.entryId && e.action !== "delete" && e.entryDate ? `/ledger?entry=${e.entryId}&date=${e.entryDate.slice(0, 10)}` : undefined} />
              ))}
            </ul>
            {more && <button onClick={() => load(events[events.length - 1]?.id).catch((x) => setState(x.message))} className="text-sm text-fl-gold underline-offset-4 hover:underline">Показать ещё</button>}
          </>
        )}
    </div>
  );
}
