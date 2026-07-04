"use client";

import { useEffect, useState } from "react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ReferenceLine, ResponsiveContainer, Cell,
} from "recharts";
import { useReportPicker, ReportPickerBar } from "@/components/ReportPicker";
import {
  calculate, compareRegimes, breakEven, safetyMargin, grossMargin, taxBurden, doForecast,
  type CalculateResult, type RegimeKey,
} from "@/lib/tax-engine";
import {
  computeRisks, computeRecommendations, waterfallSteps, waterfallChartData, cvpCurve,
  accountingStandard, continuityNote,
} from "@/lib/executive";
import { formatNumber, formatPercent } from "@/lib/format";

const COLORS = { green: "#4F7942", red: "#B23B3B", gold: "#C9A227" };

export default function ExecutivePage() {
  const picker = useReportPicker();
  const [fr, setFr] = useState<CalculateResult | null>(null);
  const [periodLabel, setPeriodLabel] = useState("");
  const [scenarios, setScenarios] = useState({ pessimistic: -10, base: 4, optimistic: 15 });

  useEffect(() => {
    if (!picker.reportId) { setFr(null); return; }
    fetch(`/api/reports/${picker.reportId}`).then((r) => r.json()).then((report) => {
      const computed = calculate({
        regimeKey: report.regimeKey as RegimeKey,
        revenue: report.revenue, otherIncome: report.otherIncome, cogs: report.cogs,
        salaries: report.salaries, rent: report.rent, sellingExp: report.sellingExp,
        adminExp: report.adminExp, otherOpExp: report.otherOpExp, interestExp: report.interestExp,
        otherNonOp: report.otherNonOp, investInc: report.investInc, cashPct: report.cashPct,
        patentAmount: report.patentAmount,
      });
      setFr(computed);
      setPeriodLabel(report.periodLabel);
    });
  }, [picker.reportId]);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          🎯 Big 4 Executive Report
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">Сводка для руководителя · {periodLabel}</p>
      </header>

      <ReportPickerBar {...picker} />

      {!fr ? (
        <p className="text-sm text-fl-cream/50">Выберите отчёт для сводки.</p>
      ) : (
        <ExecutiveBody fr={fr} periodLabel={periodLabel} scenarios={scenarios} setScenarios={setScenarios} />
      )}
    </main>
  );
}

