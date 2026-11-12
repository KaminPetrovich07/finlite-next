"use client";

import { useMemo, useState } from "react";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { SETTLE } from "@/lib/counterparties/types";
import { wantsItem } from "@/lib/ledger/stock";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { OkeiDatalist, UnitInput } from "@/components/okei/UnitInput";
import { AccountViewToggle, useAccountView } from "@/components/AccountView";
import { ifrsPickerGroups } from "@/lib/ledger/ifrs";
import { isMonetary, MAIN_CURRENCIES } from "@/lib/fx/fx";

interface Line { account: string; debit: string; credit: string; memo: string; party: string; item: string; qty: string; unit: string; currency: string; amountCur: string; rate: number | null; showCur: boolean }

interface Props {
  mode: "manual" | "opening";
  defaultDate: string;
  onSubmit: (entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string; party?: string; item?: string; qty?: number; unit?: string; currency?: string; amountCur?: number }> }) => Promise<boolean>;
  onCancel: () => void;
  /** контрагенты, уже встречавшиеся в журнале — подсказки для поля */
  parties?: string[];
  /** номенклатура из журнала — подсказки */
  items?: string[];
}

const blank = (): Line => ({ account: "", debit: "", credit: "", memo: "", party: "", item: "", qty: "", unit: "", currency: "", amountCur: "", rate: null, showCur: false });
/** Счета в иностранной валюте — поле валюты открыто сразу. */
const FX_ACCOUNTS = new Set(["1120", "1220", "1230"]);
/** Счета расчётов, по которым нужен контрагент; выручка и закупки — по желанию. */
const wantsParty = (acc: string) => !!SETTLE[acc] || /^(61|16|17)/.test(acc);
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
/** The same accounts grouped by IFRS statement line, shown without codes. */
const IFRS_GROUPS = ifrsPickerGroups();
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

