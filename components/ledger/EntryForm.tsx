"use client";

import { useMemo, useState } from "react";
import { SETTLE } from "@/lib/counterparties/types";
import { wantsItem } from "@/lib/ledger/stock";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { OkeiDatalist, UnitInput } from "@/components/okei/UnitInput";
import { AccountViewToggle, useAccountView } from "@/components/AccountView";
import { AccountPicker } from "@/components/ledger/AccountPicker";
import { fillTemplate, splitVat, TEMPLATES, templateWants, type Template } from "@/lib/ledger/templates";
import { isMonetary, MAIN_CURRENCIES } from "@/lib/fx/fx";

interface Line { account: string; debit: string; credit: string; memo: string; party: string; item: string; qty: string; unit: string; currency: string; amountCur: string; rate: number | null; showCur: boolean }

interface Props {
  mode: "manual" | "opening";
  defaultDate: string;
  onSubmit: (entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string; party?: string; item?: string; qty?: number; unit?: string; currency?: string; amountCur?: number }>; repeat?: { day: number } }) => Promise<boolean>;
  onCancel: () => void;
  /** контрагенты, уже встречавшиеся в журнале — подсказки для поля */
  parties?: string[];
  /** номенклатура из журнала — подсказки */
  items?: string[];
  /** изменение существующей проводки: её дата, содержание и строки */
  initial?: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string | null; party?: string | null; item?: string | null; qty?: number | null; unit?: string | null; currency?: string | null; amountCur?: number | null }> };
  /** дата, по которую включительно период закрыт для изменений — предупреждение до отправки */
  lockedThrough?: string | null;
}

const blank = (): Line => ({ account: "", debit: "", credit: "", memo: "", party: "", item: "", qty: "", unit: "", currency: "", amountCur: "", rate: null, showCur: false });
/** Счета в иностранной валюте — поле валюты открыто сразу. */
const FX_ACCOUNTS = new Set(["1120", "1220", "1230"]);
/** Счета расчётов, по которым нужен контрагент; выручка и закупки — по желанию. */
const wantsParty = (acc: string) => !!SETTLE[acc] || /^(61|16|17)/.test(acc);
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

