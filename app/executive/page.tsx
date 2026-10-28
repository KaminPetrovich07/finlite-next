"use client";

import { useCallback, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { LedgerSource, type LedgerLoad } from "@/components/ledger/LedgerSource";
import { Info } from "@/components/Info";
import { Waterfall } from "@/components/charts/Waterfall";
import {
  calculate, comparableRegimes, compareRegimes, breakEven, safetyMargin, grossMargin, taxBurden, doForecast,
  SOCIAL_EMPLOYER, type CalculateResult,
} from "@/lib/tax-engine";
import {
  computeRisks, computeRecommendations, waterfallSteps, waterfallChartData, cvpCurve,
  accountingStandard, continuityNote,
} from "@/lib/executive";
import { CHART, compactSom } from "@/lib/chart-theme";
import { formatNumber, formatPercent } from "@/lib/format";

const card = "mb-6 rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";

export default function ExecutivePage() {
  const [data, setData] = useState<{ fr: CalculateResult; load: LedgerLoad } | null>(null);
  const [scenarios, setScenarios] = useState({ pessimistic: -10, base: 4, optimistic: 15 });

  const onLoad = useCallback((load: LedgerLoad) => {
    setData({ fr: calculate(load.bridge.input), load });
  }, []);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Сводка для руководителя</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Главные цифры, риски, безубыточность, сценарии и рекомендации — в формате, который аудиторские компании «большой
          четвёрки» готовят для руководства. Все цифры берутся из журнала проводок выбранной компании за период.
        </p>
      </header>

      <div className="mb-6">
        <LedgerSource auto onLoad={onLoad} title="Компания и период" />
      </div>

      {!data ? (
        <p className="text-sm text-fl-cream/50">Загружаю данные журнала…</p>
      ) : data.load.entryCount === 0 || data.fr.totalRevenue <= 0 ? (
        <p className="rounded-xl border border-fl-line bg-fl-gold/5 px-4 py-3 text-sm text-fl-cream/70">
          За {data.load.periodLabel.toLowerCase()} у компании нет выручки в журнале. Выберите другой период или внесите операции в «Журнале».
        </p>
      ) : (
        <ExecutiveBody fr={data.fr} load={data.load} scenarios={scenarios} setScenarios={setScenarios} />
      )}
    </main>
  );
}

