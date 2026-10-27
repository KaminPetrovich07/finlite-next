"use client";

import { useMemo, useState } from "react";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { formatNumber, parseFormattedNumber } from "@/lib/format";

interface Line { account: string; debit: string; credit: string; memo: string }

interface Props {
  mode: "manual" | "opening";
  defaultDate: string;
  onSubmit: (entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string }> }) => Promise<boolean>;
  onCancel: () => void;
}

const blank = (): Line => ({ account: "", debit: "", credit: "", memo: "" });
/** Postable accounts grouped under their group header (1100, 1200 …), in chart order. */
const GROUPS: Array<{ title: string; accounts: typeof ACCOUNTS }> = (() => {
  const out: Array<{ title: string; accounts: typeof ACCOUNTS }> = [];
  let cur: { title: string; accounts: typeof ACCOUNTS } | null = null;
  for (const a of ACCOUNTS) {
    if (a.header) {
      if (a.code.endsWith("000") && a.code !== "8000") continue; // section titles: 1000, 2000 …
      cur = { title: `${a.code} ${a.name}`, accounts: [] };
      out.push(cur);
    } else {
      const key = (c: string) => (c.startsWith("8") ? "8" : c.slice(0, 2)); // 8000 groups 8010–8490
      if (!cur || (!a.parent && key(a.code) !== key(cur.title))) {
        cur = { title: `${a.code} ${a.name}`, accounts: [] };
        out.push(cur);
      }
      cur.accounts.push(a);
    }
  }
  return out.filter((g) => g.accounts.length);
})();
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

export function EntryForm({ mode, defaultDate, onSubmit, onCancel }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState(mode === "opening" ? "Начальные остатки" : "");
  const [lines, setLines] = useState<Line[]>(mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]);
  const [saving, setSaving] = useState(false);

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + parseFormattedNumber(l.debit), 0);
    const cr = lines.reduce((s, l) => s + parseFormattedNumber(l.credit), 0);
    return { dr, cr, diff: Math.round((dr - cr) * 100) / 100 };
  }, [lines]);

  const filled = lines.filter((l) => l.account && (parseFormattedNumber(l.debit) > 0 || parseFormattedNumber(l.credit) > 0));
  const ready = description.trim() && filled.length >= 2 && totals.diff === 0 && totals.dr > 0;

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!ready) return;
    setSaving(true);
    const ok = await onSubmit({
      date,
      description: description.trim(),
      lines: filled.map((l) => ({
        account: l.account,
        debit: parseFormattedNumber(l.debit),
        credit: parseFormattedNumber(l.credit),
        memo: l.memo.trim() || undefined,
      })),
    });
    setSaving(false);
    if (ok) { setLines(mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]); if (mode === "manual") setDescription(""); }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-fl-gold/25 bg-fl-charcoal-2 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-fl-cream">
        {mode === "opening" ? "Начальные остатки" : "Новая проводка"}
      </h2>
      {mode === "opening" && (
        <p className="mt-1 text-sm text-fl-cream/55">
          Перенесите сальдо счетов на дату начала учёта: активы — в дебет, обязательства и капитал — в кредит.
          Остатки не считаются оборотом и не попадают в ОДДС.
        </p>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-xs text-fl-cream/50">
          Дата
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fl-cream/50">
          Содержание операции
          <input required value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Например: оплата поставщику по счёту №12" className={`${field} mt-1`} />
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-[1fr_130px_130px_1fr_32px] gap-2 px-0.5 text-xs text-fl-cream/45 md:grid">
          <span>Счёт</span><span className="text-right">Дебет</span><span className="text-right">Кредит</span><span>Комментарий</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-fl-line p-2 md:grid-cols-[1fr_130px_130px_1fr_32px] md:border-0 md:p-0">
            <select
              aria-label={`Счёт, строка ${i + 1}`}
              value={l.account}
              onChange={(e) => set(i, { account: e.target.value })}
              className={`${field} col-span-2 md:col-span-1`}
            >
              <option value="">Выберите счёт</option>
              {GROUPS.map((g) => (
                <optgroup key={g.title} label={g.title}>
                  {g.accounts.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                </optgroup>
              ))}
            </select>
            <input
              aria-label={`Дебет, строка ${i + 1}`} inputMode="decimal" placeholder="Дебет"
              value={l.debit} onChange={(e) => set(i, { debit: e.target.value, credit: e.target.value ? "" : l.credit })}
              className={`${field} num text-right`}
            />
            <input
              aria-label={`Кредит, строка ${i + 1}`} inputMode="decimal" placeholder="Кредит"
              value={l.credit} onChange={(e) => set(i, { credit: e.target.value, debit: e.target.value ? "" : l.debit })}
              className={`${field} num text-right`}
            />
            <input
              aria-label={`Комментарий, строка ${i + 1}`} placeholder="Комментарий"
              value={l.memo} onChange={(e) => set(i, { memo: e.target.value })}
              className={`${field} col-span-2 md:col-span-1`}
            />
            <button
              type="button"
              aria-label={`Удалить строку ${i + 1}`}
              onClick={() => setLines((ls) => (ls.length > 2 ? ls.filter((_, j) => j !== i) : ls))}
              className="col-span-2 rounded text-sm text-fl-cream/40 hover:text-fl-red md:col-span-1"
            >
              ×
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setLines((ls) => [...ls, blank()])} className="text-sm text-fl-gold underline-offset-4 hover:underline">
          Добавить строку
        </button>
      </div>

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-fl-line pt-4">
        <p className="text-sm text-fl-cream/60">
          Дебет <span className="num text-fl-cream">{formatNumber(totals.dr, 2)}</span>
          <span className="mx-2 text-fl-cream/30">/</span>
          Кредит <span className="num text-fl-cream">{formatNumber(totals.cr, 2)}</span>
          {totals.diff !== 0 && <span className="ml-3 text-fl-amber">разница {formatNumber(Math.abs(totals.diff), 2)}</span>}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2.5 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
          <button
            type="submit"
            disabled={!ready || saving}
            className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Сохраняю…" : "Провести"}
          </button>
        </div>
      </div>
    </form>
  );
}
