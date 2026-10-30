"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Drawer } from "@/components/ledger/Drawer";
import { Info } from "@/components/Info";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { UNASSIGNED, type CpResult, type CpRow } from "@/lib/counterparties/calc";
import { CP_ROLE, SETTLE, emptyCounterparty, slug, type Counterparty, type CpRole, type CpStore } from "@/lib/counterparties/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const LVL = { error: "border-fl-red/40 bg-fl-red/10", warn: "border-fl-amber/40 bg-fl-amber/10", tip: "border-fl-line bg-fl-gold/5" } as const;
const BUCKETS: Array<[keyof CpRow["buckets"], string, string]> = [
  ["current", "В срок", "#1baf7a"], ["d30", "1–30 дн.", "#eda100"], ["d60", "31–60 дн.", "#eb6834"], ["d90", "61–90 дн.", "#d6452a"], ["d180", "> 90 дн.", "#a3261b"],
];
const OPEN_ACCS = ["1410", "1590", "1810", "3110", "3190", "3210", "3310"];

export default function CounterpartiesPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [store, setStore] = useState<CpStore>({ list: [], links: {} });
  const [result, setResult] = useState<CpResult | null>(null);
  const [demo, setDemo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [draft, setDraft] = useState<Counterparty | null>(null);
  const [q, setQ] = useState("");
  const [order, setOrder] = useState({ number: "", date: "" });
  const { show, ToastContainer } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  useEffect(() => {
    if (!companyId || !period) return;
    setError(null);
    fetch(`/api/counterparties?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить"); return b; })
      .then((b) => { setStore(b.store); setResult(b.result); setDemo(b.demo); setDirty(false); })
      .catch((e) => { setError(e.message); setResult(null); });
  }, [companyId, period]);

  const recalc = useCallback((s: CpStore) => {
    if (!period) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/counterparties", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from: period.from, to: period.to, store: s }) });
        const b = await r.json();
        if (r.ok) setResult(b.result);
      } catch { /* keep the last result */ }
    }, 300);
  }, [companyId, period]);

  const update = (s: CpStore) => { setStore(s); setDirty(true); recalc(s); };

  async function save() {
    if (!period) return;
    setBusy("save");
    try {
      const r = await fetch("/api/counterparties", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from: period.from, to: period.to, store }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось сохранить");
      setStore(b.store); setResult(b.result); setDirty(false);
      show("Справочник сохранён");
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  async function download(doc: "act" | "inv17", format: "pdf" | "docx", cpId?: string) {
    if (!period) return;
    const key = `${doc}:${format}:${cpId ?? ""}`;
    setBusy(key);
    try { await downloadPost(`/api/counterparties/export?format=${format}`, { companyId, from: period.from, to: period.to, doc, cpId, store, order }, `${doc === "act" ? "Акт сверки" : "ИНВ-17"}.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  /** Open the card: an existing one, one found in the journal, or a new one. */
  function openCard(row?: CpRow) {
    const existing = row ? store.list.find((c) => c.id === row.id) : undefined;
    const d = existing ?? { ...emptyCounterparty(row?.name ?? ""), id: row && !row.auto ? row.id : "", role: (row?.role === "other" ? (/банк/i.test(row.name) ? "lender" : row.sales > 0 ? "buyer" : row.purchases > 0 ? "supplier" : "other") : row?.role ?? "buyer") as CpRole };
    setDraft({ ...d, aliases: [...d.aliases], opening: { ...d.opening } });
    setOpenId(row?.id ?? "__new");
  }

  function applyDraft() {
    if (!draft || !draft.name.trim()) { show("Укажите наименование", "error"); return; }
    const old = openId && openId !== "__new" ? openId : null;
    let id = draft.id || slug(draft.name);
    const taken = new Set(store.list.filter((c) => c.id !== old).map((c) => c.id));
    while (taken.has(id)) id = `${id}-${taken.size}`;
    const next = { ...draft, id };
    const exists = store.list.some((c) => c.id === old);
    const list = exists ? store.list.map((c) => (c.id === old ? next : c)) : [...store.list, next];
    // operations that were matched to the journal name keep their counterparty
    const links = { ...store.links };
    if (old && old !== id) for (const [k, v] of Object.entries(links)) if (v === old) links[k] = id;
    update({ list, links });
    setOpenId(null); setDraft(null);
  }

  function removeCard(id: string) {
    const links = Object.fromEntries(Object.entries(store.links).filter(([, v]) => v !== id));
    update({ list: store.list.filter((c) => c.id !== id), links });
    setOpenId(null); setDraft(null);
  }

  /** Real company: the counterparty is written into the journal lines. Demo: kept as a link on screen. */
  async function link(entryId: string, cpId: string) {
    const card = store.list.find((c) => c.id === cpId);
    const row = result?.rows.find((r) => r.id === cpId);
    const name = card?.name ?? row?.name;
    if (!name) return;
    if (!demo) {
      try {
        const r = await fetch("/api/ledger/party", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entryIds: [entryId], party: name, partyInn: card?.inn || undefined }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Не удалось записать");
        show(`${name} — записано в проводку`);
        recalc(store);
      } catch (e: any) { show(e.message, "error"); }
      return;
    }
    if (cpId.startsWith("auto-")) {
      const id = slug(name);
      const list = store.list.some((c) => c.id === id) ? store.list : [...store.list, { ...emptyCounterparty(name), id }];
      update({ list, links: { ...store.links, [entryId]: id } });
      return;
    }
    update({ ...store, links: { ...store.links, [entryId]: cpId } });
  }

  function markConfirmed(row: CpRow) {
    if (!period) return;
    const has = store.list.find((c) => c.id === row.id);
    const base = has ?? { ...emptyCounterparty(row.name), id: slug(row.name) };
    const nextC = { ...base, recon: { date: period.to, balance: row.net } };
    update({ ...store, list: has ? store.list.map((c) => (c.id === row.id ? nextC : c)) : [...store.list, nextC] });
    show(`Сверка с ${row.name} на ${period.to.split("-").reverse().join(".")} отмечена подписанной`);
  }

  const rows = useMemo(() => (result?.rows ?? []).filter((r) => !q || r.name.toLowerCase().includes(q.toLowerCase()) || r.inn.includes(q)), [result, q]);
  const openRow = result?.rows.find((r) => r.id === openId);
  const t = result?.totals;
  const unTotal = result ? Object.values(result.unassigned.balances).reduce((s, v) => s + Math.abs(v), 0) : 0;
  const bucketTotals = BUCKETS.map(([k, label, color]) => ({ k, label, color, v: (result?.rows ?? []).reduce((s, r) => s + r.buckets[k], 0) }));
  const bucketSum = bucketTotals.reduce((s, b) => s + b.v, 0);
  const choices = [...store.list.map((c) => ({ id: c.id, name: c.name })), ...(result?.rows ?? []).filter((r) => r.auto).map((r) => ({ id: r.id, name: `${r.name} (из журнала)` }))];

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Контрагенты и расчёты</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Справочник покупателей, поставщиков и банков с условиями договоров. Долги считаются по журналу проводок: кто сколько
          должен, что просрочено и на сколько дней, какой нужен резерв по учётной политике. Отсюда же — акт сверки с любым
          контрагентом и акт инвентаризации расчётов ИНВ-17.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px] py-2`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-fl-cream/55">Период (сальдо — на последний день)</span>
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      {result && t && (
        <>
          <section className="mb-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Kpi label="Нам должны" v={t.receivable} sub={t.overdueRecv ? `просрочено ${formatNumber(t.overdueRecv)}` : "просрочки нет"} bad={t.overdueRecv > 0} />
            <Kpi label="Мы должны" v={t.payable} sub={t.overduePay ? `просрочено ${formatNumber(t.overduePay)}` : "просрочки нет"} bad={t.overduePay > 0} />
            <Kpi label="Резерв по сомнительным долгам" v={t.allowance} sub={`в учёте ${formatNumber(t.allowanceBooked)}`} bad={t.allowance - t.allowanceBooked > 0.5} />
            <Kpi label="Без контрагента" v={unTotal} sub={result.unassigned.entries.length ? `${result.unassigned.entries.length} операций без контрагента` : unTotal > 0.5 ? "начальные остатки не распределены" : "всё разнесено"} bad={unTotal > 0.5} />
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
            <section className={`${card} min-w-0`}>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="font-display text-[15px] font-semibold text-fl-cream">Расчёты на {period?.to.split("-").reverse().join(".")} · {result.rows.length}</h2>
                <div className="flex items-center gap-2">
                  <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: имя или ИНН" className={`${field} w-40 sm:w-48`} />
                  <button type="button" onClick={() => openCard()} className="shrink-0 rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream hover:border-fl-gold">+ Контрагент</button>
                </div>
              </div>
              {rows.length === 0 && <p className="py-6 text-sm text-fl-cream/55">Контрагентов пока нет. Они появятся из журнала, когда в описании операций есть «ОсОО «…»», «ИП …» или банк, — или добавьте вручную.</p>}
              {rows.length > 0 && (
                <div className="-mx-1 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-sm">
                    <thead>
                      <tr className="border-b border-fl-line text-left text-xs text-fl-cream/55">
                        <th className="px-1 py-2 font-medium">Контрагент</th>
                        <th className="px-1 py-2 text-right font-medium">Нам должны</th>
                        <th className="px-1 py-2 text-right font-medium">Мы должны</th>
                        <th className="px-1 py-2 text-right font-medium">Просрочено</th>
                        <th className="px-1 py-2 text-right font-medium">Оборот за период</th>
                        <th className="px-1 py-2 text-right font-medium">Ср. срок оплаты<Info t={{ what: "Сколько дней в среднем проходит от отгрузки до оплаты покупателем.", how: "Оплаты погашают самые старые счета (FIFO); дни взвешены по сумме." }} /></th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r) => (
                        <tr key={r.id} onClick={() => openCard(r)} className="cursor-pointer border-b border-fl-line/60 hover:bg-fl-gold/5">
                          <td className="px-1 py-2">
                            <p className="font-medium text-fl-cream">{r.name}</p>
                            <p className="text-[11px] text-fl-cream/50">
                              {r.auto ? <span className="text-fl-amber">из журнала · не в справочнике</span> : CP_ROLE[r.role]}
                              {r.inn ? ` · ИНН ${r.inn}` : ""}{r.confirmed ? " · ✓ сверка" : ""}
                            </p>
                          </td>
                          <td className="num px-1 py-2 text-right text-fl-cream">{r.receivable ? formatNumber(r.receivable) : "—"}</td>
                          <td className="num px-1 py-2 text-right text-fl-cream">{r.payable ? formatNumber(r.payable) : "—"}</td>
                          <td className={`num px-1 py-2 text-right ${r.overdueRecv + r.overduePay > 0 ? "text-fl-red" : "text-fl-cream/50"}`}>
                            {r.overdueRecv + r.overduePay > 0 ? formatNumber(r.overdueRecv + r.overduePay) : "—"}
                            {r.maxOverdue > 0 && <span className="block text-[11px]">до {r.maxOverdue} дн.</span>}
                          </td>
                          <td className="num px-1 py-2 text-right text-fl-cream/80">{r.sales ? `↑ ${formatNumber(r.sales)}` : ""}{r.sales && r.purchases ? <br /> : null}{r.purchases ? `↓ ${formatNumber(r.purchases)}` : ""}{!r.sales && !r.purchases ? "—" : ""}</td>
                          <td className="num px-1 py-2 text-right text-fl-cream/80">{r.avgDays === null ? "—" : `${r.avgDays} дн.`}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <p className="mt-2 text-[11px] text-fl-cream/45">↑ продажи (выручка 61xx), ↓ закупки. Нажмите на строку — карточка, движение и акт сверки.</p>
                </div>
              )}

              {result.unassigned.entries.length > 0 && (
                <div className="mt-6">
                  <h3 className="mb-1 font-display text-[14px] font-semibold text-fl-cream">Операции без контрагента</h3>
                  <p className="mb-2 text-xs text-fl-cream/55">По этим проводкам на счетах расчётов не видно, с кем они. Выберите контрагента — он запишется в поле «контрагент» самой проводки и будет виден в журнале.</p>
                  <ul className="divide-y divide-fl-line/60">
                    {result.unassigned.entries.slice(0, 50).map((u) => (
                      <li key={u.entryId} className="flex flex-wrap items-center justify-between gap-2 py-2">
                        <p className="min-w-0 flex-1 text-sm text-fl-cream/85"><span className="num mr-2 text-fl-cream/50">{u.date.split("-").reverse().join(".")}</span>{u.text} <span className="text-xs text-fl-cream/45">· {u.accounts.join(", ")} · <span className="num">{formatNumber(u.amount)}</span></span></p>
                        <select value="" onChange={(e) => e.target.value && link(u.entryId, e.target.value)} className={`${field} w-56`}>
                          <option value="">Указать контрагента…</option>
                          {choices.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                        </select>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </section>

            <aside className="flex flex-col gap-4">
              <section className={card}>
                <button type="button" onClick={save} disabled={demo || busy !== null || !dirty} className="mb-3 w-full rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{demo ? "Демо: сохранить нельзя" : busy === "save" ? "Сохраняю…" : dirty ? "Сохранить справочник" : "Сохранено"}</button>
                <h2 className="mb-1 font-display text-[15px] font-semibold text-fl-cream">Инвентаризация расчётов · ИНВ-17</h2>
                <p className="mb-2 text-xs text-fl-cream/55">Акт со справкой на последний день периода: дебиторы и кредиторы по счетам, подтверждённые сверкой суммы, долги с истекшим сроком давности.</p>
                <div className="mb-2 grid grid-cols-2 gap-2">
                  <input value={order.number} onChange={(e) => setOrder({ ...order, number: e.target.value })} placeholder="Приказ №" className={field} />
                  <input type="date" value={order.date} onChange={(e) => setOrder({ ...order, date: e.target.value })} className={field} />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => download("inv17", "pdf")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "inv17:pdf:" ? "…" : "PDF"}</button>
                  <button type="button" disabled={busy !== null} onClick={() => download("inv17", "docx")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "inv17:docx:" ? "…" : "Word"}</button>
                </div>
              </section>

              {bucketSum > 0 && (
                <section className={card}>
                  <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Долги покупателей по срокам<Info t={{ what: "Открытые счета покупателей по дням просрочки сверх отсрочки из договора.", how: "Оплаты гасят самые старые долги первыми (FIFO). Для контрагентов без карточки отсрочка — 30 дней." }} /></h2>
                  <div className="flex h-3 overflow-hidden rounded-full bg-fl-line/40">
                    {bucketTotals.filter((b) => b.v > 0).map((b) => <div key={b.k} style={{ width: `${(b.v / bucketSum) * 100}%`, background: b.color }} title={`${b.label}: ${formatNumber(b.v)}`} />)}
                  </div>
                  <ul className="mt-3 flex flex-col gap-1 text-xs">
                    {bucketTotals.map((b) => (
                      <li key={b.k} className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 text-fl-cream/70"><span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: b.color }} />{b.label}</span>
                        <span className="num text-fl-cream">{formatNumber(b.v)}</span>
                      </li>
                    ))}
                  </ul>
                </section>
              )}

              <section className={card}>
                <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Рекомендации</h2>
                {result.advice.length === 0 && <p className="text-sm text-fl-cream/60">Замечаний нет: долги в срок, остатки разнесены.</p>}
                <ul className="flex flex-col gap-2">
                  {result.advice.map((a, i) => (
                    <li key={i} className={`rounded-lg border p-2.5 ${LVL[a.level]}`}>
                      <p className="text-sm font-medium text-fl-cream">{a.cpId ? <button type="button" className="text-left hover:underline" onClick={() => { const r = result.rows.find((x) => x.id === a.cpId); if (r) openCard(r); }}>{a.title}</button> : a.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fl-cream/70">{a.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}

      <Drawer open={!!openId && !!draft} title={draft?.name || "Новый контрагент"} subtitle={openRow ? `${openRow.receivable ? `должен нам ${formatNumber(openRow.receivable)}` : ""}${openRow.receivable && openRow.payable ? " · " : ""}${openRow.payable ? `мы должны ${formatNumber(openRow.payable)}` : ""}` : "Карточка контрагента"} onClose={() => { setOpenId(null); setDraft(null); }}>
        {draft && (
          <div className="flex flex-col gap-3">
            {openRow && period && (
              <div className="rounded-lg border border-fl-line p-3">
                <p className="mb-2 text-sm font-medium text-fl-cream">Акт сверки за период</p>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy !== null} onClick={() => download("act", "pdf", openRow.id)} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === `act:pdf:${openRow.id}` ? "…" : "PDF"}</button>
                  <button type="button" disabled={busy !== null} onClick={() => download("act", "docx", openRow.id)} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === `act:docx:${openRow.id}` ? "…" : "Word"}</button>
                </div>
                {Math.abs(openRow.net) > 0.004 && (
                  openRow.confirmed
                    ? <p className="mt-2 text-xs text-fl-green">✓ Сальдо {formatNumber(openRow.net)} подтверждено актом на {period.to.split("-").reverse().join(".")}</p>
                    : <button type="button" onClick={() => markConfirmed(openRow)} className="mt-2 text-xs text-fl-gold hover:underline">Контрагент подписал акт без расхождений — отметить</button>
                )}
              </div>
            )}

            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Наименование</span><input className={field} value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} placeholder="ОсОО «…»" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">ИНН</span><input className={field} inputMode="numeric" value={draft.inn} onChange={(e) => setDraft({ ...draft, inn: e.target.value.replace(/\D/g, "").slice(0, 14) })} /></label>
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Роль</span>
                <select className={field} value={draft.role} onChange={(e) => setDraft({ ...draft, role: e.target.value as CpRole })}>
                  {(Object.keys(CP_ROLE) as CpRole[]).map((k) => <option key={k} value={k}>{CP_ROLE[k]}</option>)}
                </select>
              </label>
            </div>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Договор</span><input className={field} value={draft.contract} onChange={(e) => setDraft({ ...draft, contract: e.target.value })} placeholder="№ 12 от 10.01.2026" /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Отсрочка оплаты, дней</span><input className={field} type="number" min={0} value={draft.paymentDays} onChange={(e) => setDraft({ ...draft, paymentDays: Math.max(0, Number(e.target.value) || 0) })} /></label>
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Кредитный лимит, сом</span><input className={field} type="number" min={0} value={draft.creditLimit || ""} onChange={(e) => setDraft({ ...draft, creditLimit: Math.max(0, Number(e.target.value) || 0) })} placeholder="без лимита" /></label>
            </div>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Адрес</span><input className={field} value={draft.address} onChange={(e) => setDraft({ ...draft, address: e.target.value })} /></label>
            <div className="grid grid-cols-2 gap-2">
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Контактное лицо</span><input className={field} value={draft.contact} onChange={(e) => setDraft({ ...draft, contact: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Телефон</span><input className={field} value={draft.phone} onChange={(e) => setDraft({ ...draft, phone: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">E-mail</span><input className={field} type="email" value={draft.email} onChange={(e) => setDraft({ ...draft, email: e.target.value })} /></label>
              <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Банк</span><input className={field} value={draft.bank} onChange={(e) => setDraft({ ...draft, bank: e.target.value })} /></label>
            </div>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Расчётный счёт</span><input className={field} value={draft.account} onChange={(e) => setDraft({ ...draft, account: e.target.value })} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Другие написания в описаниях операций (через «;»)</span><input className={field} value={draft.aliases.join("; ")} onChange={(e) => setDraft({ ...draft, aliases: e.target.value.split(";").map((s) => s.trimStart()) })} placeholder="Ала-Тоо; AlaToo Hotel" /></label>

            <div className="rounded-lg border border-fl-line p-3">
              <p className="text-sm font-medium text-fl-cream">Начальные остатки<Info t={{ what: "Часть остатка из ввода начальных остатков, которая приходится на этого контрагента.", how: "В журнале остаток по счёту одной строкой; здесь он делится по контрагентам. Нераспределённое видно как «без контрагента»." }} /></p>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {OPEN_ACCS.map((acc) => (
                  <label key={acc} className="block"><span className="mb-1 block text-[11px] text-fl-cream/55">{acc} · {SETTLE[acc].short}</span>
                    <input className={field} type="number" min={0} value={draft.opening[acc] || ""} onChange={(e) => setDraft({ ...draft, opening: { ...draft.opening, [acc]: Math.max(0, Number(e.target.value) || 0) } })} />
                  </label>
                ))}
                <label className="block"><span className="mb-1 block text-[11px] text-fl-cream/55">Дата возникновения долга</span><input className={field} type="date" value={draft.openingDate} onChange={(e) => setDraft({ ...draft, openingDate: e.target.value })} /></label>
              </div>
            </div>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Примечание</span><textarea className={field} rows={2} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })} /></label>

            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={applyDraft} className="rounded-lg bg-fl-accent px-3 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{store.list.some((c) => c.id === openId) ? "Применить" : "Добавить в справочник"}</button>
              {store.list.some((c) => c.id === openId)
                ? <button type="button" onClick={() => removeCard(openId!)} className="rounded-lg border border-fl-red/40 px-3 py-2.5 text-sm text-fl-red hover:bg-fl-red/10">Удалить карточку</button>
                : <button type="button" onClick={() => { setOpenId(null); setDraft(null); }} className="rounded-lg border border-fl-line px-3 py-2.5 text-sm text-fl-cream hover:border-fl-gold">Отмена</button>}
            </div>
            <p className="text-[11px] text-fl-cream/45">Изменения попадут в базу после «Сохранить справочник».</p>

            {openRow && openRow.movements.length > 0 && (
              <div className="mt-2">
                <p className="mb-1 text-sm font-medium text-fl-cream">Движение по расчётам</p>
                <ul className="divide-y divide-fl-line/60 text-xs">
                  {openRow.movements.slice(-40).map((m, i) => (
                    <li key={i} className="flex items-baseline justify-between gap-2 py-1.5">
                      <span className="min-w-0 text-fl-cream/75"><span className="num mr-1.5 text-fl-cream/45">{m.date.split("-").reverse().join(".")}</span>{m.text}{m.account ? <span className="text-fl-cream/40"> · {m.account}</span> : null}</span>
                      <span className="num shrink-0 text-fl-cream">{m.debit ? `+${formatNumber(m.debit)}` : `−${formatNumber(m.credit)}`}</span>
                    </li>
                  ))}
                </ul>
                {Object.entries(store.links).some(([, v]) => v === openRow.id) && (
                  <p className="mt-2 text-[11px] text-fl-cream/45">Операции, привязанные вручную, можно отвязать: <button type="button" className="text-fl-gold hover:underline" onClick={() => update({ ...store, links: Object.fromEntries(Object.entries(store.links).map(([k, v]) => [k, v === openRow.id ? UNASSIGNED : v])) })}>отвязать все</button></p>
                )}
              </div>
            )}
          </div>
        )}
      </Drawer>
    </main>
  );
}

function Kpi({ label, v, sub, bad }: { label: string; v: number; sub?: string; bad?: boolean }) {
  return (
    <div className={`rounded-xl border p-3 shadow-card ${bad ? "border-fl-amber/40 bg-fl-amber/5" : "border-fl-line bg-fl-charcoal-2"}`}>
      <p className="text-xs text-fl-cream/60">{label}</p>
      <p className="num mt-1 text-xl font-semibold text-fl-cream">{formatNumber(v)}</p>
      {sub && <p className={`mt-0.5 text-[11px] ${bad ? "text-fl-amber" : "text-fl-cream/50"}`}>{sub}</p>}
    </div>
  );
}
