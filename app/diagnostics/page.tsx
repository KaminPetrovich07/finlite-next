"use client";

// Финансовая диагностика: признаки неплатёжеспособности, перечень кредиторов, «что если».
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { downloadPost } from "@/components/download";
import { CHART } from "@/lib/chart-theme";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { CREDITOR_KIND, DEFAULT_TERMS, whatIf, type CreditorKind, type Diagnosis, type Level, type Terms } from "@/lib/insolvency/diagnose";

type Res = Diagnosis & { company: { name: string; inn: string | null; demo: boolean } };

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const TONE: Record<Level, string> = { ok: "border-fl-green/45 bg-fl-green/[0.06]", watch: "border-fl-amber/50 bg-fl-amber/[0.07]", risk: "border-fl-red/50 bg-fl-red/[0.07]" };
const DOT: Record<Level, string> = { ok: "bg-fl-green", watch: "bg-fl-amber", risk: "bg-fl-red" };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const num = (v: number | null, unit: string) => (v == null ? "—" : unit === "%" ? `${v} %` : unit === "мес" ? `${v.toLocaleString("ru-RU")} мес.` : v.toLocaleString("ru-RU"));
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const TERM_LABEL: Record<keyof Terms, string> = { suppliers: "Поставщикам", staff: "Зарплата", budget: "Налоги и взносы за месяц", quarterlyTax: "Налог на прибыль / единый", interest: "Проценты по кредитам", other: "Прочие" };

