"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { useAccountLabel } from "@/components/AccountView";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { CHART } from "@/lib/chart-theme";
import { forecast, type Article, type Budget, type PlanFactRow } from "@/lib/budget/budget";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const btn = "rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40";
const ghost = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const MON = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const m0 = (n: number) => formatNumber(n, 0);
const ymLabel = (ym: string) => `${MONTHS[+ym.slice(5, 7) - 1]} ${ym.slice(0, 4)}`;

interface Data {
  budget: Budget;
  planFact: { rows: PlanFactRow[]; unassigned: Array<{ account: string; total: number }> };
  readOnly: boolean;
  forecastInput: { today: string; start: string; cashNow: number; history: Array<{ month: string; cashIn: number; cashOut: number }>; receivable: number; payable: number; depreciation: Record<string, number>; firstMonthShare: number };
}

type View = "month" | "ytd" | "year";

export default function BudgetPage() {
  const { companies, companyId, setCompanyId, loaded } = useCompanies();
  const [year, setYear] = useState<number | null>(null);
  const [data, setData] = useState<Data | null>(null);
  const [draft, setDraft] = useState<Budget | null>(null);
  const [tab, setTab] = useState<"pf" | "cash">("pf");
  const [view, setView] = useState<View>("ytd");
  const [month, setMonth] = useState<number>(new Date().getMonth());
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async (fill?: number) => {
    if (!companyId) return;
    setError(null);
    try {
      const r = await fetch(`/api/budget?companyId=${encodeURIComponent(companyId)}${year ? `&year=${year}` : ""}${fill !== undefined ? `&fill=${fill}` : ""}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
      setData(b); setDraft(b.budget);
      if (!year) { setYear(b.budget.year); setMonth(+b.forecastInput.today.slice(5, 7) - 1); }
      if (fill !== undefined) { setEditing(true); show("План заполнен из факта прошлого года — проверьте и сохраните"); }
    } catch (e: any) { setError(e.message); setData(null); }
  }, [companyId, year]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);

  async function save() {
    if (!draft) return;
    setBusy(true);
    try {
      const r = await fetch("/api/budget", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, budget: draft }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show("Бюджет сохранён"); setEditing(false); await load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }

  const range = view === "month" ? [month] : view === "ytd" ? Array.from({ length: month + 1 }, (_, i) => i) : Array.from({ length: 12 }, (_, i) => i);
  const sum = (a: number[]) => range.reduce((s, i) => s + (a[i] || 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">План-факт и прогноз денег</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Бюджет доходов и расходов по месяцам, сравнение с фактом из журнала и прогноз остатка денег на 3 месяца с
          предупреждением о кассовом разрыве.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setYear(null); setEditing(false); }} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select></label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Год бюджета</span>
          <input type="number" value={year ?? ""} onChange={(e) => setYear(Number(e.target.value) || null)} className={`${field} w-28`} /></label>
        <div className="ml-auto flex gap-1.5">
          {([["pf", "План-факт"], ["cash", "Прогноз денег"]] as const).map(([k, t]) => (
            <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-fl-gold/20 font-semibold text-fl-gold" : "text-fl-cream/65 hover:text-fl-cream"}`}>{t}</button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {data && draft && tab === "pf" && !editing && (
        <section className={`${card} overflow-x-auto`}>
          <div className="flex flex-wrap items-center gap-2 border-b border-fl-line px-4 py-3">
            {([["month", "Месяц"], ["ytd", "С начала года"], ["year", "Год"]] as Array<[View, string]>).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setView(k)} className={`rounded-md px-2.5 py-1 text-sm ${view === k ? "bg-fl-gold/20 text-fl-gold" : "text-fl-cream/60 hover:text-fl-cream"}`}>{t}</button>
            ))}
            {view !== "year" && <select value={month} onChange={(e) => setMonth(+e.target.value)} className="rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1 text-sm text-fl-cream focus:border-fl-gold focus:outline-none">{MONTHS.map((x, i) => <option key={x} value={i}>{view === "ytd" ? `по ${x.toLowerCase()}` : x}</option>)}</select>}
            {!data.readOnly && <div className="ml-auto flex gap-2">
              <button type="button" onClick={() => setEditing(true)} className={ghost}>Изменить план</button>
              <button type="button" onClick={() => { const g = prompt("План = факт прошлого года × (1 + рост). Рост, %:", "10"); if (g !== null) load(Number(g.replace(",", ".")) || 0); }} className={ghost}>Из прошлого года…</button>
            </div>}
          </div>
          <table className="w-full min-w-[720px] text-sm">
            <thead><tr className="text-xs text-fl-cream/50">{["Статья", "План", "Факт", "Отклонение", "Исполнение"].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
            <tbody>
              {data.planFact.rows.filter((r) => r.kind === "result" || r.id === "revenue" || r.plan.some((x) => x) || r.fact.some((x) => x)).map((r) => {
                const p = sum(r.plan), f = sum(r.fact), dev = f - p;
                const good = r.kind === "expense" ? dev <= 0 : dev >= 0;
                const pct = Math.abs(p) > 0.5 ? (f / p) * 100 : null;
                const total = r.kind === "result";
                return (
                  <tr key={r.id} className={`border-t ${total ? "border-fl-gold/40 font-semibold text-fl-cream" : "border-fl-line/60 text-fl-cream/85"}`}>
                    <td className="px-4 py-2">{r.name}<span className="ml-2 text-xs text-fl-cream/40">{r.kind === "income" ? "доход" : r.kind === "expense" ? "расход" : ""}</span></td>
                    <td className="num px-4 py-2 text-right">{m0(p)}</td>
                    <td className="num px-4 py-2 text-right">{m0(f)}</td>
                    <td className={`num px-4 py-2 text-right ${Math.abs(dev) < 0.5 || !p ? "text-fl-cream/50" : good ? "text-fl-green" : "text-fl-red"}`}>{dev > 0 ? "+" : ""}{m0(dev)}</td>
                    <td className="num px-4 py-2 text-right text-fl-cream/70">{pct === null ? "—" : `${pct.toFixed(0)} %`}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {data.planFact.unassigned.length > 0 && <p className="border-t border-fl-line px-4 py-2 text-xs text-fl-amber">Счета без статьи: {data.planFact.unassigned.map((u) => u.account).join(", ")} — добавьте их в статью.</p>}
          {data.planFact.rows.every((r) => r.plan.every((x) => !x)) && <p className="border-t border-fl-line px-4 py-3 text-sm text-fl-cream/60">План ещё не задан. Нажмите «Изменить план» или «Из прошлого года…» — план заполнится фактом прошлого года с учётом роста.</p>}
        </section>
      )}

      {data && draft && tab === "pf" && editing && <PlanEditor draft={draft} setDraft={setDraft} onSave={save} onCancel={() => { setDraft(data.budget); setEditing(false); }} busy={busy} />}

      {data && draft && tab === "cash" && <CashTab data={data} budget={draft} setMinCash={(v) => setDraft({ ...draft, minCash: v })} onSave={save} />}
    </main>
  );
}

function PlanEditor({ draft, setDraft, onSave, onCancel, busy }: { draft: Budget; setDraft: (b: Budget) => void; onSave: () => void; onCancel: () => void; busy: boolean }) {
  const label = useAccountLabel();
  const setArticle = (i: number, patch: Partial<Article>) => setDraft({ ...draft, articles: draft.articles.map((a, j) => (j === i ? { ...a, ...patch } : a)) });
  const defaults = new Set(["revenue", "otherIncome", "financeIncome", "shareOfAssoc", "cogs", "selling", "admin", "otherExpense", "financeCosts", "incomeTax"]);
  return (
    <section className={`${card} p-4`}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="font-display text-lg font-semibold text-fl-cream">План на {draft.year} год, сом</h2>
        <div className="flex gap-2">
          <button type="button" onClick={() => setDraft({ ...draft, articles: [...draft.articles, { id: `c${Date.now().toString(36)}`, name: "Новая статья", kind: "expense", accounts: [], plan: Array(12).fill(0) }] })} className={ghost}>+ Своя статья</button>
          <button type="button" onClick={onCancel} className="px-3 py-2 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
          <button type="button" onClick={onSave} disabled={busy} className={btn}>{busy ? "Сохраняю…" : "Сохранить"}</button>
        </div>
      </div>
      <p className="mb-3 text-xs text-fl-cream/50">Своя статья забирает указанные счета у статей по умолчанию. Счета — через запятую; «75*» — все счета, начинающиеся на 75.</p>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[1200px] text-xs">
          <thead><tr className="text-fl-cream/50"><th className="w-56 py-1 text-left font-medium">Статья</th>{MON.map((x) => <th key={x} className="py-1 text-right font-medium">{x}</th>)}<th className="py-1 text-right font-medium">Год</th><th /></tr></thead>
          <tbody>
            {draft.articles.map((a, i) => (
              <tr key={a.id} className="border-t border-fl-line/60 align-top">
                <td className="py-1 pr-2">
                  {defaults.has(a.id) ? <span className="text-sm text-fl-cream">{a.name}</span> : (
                    <div className="space-y-1">
                      <input value={a.name} onChange={(e) => setArticle(i, { name: e.target.value })} className={`${field} py-1 text-xs`} />
                      <div className="flex gap-1">
                        <select value={a.kind} onChange={(e) => setArticle(i, { kind: e.target.value as Article["kind"] })} className={`${field} w-24 py-1 text-xs`}><option value="income">доход</option><option value="expense">расход</option></select>
                        <input value={a.accounts.join(", ")} onChange={(e) => setArticle(i, { accounts: e.target.value.split(/[,;\s]+/).filter(Boolean) })} placeholder="8030, 75*" className={`${field} py-1 text-xs`} title={a.accounts.filter((x) => !x.endsWith("*")).map(label).join("; ")} />
                      </div>
                    </div>
                  )}
                </td>
                {a.plan.map((v, mm) => (
                  <td key={mm} className="py-1 pl-1"><input inputMode="numeric" value={v ? formatNumber(v, 0) : ""} onChange={(e) => setArticle(i, { plan: a.plan.map((x, k) => (k === mm ? parseFormattedNumber(e.target.value) : x)) })} className={`${field} num w-[84px] px-1.5 py-1 text-right text-xs`} /></td>
                ))}
                <td className="num py-2 pl-2 text-right text-fl-cream/80">{m0(a.plan.reduce((s, x) => s + (x || 0), 0))}</td>
                <td className="py-2 pl-2">{!defaults.has(a.id) && <button type="button" onClick={() => setDraft({ ...draft, articles: draft.articles.filter((_, j) => j !== i) })} className="text-fl-cream/40 hover:text-fl-red">×</button>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function CashTab({ data, budget, setMinCash, onSave }: { data: Data; budget: Budget; setMinCash: (v: number) => void; onSave: () => void }) {
  const fi = data.forecastInput;
  const hasPlan = budget.articles.some((a) => a.plan.some((x) => x));
  const [method, setMethod] = useState<"average" | "budget">(hasPlan ? "budget" : "average");
  const [debts, setDebts] = useState(false);
  const f = useMemo(() => forecast({
    cashNow: fi.cashNow, history: fi.history, start: fi.start, horizon: 3, method, budget, depreciation: fi.depreciation,
    debts: debts ? { receivable: fi.receivable, payable: fi.payable } : null, minCash: budget.minCash, firstMonthShare: fi.firstMonthShare,
  }), [fi, method, budget, debts]);
  const chart = f.rows.map((r) => ({ name: MONTHS[+r.month.slice(5, 7) - 1], Поступления: r.inflow, Выплаты: -r.outflow, Остаток: r.closing }));
  const gap = f.rows.find((r) => r.gap);
  return (
    <div className="space-y-4">
      {gap ? (
        <div className="rounded-xl border border-fl-red/50 bg-fl-red/10 px-4 py-3 text-sm text-fl-cream">
          <b className="text-fl-red">Кассовый разрыв в {ymLabel(gap.month).toLowerCase()}:</b> не хватит {m0(-gap.closing)} сом. Варианты: ускорить оплату
          дебиторской задолженности ({m0(fi.receivable)} сом сейчас), перенести платежи поставщикам или заранее договориться о кредитной линии.
        </div>
      ) : f.rows.some((r) => r.low) ? (
        <div className="rounded-xl border border-fl-amber/50 bg-fl-amber/10 px-4 py-3 text-sm text-fl-cream">Остаток опустится ниже минимального ({m0(budget.minCash)} сом) в {ymLabel(f.rows.find((r) => r.low)!.month).toLowerCase()}.</div>
      ) : (
        <div className="rounded-xl border border-fl-green/40 bg-fl-green/10 px-4 py-3 text-sm text-fl-cream">Кассового разрыва в ближайшие 3 месяца нет.</div>
      )}

      <section className={`${card} p-4`}>
        <div className="mb-3 flex flex-wrap items-end gap-3">
          <div className="flex gap-1">
            {([["average", "По средним за 3 месяца"], ["budget", "По бюджету"]] as const).map(([k, t]) => (
              <button key={k} type="button" onClick={() => setMethod(k)} disabled={k === "budget" && !hasPlan} className={`rounded-md px-2.5 py-1.5 text-sm disabled:opacity-40 ${method === k ? "bg-fl-gold/20 text-fl-gold" : "text-fl-cream/60 hover:text-fl-cream"}`}>{t}</button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-sm text-fl-cream/80"><input type="checkbox" checked={debts} onChange={(e) => setDebts(e.target.checked)} className="h-4 w-4" />Учесть текущие долги в первом месяце</label>
          <label className="ml-auto block"><span className="mb-1 block text-xs text-fl-cream/55">Минимальный остаток, сом</span>
            <div className="flex gap-2"><input inputMode="numeric" value={budget.minCash ? formatNumber(budget.minCash, 0) : ""} onChange={(e) => setMinCash(parseFormattedNumber(e.target.value))} className={`${field} num w-36 text-right`} />
              {!data.readOnly && <button type="button" onClick={onSave} className={ghost}>Сохранить</button>}</div></label>
        </div>
        <div className="h-72">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={chart} stackOffset="sign" margin={{ top: 10, right: 10, bottom: 0, left: 10 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="name" tick={{ fill: CHART.axis, fontSize: 12 }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} axisLine={false} tickLine={false} tickFormatter={(v) => `${Math.round(v / 1000).toLocaleString("ru-RU")} т`} width={64} />
              <Tooltip contentStyle={CHART.tooltip} formatter={(v: number) => `${m0(Math.abs(v))} сом`} />
              <Legend wrapperStyle={{ fontSize: 12 }} />
              <ReferenceLine y={0} stroke={CHART.axisFaint} />
              {budget.minCash > 0 && <ReferenceLine y={budget.minCash} stroke={CHART.neg} strokeDasharray="4 4" label={{ value: "минимум", fill: CHART.axis, fontSize: 11, position: "insideTopRight" }} />}
              <Bar dataKey="Поступления" fill={CHART.s1} radius={[4, 4, 0, 0]} />
              <Bar dataKey="Выплаты" fill={CHART.s2} radius={[0, 0, 4, 4]} />
              <Line dataKey="Остаток" stroke={CHART.ink} strokeWidth={2} dot={{ r: 4 }} />
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </section>

      <section className={`${card} overflow-x-auto`}>
        <table className="w-full min-w-[680px] text-sm">
          <thead><tr className="text-xs text-fl-cream/50">{["Месяц", "На начало", "Поступления", "Выплаты", "На конец", "Основа"].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i && i < 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {f.rows.map((r) => (
              <tr key={r.month} className="border-t border-fl-line/60">
                <td className="px-4 py-2 text-fl-cream">{ymLabel(r.month)}</td>
                <td className="num px-4 py-2 text-right">{m0(r.opening)}</td>
                <td className="num px-4 py-2 text-right text-fl-green">{m0(r.inflow)}</td>
                <td className="num px-4 py-2 text-right text-fl-red">{m0(r.outflow)}</td>
                <td className={`num px-4 py-2 text-right font-semibold ${r.gap ? "text-fl-red" : r.low ? "text-fl-amber" : "text-fl-cream"}`}>{m0(r.closing)}</td>
                <td className="px-4 py-2 text-xs text-fl-cream/50">{r.basis}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="border-t border-fl-line px-4 py-2 text-xs text-fl-cream/50">
          Деньги сейчас: {m0(fi.cashNow)} сом на {fi.today.split("-").reverse().join(".")}. Средние за {fi.history.map((h) => MON[+h.month.slice(5, 7) - 1]).join(", ")}: поступления {m0(f.avgIn)}, выплаты {m0(f.avgOut)} в месяц.
          Долги сейчас: нам должны {m0(fi.receivable)}, мы должны поставщикам, бюджету и работникам {m0(fi.payable)}. В бюджетном методе амортизация исключена — это не платёж.
        </p>
      </section>
    </div>
  );
}
