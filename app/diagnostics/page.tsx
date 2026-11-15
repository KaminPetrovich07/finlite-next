"use client";

// Финансовая диагностика: признаки неплатёжеспособности, перечень кредиторов, «что если».
import { useEffect, useMemo, useState } from "react";
import { Bar, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { downloadPost } from "@/components/download";
import { useT } from "@/components/i18n";
import { CHART } from "@/lib/chart-theme";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { CREDITOR_KIND, DEFAULT_TERMS, whatIf, type CreditorKind, type Diagnosis, type Level, type Terms } from "@/lib/insolvency/diagnose";

type Res = Diagnosis & { company: { name: string; inn: string | null; demo: boolean } };

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const TONE: Record<Level, string> = { ok: "border-fl-green/45 bg-fl-green/[0.06]", watch: "border-fl-amber/50 bg-fl-amber/[0.07]", risk: "border-fl-red/50 bg-fl-red/[0.07]" };
const DOT: Record<Level, string> = { ok: "bg-fl-green", watch: "bg-fl-amber", risk: "bg-fl-red" };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const TERM_KEYS: Array<keyof Terms> = ["suppliers", "staff", "budget", "quarterlyTax", "interest", "other"];

export default function DiagnosticsPage() {
  const t = useT();
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
    const timer = setTimeout(() => {
      fetch(`/api/insolvency?${query}`).then(async (x) => { const b = await x.json(); if (!x.ok) throw new Error(b.error); setR(b); }).catch((e) => setErr(e.message));
    }, 250);
    return () => clearTimeout(timer);
  }, [query, companyId, asOf]);

  async function download(format: "pdf" | "docx") {
    setBusy(format);
    try { await downloadPost(`/api/insolvency?format=${format}`, { companyId, asOf, months, ...terms }, `${t("Финансовая диагностика")}.${format}`); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }

  const num = (v: number | null, unit: string) => (v == null ? "—" : unit === "%" ? `${v} %` : unit === "мес" ? t("{n} мес.", { n: v.toLocaleString("ru-RU") }) : v.toLocaleString("ru-RU"));
  const termLabel: Record<keyof Terms, string> = {
    suppliers: t("Поставщикам"), staff: t("Зарплата"), budget: t("Налоги и взносы за месяц"), quarterlyTax: t("Налог на прибыль / единый"), interest: t("Проценты по кредитам"), other: t("Прочие"),
  };
  const creditorName = (d: Res["debts"][number]) => (d.interest ? t("{name} — проценты", { name: t(d.creditor) }) : t(d.creditor));
  const w = r ? whatIf(r.balance, r.totals.overdue, wi) : null;
  const debts = r?.debts.filter((d) => kind === "all" || (kind === "overdue" ? d.overdue > 0 : d.kind === kind)) ?? [];
  const chart = r?.months.map((m) => ({ month: m.month, current: m.current, quick: m.quick, overdue: Math.round(m.overdue), liquid: Math.round(m.liquid) }));
  const sCurrent = t("Текущая ликвидность"), sQuick = t("Быстрая ликвидность");

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Финансовая диагностика")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          {t("Гасит ли компания долги в срок и хватает ли ей на них денег и того, что быстро превращается в деньги. Считается по журналу проводок: ликвидность по месяцам, возраст каждого долга, признаки неплатёжеспособности по ст. 3 Закона КР «О банкротстве (несостоятельности)» и что изменит взыскание дебиторки, продажа запасов или отсрочка долгов.")}
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Компания")}</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>{t("+ Добавить компанию…")}</option>
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("На дату")}</span>
          <input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={field} />
        </label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Динамика")}</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={field}>
            {[3, 6, 12, 24].map((n) => <option key={n} value={n}>{t("{n} мес.", { n })}</option>)}
          </select>
        </label>
        <div className="ml-auto flex gap-2">
          <button className={btn} disabled={!r || busy !== null} onClick={() => download("pdf")}>{busy === "pdf" ? "…" : t("Заключение PDF")}</button>
          <button className={btn} disabled={!r || busy !== null} onClick={() => download("docx")}>{busy === "docx" ? "…" : "Word"}</button>
        </div>
      </div>

      {err && <p className="mb-4 text-sm text-fl-red">{t(err)}</p>}
      {!r ? !err && <p className="text-sm text-fl-cream/50">{t("Считаю…")}</p> : (
        <div className="space-y-5">
          <section className={`rounded-2xl border p-4 ${TONE[r.verdict.level]}`}>
            <div className="flex items-center gap-2"><span className={`h-3 w-3 rounded-full ${DOT[r.verdict.level]}`} /><h2 className="font-display text-xl font-semibold text-fl-cream">{t(r.verdict.title)}</h2></div>
            <p className="mt-1 text-sm text-fl-cream/80">{t(r.verdict.detail)}</p>
            {r.signals.length > 0 && (
              <ul className="mt-3 space-y-1.5">{r.signals.map((s) => (
                <li key={s.title} className="flex gap-2 text-sm"><span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${s.level === "risk" ? "bg-fl-red" : "bg-fl-amber"}`} /><span><b className="text-fl-cream">{t(s.title, s.vars)}.</b> <span className="text-fl-cream/75">{t(s.detail, s.vars)}</span></span></li>
              ))}</ul>
            )}
          </section>

          <section className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-3">
            {r.indicators.map((i) => (
              <div key={i.key} className={`rounded-xl border p-3 ${TONE[i.level]}`} title={t(i.hint)}>
                <div className="flex items-center justify-between gap-2"><span className="text-sm text-fl-cream/70">{t(i.label)}</span><span className={`h-2.5 w-2.5 flex-none rounded-full ${DOT[i.level]}`} /></div>
                <div className="mt-1 font-display text-2xl font-semibold tabular-nums text-fl-cream">{num(i.value, i.unit)}</div>
                <div className="text-xs text-fl-cream/50">{t(i.norm)}</div>
                <p className="mt-1 hidden text-xs text-fl-cream/60 sm:block">{t(i.hint)}</p>
              </div>
            ))}
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <h2 className="font-semibold text-fl-cream">{t("Динамика: ликвидность и просроченные долги")}</h2>
            <div className="mt-3 h-64" role="img" aria-label={t("Ликвидность и просроченные долги по месяцам")}>
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid stroke={CHART.grid} vertical={false} />
                  <XAxis dataKey="month" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                  <YAxis yAxisId="m" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={78} tickFormatter={(v) => t("{n} т", { n: Math.round(v / 1000).toLocaleString("ru-RU") })} />
                  <YAxis yAxisId="x" orientation="right" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={36} />
                  <Tooltip contentStyle={CHART.tooltip} formatter={(v: number, n: string) => (n === sCurrent || n === sQuick ? [v, n] : [t("{sum} сом", { sum: money(v) }), n])} />
                  <Legend wrapperStyle={{ fontSize: 12 }} />
                  <Bar yAxisId="m" dataKey="overdue" name={t("Просрочено")} fill={CHART.neg} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Bar yAxisId="m" dataKey="liquid" name={t("Ликвидные активы")} fill={CHART.s1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  <Line yAxisId="x" dataKey="current" name={sCurrent} stroke={CHART.s2} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  <Line yAxisId="x" dataKey="quick" name={sQuick} stroke={CHART.s3} strokeDasharray="4 3" strokeWidth={2} dot={{ r: 2 }} isAnimationActive={false} />
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <h2 className="font-semibold text-fl-cream">{t("Кредиторы: {sum} сом, не погашено в срок {overdue} сом", { sum: money(r.totals.debts), overdue: money(r.totals.overdue) })}</h2>
              <span className="text-xs text-fl-cream/50">{t("группы — по видам долга; очерёдность при банкротстве — ст. 85–87 Закона")}</span>
            </div>
            <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {r.totals.byKind.map((k) => (
                <button key={k.kind} onClick={() => setKind(kind === k.kind ? "all" : k.kind)} className={`rounded-xl border p-3 text-left ${kind === k.kind ? "border-fl-gold bg-fl-gold/10" : k.overdue > 0 ? "border-fl-amber/50" : "border-fl-line"}`}>
                  <div className="text-sm text-fl-cream/70">{t(k.label)}</div>
                  <div className="font-semibold tabular-nums text-fl-cream">{t("{sum} сом", { sum: money(k.amount) })}</div>
                  <div className={`text-xs ${k.overdue > 0 ? "text-fl-amber" : "text-fl-cream/50"}`}>{k.overdue > 0 ? t("в срок не погашено {sum}", { sum: money(k.overdue) }) : t("просрочки нет")} · {t("кредиторов: {n}", { n: k.count })}</div>
                </button>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap gap-2 text-sm">
              {([["all", t("Все")], ["overdue", t("Только с просрочкой")]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setKind(k)} className={`rounded-full border px-3 py-1 ${kind === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65"}`}>{l}</button>
              ))}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[640px] text-sm">
                <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-3 font-normal">{t("Кредитор")}</th><th className="py-1.5 pr-3 font-normal">{t("Вид")}</th><th className="py-1.5 pr-3 font-normal">{t("Счета")}</th><th className="py-1.5 pr-3 text-right font-normal">{t("Долг")}</th><th className="py-1.5 pr-3 text-right font-normal">{t("С какой даты")}</th><th className="py-1.5 text-right font-normal">{t("Не погашено в срок")}</th></tr></thead>
                <tbody className="divide-y divide-fl-line">
                  {debts.map((d) => (
                    <tr key={d.key}>
                      <td className="py-1.5 pr-3 text-fl-cream">{creditorName(d)}</td>
                      <td className="py-1.5 pr-3 text-fl-cream/65">{t(CREDITOR_KIND[d.kind])}</td>
                      <td className="py-1.5 pr-3 text-fl-cream/55">{d.accounts.join(", ")}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream">{money(d.amount)}</td>
                      <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/65">{d.oldest.split("-").reverse().join(".")} <span className="text-xs text-fl-cream/45">{t("({n} дн.)", { n: d.age })}</span></td>
                      <td className={`py-1.5 text-right tabular-nums ${d.overdue > 0 ? (d.overdue90 > 0 ? "font-semibold text-fl-red" : "text-fl-amber") : "text-fl-cream/40"}`}>{d.overdue > 0 ? money(d.overdue) : "—"}</td>
                    </tr>
                  ))}
                  {debts.length === 0 && <tr><td colSpan={6} className="py-3 text-center text-fl-cream/50">{t("Нет долгов.")}</td></tr>}
                </tbody>
              </table>
            </div>
          </section>

          {w && (
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
              <h2 className="font-semibold text-fl-cream">{t("Что если: план оздоровления")}</h2>
              <p className="mt-1 text-sm text-fl-cream/60">{t("Подвигайте ползунки — показатели пересчитаются сразу. Это не меняет журнал.")}</p>
              <div className="mt-3 grid gap-4 md:grid-cols-3">
                {([["collect", t("Взыскать дебиторку"), r.balance.receivables, wi.collect],
                   ["sell", t("Продать запасы"), r.balance.inventory, wi.sell],
                   ["defer", t("Отсрочить просроченные долги (реструктуризация)"), r.totals.overdue, wi.defer]] as const).map(([k, l, base, v]) => (
                  <label key={k} className="block text-sm">
                    <span className="flex justify-between gap-3 text-fl-cream/80"><span>{l}</span><b className="whitespace-nowrap text-fl-cream">{v} %</b></span>
                    <input type="range" min={0} max={100} step={5} value={v} onChange={(e) => setWi({ ...wi, [k]: Number(e.target.value) })} className="mt-1 w-full accent-[var(--fl-gold,#c9a227)]" />
                    <span className="text-xs text-fl-cream/50">{t("{part} сом из {all}", { part: money((base * v) / 100), all: money(base) })}</span>
                  </label>
                ))}
              </div>
              <div className="mt-4 grid gap-2 text-sm sm:grid-cols-4">
                {[[t("Деньги"), t("{sum} сом", { sum: money(w.cash) })],
                  [t("Просрочено останется"), t("{sum} сом", { sum: money(w.overdue) })],
                  [t("Покрытие просроченного"), w.coverage == null ? t("долгов нет") : t("{now} (было {was})", { now: w.coverage.toLocaleString("ru-RU"), was: num(r.indicators.find((i) => i.key === "coverage")!.value, "x") })],
                  [t("Текущая ликвидность"), t("{now} (было {was})", { now: num(w.current, "x"), was: num(r.indicators[0].value, "x") })]].map(([a, b]) => (
                  <div key={a} className="rounded-lg bg-fl-surface-2 px-3 py-2"><div className="text-xs text-fl-cream/55">{a}</div><div className="font-semibold tabular-nums text-fl-cream">{b}</div></div>
                ))}
              </div>
            </section>
          )}

          <div className="grid gap-5 md:grid-cols-2">
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 text-sm">
              <h2 className="font-semibold text-fl-cream">{t("Модель Альтмана Z''")}</h2>
              {r.altman ? <>
                <p className="mt-1 text-fl-cream/75">Z'' = <b className="text-fl-cream">{r.altman.z.toLocaleString("ru-RU")}</b> — {r.altman.zone === "safe" ? t("зона устойчивости") : r.altman.zone === "grey" ? t("серая зона") : t("зона высокого риска")}.</p>
                <p className="mt-1 text-xs text-fl-cream/55">{t("6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4, где X1 = оборотный капитал / активы ({x1}), X2 = нераспределённая прибыль / активы ({x2}), X3 = операционная прибыль за год / активы ({x3}), X4 = капитал / обязательства ({x4}). Выше 2,6 — устойчиво, ниже 1,1 — высокий риск. Международный ориентир (Altman, 1995), не норма законодательства КР.", { x1: r.altman.x1, x2: r.altman.x2, x3: r.altman.x3, x4: r.altman.x4 })}</p>
              </> : <p className="mt-1 text-fl-cream/60">{t("Нет активов на дату — модель не считается.")}</p>}
            </section>
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 text-sm">
              <h2 className="font-semibold text-fl-cream">{t("Когда долг считается непогашенным в срок, дней")}</h2>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {TERM_KEYS.map((k) => (
                  <label key={k} className="block"><span className="text-xs text-fl-cream/55">{termLabel[k]}</span>
                    <input type="number" min={1} max={730} value={terms[k]} onChange={(e) => setTerms({ ...terms, [k]: Math.max(1, Number(e.target.value) || 1) })} className={field} />
                  </label>
                ))}
              </div>
              <p className="mt-2 text-xs text-fl-cream/50">{t("Ориентиры для раннего предупреждения; точные сроки — в договорах и Налоговом кодексе. Тело кредитов гасится по графику договора и здесь просрочкой не считается.")}</p>
            </section>
          </div>
        </div>
      )}
    </main>
  );
}
