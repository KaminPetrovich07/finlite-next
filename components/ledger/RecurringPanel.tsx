"use client";

import { useCallback, useEffect, useState } from "react";
import { Collapsible } from "@/components/Collapsible";
import { formatNumber } from "@/lib/format";
import { DAY_LABEL, type RecurringTemplate } from "@/lib/ledger/recurring";

type Row = RecurringTemplate & { next: string | null; due: number; posted: number };
const dmy = (iso: string) => iso.split("-").reverse().join(".");
const ym = (s: string) => { const [y, m] = s.split("-"); return `${m}.${y}`; };

/**
 * Регулярные операции компании: список шаблонов, пауза, удаление и «Провести, что пора».
 * Сами проводки создаёт ежедневная задача; кнопка нужна, чтобы не ждать до завтра.
 */
export function RecurringPanel({ companyId, readOnly, refreshKey, onPosted, toast }: {
  companyId: string; readOnly: boolean; refreshKey: number; onPosted: () => void;
  toast: (msg: string, kind?: "error" | "info") => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/ledger/recurring?companyId=${encodeURIComponent(companyId)}`);
      const b = await r.json();
      setRows(r.ok ? b.templates : []);
    } catch { setRows([]); }
  }, [companyId]);
  useEffect(() => { load(); }, [load, refreshKey]);

  async function call(method: string, body?: unknown, query = "") {
    const r = await fetch(`/api/ledger/recurring${query}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "Не удалось сохранить");
    return b;
  }
  async function toggle(t: Row) {
    try { await call("PATCH", { companyId, id: t.id, paused: !t.paused }); await load(); } catch (e: any) { toast(e.message, "error"); }
  }
  async function remove(t: Row) {
    if (!confirm(`Удалить регулярную операцию «${t.description}»? Уже проведённые проводки останутся в журнале.`)) return;
    try { await call("DELETE", undefined, `?companyId=${encodeURIComponent(companyId)}&id=${t.id}`); await load(); toast("Регулярная операция удалена", "info"); } catch (e: any) { toast(e.message, "error"); }
  }
  async function runNow() {
    setBusy(true);
    try {
      const r = await fetch("/api/ledger/recurring/run", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось провести");
      const skipped = b.skipped?.length ? ` Не проведено: ${b.skipped.length} — ${b.skipped[0].reason}` : "";
      toast(b.posted ? `Проведено регулярных операций: ${b.posted}.${skipped}` : `Проводить пока нечего.${skipped}`, b.skipped?.length ? "error" : "info");
      await load();
      if (b.posted) onPosted();
    } catch (e: any) { toast(e.message, "error"); } finally { setBusy(false); }
  }

  if (!rows || rows.length === 0) return null;
  const due = rows.reduce((s, t) => s + t.due, 0);
  return (
    <div className="mb-5">
      <Collapsible title={`Регулярные операции: ${rows.length}`} subtitle="Проводятся сами каждый месяц в заданное число" badge={due ? `пора провести: ${due}` : undefined} defaultOpen={due > 0}>
        <ul className="divide-y divide-fl-line/60">
          {rows.map((t) => (
            <li key={t.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center">
              <div className="min-w-0 flex-1">
                <p className={`text-sm ${t.paused ? "text-fl-cream/45 line-through" : "text-fl-cream"}`}>{t.description}</p>
                <p className="text-xs text-fl-cream/50">
                  <span className="num">{formatNumber(t.lines.reduce((s, l) => s + l.debit, 0), 2)}</span> · {DAY_LABEL(t.day)} · с {ym(t.from)}{t.until ? ` по ${ym(t.until)}` : ""}
                  {t.paused ? " · на паузе" : t.due ? <span className="text-fl-amber"> · пора провести: {t.due}</span> : t.next ? ` · следующая ${dmy(t.next)}` : " · срок закончился"}
                  {t.posted ? ` · проведено: ${t.posted}` : ""}
                </p>
              </div>
              {!readOnly && (
                <div className="flex shrink-0 gap-3 text-xs">
                  <button onClick={() => toggle(t)} className="text-fl-cream/60 underline-offset-2 hover:text-fl-cream hover:underline">{t.paused ? "Возобновить" : "Пауза"}</button>
                  <button onClick={() => remove(t)} className="text-fl-cream/45 underline-offset-2 hover:text-fl-red hover:underline">Удалить</button>
                </div>
              )}
            </li>
          ))}
        </ul>
        {!readOnly && due > 0 && (
          <button onClick={runNow} disabled={busy} className="mt-2 rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">
            {busy ? "Провожу…" : `Провести, что пора (${due})`}
          </button>
        )}
      </Collapsible>
    </div>
  );
}