function ExecutiveBody({
  fr, periodLabel, scenarios, setScenarios,
}: {
  fr: CalculateResult; periodLabel: string;
  scenarios: { pessimistic: number; base: number; optimistic: number };
  setScenarios: (s: { pessimistic: number; base: number; optimistic: number }) => void;
}) {
  const gm = grossMargin(fr);
  const sm = safetyMargin(fr);
  const be = breakEven(fr);
  const tb = taxBurden(fr);
  const risks = computeRisks(fr, sm);
  const best = compareRegimes({
    revenue: fr.revenue, otherIncome: fr.otherIncome, cogs: fr.cogs,
    salaries: fr.salaries, rent: fr.rent, sellingExp: fr.sellingExp, adminExp: fr.adminExp,
  })[0];
  const recs = computeRecommendations(fr, best.name, best.tax);
  const cvp = cvpCurve(fr);
  const bars = waterfallChartData(waterfallSteps(fr));

  return (
    <>
      {/* Executive summary */}
      <section className="mb-6 space-y-1.5 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 text-sm sm:p-5">
        <p className="font-display text-base font-semibold text-fl-gold-bright">📌 EXECUTIVE SUMMARY — {periodLabel}</p>
        <p>💰 <b>Чистая прибыль:</b> {formatNumber(fr.netProfit)} сом (рентабельность {formatPercent(fr.profitability)})</p>
        <p>📊 <b>Валовая маржа:</b> {formatPercent(gm)} | <b>Налоговая нагрузка:</b> {formatPercent(tb)} | <b>Запас прочности:</b> {formatPercent(sm)}</p>
        <p>🏛️ <b>Режим:</b> {fr.regimeName} | <b>EBIT:</b> {formatNumber(fr.ebit)} сом | <b>EBT:</b> {formatNumber(fr.ebt)} сом</p>
        <p>📍 <b>Точка безубыточности:</b> {formatNumber(be)} сом — {sm > 30 ? "✅ устойчив" : sm > 15 ? "⚠️ внимание" : "🔴 критично"}</p>
      </section>

      {/* KPI dashboard */}
      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Выручка" value={formatNumber(fr.totalRevenue)} />
        <Kpi label="Валовая маржа" value={formatPercent(gm)} />
        <Kpi label="EBIT" value={formatNumber(fr.ebit)} />
        <Kpi label="Чист. прибыль" value={formatNumber(fr.netProfit)} gold />
      </section>

      {/* Risks */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">⚠️ Анализ рисков</h2>
        <div className="space-y-1.5 text-sm">
          {risks.map((r, i) => (
            <p key={i}>{r.level} <b className="text-fl-cream">{r.title}</b> — <span className="text-fl-cream/60">{r.detail}</span></p>
          ))}
        </div>
      </section>

      {/* CVP chart */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-1 font-display text-base font-semibold text-fl-cream">📐 CVP-анализ</h2>
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="Вал. маржа" value={formatPercent(gm)} />
          <Metric label="Точка безубыточности" value={formatNumber(be)} />
          <Metric label="Запас прочности" value={formatPercent(sm)} />
          <Metric label="Нал. нагрузка" value={formatPercent(tb)} />
        </div>
        {cvp.length > 0 && (
          <ResponsiveContainer width="100%" height={260}>
            <LineChart data={cvp}>
              <CartesianGrid stroke="#C9A22720" />
              <XAxis dataKey="revenue" tickFormatter={(v) => formatNumber(v)} stroke="#F2EDE480" fontSize={11} />
              <YAxis tickFormatter={(v) => formatNumber(v)} stroke="#F2EDE480" fontSize={11} width={70} />
              <Tooltip formatter={(v: number) => formatNumber(v)} labelFormatter={(v) => `Выручка: ${formatNumber(Number(v))}`}
                contentStyle={{ background: "#14110D", border: "1px solid #C9A22740" }} />
              <ReferenceLine y={0} stroke="#B23B3B" strokeDasharray="4 4" label={{ value: "Точка безубыточности", fill: "#B23B3B", fontSize: 11 }} />
              {be > 0 && <ReferenceLine x={be} stroke="#4F7942" strokeDasharray="2 2" />}
              <Line type="monotone" dataKey="profit" stroke="#E8C547" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </section>

      {/* Forecast scenarios */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">🔮 Прогноз и сценарии</h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScenarioCard label="🔴 Пессимистичный" growth={scenarios.pessimistic}
            onChange={(v) => setScenarios({ ...scenarios, pessimistic: v })} fr={fr} />
          <ScenarioCard label="🟡 Базовый" growth={scenarios.base}
            onChange={(v) => setScenarios({ ...scenarios, base: v })} fr={fr} />
          <ScenarioCard label="🟢 Оптимистичный" growth={scenarios.optimistic}
            onChange={(v) => setScenarios({ ...scenarios, optimistic: v })} fr={fr} />
        </div>
      </section>

      {/* Recommendations */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">✅ Рекомендации</h2>
        <div className="space-y-1.5 text-sm">
          {recs.map((r, i) => (
            <p key={i}><b className="text-fl-gold-bright">{r.priority}</b> | <b className="text-fl-cream">{r.title}</b> — <span className="text-fl-cream/60">{r.detail}</span></p>
          ))}
        </div>
      </section>

      {/* Waterfall */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">📈 Водопад: от выручки к прибыли</h2>
        <ResponsiveContainer width="100%" height={320}>
          <BarChart data={bars} margin={{ top: 20 }}>
            <CartesianGrid stroke="#C9A22720" vertical={false} />
            <XAxis dataKey="label" stroke="#F2EDE480" fontSize={10} interval={0} angle={-15} textAnchor="end" height={60} />
            <YAxis tickFormatter={(v) => formatNumber(v)} stroke="#F2EDE480" fontSize={11} width={70} />
            <Tooltip formatter={(_: number, _name: string, props: any) => formatNumber(props.payload.value)}
              contentStyle={{ background: "#14110D", border: "1px solid #C9A22740" }} />
            <Bar dataKey="base" stackId="wf" fill="transparent" />
            <Bar dataKey="bar" stackId="wf">
              {bars.map((b, i) => <Cell key={i} fill={COLORS[b.color]} />)}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </section>

      {/* Explanatory notes */}
      <section className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 text-sm leading-relaxed sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">📝 Пояснительная записка (IAS 1.112)</h2>
        <div className="space-y-3 text-fl-cream/80">
          <p><b className="text-fl-cream">1. Основы подготовки отчётности.</b> Отчётность за <b>{periodLabel}</b> подготовлена по методу начисления (МСФО IAS 1.27). Применяемый стандарт: <b>{accountingStandard(fr.totalRevenue)}</b>.</p>
          <p><b className="text-fl-cream">2. Учётная политика.</b> Выручка признаётся по мере выполнения обязательств (МСФО IFRS 15). Запасы оцениваются по средней себестоимости. Амортизация начисляется линейным способом.</p>
          <p><b className="text-fl-cream">3. Налоговый режим и ставки.</b> Режим: <b>{fr.regimeName}</b>. Соцфонд (работодатель): <b>12.25%</b> от ФОТ = <b>{formatNumber(fr.social)}</b> сом (ГСЗН КР). Прямые налоги итого: <b>{formatNumber(fr.totalDirect)}</b> сом ({formatPercent(tb)} от выручки).{fr.vat > 0 && <> НДС: <b>{formatNumber(fr.vat)}</b> сом — косвенный налог (ст.254 НК КР), не уменьшает прибыль (IAS 1).</>}</p>
          <p><b className="text-fl-cream">4. Ключевые оценки и допущения.</b> Точка безубыточности: <b>{formatNumber(be)}</b> сом. Запас финансовой прочности: <b>{formatPercent(sm)}</b>. Валовая маржа: <b>{formatPercent(gm)}</b>. Налоговая нагрузка: <b>{formatPercent(tb)}</b>.</p>
          <p><b className="text-fl-cream">5. Допущение о непрерывности деятельности (IAS 1.25).</b> {continuityNote(fr.netProfit)}</p>
          <p><b className="text-fl-cream">6. Связанные стороны (IAS 24).</b> Существенных операций со связанными сторонами в отчётном периоде не выявлено.</p>
        </div>
      </section>
    </>
  );
}

function ScenarioCard({ label, growth, onChange, fr }: { label: string; growth: number; onChange: (v: number) => void; fr: CalculateResult }) {
  const fct = doForecast(fr, growth);
  return (
    <div className="rounded-lg border border-fl-gold/10 bg-fl-charcoal p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-fl-cream/70">{label}</span>
        <span className="font-mono text-fl-gold-bright">{growth >= 0 ? "+" : ""}{growth}%</span>
      </div>
      <input type="range" min={-30} max={30} value={growth} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-fl-gold" />
      <div className="mt-2 font-mono text-base font-semibold tabular-nums text-fl-cream">{formatNumber(fct.net)} сом</div>
      <div className="text-xs text-fl-cream/50">{formatPercent(fct.pct)} маржа</div>
    </div>
  );
}

function Kpi({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-fl-gold/10 bg-fl-charcoal-2 p-3">
      <div className="text-xs text-fl-cream/50">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${gold ? "text-fl-gold-bright" : "text-fl-cream"}`}>{value}</div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md border border-fl-gold/10 bg-fl-charcoal p-2">
      <div className="text-[11px] text-fl-cream/50">{label}</div>
      <div className="font-mono text-sm font-semibold text-fl-cream">{value}</div>
    </div>
  );
}