export default function DiagnosticsPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [asOf, setAsOf] = useState("");
  const [months, setMonths] = useState(12);
  const [terms, setTerms] = useState<Terms>(DEFAULT_TERMS);
  const [r, setR] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [kind, setKind] = useState<CreditorKind | "all" | "overdue">("all");
  const [wi, setWi] = useState({ collect: 0, sell: 0, defer: 0 });

  useEffect(() => { if (loaded && !asOf) setAsOf(company?.demo ? DEMO_PERIOD.to : today()); }, [loaded, company, asOf]);
  useEffect(() => { if (company?.demo) { setAsOf(DEMO_PERIOD.to); setMonths(3); } }, [company?.demo]);

  const query = useMemo(() => new URLSearchParams({ companyId, asOf, months: String(months), ...Object.fromEntries(Object.entries(terms).map(([k, v]) => [k, String(v)])) }).toString(), [companyId, asOf, months, terms]);
  useEffect(() => {
    if (!companyId || !asOf || companyId === NEW_COMPANY) return;
    setErr(null);
    const t = setTimeout(() => {
      fetch(`/api/insolvency?${query}`).then(async (x) => { const b = await x.json(); if (!x.ok) throw new Error(b.error); setR(b); }).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(t);
  }, [query, companyId, asOf]);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    try { await downloadPost(`/api/insolvency?format=${format}`, { companyId, asOf, months, ...terms }, `Финансовая диагностика.${format}`); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const w = r ? whatIf(r.balance, r.totals.overdue, wi) : null;
  const debts = r?.debts.filter((d) => kind === "all" || (kind === "overdue" ? d.overdue > 0 : d.kind === kind)) ?? [];
  const chart = r?.months.map((m) => ({ month: m.month, current: m.current, quick: m.quick, overdue: Math.round(m.overdue), liquid: Math.round(m.liquid) }));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Финансовая диагностика</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Гасит ли компания долги в срок и хватает ли ей на них денег и того, что быстро превращается в деньги. Считается по журналу проводок: ликвидность по месяцам, возраст каждого долга,
          признаки неплатёжеспособности по ст. 3 Закона КР «О банкротстве (несостоятельности)» и что изменит взыскание дебиторки, продажа запасов или отсрочка долгов.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">На дату</span>
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={field} />
        </label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Динамика</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={field}>
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>{n} мес.</option>)}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button className={btn} disabled={!r || busy !== null} onClick={() => download("pdf")}>{busy === "pdf" ? "…" : "Заключение PDF"}</button>
          <button className={btn} disabled={!r || busy !== null} onClick={() => download("docx")}>{busy === "docx" ? "…" : "Word"}</button>
        </div>
      </div>

      {err && <p className="mb-4 text-sm text-fl-red">{err}</p>}
      {!r ? !err && <p className="text-sm text-fl-cream/50">Считаю…</p> : (
        <div className="space-y-5">
          <section className={`rounded-2xl border p-4 ${TONE[r.verdict.level]}`}>
            <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${DOT[r.verdict.level]}`} /><h2 className="font-display text-xl font-semibold text-fl-cream">{r.verdict.title}</h2></div>
            <p className="mt-1 text-sm text-fl-cream/80">{r.verdict.detail}</p>
            {r.signals.length > 0 && (
              <ul className="mt-3 space-y-1.5">{r.signals.map((s) => (
                <li key={s.title} className="flex gap-2 text-sm"><span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${s.level === "risk" ? "bg-fl-red" : "bg-fl-amber"}`} /><span><b className="text-fl-cream">{s.title}.</b> <span className="text-fl-cream/75">{s.detail}</span></span></li>
              ))}</ul>
            )}
          </section>

          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {r.indicators.map((i) => (
              <div key={i.key} className={`rounded-xl border p-3 ${TONE[i.level]}`} title={i.hint}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm text-fl-cream/70">{i.label}</span><span className={`h-2.5 w-2.5 rounded-full ${DOT[i.level]}`} /></div>
                <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-fl-cream">{num(i.value, i.unit)}</div>
                <div className="text-xs text-fl-cream/50">{i.norm}</div>
                <p className="mt-1 text-xs text-fl-cream/60">{i.hint}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <h2 className="font-semibold text-fl-cream">Динамика: ликвидность и просроченные долги</h2>
            <div className="mt-3 h-64" role="img" aria-label="Ликвидность и просроченные долги по месяцам">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                  <YAxis yAxisId="m" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `${Math.round(v / 1000).toLocaleString("ru-RU")} т`} />
                  <YAxis yAxisId="x" orientation="right" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={CHART.tooltip} formatter={(v: number, n: string) => (n === "Текущая ликвидность" || n === "Быстрая ликвидность" ? [v, n] : [`${money(v)} сом`, n])} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="m" dataKey="overdue" name="Просрочено" fill={CHART.neg} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar yAxisId="m" dataKey="liquid" name="Ликвидные активы" fill={CHART.s1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="x" dataKey="current" name="Текущая ликвидность" stroke={CHART.s2} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line yAxisId="x" dataKey="quick" name="Быстрая ликвидность" stroke={CHART.s3} strokeDasharray="4 3" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-fl-cream">Кредиторы: {money(r.totals.debts)} сом, не погашено в срок {money(r.totals.overdue)} сом</h2>
              <span className="text-xs text-fl-cream/50">группы — по видам долга; очерёдность при банкротстве — ст. 85–87 Закона</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {r.totals.byKind.map((k) => (
                <button key={k.kind} onClick={() => setKind(kind === k.kind ? "all" : k.kind)} className={`rounded-xl border p-3 text-left ${kind === k.kind ? "border-fl-gold bg-fl-gold/10" : k.overdue > 0 ? "border-fl-amber/50" : "border-fl-line"}`}>
                  <div className="text-sm text-fl-cream/70">{k.label}</div>
                  <div className="font-semibold tabular-nums text-fl-cream">{money(k.amount)} сом</div>
                  <div className={`text-xs ${k.overdue > 0 ? "text-fl-amber" : "text-fl-cream/50"}`}>{k.overdue > 0 ? `в срок не погашено ${money(k.overdue)}` : "просрочки нет"} · {k.count} кред.</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {([["all", "Все"], ["overdue", "Только с просрочкой"]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 ${kind === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65"}`}>{l}</button>
              ))}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-3 font-normal">Кредитор</th><th className="py-1.5 pr-3 font-normal">Вид</th><th className="py-1.5 pr-3 font-normal">Счета</th><th className="py-1.5 pr-3 text-right font-normal">Долг</th><th className="py-1.5 pr-3 text-right font-normal">С какой даты</th><th className="py-1.5 text-right font-normal">Не погашено в срок</th></tr></thead>
                <tbody className="divide-y divide-fl-line">
                  {debts.map((d) => (
                    <tr key={d.key}>
                      <td className="py-1.5 pr-3 text-fl-cream">{d.creditor}</td>
                      <td className="py-1.5 pr-3 text-fl-cream/65">{CREDITOR_KIND[d.kind]}</td>
                      <td className="py-1.5 pr-3 text-fl-cream/55">{d.accounts.join(", ")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream">{money(d.amount)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/65">{d.oldest.split("-").reverse().join(".")} <span className="text-xs text-fl-cream/45">({d.age} дн.)</span></td>
                      <td className={`py-1.5 text-right tabular-nums ${d.overdue > 0 ? (d.overdue90 > 0 ? "font-semibold text-fl-red" : "text-fl-amber") : "text-fl-cream/40"}`}>{d.overdue > 0 ? money(d.overdue) : "—"}</td>
                    </tr>
                  ))}
                  {debts.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-fl-cream/50">Нет долгов.</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {w && (
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
              <h2 className="font-semibold text-fl-cream">Что если: план оздоровления</h2>
              <p className="mt-1 text-sm text-fl-cream/60">Подвигайте ползунки — показатели пересчитаются сразу. Это не меняет журнал.</p>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {([["collect", "Взыскать дебиторку", `${money((r.balance.receivables * wi.collect) / 100)} сом из ${money(r.balance.receivables)}`],
                   ["sell", "Продать запасы", `${money((r.balance.inventory * wi.sell) / 100)} сом из ${money(r.balance.inventory)}`],
                   ["defer", "Отсрочить просроченные долги (реструктуризация)", `${money((r.totals.overdue * wi.defer) / 100)} сом из ${money(r.totals.overdue)}`]] as const).map(([k, l, hint]) => (
                  <label key={k} className="block text-sm">
                    <span className="flex justify-between gap-3 text-fl-cream/80"><span>{l}</span><b className="whitespace-nowrap text-fl-cream">{wi[k]} %</b></span>
                    <input type="range" min={0} max={100} step={5} value={wi[k]} onChange={(e) => setWi({ ...wi, [k]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--fl-gold,#c9a227)]" />
                    <span className="text-xs text-fl-cream/50">{hint}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
                {[["Деньги", `${money(w.cash)} сом`], ["Просрочено останется", `${money(w.overdue)} сом`], ["Покрытие просроченного", w.coverage == null ? "долгов нет" : `${w.coverage.toLocaleString("ru-RU")} (было ${num(r.indicators.find((i) => i.key === "coverage")!.value, "x")})`], ["Текущая ликвидность", `${num(w.current, "x")} (было ${num(r.indicators[0].value, "x")})`]].map(([a, b]) => (
                  <div key={a} className="rounded-lg bg-fl-surface-2 px-3 py-2"><div className="text-xs text-fl-cream/55">{a}</div><div className="font-semibold tabular-nums text-fl-cream">{b}</div></div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 text-sm">
              <h2 className="font-semibold text-fl-cream">Модель Альтмана Z''</h2>
              {r.altman ? <>
                <p className="mt-1 text-fl-cream/75">Z'' = <b className="text-fl-cream">{r.altman.z.toLocaleString("ru-RU")}</b> — {r.altman.zone === "safe" ? "зона устойчивости" : r.altman.zone === "grey" ? "серая зона" : "зона высокого риска"}.</p>
                <p className="mt-1 text-xs text-fl-cream/55">6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4, где X1 = оборотный капитал / активы ({r.altman.x1}), X2 = нераспределённая прибыль / активы ({r.altman.x2}), X3 = операционная прибыль за год / активы ({r.altman.x3}), X4 = капитал / обязательства ({r.altman.x4}). Выше 2,6 — устойчиво, ниже 1,1 — высокий риск. Международный ориентир (Altman, 1995), не норма законодательства КР.</p>
              </> : <p className="mt-1 text-fl-cream/60">Нет активов на дату — модель не считается.</p>}
            </section>
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 text-sm">
              <h2 className="font-semibold text-fl-cream">Когда долг считается непогашенным в срок, дней</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {(Object.keys(TERM_LABEL) as Array<keyof Terms>).map((k) => (
                  <label key={k} className="block"><span className="text-xs text-fl-cream/55">{TERM_LABEL[k]}</span>
                    <input type="number" min={1} max={730} value={terms[k]} onChange={(e) => setTerms({ ...terms, [k]: Math.max(1, Number(e.target.value) || 1) })} className={field} />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-fl-cream/50">Ориентиры для раннего предупреждения; точные сроки — в договорах и Налоговом кодексе. Тело кредитов гасится по графику договора и здесь просрочкой не считается.</p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
