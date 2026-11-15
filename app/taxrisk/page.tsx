"use client";

// Налоговые риски: что увидит налоговая при камеральном анализе.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { CHART } from "@/lib/chart-theme";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import type { RiskSeverity, TaxRiskReport } from "@/lib/taxrisk/check";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const TONE: Record<RiskSeverity, string> = { high: "border-fl-red/50 bg-fl-red/[0.06]", medium: "border-fl-amber/50 bg-fl-amber/[0.06]", info: "border-fl-line" };
const BADGE: Record<RiskSeverity, [string, string]> = { high: ["высокий риск", "bg-fl-red/15 text-fl-red"], medium: ["проверить", "bg-fl-amber/15 text-fl-amber"], info: ["к сведению", "bg-fl-info/15 text-fl-info"] };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const quarter = () => { const d = new Date(Date.now() + 6 * 3600e3); const y = d.getUTCFullYear(), m = d.getUTCMonth(); return { from: new Date(Date.UTC(y, m - 3, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) }; };

export default function TaxRiskPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [key, setKey] = useState(0);
  const [r, setR] = useState<TaxRiskReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<RiskSeverity | "all">("all");

  useEffect(() => { if (loaded && !period) { setPeriod(company?.demo ? DEMO_PERIOD : quarter()); setKey((k) => k + 1); } }, [loaded, company, period]);
  useEffect(() => {
    if (!companyId || !period || companyId === NEW_COMPANY) return;
    setR(null); setErr(null);
    fetch(`/api/taxrisk?companyId=${companyId}&from=${period.from}&to=${period.to}`).then(async (x) => { const b = await x.json(); if (!x.ok) throw new Error(b.error); setR(b); }).catch((e) => setErr(e.message));
  }, [companyId, period]);

  const list = r?.risks.filter((f) => only === "all" || f.severity === only) ?? [];
  const count = (s: RiskSeverity) => r?.risks.filter((f) => f.severity === s).length ?? 0;
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Налоговые риски</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">То, на что смотрит налоговая при камеральном анализе: продажа товара, которого по учёту не было, цена ниже себестоимости, НДС к возмещению месяц за месяцем, реализация без НДС, неуплаченный НДС при ввозе из ЕАЭС, импорт без НДС при ввозе, контрагенты без ИНН. Это повод проверить документы до проверки, а не обязательно нарушение.</p>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div><span className="mb-1 block text-xs text-fl-cream/55">Период</span>{period && <PeriodPicker key={key} from={period.from} to={period.to} onChange={(p) => setPeriod((c) => (c && c.from === p.from && c.to === p.to ? c : p))} />}</div>
      </div>
      {err ? <p className="text-sm text-fl-red">{err}</p> : !r ? <p className="text-sm text-fl-cream/50">Проверяю…</p> : (
        <div className="space-y-5">
          <div className="flex flex-wrap gap-2 text-sm">
            {([["all", `Все: ${r.risks.length}`], ["high", `Высокий риск: ${count("high")}`], ["medium", `Проверить: ${count("medium")}`], ["info", `К сведению: ${count("info")}`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 ${only === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65 hover:text-fl-cream"}`}>{l}</button>
            ))}
            <span className="ml-auto self-center text-fl-cream/50">проверено операций: {r.checked}</span>
          </div>
          {r.risks.length === 0 && <p className="rounded-xl border border-fl-green/40 bg-fl-green/[0.06] px-4 py-3 text-sm text-fl-cream/85">Рисков за период не найдено.</p>}
          <ul className="space-y-2">{list.map((f) => (
            <li key={f.id} className={`rounded-xl border p-3 ${TONE[f.severity]}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.severity][1]}`}>{BADGE[f.severity][0]}</span>
                <span className="font-semibold text-fl-cream">{f.title}</span>
                {f.amount > 0 && <span className="text-xs text-fl-cream/55">{money(f.amount)} сом</span>}
                <span className="ml-auto flex gap-3 text-xs">{f.entryIds.slice(0, 3).map((id, i) => <a key={id} href={`/ledger?entry=${id}&date=${f.date}`} className="text-fl-gold underline">{f.entryIds.length > 1 ? `операция ${i + 1}` : "открыть в журнале"}</a>)}</span>
              </div>
              <p className="mt-1 text-sm text-fl-cream/75">{f.detail}</p>
            </li>
          ))}</ul>
          {r.vat.length > 0 && (
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
              <h2 className="font-semibold text-fl-cream">НДС по месяцам: начислено и к вычету</h2>
              <div className="mt-3 h-56" role="img" aria-label="НДС начисленный и к вычету по месяцам">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={r.vat} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="month" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                    <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} tickFormatter={(v) => `${Math.round(v / 1000).toLocaleString("ru-RU")} т`} />
                    <Tooltip contentStyle={CHART.tooltip} formatter={(v: number, n: string) => [`${money(v)} сом`, n]} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="output" name="Начислено с реализации" fill={CHART.s1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Bar dataKey="input" name="К вычету" fill={CHART.s2} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <table className="mt-2 w-full text-sm"><thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1 font-normal">Месяц</th><th className="text-right font-normal">Начислено</th><th className="text-right font-normal">К вычету</th><th className="text-right font-normal">Доля вычетов</th></tr></thead>
                <tbody className="divide-y divide-fl-line">{r.vat.map((m) => <tr key={m.month}><td className="py-1 text-fl-cream/80">{m.month}</td><td className="text-right tabular-nums">{money(m.output)}</td><td className="text-right tabular-nums">{money(m.input)}</td><td className={`text-right tabular-nums ${(m.share ?? 0) >= 90 ? "text-fl-amber" : "text-fl-cream/70"}`}>{m.share == null ? "—" : `${m.share.toLocaleString("ru-RU")} %`}</td></tr>)}</tbody></table>
            </section>
          )}
          {!r.vatPayer && <p className="text-xs text-fl-cream/50">НДС с реализации в журнале нет — проверки НДС пропущены (компания не плательщик НДС или НДС не выделяется).</p>}
        </div>
      )}
    </main>
  );
}