function ExecutiveBody({ fr, load, scenarios, setScenarios }: {
  fr: CalculateResult; load: LedgerLoad;
  scenarios: { pessimistic: number; base: number; optimistic: number };
  setScenarios: (s: { pessimistic: number; base: number; optimistic: number }) => void;
}) {
  const gm = grossMargin(fr);
  const sm = safetyMargin(fr);
  const be = breakEven(fr);
  const tb = taxBurden(fr);
  const risks = computeRisks(fr, sm);
  const allowed = new Set(comparableRegimes(load.regime));
  const i = load.bridge.input;
  const regimes = compareRegimes({
    revenue: i.revenue, otherIncome: i.otherIncome, cogs: i.cogs, salaries: i.salaries, rent: i.rent,
    sellingExp: i.sellingExp, adminExp: i.adminExp, otherOpExp: i.otherOpExp, interestExp: i.interestExp,
    otherNonOp: i.otherNonOp, investInc: i.investInc, cashPct: i.cashPct, patentAmount: i.patentAmount,
  }).filter((r) => allowed.has(r.key));
  const best = regimes[0];
  const recs = best ? computeRecommendations(fr, best.name, best.tax) : [];
  const cvp = cvpCurve(fr);
  const bars = waterfallChartData(waterfallSteps(fr));
  const pl = load.periodLabel;
  const socialPct = `${String(Math.round(SOCIAL_EMPLOYER * 10000) / 100).replace(".", ",")}%`;

  return (
    <>
      <section className={`${card} space-y-2 text-sm leading-relaxed`}>
        <p className="font-display text-base font-semibold text-fl-gold">Главное за {pl.toLowerCase()} · {load.companyName}</p>
        <p><b>Чистая прибыль:</b> {formatNumber(fr.netProfit)} сом — рентабельность продаж {formatPercent(fr.profitability)}.</p>
        <p>
          <b>Валовая маржа:</b> {formatPercent(gm)} <Info k="exec:gross" /> · <b>Налоговая нагрузка:</b> {formatPercent(tb)} <Info k="tax:burden" /> ·{" "}
          <b>Запас прочности:</b> {formatPercent(sm)} <Info k="exec:safety" />
        </p>
        <p>
          <b>Режим:</b> {fr.regimeName} · <b>Операционная прибыль (EBIT):</b> {formatNumber(fr.ebit)} сом <Info k="exec:ebit" /> ·{" "}
          <b>Прибыль до налога (EBT):</b> {formatNumber(fr.ebt)} сом <Info k="exec:ebt" />
        </p>
        <p>
          <b>Точка безубыточности:</b> {formatNumber(be)} сом <Info k="exec:breakEven" /> —{" "}
          {sm > 30 ? "запас устойчивый" : sm > 15 ? "требует внимания" : "критически мал"}.
        </p>
        <p className="text-xs text-fl-cream/50">Источник: журнал проводок, {load.entryCount} проводок за период. Налоги пересчитаны по режиму компании.</p>
      </section>

      <section className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <Kpi label="Выручка" value={formatNumber(fr.totalRevenue)} info="kpi:netRevenue" />
        <Kpi label="Валовая маржа" value={formatPercent(gm)} info="exec:gross" />
        <Kpi label="Операционная прибыль" value={formatNumber(fr.ebit)} info="exec:ebit" />
        <Kpi label="Чистая прибыль" value={formatNumber(fr.netProfit)} info="kpi:netProfit" accent />
      </section>

      <section className={card}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Анализ рисков<Info k="exec:risks" /></h2>
        <div className="space-y-1.5 text-sm">
          {risks.map((r, i) => (
            <p key={i}>
              <span className={`mr-1 rounded-full px-2 py-0.5 text-xs font-semibold ${r.level === "Высокий" ? "bg-fl-red/15 text-fl-red" : r.level === "Средний" ? "bg-fl-amber/15 text-fl-amber" : "bg-fl-green/15 text-fl-green"}`}>{r.level}</span>
              <b className="text-fl-cream">{r.title}</b> — <span className="text-fl-cream/70">{r.detail}</span>
            </p>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-display text-base font-semibold text-fl-cream">Безубыточность: затраты — объём — прибыль<Info k="exec:cvp" /></h2>
        <p className="mb-3 text-xs text-fl-cream/55">Прибыль при разной выручке, если структура расходов сохраняется. Пересечение с нулём — точка безубыточности.</p>
        <div className="mb-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
          <Metric label="Валовая маржа" value={formatPercent(gm)} info="exec:gross" />
          <Metric label="Точка безубыточности" value={`${formatNumber(be)} сом`} info="exec:breakEven" />
          <Metric label="Запас прочности" value={formatPercent(sm)} info="exec:safety" />
          <Metric label="Налоговая нагрузка" value={formatPercent(tb)} info="tax:burden" />
        </div>
        {cvp.length > 0 && (
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={cvp} margin={{ top: 24, right: 16, left: 0, bottom: 8 }}>
                <CartesianGrid stroke={CHART.grid} />
                <XAxis dataKey="revenue" type="number" domain={[0, "dataMax"]} tickFormatter={compactSom} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }}
                  label={{ value: "Выручка, сом", position: "insideBottomRight", offset: -4, fill: CHART.axis, fontSize: 11 }} />
                <YAxis tickFormatter={compactSom} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={64} />
                <Tooltip contentStyle={CHART.tooltip} labelStyle={{ color: CHART.ink, fontWeight: 600 }} itemStyle={{ color: CHART.ink }}
                  formatter={(v: number) => [`${formatNumber(v)} сом`, "Прибыль"]} labelFormatter={(v) => `Выручка: ${formatNumber(Number(v))} сом`} />
                <ReferenceLine y={0} stroke={CHART.neg} strokeDasharray="4 4" />
                {be > 0 && <ReferenceLine x={be} stroke={CHART.pos} strokeDasharray="3 3"
                  label={{ value: `Безубыточность ${compactSom(be)}`, position: "top", fill: CHART.pos, fontSize: 11 }} />}
                <ReferenceLine x={fr.revenue} stroke={CHART.s1} strokeDasharray="3 3"
                  label={{ value: `Факт ${compactSom(fr.revenue)}`, position: "insideTopLeft", fill: CHART.s1, fontSize: 11 }} />
                <Line type="monotone" dataKey="profit" stroke={CHART.s1} strokeWidth={2.5} dot={false} isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        )}
      </section>

      <section className={card}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Прогноз и сценарии<Info k="exec:scenario" /></h2>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <ScenarioCard label="Пессимистичный" growth={scenarios.pessimistic} onChange={(v) => setScenarios({ ...scenarios, pessimistic: v })} fr={fr} />
          <ScenarioCard label="Базовый" growth={scenarios.base} onChange={(v) => setScenarios({ ...scenarios, base: v })} fr={fr} />
          <ScenarioCard label="Оптимистичный" growth={scenarios.optimistic} onChange={(v) => setScenarios({ ...scenarios, optimistic: v })} fr={fr} />
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Рекомендации<Info k="exec:recs" /></h2>
        <div className="space-y-1.5 text-sm">
          {recs.map((r, i) => (
            <p key={i}><b className="text-fl-gold">{r.priority}</b> · <b className="text-fl-cream">{r.title}</b> — <span className="text-fl-cream/70">{r.detail}</span></p>
          ))}
        </div>
      </section>

      <section className={card}>
        <h2 className="mb-1 font-display text-base font-semibold text-fl-cream">Водопад: от выручки к чистой прибыли<Info k="exec:waterfall" /></h2>
        <p className="mb-2 text-xs text-fl-cream/55">Синие столбцы — итоги, красные уменьшают результат, зелёные увеличивают. Подписи — суммы, сом.</p>
        <Waterfall bars={bars} />
      </section>

      <section className={`${card} text-sm leading-relaxed`}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Пояснительная записка (МСФО IAS 1, п. 112)<Info k="exec:notes" /></h2>
        <div className="space-y-3 text-fl-cream/80">
          <p><b className="text-fl-cream">1. Основы подготовки.</b> Отчётность за <b>{pl.toLowerCase()}</b> подготовлена по методу начисления (IAS 1, п. 27) на данных журнала проводок. Применимый стандарт: <b>{accountingStandard(fr.totalRevenue)}</b>.</p>
          <p><b className="text-fl-cream">2. Учётная политика.</b> Выручка признаётся по мере выполнения обязательств перед покупателем (IFRS 15). Запасы оцениваются по средней себестоимости, амортизация начисляется линейным способом.</p>
          <p><b className="text-fl-cream">3. Налоговый режим и ставки.</b> Режим: <b>{fr.regimeName}</b>. Страховые взносы работодателя: <b>{socialPct}</b> от фонда оплаты труда = <b>{formatNumber(fr.social)}</b> сом. Налоги из средств компании: <b>{formatNumber(fr.totalDirect)}</b> сом ({formatPercent(tb)} выручки).{fr.vat > 0 && <> НДС <b>{formatNumber(fr.vat)}</b> сом — косвенный налог (ст. 254 НК КР), прибыль не уменьшает.</>}</p>
          <p><b className="text-fl-cream">4. Ключевые оценки.</b> Точка безубыточности — <b>{formatNumber(be)}</b> сом, запас финансовой прочности — <b>{formatPercent(sm)}</b>, валовая маржа — <b>{formatPercent(gm)}</b>.</p>
          <p><b className="text-fl-cream">5. Непрерывность деятельности (IAS 1, п. 25).</b> {continuityNote(fr.netProfit)}</p>
          <p><b className="text-fl-cream">6. Связанные стороны (IAS 24).</b> Существенных операций со связанными сторонами в периоде не выявлено.</p>
        </div>
      </section>
    </>
  );
}

function ScenarioCard({ label, growth, onChange, fr }: { label: string; growth: number; onChange: (v: number) => void; fr: CalculateResult }) {
  const fct = doForecast(fr, growth);
  return (
    <div className="rounded-lg border border-fl-line bg-fl-charcoal p-3">
      <div className="mb-2 flex items-center justify-between text-sm">
        <span className="text-fl-cream/75">{label}</span>
        <span className="num font-semibold text-fl-gold">выручка {growth >= 0 ? "+" : ""}{growth}%</span>
      </div>
      <input type="range" min={-30} max={30} value={growth} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[rgb(var(--c-accent))]" aria-label={`${label}: изменение выручки`} />
      <div className="num mt-2 text-base font-semibold text-fl-cream">{formatNumber(fct.net)} сом</div>
      <div className="text-xs text-fl-cream/55">чистая прибыль · рентабельность {formatPercent(fct.pct)}</div>
    </div>
  );
}

function Kpi({ label, value, info, accent }: { label: string; value: string; info?: string; accent?: boolean }) {
  return (
    <div className="rounded-lg border border-fl-line bg-fl-charcoal-2 p-3 shadow-card">
      <div className="text-xs text-fl-cream/55">{label}{info && <Info k={info} label={label} />}</div>
      <div className={`num mt-1 text-lg font-semibold ${accent ? "text-fl-gold" : "text-fl-cream"}`}>{value}</div>
      <div className="text-[11px] text-fl-cream/45">сом</div>
    </div>
  );
}

function Metric({ label, value, info }: { label: string; value: string; info?: string }) {
  return (
    <div className="rounded-md border border-fl-line bg-fl-charcoal p-2">
      <div className="text-[11px] text-fl-cream/55">{label}{info && <Info k={info} label={label} />}</div>
      <div className="num text-sm font-semibold text-fl-cream">{value}</div>
    </div>
  );
}
