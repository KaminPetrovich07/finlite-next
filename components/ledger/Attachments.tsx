"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ledger/Drawer";
import { uploadAttachment } from "@/components/ledger/attach-upload";

interface Row { id: string; name: string; mime: string; size: number; userName: string | null; createdAt: string }
const kb = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} МБ` : `${Math.max(1, Math.round(n / 1024))} КБ`);

/** Документы проводки: просмотр, загрузка (фото или PDF), удаление. */
export function Attachments({ entry, readOnly, locked, onClose, onChanged }: {
  entry: { id: string; description: string } | null; readOnly: boolean; locked: boolean;
  onClose: () => void; onChanged: () => void;
}) {
  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    if (!entry) return;
    setError(null);
    try {
      const r = await fetch(`/api/ledger/${entry.id}/attachments`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setRows(b);
    } catch (e: any) { setError(e.message ?? "Не удалось загрузить список"); }
  }, [entry]);
  useEffect(() => { setRows(null); load(); }, [load]);

  async function add(files: FileList | null) {
    if (!entry || !files?.length) return;
    setBusy(true); setError(null);
    try { for (const f of Array.from(files)) await uploadAttachment(entry.id, f); await load(); onChanged(); }
    catch (e: any) { setError(e.message); } finally { setBusy(false); if (input.current) input.current.value = ""; }
  }
  async function remove(a: Row) {
    if (!confirm(`Удалить «${a.name}»?`)) return;
    const r = await fetch(`/api/attachments/${a.id}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { setError(b.error ?? "Не удалось удалить"); return; }
    await load(); onChanged();
  }

  return (
    <Drawer open={!!entry} title="Документы проводки" subtitle={entry?.description} onClose={onClose}>
      <p className="text-sm text-fl-cream/60">Скан или фото счёта, накладной, акта, чека — чтобы бухгалтер и аудитор видели основание операции прямо в журнале.</p>
      {error && <p className="rounded-md border border-fl-red/40 bg-fl-red/10 px-3 py-2 text-sm text-fl-red">{error}</p>}
      {!rows && !error && <p className="text-sm text-fl-cream/50">Загрузка…</p>}
      {rows && rows.length === 0 && <p className="text-sm text-fl-cream/50">Документов пока нет.</p>}
      {rows && rows.length > 0 && (
        <ul className="space-y-2">
          {rows.map((a) => (
            <li key={a.id} className="flex items-center gap-3 rounded-lg border border-fl-line bg-fl-charcoal/60 p-2.5">
              {a.mime.startsWith("image/")
                ? <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer"><img src={`/api/attachments/${a.id}`} alt="" className="h-14 w-14 rounded object-cover" /></a>
                : <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="flex h-14 w-14 items-center justify-center rounded bg-fl-surface-2 text-xs font-semibold text-fl-cream/70">PDF</a>}
              <div className="min-w-0 flex-1">
                <a href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer" className="block truncate text-sm text-fl-cream hover:text-fl-gold">{a.name}</a>
                <p className="text-xs text-fl-cream/45">{kb(a.size)}{a.userName ? ` · ${a.userName}` : ""} · {new Date(a.createdAt).toLocaleDateString("ru-RU")}</p>
              </div>
              <a href={`/api/attachments/${a.id}?download=1`} className="text-xs text-fl-cream/55 hover:text-fl-cream">Скачать</a>
              {!readOnly && !locked && <button onClick={() => remove(a)} className="text-xs text-fl-cream/40 hover:text-fl-red">Удалить</button>}
            </li>
          ))}
        </ul>
      )}
      {!readOnly && (
        <div className="pt-2">
          <input ref={input} type="file" accept="image/*,application/pdf" multiple className="hidden" onChange={(e) => add(e.target.files)} />
          <button onClick={() => input.current?.click()} disabled={busy} className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">
            {busy ? "Загружаю…" : "Прикрепить фото или PDF"}
          </button>
          <p className="mt-1.5 text-xs text-fl-cream/45">До 4 МБ на файл; фото уменьшаются автоматически.{locked ? " Период закрыт: прикрепить можно, удалить — нет." : ""}</p>
        </div>
      )}
    </Drawer>
  );
}
