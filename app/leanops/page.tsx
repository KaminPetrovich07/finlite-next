"use client";

import { useState } from "react";
import {
  BarChart, Bar, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from "recharts";
import { useReportPicker, ReportPickerBar } from "@/components/ReportPicker";
import {
  computeStockLoss, type StockLossInputs, type StockLossResult,
  MUDA_CATEGORIES, defaultMudaScores, computeMudaIndex, top3Priorities, type MudaScores, type MudaResult,
  SALES_CHANNELS, computeUnitEconomics, channelComparison, unitEconomicsWaterfallSteps,
  type UnitEconomicsInputs, type UnitEconomicsResult, type SalesChannel,
} from "@/lib/leanops";
import { formatNumber, formatPercent } from "@/lib/format";

const TABS = ["📦 Учёт остатков", "🔍 Аудит потерь (Муда)", "💹 Юнит-экономика", "📊 Lean-дашборд"] as const;
const COLORS = { green: "#4F7942", red: "#B23B3B", gold: "#C9A227" };

const emptyStock: StockLossInputs = {
  rawIn: 0, rawPrice: 0, rawUsed: 0, wipQty: 0, wasteQty: 0, defectQty: 0,
  prodOut: 0, prodPrice: 0, prodSold: 0, prodStock: 0, wastePrice: 0, defectPrice: 0,
};
const emptyUe: UnitEconomicsInputs = {
  raw: 0, labor: 0, overhead: 0, wasteLoss: 0, price: 0,
  channel: "Прямые продажи", delivery: 0, pack: 0, qty: 100,
};

export default function LeanOpsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [stockResult, setStockResult] = useState<StockLossResult | null>(null);
  const [mudaScores, setMudaScores] = useState<MudaScores>(defaultMudaScores());
  const [mudaResult, setMudaResult] = useState<MudaResult | null>(null);
  const [ueInputs, setUeInputs] = useState<UnitEconomicsInputs>(emptyUe);
  const [ueResult, setUeResult] = useState<UnitEconomicsResult | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          🏭 LeanOps — Бережливое производство
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">KT Lean Platform · учёт остатков, аудит муда, юнит-экономика</p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${
              tab === t ? "bg-fl-gold text-fl-charcoal" : "border border-fl-gold/20 text-fl-cream/70 hover:border-fl-gold/40"
            }`}>
            {t}
          </button>
        ))}
      </nav>

      {tab === TABS[0] && <StockLossTab result={stockResult} onCalc={(i) => setStockResult(computeStockLoss(i))} />}
      {tab === TABS[1] && <MudaTab scores={mudaScores} setScores={setMudaScores} result={mudaResult}
        onCalc={() => setMudaResult(computeMudaIndex(mudaScores))} />}
      {tab === TABS[2] && <UnitEconomicsTab inputs={ueInputs} setInputs={setUeInputs} result={ueResult}
        onCalc={() => setUeResult(computeUnitEconomics(ueInputs))} />}
      {tab === TABS[3] && <DashboardTab stockResult={stockResult} mudaResult={mudaResult} ueResult={ueResult} />}
    </main>
  );
}

// ── 1. Учёт остатков ─────────────────────────────────────────────────────

function StockLossTab({ result, onCalc }: { result: StockLossResult | null; onCalc: (i: StockLossInputs) => void }) {
  const [i, setI] = useState<StockLossInputs>(emptyStock);
  const set = (k: keyof StockLossInputs) => (e: React.ChangeEvent<HTMLInputElement>) => setI((s) => ({ ...s, [k]: Number(e.target.value) }));

  return (
    <section className="space-y-6">
      <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">I. Сырьё и материалы</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumField label="Поступило сырья (ед.)" value={i.rawIn} onChange={set("rawIn")} />
          <NumField label="Цена сырья (сом/ед.)" value={i.rawPrice} onChange={set("rawPrice")} />
          <NumField label="Использовано в пр-ве" value={i.rawUsed} onChange={set("rawUsed")} />
          <NumField label="WIP (незаверш. пр-во)" value={i.wipQty} onChange={set("wipQty")} />
          <NumField label="Отходы/обрезки" value={i.wasteQty} onChange={set("wasteQty")} />
          <NumField label="Брак" value={i.defectQty} onChange={set("defectQty")} />
        </div>
      </div>

      <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">II. Готовая продукция</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <NumField label="Выпущено (шт)" value={i.prodOut} onChange={set("prodOut")} />
          <NumField label="Цена реализации (сом/шт)" value={i.prodPrice} onChange={set("prodPrice")} />
          <NumField label="Продано (шт)" value={i.prodSold} onChange={set("prodSold")} />
          <NumField label="Остаток склад (шт)" value={i.prodStock} onChange={set("prodStock")} />
          <NumField label="Цена отходов (сом/ед.)" value={i.wastePrice} onChange={set("wastePrice")} />
          <NumField label="Цена брака (сом/шт)" value={i.defectPrice} onChange={set("defectPrice")} />
        </div>
      </div>

      <button onClick={() => onCalc(i)} className="w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright sm:w-auto sm:px-8">
        🧮 Рассчитать остатки и потери
      </button>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Остаток сырья" value={`${result.rawRemain.toLocaleString("ru-RU")} ед.`} />
            <Kpi label="Стоимость отходов" value={formatNumber(result.wasteValue)} />
            <Kpi label="Стоимость брака" value={formatNumber(result.defectValue)} />
            <Kpi label="Потери от выпуска" value={formatPercent(result.lossPct)} gold />
          </div>

          <div className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">📋 Сводная таблица</h3>
            <table className="w-full text-sm">
              <tbody>
                {[
                  ["Стоимость всего сырья", result.rawCostTotal, false],
                  ["Стоимость WIP", result.wipValue, false],
                  ["Стоимость готовой продукции", result.prodValue, false],
                  ["Выручка от реализации", result.soldRevenue, false],
                  ["Стоимость остатка на складе", result.stockValue, false],
                  ["Стоимость отходов (к продаже)", result.wasteValue, false],
                  ["Стоимость брака", result.defectValue, false],
                  ["ИТОГО ПОТЕРИ", result.lossTotal, true],
                ].map(([label, val, isTotal]) => (
                  <tr key={label as string} className={`border-t border-fl-gold/10 ${isTotal ? "font-semibold" : ""}`}>
                    <td className="py-1.5 text-fl-cream/80">{label as string}</td>
                    <td className={`py-1.5 text-right font-mono tabular-nums ${isTotal ? "text-fl-red" : "text-fl-cream"}`}>{formatNumber(val as number)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {result.wasteQty > 0 && (
            <Alert kind="warn">💡 <b>Монетизация отходов:</b> {formatNumber(result.wasteValue)} сом. Передайте переработчикам (матрасы, подушки, топливо).</Alert>
          )}
          {result.lossPct > 15 && (
            <Alert kind="err">🔴 Высокие потери {formatPercent(result.lossPct)} — рекомендуется Lean-аудит.</Alert>
          )}
        </>
      )}
    </section>
  );
}

// ── 2. Аудит потерь (Муда) ───────────────────────────────────────────────

function MudaTab({ scores, setScores, result, onCalc }: {
  scores: MudaScores; setScores: (s: MudaScores) => void; result: MudaResult | null; onCalc: () => void;
}) {
  const radarData = MUDA_CATEGORIES.map((c) => ({ subject: c.name.split(" ").slice(1).join(" "), score: scores[c.key] }));

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        {MUDA_CATEGORIES.map((c) => (
          <details key={c.key} className="rounded-lg border border-fl-gold/20 bg-fl-charcoal-2 p-4">
            <summary className="cursor-pointer font-medium text-fl-cream">{c.name}</summary>
            <p className="mt-2 text-sm text-fl-cream/60">{c.desc}</p>
            <label className="mt-3 block">
              <span className="text-xs text-fl-cream/50">Уровень потерь (0=нет, 10=критично): <b className="text-fl-gold-bright">{scores[c.key]}</b></span>
              <input type="range" min={0} max={10} value={scores[c.key]}
                onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })}
                className="mt-1 w-full accent-fl-gold" />
            </label>
          </details>
        ))}
      </div>

      <button onClick={onCalc} className="w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright sm:w-auto sm:px-8">
        📊 Рассчитать Lean-индекс
      </button>

      {result && (
        <>
          <div className="grid grid-cols-3 gap-4">
            <Kpi label="Lean-индекс" value={`${result.leanIdx.toFixed(0)}/100`} gold />
            <Kpi label="Средний балл" value={`${result.avg.toFixed(1)}/10`} />
            <Kpi label="Уровень Lean" value={`${result.maturity.level} ${result.maturity.name}`} />
          </div>
          <Alert kind="info">{result.maturity.level} <b>{result.maturity.name}:</b> {result.maturity.desc}</Alert>

          <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">📊 Муда-радар</h3>
            <ResponsiveContainer width="100%" height={320}>
              <RadarChart data={radarData}>
                <PolarGrid stroke="#C9A22730" />
                <PolarAngleAxis dataKey="subject" stroke="#F2EDE480" fontSize={10} />
                <PolarRadiusAxis domain={[0, 10]} stroke="#F2EDE440" fontSize={9} />
                <Radar dataKey="score" stroke="#C9A227" fill="#C9A227" fillOpacity={0.25} />
              </RadarChart>
            </ResponsiveContainer>
          </div>

          <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">🎯 Топ-3 приоритета</h3>
            <div className="space-y-2">
              {top3Priorities(scores).map((p, i) => (
                <Alert key={p.key} kind="warn"><b>#{i + 1} {p.name}</b> (балл: {p.score}/10) → {p.rec}</Alert>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ── 3. Юнит-экономика ────────────────────────────────────────────────────

function UnitEconomicsTab({ inputs, setInputs, result, onCalc }: {
  inputs: UnitEconomicsInputs; setInputs: (i: UnitEconomicsInputs) => void; result: UnitEconomicsResult | null; onCalc: () => void;
}) {
  const set = (k: keyof UnitEconomicsInputs) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setInputs({ ...inputs, [k]: Number(e.target.value) });
  const bars = result ? waterfallBars(unitEconomicsWaterfallSteps(inputs, result)) : [];
  const cmp = result ? channelComparison(inputs.price, result.cogsUnit, inputs.delivery, inputs.pack) : [];

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-1 gap-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:grid-cols-2 sm:p-5">
        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Затраты на единицу</h2>
          <div className="space-y-3">
            <NumField label="Сырьё и материалы (сом/ед.)" value={inputs.raw} onChange={set("raw")} />
            <NumField label="Труд (сом/ед.)" value={inputs.labor} onChange={set("labor")} />
            <NumField label="Накладные расходы (сом/ед.)" value={inputs.overhead} onChange={set("overhead")} />
            <NumField label="Потери на брак/отходы (сом/ед.)" value={inputs.wasteLoss} onChange={set("wasteLoss")} />
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Продажи</h2>
          <div className="space-y-3">
            <NumField label="Цена продажи (сом/ед.)" value={inputs.price} onChange={set("price")} />
            <label className="block">
              <span className="text-sm text-fl-cream/70">Канал продаж</span>
              <select value={inputs.channel} onChange={(e) => setInputs({ ...inputs, channel: e.target.value as SalesChannel })}
                className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
                {Object.keys(SALES_CHANNELS).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </label>
            <NumField label="Доставка (сом/ед.)" value={inputs.delivery} onChange={set("delivery")} />
            <NumField label="Упаковка (сом/ед.)" value={inputs.pack} onChange={set("pack")} />
            <NumField label="Объём продаж (шт/мес)" value={inputs.qty} onChange={set("qty")} />
          </div>
        </div>
      </div>

      <button onClick={onCalc} className="w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright sm:w-auto sm:px-8">
        💹 Рассчитать юнит-экономику
      </button>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Себестоимость ед." value={formatNumber(result.cogsUnit)} />
            <Kpi label="Маржа на ед." value={formatNumber(result.marginUnit)} sub={formatPercent(result.marginPct)} gold />
            <Kpi label="Выручка/мес." value={formatNumber(result.revenueMonth)} />
            <Kpi label="Прибыль/мес." value={formatNumber(result.profitMonth)} />
          </div>

          {result.marginPct < 20 && <Alert kind="warn">⚠️ Маржа {formatPercent(result.marginPct)} — ниже 20%. Снизьте с/с через Lean или пересмотрите цену.</Alert>}
          {result.marginPct > 40 && <Alert kind="ok">✅ Маржа {formatPercent(result.marginPct)} — отлично. Масштабируйте.</Alert>}

          <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">📈 Водопад юнит-экономики</h3>
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={bars} margin={{ top: 20 }}>
                <CartesianGrid stroke="#C9A22720" vertical={false} />
                <XAxis dataKey="label" stroke="#F2EDE480" fontSize={10} interval={0} angle={-15} textAnchor="end" height={55} />
                <YAxis tickFormatter={(v) => formatNumber(v)} stroke="#F2EDE480" fontSize={11} width={60} />
                <Tooltip formatter={(_: number, _n: string, p: any) => formatNumber(p.payload.value)} contentStyle={{ background: "#14110D", border: "1px solid #C9A22740" }} />
                <Bar dataKey="base" stackId="wf" fill="transparent" />
                <Bar dataKey="bar" stackId="wf">
                  {bars.map((b, i) => <Cell key={i} fill={COLORS[b.color]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">📊 Сравнение каналов продаж</h3>
            <table className="w-full text-left text-sm">
              <thead><tr className="text-fl-cream/50"><th className="py-1.5 pr-3">Канал</th><th className="py-1.5 pr-3 text-right">Комиссия</th><th className="py-1.5 pr-3 text-right">Маржа</th><th className="py-1.5 text-right">Маржа %</th></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.channel} className="border-t border-fl-gold/10">
                    <td className="py-1.5 pr-3 text-fl-cream/80">{c.channel}</td>
                    <td className="py-1.5 pr-3 text-right font-mono tabular-nums">{formatNumber(c.commission)}</td>
                    <td className={`py-1.5 pr-3 text-right font-mono tabular-nums ${c.margin > 0 ? "text-fl-green" : "text-fl-red"}`}>{formatNumber(c.margin)}</td>
                    <td className="py-1.5 text-right font-mono tabular-nums text-fl-cream/70">{formatPercent(c.marginPct)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </section>
  );
}

// ── 4. Lean-дашборд ──────────────────────────────────────────────────────

const ROADMAP: Array<[string, string, string]> = [
  ["Месяц 1", "Диагностика (VSM)", "Картирование потока. Топ-3 потерь."],
  ["Месяц 1", "5S", "Сортировка, порядок, чистота, стандартизация, дисциплина."],
  ["Месяц 2", "Нормирование", "Нормы расхода сырья, допустимый % брака."],
  ["Месяц 2", "Kanban", "Pull-система — производить только по заказу."],
  ["Месяц 3", "Kaizen", "Ежедневные 15-мин. совещания по улучшению."],
  ["Месяц 3", "Мониторинг", "Ежемесячный Lean-аудит через LeanOps + FinLite KG."],
];

function DashboardTab({ stockResult, mudaResult, ueResult }: {
  stockResult: StockLossResult | null; mudaResult: MudaResult | null; ueResult: UnitEconomicsResult | null;
}) {
  const picker = useReportPicker();
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  if (!stockResult && !mudaResult && !ueResult) {
    return <Alert kind="info">👈 Заполните данные на вкладках «Учёт остатков», «Аудит потерь» и «Юнит-экономика»</Alert>;
  }

  async function saveToReport() {
    if (!picker.reportId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/reports/${picker.reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ leanResults: { stock: stockResult, muda: mudaResult, unitEconomics: ueResult } }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setSaveMsg("✅ Результаты LeanOps сохранены в отчёт");
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="space-y-6">
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {stockResult && <Kpi label="Потери пр-ва" value={formatPercent(stockResult.lossPct)} />}
        {stockResult && <Kpi label="Стоимость отходов" value={formatNumber(stockResult.wasteValue)} />}
        {mudaResult && <Kpi label="Lean-индекс" value={`${mudaResult.leanIdx.toFixed(0)}/100`} />}
        {ueResult && <Kpi label="Маржа/ед." value={formatPercent(ueResult.marginPct)} />}
      </div>

      <div className="space-y-1.5 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 text-sm sm:p-5">
        <p className="font-display text-base font-semibold text-fl-gold-bright">🏭 LEANOPS EXECUTIVE SUMMARY</p>
        {stockResult && <p>📦 <b>Потери:</b> {formatNumber(stockResult.lossTotal)} сом ({formatPercent(stockResult.lossPct)})</p>}
        {stockResult && <p>♻️ <b>Монетизация отходов:</b> {formatNumber(stockResult.wasteValue)} сом → продайте переработчикам</p>}
        {mudaResult && <p>📊 <b>Lean-индекс:</b> {mudaResult.leanIdx.toFixed(0)} /100</p>}
        {ueResult && <p>💹 <b>Юнит-маржа:</b> {formatNumber(ueResult.marginUnit)} сом/ед. ({formatPercent(ueResult.marginPct)})</p>}
        {ueResult && <p>💰 <b>Прибыль/мес:</b> {formatNumber(ueResult.profitMonth)} сом</p>}
      </div>

      <div className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h3 className="mb-3 font-display text-base font-semibold text-fl-cream">🔗 Интеграция LeanOps ↔ FinLite KG</h3>
        <p className="mb-3 text-sm text-fl-cream/60">Выберите отчёт, чтобы сохранить результаты LeanOps вместе с ним.</p>
        <ReportPickerBar {...picker} />
        {picker.reportId && (
          <>
            <button onClick={saveToReport} disabled={saving}
              className="rounded-md bg-fl-gold px-5 py-2.5 font-medium text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50">
              {saving ? "Сохранение…" : "💾 Сохранить результаты в отчёт"}
            </button>
            {saveMsg && <p className="mt-2 text-sm text-fl-cream/80">{saveMsg}</p>}
            {stockResult && (
              <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                <Alert kind="info">📦 <b>Потери LeanOps:</b> {formatNumber(stockResult.lossTotal)} сом → включены в себестоимость (стр.020)</Alert>
                {stockResult.wasteValue > 0 && <Alert kind="info">♻️ <b>Продажа отходов:</b> {formatNumber(stockResult.wasteValue)} сом → прочие доходы (стр.040)</Alert>}
              </div>
            )}
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h3 className="mb-3 font-display text-base font-semibold text-fl-cream">🗺️ Roadmap Lean (план на 3 месяца)</h3>
        <table className="w-full text-left text-sm">
          <thead><tr className="text-fl-cream/50"><th className="py-1.5 pr-3">Период</th><th className="py-1.5 pr-3">Инструмент</th><th className="py-1.5">Действие</th></tr></thead>
          <tbody>
            {ROADMAP.map(([period, tool, action], i) => (
              <tr key={i} className="border-t border-fl-gold/10">
                <td className="py-2 pr-3 font-semibold text-fl-gold-bright">{period}</td>
                <td className="py-2 pr-3 font-semibold text-fl-cream">{tool}</td>
                <td className="py-2 text-fl-cream/60">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── shared bits ───────────────────────────────────────────────────────────

function waterfallBars(steps: Array<{ label: string; value: number; isTotal: boolean }>) {
  const bars: Array<{ label: string; base: number; bar: number; value: number; color: "green" | "red" | "gold" }> = [];
  let cumulative = 0;
  steps.forEach((step, i) => {
    const isFirst = i === 0;
    const isLast = i === steps.length - 1;
    if (step.isTotal && (isFirst || isLast)) {
      bars.push({ label: step.label, base: 0, bar: step.value, value: step.value, color: "gold" });
      if (isFirst) cumulative = step.value;
    } else {
      const next = cumulative + step.value;
      if (step.value < 0) bars.push({ label: step.label, base: next, bar: -step.value, value: step.value, color: "red" });
      else bars.push({ label: step.label, base: cumulative, bar: step.value, value: step.value, color: "green" });
      cumulative = next;
    }
  });
  return bars;
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (e: React.ChangeEvent<HTMLInputElement>) => void }) {
  return (
    <label className="block">
      <span className="text-xs text-fl-cream/60">{label}</span>
      <input type="number" value={value} onChange={onChange}
        className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2 text-sm text-fl-cream tabular-nums" />
    </label>
  );
}

function Kpi({ label, value, sub, gold }: { label: string; value: string; sub?: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-fl-gold/10 bg-fl-charcoal-2 p-3">
      <div className="text-xs text-fl-cream/50">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${gold ? "text-fl-gold-bright" : "text-fl-cream"}`}>{value}</div>
      {sub && <div className="text-xs text-fl-cream/50">{sub}</div>}
    </div>
  );
}

function Alert({ kind, children }: { kind: "ok" | "warn" | "err" | "info"; children: React.ReactNode }) {
  const styles = {
    ok: "border-fl-green/40 bg-fl-green/10",
    warn: "border-fl-gold/40 bg-fl-gold/10",
    err: "border-fl-red/40 bg-fl-red/10",
    info: "border-fl-gold/20 bg-fl-charcoal-2",
  };
  return <div className={`rounded-lg border p-3 text-sm text-fl-cream ${styles[kind]}`}>{children}</div>;
}