export function EntryForm({ mode, defaultDate, onSubmit, onCancel, parties = [], items = [] }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [description, setDescription] = useState(mode === "opening" ? "Начальные остатки" : "");
  const [lines, setLines] = useState<Line[]>(mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]);
  const [saving, setSaving] = useState(false);
  const [view] = useAccountView();
  const ifrs = view === "ifrs";

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + parseFormattedNumber(l.debit), 0);
    const cr = lines.reduce((s, l) => s + parseFormattedNumber(l.credit), 0);
    return { dr, cr, diff: Math.round((dr - cr) * 100) / 100 };
  }, [lines]);

  const filled = lines.filter((l) => l.account && (parseFormattedNumber(l.debit) > 0 || parseFormattedNumber(l.credit) > 0));
  const ready = description.trim() && filled.length >= 2 && totals.diff === 0 && totals.dr > 0;

  const set = (i: number, patch: Partial<Line>) => setLines((ls) => ls.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  /** Amount in currency × NBKR rate on the entry date → the som amount on the side already chosen (debit by default). */
  async function applyRate(i: number, patch: Partial<Line>) {
    const cur = { ...lines[i], ...patch };
    set(i, patch);
    const amt = parseFormattedNumber(cur.amountCur);
    if (!cur.currency || !(amt > 0) || !date) return;
    try {
      const r = await fetch(`/api/fx/rates?date=${date}&code=${cur.currency}`);
      const b = await r.json();
      const rate: number | null = b.rate?.rate ?? null;
      if (!rate) { set(i, { rate: null }); return; }
      const som = formatNumber(Math.round(amt * rate * 100) / 100, 2);
      set(i, cur.credit && !cur.debit ? { rate, credit: som } : { rate, debit: som, credit: "" });
    } catch { /* no rate — the user types the som amount */ }
  }

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
        party: l.party.trim() || undefined,
        item: l.item.trim() || undefined,
        qty: parseFormattedNumber(l.qty) > 0 ? parseFormattedNumber(l.qty) : undefined,
        unit: l.unit.trim() || undefined,
        ...(l.currency && parseFormattedNumber(l.amountCur) > 0 ? { currency: l.currency, amountCur: parseFormattedNumber(l.amountCur) } : {}),
      })),
    });
    setSaving(false);
    if (ok) { setLines(mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]); if (mode === "manual") setDescription(""); }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-fl-gold/25 bg-fl-charcoal-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fl-cream">
          {mode === "opening" ? "Начальные остатки" : "Новая проводка"}
        </h2>
        <AccountViewToggle />
      </div>
      {mode === "opening" && (
        <p className="mt-1 text-sm text-fl-cream/55">
          Перенесите остатки на дату начала учёта: активы — в дебет, обязательства и капитал — в кредит.
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
          <span>{ifrs ? "Статья" : "Счёт"}</span><span className="text-right">Дебет</span><span className="text-right">Кредит</span><span>Комментарий</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-fl-line p-2 md:grid-cols-[1fr_130px_130px_1fr_32px] md:border-0 md:p-0">
            <select
              aria-label={`${ifrs ? "Статья" : "Счёт"}, строка ${i + 1}`}
              value={l.account}
              onChange={(e) => set(i, { account: e.target.value })}
              className={`${field} col-span-2 md:col-span-1`}
            >
              <option value="">{ifrs ? "Выберите статью" : "Выберите счёт"}</option>
              {ifrs
                ? IFRS_GROUPS.map((g) => (
                  <optgroup key={g.title} label={g.title}>
                    {g.accounts.map((a) => <option key={a.code} value={a.code}>{a.name}</option>)}
                  </optgroup>
                ))
                : GROUPS.map((g) => (
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
            {(FX_ACCOUNTS.has(l.account) || l.showCur || l.currency) && (
              <div className="col-span-2 grid grid-cols-2 items-center gap-2 md:col-span-4 md:grid-cols-[110px_160px_1fr]">
                <select aria-label={`Валюта, строка ${i + 1}`} value={l.currency} onChange={(e) => applyRate(i, { currency: e.target.value })} className={field}>
                  <option value="">сом</option>
                  {MAIN_CURRENCIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  {["GBP", "CHF", "JPY", "TRY", "UZS", "TJS", "AED", "KRW"].map((c) => <option key={c} value={c}>{c}</option>)}
                </select>
                <input aria-label={`Сумма в валюте, строка ${i + 1}`} inputMode="decimal" placeholder="Сумма в валюте" value={l.amountCur} disabled={!l.currency}
                  onChange={(e) => set(i, { amountCur: e.target.value })} onBlur={() => applyRate(i, {})} className={`${field} num text-right disabled:opacity-40`} />
                <span className="col-span-2 text-xs text-fl-cream/50 md:col-span-1">
                  {l.currency ? (l.rate ? `по курсу НБКР ${l.rate.toLocaleString("ru-RU", { maximumFractionDigits: 4 })} на ${date.split("-").reverse().join(".")}` : "курса на эту дату нет — сумму в сомах введите сами или загрузите курсы на странице «Валюта»") : "операция в сомах"}
                </span>
              </div>
            )}
            {!FX_ACCOUNTS.has(l.account) && !l.showCur && !l.currency && l.account && isMonetary(l.account) && (
              <button type="button" onClick={() => set(i, { showCur: true })} className="col-span-2 justify-self-start text-xs text-fl-cream/45 hover:text-fl-gold md:col-span-4">+ в валюте</button>
            )}
            {(wantsParty(l.account) || l.party || wantsItem(l.account) || l.item) && (
              <div className="col-span-2 grid grid-cols-2 gap-2 md:col-span-4 md:grid-cols-[1fr_1fr_110px_130px]">
                {(wantsParty(l.account) || l.party) && (
                  <input
                    aria-label={`Контрагент, строка ${i + 1}`} list="fl-parties"
                    placeholder={SETTLE[l.account] ? "Контрагент — ОсОО «…», ИП …, банк" : "Контрагент (необязательно)"}
                    value={l.party} onChange={(e) => set(i, { party: e.target.value })}
                    className={`${field} col-span-2 md:col-span-1 ${wantsItem(l.account) || l.item ? "" : "md:col-span-4"}`}
                  />
                )}
                {(wantsItem(l.account) || l.item) && (
                  <>
                    <input aria-label={`Номенклатура, строка ${i + 1}`} list="fl-items" placeholder="Номенклатура — ЛДСП 16 мм, товар…" value={l.item} onChange={(e) => set(i, { item: e.target.value })} className={`${field} col-span-2 md:col-span-1`} />
                    <input aria-label={`Количество, строка ${i + 1}`} inputMode="decimal" placeholder="Кол-во" value={l.qty} onChange={(e) => set(i, { qty: e.target.value })} className={`${field} num text-right`} />
                    <UnitInput aria-label={`Единица, строка ${i + 1}`} value={l.unit} onChange={(v) => set(i, { unit: v })} className={field} />
                  </>
                )}
              </div>
            )}
          </div>
        ))}
        <datalist id="fl-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>
        <datalist id="fl-items">{items.map((p) => <option key={p} value={p} />)}</datalist>
        <OkeiDatalist />
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