export function EntryForm({ mode, defaultDate, onSubmit, onCancel, parties = [], items = [], initial, lockedThrough }: Props) {
  const [date, setDate] = useState(initial?.date ?? defaultDate);
  const [description, setDescription] = useState(initial?.description ?? (mode === "opening" ? "Начальные остатки" : ""));
  const [lines, setLines] = useState<Line[]>(() => initial
    ? [...initial.lines.map((l): Line => ({
        ...blank(), account: l.account,
        debit: l.debit ? formatNumber(l.debit, 2) : "", credit: l.credit ? formatNumber(l.credit, 2) : "",
        memo: l.memo ?? "", party: l.party ?? "", item: l.item ?? "", qty: l.qty ? String(l.qty).replace(".", ",") : "", unit: l.unit ?? "",
        currency: l.currency ?? "", amountCur: l.amountCur ? formatNumber(l.amountCur, 2) : "", showCur: !!l.currency,
      })), blank()]
    : mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]);
  const editing = !!initial;
  // «повторять каждый месяц» — регулярная операция: аренда, связь, подписки
  const [repeat, setRepeat] = useState(false);
  const [repeatDay, setRepeatDay] = useState<number | null>(null);
  const dateLocked = !!lockedThrough && !!date && date <= lockedThrough;
  const [saving, setSaving] = useState(false);
  const [view] = useAccountView();
  const ifrs = view === "ifrs";
  // типовая операция: сумма, НДС, контрагент → строки проводки
  const [tpl, setTpl] = useState<Template | null>(null);
  const [tv, setTv] = useState({ total: "", vat: false, party: "", item: "", qty: "", unit: "" });
  const [descTouched, setDescTouched] = useState(false);

  function applyTemplate(t: Template | null, v: typeof tv) {
    setTpl(t); setTv(v);
    if (!t) return;
    const r = fillTemplate(t, { total: parseFormattedNumber(v.total), vat: v.vat, party: v.party, item: v.item, qty: v.qty, unit: v.unit });
    setLines(r.lines.map((l) => ({ ...blank(), ...l })));
    if (!descTouched) setDescription(r.description);
  }

  const totals = useMemo(() => {
    const dr = lines.reduce((s, l) => s + parseFormattedNumber(l.debit), 0);
    const cr = lines.reduce((s, l) => s + parseFormattedNumber(l.credit), 0);
    return { dr, cr, diff: Math.round((dr - cr) * 100) / 100 };
  }, [lines]);

  const filled = lines.filter((l) => l.account && (parseFormattedNumber(l.debit) > 0 || parseFormattedNumber(l.credit) > 0));
  const ready = description.trim() && filled.length >= 2 && totals.diff === 0 && totals.dr > 0;

  /** Строка, куда «Уравнять» поставит разницу: первая со счётом и без суммы, иначе первая пустая. */
  const balanceTarget = (() => {
    const empty = (l: Line) => !parseFormattedNumber(l.debit) && !parseFormattedNumber(l.credit);
    const withAcc = lines.findIndex((l) => l.account && empty(l));
    return withAcc >= 0 ? withAcc : lines.findIndex(empty);
  })();
  function balance() {
    if (balanceTarget < 0 || totals.diff === 0) return;
    const amt = formatNumber(Math.abs(totals.diff), 2);
    set(balanceTarget, totals.diff > 0 ? { credit: amt, debit: "" } : { debit: amt, credit: "" });
  }

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
      ...(repeat && mode === "manual" && !editing ? { repeat: { day: repeatDay ?? Math.min(Number(date.slice(8, 10)) || 1, 28) } } : {}),
    });
    setSaving(false);
    if (ok && !editing) {
      setLines(mode === "opening" ? [blank(), blank(), blank(), blank()] : [blank(), blank()]);
      setRepeat(false); setRepeatDay(null);
      if (mode === "manual") { setDescription(""); setDescTouched(false); setTpl(null); setTv({ total: "", vat: tv.vat, party: "", item: "", qty: "", unit: "" }); }
    }
  }

  return (
    <form onSubmit={submit} className="rounded-xl border border-fl-gold/25 bg-fl-charcoal-2 p-4 sm:p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fl-cream">
          {editing ? "Изменение проводки" : mode === "opening" ? "Начальные остатки" : "Новая проводка"}
        </h2>
        <AccountViewToggle />
      </div>
      {mode === "opening" && (
        <p className="mt-1 text-sm text-fl-cream/55">
          Перенесите остатки на дату начала учёта: активы — в дебет, обязательства и капитал — в кредит.
          Остатки не считаются оборотом и не попадают в ОДДС.
        </p>
      )}

      {editing && (
        <p className="mt-1 text-sm text-fl-cream/55">Прежняя версия сохранится в истории проводки: кто и когда изменил, что было до и после.</p>
      )}

      {mode === "manual" && !editing && (
        <div className="mt-4">
          <p className="mb-2 text-xs text-fl-cream/50">Типовая операция — строки заполнятся сами, их можно поправить</p>
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1 [scrollbar-width:thin] sm:flex-wrap sm:overflow-visible">
            <button type="button" onClick={() => { applyTemplate(null, tv); setLines([blank(), blank()]); if (!descTouched) setDescription(""); }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${!tpl ? "bg-fl-cream font-semibold text-fl-charcoal" : "border border-fl-line text-fl-cream/75 hover:border-fl-gold/50"}`}>Своя проводка</button>
            {TEMPLATES.map((t) => (
              <button key={t.key} type="button" onClick={() => applyTemplate(t, { ...tv, vat: t.vat ? tv.vat : false })} title={t.group}
                className={`shrink-0 rounded-full px-3 py-1.5 text-sm ${tpl?.key === t.key ? "bg-fl-gold/25 font-semibold text-fl-gold" : "border border-fl-line text-fl-cream/75 hover:border-fl-gold/50 hover:text-fl-cream"}`}>{t.label}</button>
            ))}
          </div>
          {tpl && (
            <div className="mt-3 grid gap-2 rounded-xl bg-fl-surface-2 p-3 sm:grid-cols-[180px_1fr] lg:grid-cols-[180px_auto_1fr]">
              <label className="text-xs text-fl-cream/55">Сумма{tpl.vat && tv.vat ? " с НДС" : ""}
                <input autoFocus inputMode="decimal" value={tv.total} onChange={(e) => applyTemplate(tpl, { ...tv, total: e.target.value })} placeholder="0,00" className={`${field} num mt-1 text-right text-base`} />
              </label>
              {tpl.vat && (
                <label className="flex items-center gap-2 self-end pb-2 text-sm text-fl-cream/80">
                  <input type="checkbox" checked={tv.vat} onChange={(e) => applyTemplate(tpl, { ...tv, vat: e.target.checked })} className="h-4 w-4" />
                  в т. ч. НДС 12 %{tv.vat && parseFormattedNumber(tv.total) > 0 && <span className="num text-fl-cream/50">— {formatNumber(splitVat(parseFormattedNumber(tv.total)).vat, 2)}</span>}
                </label>
              )}
              {templateWants(tpl).party && (
                <label className="text-xs text-fl-cream/55 sm:col-span-2 lg:col-span-1">Контрагент
                  <input list="fl-parties" value={tv.party} onChange={(e) => applyTemplate(tpl, { ...tv, party: e.target.value })} placeholder="ОсОО «…», ИП …" className={`${field} mt-1`} />
                </label>
              )}
              {templateWants(tpl).item && (
                <div className="grid grid-cols-[1fr_90px_110px] gap-2 sm:col-span-2 lg:col-span-3">
                  <label className="text-xs text-fl-cream/55">Номенклатура (необязательно)
                    <input list="fl-items" value={tv.item} onChange={(e) => applyTemplate(tpl, { ...tv, item: e.target.value })} placeholder="Товар, услуга" className={`${field} mt-1`} />
                  </label>
                  <label className="text-xs text-fl-cream/55">Кол-во
                    <input inputMode="decimal" value={tv.qty} onChange={(e) => applyTemplate(tpl, { ...tv, qty: e.target.value })} className={`${field} num mt-1 text-right`} />
                  </label>
                  <label className="text-xs text-fl-cream/55">Ед.
                    <UnitInput aria-label="Единица" value={tv.unit} onChange={(u) => applyTemplate(tpl, { ...tv, unit: u })} className={`${field} mt-1`} />
                  </label>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-[160px_1fr]">
        <label className="text-xs text-fl-cream/50">
          Дата
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fl-cream/50">
          Содержание операции
          <input required value={description} onChange={(e) => { setDescription(e.target.value); setDescTouched(true); }} placeholder="Например: оплата поставщику по счёту №12" className={`${field} mt-1`} />
        </label>
      </div>

      <div className="mt-4 space-y-2">
        <div className="hidden grid-cols-[1fr_130px_130px_1fr_32px] gap-2 px-0.5 text-xs text-fl-cream/45 md:grid">
          <span>{ifrs ? "Статья" : "Счёт"}</span><span className="text-right">Дебет</span><span className="text-right">Кредит</span><span>Комментарий</span><span />
        </div>
        {lines.map((l, i) => (
          <div key={i} className="grid grid-cols-2 gap-2 rounded-lg border border-fl-line p-2 md:grid-cols-[1fr_130px_130px_1fr_32px] md:border-0 md:p-0">
            <AccountPicker label={`${ifrs ? "Статья" : "Счёт"}, строка ${i + 1}`} value={l.account} onChange={(code) => set(i, { account: code })} ifrs={ifrs} className="col-span-2 md:col-span-1" />
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

      {mode === "manual" && !editing && (
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 text-sm text-fl-cream/75">
          <label className="flex items-center gap-2">
            <input type="checkbox" checked={repeat} onChange={(e) => setRepeat(e.target.checked)} className="h-4 w-4" />
            Повторять каждый месяц
          </label>
          {repeat && (
            <label className="flex items-center gap-2 text-xs text-fl-cream/60">
              числа
              <select value={repeatDay ?? Math.min(Number(date.slice(8, 10)) || 1, 28)} onChange={(e) => setRepeatDay(Number(e.target.value))}
                className="rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1 text-sm text-fl-cream">
                {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => <option key={d} value={d}>{d}</option>)}
                <option value={31}>последнего</option>
              </select>
              <span>— следующие месяцы проведутся сами; остановить можно в «Регулярных операциях»</span>
            </label>
          )}
        </div>
      )}

      {dateLocked && (
        <p className="mt-4 rounded-md border border-fl-amber/40 bg-fl-amber/10 px-3 py-2 text-sm text-fl-amber">
          Период по {lockedThrough!.split("-").reverse().join(".")} закрыт для изменений. Выберите дату в открытом периоде — исправление прошлого месяца проводят сторно текущей датой.
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-fl-line pt-4">
        <p className="text-sm text-fl-cream/60">
          Дебет <span className="num text-fl-cream">{formatNumber(totals.dr, 2)}</span>
          <span className="mx-2 text-fl-cream/30">/</span>
          Кредит <span className="num text-fl-cream">{formatNumber(totals.cr, 2)}</span>
          {totals.diff !== 0 && <span className="ml-3 text-fl-amber">разница {formatNumber(Math.abs(totals.diff), 2)}</span>}
          {totals.diff !== 0 && balanceTarget >= 0 && (
            <button type="button" onClick={balance} className="ml-2 rounded-md border border-fl-amber/50 px-2 py-0.5 text-xs font-medium text-fl-amber hover:bg-fl-amber/10" title="Поставить разницу в строку без суммы">Уравнять</button>
          )}
        </p>
        <div className="flex gap-2">
          <button type="button" onClick={onCancel} className="rounded-md px-4 py-2.5 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
          <button
            type="submit"
            disabled={!ready || saving || dateLocked}
            className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            {saving ? "Сохраняю…" : editing ? "Сохранить изменения" : "Провести"}
          </button>
        </div>
      </div>
    </form>
  );
}
