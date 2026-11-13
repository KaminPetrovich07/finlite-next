"use client";

// Проверка журнала: подозрительные операции периода и закон Бенфорда.
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Line, ComposedChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { CHART } from "@/lib/chart-theme";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import type { AnomalyReport, Severity } from "@/lib/audit/anomalies";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const TONE: Record<Severity, string> = { high: "border-fl-red/50 bg-fl-red/[0.06]", medium: "border-fl-amber/50 bg-fl-amber/[0.06]", info: "border-fl-line" };
const BADGE: Record<Severity, [string, string]> = { high: ["важно", "bg-fl-red/15 text-fl-red"], medium: ["проверить", "bg-fl-amber/15 text-fl-amber"], info: ["к сведению", "bg-fl-info/15 text-fl-info"] };
const VERDICT = { close: "соответствует закону Бенфорда", acceptable: "в допустимых пределах", marginal: "на границе — стоит присмотреться", nonconforming: "не соответствует — проверьте суммы выборочно", few: "мало операций для вывода (нужно от 100)" };
const month = () => { const d = new Date(Date.now() + 6 * 3600e3); const y = d.getUTCFullYear(), m = d.getUTCMonth(); return { from: new Date(Date.UTC(y, m, 1)).toISOString().slice(0, 10), to: new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10) }; };

export default function AuditPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriod] = useState<{ from: string; to: string } | null>(null);
  const [key, setKey] = useState(0);
  const [r, setR] = useState<AnomalyReport | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [only, setOnly] = useState<Severity | "all">("all");

  useEffect(() => {
    if (!loaded || period) return;
    const sp = new URLSearchParams(location.search);
    const from = sp.get("from"), to = sp.get("to");
    setPeriod(from && to ? { from, to } : company?.demo ? DEMO_PERIOD : month());
    setKey((k) => k + 1);
  }, [loaded, company, period]);
  useEffect(() => {
    if (!companyId || !period) return;
    setR(null); setErr(null);
    fetch(`/api/audit?companyId=${companyId}&from=${period.from}&to=${period.to}`).then(async (x) => { const b = await x.json(); if (!x.ok) throw new Error(b.error); setR(b); }).catch((e) => setErr(e.message));
  }, [companyId, period]);

  const list = r?.findings.filter((f) => only === "all" || f.severity === only) ?? [];
  const count = (s: Severity) => r?.findings.filter((f) => f.severity === s).length ?? 0;
  const chart = r?.benford.expected.map((e, i) => ({ d: String(i + 1), expected: e, actual: r.benford.actual[i] }));
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Проверка журнала</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Программа ищет то, на что обратил бы внимание аудитор: возможные дубли, суммы во много раз больше обычных, банковские операции в выходные, уменьшение выручки, нетипичные проводки. Это повод посмотреть документ, а не обязательно ошибка.</p>
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
            {([["all", `Все: ${r.findings.length}`], ["high", `Важно: ${count("high")}`], ["medium", `Проверить: ${count("medium")}`], ["info", `К сведению: ${count("info")}`]] as const).map(([k, l]) => (
              <button key={k} onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 ${only === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65 hover:text-fl-cream"}`}>{l}</button>
            ))}
            <span className="ml-auto self-center text-fl-cream/50">проверено операций: {r.checked}</span>
          </div>
          {r.findings.length === 0 && <p className="rounded-xl border border-fl-green/40 bg-fl-green/[0.06] px-4 py-3 text-sm text-fl-cream/85">Подозрительных операций за период не найдено.</p>}
          <ul className="space-y-2">{list.map((f) => (
            <li key={f.id} className={`rounded-xl border p-3 ${TONE[f.severity]}`}>
              <div className="flex flex-wrap items-center gap-2">
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[f.severity][1]}`}>{BADGE[f.severity][0]}</span>
                <span className="font-semibold text-fl-cream">{f.title}</span>
                <span className="text-xs text-fl-cream/50">{f.date.split("-").reverse().join(".")}</span>
                <span className="ml-auto flex gap-3 text-xs">{f.entryIds.map((id, i) => <a key={id} href={`/ledger?entry=${id}&date=${f.date}`} className="text-fl-gold underline">{f.entryIds.length > 1 ? `операция ${i + 1}` : "открыть в журнале"}</a>)}</span>
              </div>
              <p className="mt-1 text-sm text-fl-cream/75">{f.detail}</p>
            </li>
          ))}</ul>
          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <h2 className="font-semibold text-fl-cream">Закон Бенфорда: первые цифры сумм</h2>
            <p className="mt-1 text-sm text-fl-cream/65">В естественных финансовых данных суммы чаще начинаются с 1, чем с 9 (30,1 % против 4,6 %). Сильное отклонение бывает при выдуманных или «подогнанных» суммах. Сумм: {r.benford.n}, отклонение MAD {r.benford.mad.toLocaleString("ru-RU")} — <b className="text-fl-cream">{VERDICT[r.benford.verdict]}</b>.</p>
            {r.benford.n > 0 && chart && (
              <div className="mt-3 h-56" role="img" aria-label="Доля первых цифр сумм: фактически и по закону Бенфорда">
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={chart} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                    <CartesianGrid stroke={CHART.grid} vertical={false} />
                    <XAxis dataKey="d" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
                    <YAxis unit=" %" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} />
                    <Tooltip contentStyle={CHART.tooltip} formatter={(v: number, n: string) => [`${v.toLocaleString("ru-RU")} %`, n === "actual" ? "В журнале" : "По Бенфорду"]} labelFormatter={(d) => `Первая цифра ${d}`} />
                    <Bar dataKey="actual" fill={CHART.s1} radius={[3, 3, 0, 0]} isAnimationActive={false} />
                    <Line dataKey="expected" stroke={CHART.s2} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              </div>
            )}
            <p className="mt-2 text-xs text-fl-cream/50">Столбцы — доля сумм журнала, линия — ожидаемая по закону Бенфорда. Пороги MAD по Нигрини: до 0,006 — близко, до 0,012 — допустимо, до 0,015 — на границе.</p>
          </section>
        </div>
      )}
    </main>
  );
}
