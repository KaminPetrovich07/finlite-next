"use client";

import { useCallback, useState } from "react";
import { PolarAngleAxis, PolarGrid, PolarRadiusAxis, Radar, RadarChart, ResponsiveContainer, Tooltip } from "recharts";
import { Info } from "@/components/Info";
import { Waterfall } from "@/components/charts/Waterfall";
import { LedgerSource, type LedgerLoad } from "@/components/ledger/LedgerSource";
import { getAccount } from "@/lib/ledger/accounts";
import { waterfallChartData } from "@/lib/executive";
import { CHART } from "@/lib/chart-theme";
import type { Term } from "@/lib/glossary";
import {
  computeStockLoss, type StockLossInputs, type StockLossResult,
  MUDA_CATEGORIES, defaultMudaScores, computeMudaIndex, top3Priorities, type MudaScores, type MudaResult,
  SALES_CHANNELS, computeUnitEconomics, channelComparison, unitEconomicsWaterfallSteps,
  type UnitEconomicsInputs, type UnitEconomicsResult, type SalesChannel,
} from "@/lib/leanops";
import { formatNumber, formatPercent } from "@/lib/format";

const TABS = ["Остатки и потери", "Аудит потерь (муда)", "Юнит-экономика", "Сводка и план"] as const;
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";

const emptyStock: StockLossInputs = {
  rawIn: 0, rawPrice: 0, rawUsed: 0, wipQty: 0, wasteQty: 0, defectQty: 0,
  prodOut: 0, prodPrice: 0, prodSold: 0, prodStock: 0, wastePrice: 0, defectPrice: 0,
};
const emptyUe: UnitEconomicsInputs = {
  raw: 0, labor: 0, overhead: 0, wasteLoss: 0, price: 0,
  channel: "Прямые продажи", delivery: 0, pack: 0, qty: 100,
};

/** Short explanations for every input — shown by the «i» button. */
const F: Record<string, Term> = {
  rawIn: { what: "Сколько сырья и материалов поступило за период, в единицах (м², кг, листы, шт.)." },
  rawPrice: { what: "Средняя закупочная цена единицы сырья, сом." },
  rawUsed: { what: "Сколько сырья отпущено в производство за период." },
  wipQty: { what: "Незавершённое производство: сколько сырья находится в изделиях, которые ещё не доделаны.", read: "Большой объём — признак узкого места или перепроизводства." },
  wasteQty: { what: "Отходы и обрезки — часть сырья, не вошедшая в изделия. Часть можно продать переработчикам." },
  defectQty: { what: "Бракованные изделия, которые нельзя продать по полной цене." },
  prodOut: { what: "Сколько готовых изделий выпущено за период." },
  prodPrice: { what: "Цена продажи одного изделия, сом." },
  prodSold: { what: "Сколько изделий продано за период." },
  prodStock: { what: "Остаток готовой продукции на складе на конец периода." },
  wastePrice: { what: "По какой цене можно продать единицу отходов переработчикам. 0 — если отходы только вывозятся." },
  defectPrice: { what: "Себестоимость или потерянная стоимость одного бракованного изделия, сом." },
  raw: { what: "Стоимость сырья и материалов в одном изделии, сом.", how: "Из журнала: материальные затраты в себестоимости / количество изделий." },
  labor: { what: "Зарплата производственных рабочих с взносами на одно изделие, сом.", how: "Из журнала: счета 7120 и 7130 / количество изделий." },
  overhead: { what: "Накладные производственные расходы на одно изделие: электроэнергия цеха, амортизация оборудования, ремонт.", how: "Из журнала: прочие счета себестоимости / количество изделий." },
  wasteLoss: { what: "Потери на брак и отходы в расчёте на одно изделие, сом. Можно взять из вкладки «Остатки и потери»." },
  price: { what: "Цена продажи одного изделия без НДС, сом.", how: "Из журнала: выручка / количество проданных изделий." },
  channel: { what: "Через какой канал продаётся изделие. От канала зависит комиссия (маркетплейсы берут процент с продажи)." },
  delivery: { what: "Доставка одного изделия до покупателя, сом.", how: "Из журнала: счёт 7540 / количество изделий." },
  pack: { what: "Упаковка одного изделия, сом." },
  qty: { what: "Сколько изделий продаётся за период (месяц) — для расчёта выручки и прибыли за период." },
};

export default function LeanOpsPage() {
  const [tab, setTab] = useState<(typeof TABS)[number]>(TABS[0]);
  const [stockResult, setStockResult] = useState<StockLossResult | null>(null);
  const [mudaScores, setMudaScores] = useState<MudaScores>(defaultMudaScores());
  const [mudaResult, setMudaResult] = useState<MudaResult | null>(null);
  const [ueInputs, setUeInputs] = useState<UnitEconomicsInputs>(emptyUe);
  const [ueResult, setUeResult] = useState<UnitEconomicsResult | null>(null);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Бережливое производство</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Инструменты бережливого производства (lean): учёт остатков и потерь сырья, аудит семи видов потерь (муда),
          юнит-экономика изделия с данными из журнала проводок и план внедрения улучшений.<Info k="lean:muda" label="Муда" />
        </p>
      </header>

      <nav className="mb-6 flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button key={t} role="tab" aria-selected={tab === t} onClick={() => setTab(t)}
            className={`rounded-md px-3 py-2 text-sm font-medium ${tab === t ? "bg-fl-accent text-fl-on-accent" : "border border-fl-line text-fl-cream/75 hover:border-fl-gold/40"}`}>
            {t}
          </button>
        ))}
      </nav>

      {tab === TABS[0] && <StockLossTab result={stockResult} onCalc={(i) => setStockResult(computeStockLoss(i))} />}
      {tab === TABS[1] && <MudaTab scores={mudaScores} setScores={setMudaScores} result={mudaResult}
        onCalc={() => setMudaResult(computeMudaIndex(mudaScores))} />}
      {tab === TABS[2] && <UnitEconomicsTab inputs={ueInputs} setInputs={setUeInputs} result={ueResult}
        onCalc={(i) => setUeResult(computeUnitEconomics(i ?? ueInputs))} stockResult={stockResult} />}
      {tab === TABS[3] && <DashboardTab stockResult={stockResult} mudaResult={mudaResult} ueResult={ueResult} />}
    </main>
  );
}

// ── 1. Остатки и потери ─────────────────────────────────────────────────

function StockLossTab({ result, onCalc }: { result: StockLossResult | null; onCalc: (i: StockLossInputs) => void }) {
  const [i, setI] = useState<StockLossInputs>(emptyStock);
  const set = (k: keyof StockLossInputs) => (v: number) => setI((s) => ({ ...s, [k]: v }));

  return (
    <section className="space-y-6">
      <div className={card}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">1. Сырьё и материалы</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumField k="rawIn" label="Поступило сырья, ед." value={i.rawIn} onChange={set("rawIn")} />
          <NumField k="rawPrice" label="Цена сырья, сом за ед." value={i.rawPrice} onChange={set("rawPrice")} />
          <NumField k="rawUsed" label="Отпущено в производство, ед." value={i.rawUsed} onChange={set("rawUsed")} />
          <NumField k="wipQty" label="Незавершённое производство, ед." value={i.wipQty} onChange={set("wipQty")} />
          <NumField k="wasteQty" label="Отходы и обрезки, ед." value={i.wasteQty} onChange={set("wasteQty")} />
          <NumField k="defectQty" label="Брак, шт." value={i.defectQty} onChange={set("defectQty")} />
        </div>
      </div>

      <div className={card}>
        <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">2. Готовая продукция</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <NumField k="prodOut" label="Выпущено, шт." value={i.prodOut} onChange={set("prodOut")} />
          <NumField k="prodPrice" label="Цена продажи, сом за шт." value={i.prodPrice} onChange={set("prodPrice")} />
          <NumField k="prodSold" label="Продано, шт." value={i.prodSold} onChange={set("prodSold")} />
          <NumField k="prodStock" label="Остаток на складе, шт." value={i.prodStock} onChange={set("prodStock")} />
          <NumField k="wastePrice" label="Цена отходов, сом за ед." value={i.wastePrice} onChange={set("wastePrice")} />
          <NumField k="defectPrice" label="Стоимость брака, сом за шт." value={i.defectPrice} onChange={set("defectPrice")} />
        </div>
      </div>

      <button onClick={() => onCalc(i)} className="w-full rounded-md bg-fl-accent py-3 font-display text-base font-semibold text-fl-on-accent hover:bg-fl-accent-hover sm:w-auto sm:px-8">
        Рассчитать остатки и потери
      </button>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Остаток сырья" value={`${result.rawRemain.toLocaleString("ru-RU")} ед.`} t={{ what: "Сколько сырья осталось на складе.", how: "Поступило − отпущено в производство." }} />
            <Kpi label="Стоимость отходов" value={`${formatNumber(result.wasteValue)} сом`} t={{ what: "Сколько можно выручить, продав отходы переработчикам.", how: "Отходы × цена отходов." }} />
            <Kpi label="Стоимость брака" value={`${formatNumber(result.defectValue)} сом`} t={{ what: "Стоимость бракованных изделий.", how: "Брак × стоимость брака." }} />
            <Kpi label="Потери от выпуска" value={formatPercent(result.lossPct)} accent t={{ what: "Доля потерь (отходы и брак) в стоимости выпущенной продукции.", read: "Больше 15% — высокий уровень, нужен аудит потерь." }} />
          </div>

          <div className={`overflow-x-auto ${card}`}>
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">Сводная таблица</h3>
            <table className="w-full text-sm">
              <tbody>
                {([
                  ["Стоимость всего сырья", result.rawCostTotal, "Поступило сырья × цена."],
                  ["Стоимость незавершённого производства", result.wipValue, "Незавершённое производство × цена сырья."],
                  ["Стоимость выпущенной продукции", result.prodValue, "Выпущено × цена продажи."],
                  ["Выручка от реализации", result.soldRevenue, "Продано × цена продажи."],
                  ["Стоимость остатка на складе", result.stockValue, "Остаток × цена продажи."],
                  ["Стоимость отходов (к продаже)", result.wasteValue, "Отходы × цена отходов."],
                  ["Стоимость брака", result.defectValue, "Брак × стоимость брака."],
                  ["Итого потери", result.lossTotal, "Потери сырья на отходы и брак."],
                ] as Array<[string, number, string]>).map(([label, val, how], idx, arr) => {
                  const total = idx === arr.length - 1;
                  return (
                    <tr key={label} className={`border-t border-fl-line ${total ? "font-semibold" : ""}`}>
                      <td className="py-1.5 text-fl-cream/85">{label}<Info t={{ what: how }} label={label} /></td>
                      <td className={`num py-1.5 text-right ${total ? "text-fl-red" : "text-fl-cream"}`}>{formatNumber(val)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fl-cream/55">
              В учёте: потери от брака входят в себестоимость (ОПиУ, строка «Себестоимость»), продажа отходов отражается в прочих доходах.
              Проведите их в «Журнале», чтобы они попали в отчётность.
            </p>
          </div>

          {result.wasteQty > 0 && (
            <Alert kind="warn"><b>Монетизация отходов:</b> {formatNumber(result.wasteValue)} сом. Отходы можно передать переработчикам (наполнитель для мебели, топливные брикеты).</Alert>
          )}
          {result.lossPct > 15 && <Alert kind="err">Высокие потери — {formatPercent(result.lossPct)}. Проведите аудит потерь на следующей вкладке.</Alert>}
        </>
      )}
    </section>
  );
}

// ── 2. Аудит потерь (муда) ──────────────────────────────────────────────

const MATURITY_STYLE = { high: "text-fl-green", mid: "text-fl-gold", low: "text-fl-amber", critical: "text-fl-red" } as const;

function MudaTab({ scores, setScores, result, onCalc }: {
  scores: MudaScores; setScores: (s: MudaScores) => void; result: MudaResult | null; onCalc: () => void;
}) {
  const radarData = MUDA_CATEGORIES.map((c) => ({ subject: c.name.replace(/^\d+\.\s*/, ""), score: scores[c.key] }));

  return (
    <section className="space-y-6">
      <p className="text-sm text-fl-cream/65">
        Оцените каждый из семи видов потерь от 0 (нет) до 10 (критично). Разверните пункт, чтобы прочитать, что под ним понимается.
      </p>
      <div className="space-y-3">
        {MUDA_CATEGORIES.map((c) => (
          <details key={c.key} className="rounded-lg border border-fl-line bg-fl-charcoal-2 p-4">
            <summary className="cursor-pointer font-medium text-fl-cream">{c.name} — <span className="num text-fl-gold">{scores[c.key]}</span> из 10</summary>
            <p className="mt-2 text-sm text-fl-cream/70">{c.desc}</p>
            <p className="mt-1 text-xs text-fl-cream/55">Что делать: {c.rec}</p>
            <input type="range" min={0} max={10} value={scores[c.key]} aria-label={c.name}
              onChange={(e) => setScores({ ...scores, [c.key]: Number(e.target.value) })}
              className="mt-3 w-full accent-[rgb(var(--c-accent))]" />
          </details>
        ))}
      </div>

      <button onClick={onCalc} className="w-full rounded-md bg-fl-accent py-3 font-display text-base font-semibold text-fl-on-accent hover:bg-fl-accent-hover sm:w-auto sm:px-8">
        Рассчитать индекс бережливости
      </button>

      {result && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Kpi label="Индекс бережливости" value={`${result.leanIdx.toFixed(0)} из 100`} accent
              t={{ what: "Насколько производство свободно от потерь.", how: "100 − средний балл потерь × 10.", read: "80+ — зрелое, 60–79 — развивающееся, 40–59 — начальный уровень, ниже 40 — критично." }} />
            <Kpi label="Средний балл потерь" value={`${result.avg.toFixed(1)} из 10`} t={{ what: "Среднее по семи видам потерь." }} />
            <Kpi label="Уровень" value={result.maturity.name} valueClass={MATURITY_STYLE[result.maturity.level]} t={{ what: "Уровень зрелости бережливого производства по индексу." }} />
          </div>
          <Alert kind="info"><b>{result.maturity.name}:</b> {result.maturity.desc}</Alert>

          <div className={card}>
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">Профиль потерь</h3>
            <p className="mb-2 text-xs text-fl-cream/55">Чем дальше точка от центра, тем больше потери. Цифры — баллы от 0 до 10.</p>
            <div className="h-80">
              <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={radarData} outerRadius="70%">
                  <PolarGrid stroke={CHART.grid} />
                  <PolarAngleAxis dataKey="subject" tick={{ fill: CHART.ink, fontSize: 11 }} />
                  <PolarRadiusAxis domain={[0, 10]} tickCount={6} tick={{ fill: CHART.axis, fontSize: 10 }} axisLine={false} />
                  <Tooltip contentStyle={CHART.tooltip} labelStyle={{ color: CHART.ink, fontWeight: 600 }} itemStyle={{ color: CHART.ink }}
                    formatter={(v: number) => [`${v} из 10`, "Балл потерь"]} />
                  <Radar dataKey="score" stroke={CHART.s2} fill={CHART.s2} fillOpacity={0.25} strokeWidth={2}
                    label={{ fill: CHART.ink, fontSize: 11, fontWeight: 600 }} isAnimationActive={false} />
                </RadarChart>
              </ResponsiveContainer>
            </div>
          </div>

          <div className={card}>
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">Три главных приоритета</h3>
            <div className="space-y-2">
              {top3Priorities(scores).map((p, i) => (
                <Alert key={p.key} kind="warn"><b>{i + 1}. {p.name.replace(/^\d+\.\s*/, "")}</b> — балл {p.score} из 10. {p.rec}.</Alert>
              ))}
            </div>
          </div>
        </>
      )}
    </section>
  );
}

// ── 3. Юнит-экономика ───────────────────────────────────────────────────

function UnitEconomicsTab({ inputs, setInputs, result, onCalc, stockResult }: {
  inputs: UnitEconomicsInputs; setInputs: (i: UnitEconomicsInputs) => void; result: UnitEconomicsResult | null;
  onCalc: (i?: UnitEconomicsInputs) => void; stockResult: StockLossResult | null;
}) {
  const set = (k: keyof UnitEconomicsInputs) => (v: number) => setInputs({ ...inputs, [k]: v });
  const bars = result ? waterfallChartData(unitEconomicsWaterfallSteps(inputs, result)) : [];
  const cmp = result ? channelComparison(inputs.price, result.cogsUnit, inputs.delivery, inputs.pack) : [];
  const [units, setUnits] = useState(0);
  const [load, setLoad] = useState<LedgerLoad | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const onLoad = useCallback((d: LedgerLoad) => setLoad(d), []);

  function fromLedger() {
    if (!load || units <= 0) { setNote("Загрузите данные журнала и укажите, сколько изделий продано за период."); return; }
    let raw = 0, labor = 0, overhead = 0;
    for (const [code, amount] of Object.entries(load.statements.incomeStatement.byAccount)) {
      const a = getAccount(code);
      if (a?.pl !== "cogs") continue;
      if (a.nature === "payroll" || a.nature === "social") labor += amount;
      else if (a.nature === "materials" || !a.nature) raw += amount;
      else overhead += amount;
    }
    const delivery = load.statements.incomeStatement.byAccount["7540"] ?? 0;
    const next: UnitEconomicsInputs = {
      ...inputs,
      raw: round(raw / units), labor: round(labor / units), overhead: round(overhead / units),
      delivery: round(delivery / units), price: round(load.bridge.input.revenue / units), qty: units,
    };
    setInputs(next);
    onCalc(next);
    setNote(`Затраты на единицу рассчитаны по проводкам: ${load.companyName}, ${load.periodLabel.toLowerCase()}, ${units} шт.`);
  }

  return (
    <section className="space-y-6">
      <div className="space-y-3">
        <LedgerSource auto onLoad={onLoad} title="Затраты на единицу из журнала"
          note="Выберите компанию и период, укажите количество проданных изделий — себестоимость, труд, накладные, доставка и цена посчитаются по проводкам." />
        <div className={`${card} flex flex-col gap-3 sm:flex-row sm:items-end`}>
          <div className="sm:w-72"><NumField k="qty" label="Продано изделий за период, шт." value={units} onChange={setUnits} /></div>
          <button onClick={fromLedger} disabled={!load}
            className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
            Рассчитать на единицу
          </button>
          {note && <p className="text-sm text-fl-cream/70 sm:ml-2">{note}</p>}
        </div>
      </div>

      <div className={`grid grid-cols-1 gap-6 sm:grid-cols-2 ${card}`}>
        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Затраты на единицу</h2>
          <div className="space-y-3">
            <NumField k="raw" label="Сырьё и материалы, сом" value={inputs.raw} onChange={set("raw")} />
            <NumField k="labor" label="Труд рабочих с взносами, сом" value={inputs.labor} onChange={set("labor")} />
            <NumField k="overhead" label="Накладные производственные, сом" value={inputs.overhead} onChange={set("overhead")} />
            <NumField k="wasteLoss" label="Потери на брак и отходы, сом" value={inputs.wasteLoss} onChange={set("wasteLoss")} />
          </div>
        </div>
        <div>
          <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Продажи</h2>
          <div className="space-y-3">
            <NumField k="price" label="Цена продажи, сом" value={inputs.price} onChange={set("price")} />
            <label className="block">
              <span className="text-xs text-fl-cream/70">Канал продаж<Info t={F.channel} label="Канал продаж" /></span>
              <select value={inputs.channel} onChange={(e) => setInputs({ ...inputs, channel: e.target.value as SalesChannel })}
                className="mt-1 w-full rounded-md border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream">
                {Object.keys(SALES_CHANNELS).map((ch) => <option key={ch} value={ch}>{ch}</option>)}
              </select>
            </label>
            <NumField k="delivery" label="Доставка, сом" value={inputs.delivery} onChange={set("delivery")} />
            <NumField k="pack" label="Упаковка, сом" value={inputs.pack} onChange={set("pack")} />
            <NumField k="qty" label="Продажи в месяц, шт." value={inputs.qty} onChange={set("qty")} />
          </div>
        </div>
      </div>

      <button onClick={() => onCalc()} className="w-full rounded-md bg-fl-accent py-3 font-display text-base font-semibold text-fl-on-accent hover:bg-fl-accent-hover sm:w-auto sm:px-8">
        Рассчитать юнит-экономику
      </button>

      {result && (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Себестоимость единицы" value={`${formatNumber(result.cogsUnit)} сом`} t={{ what: "Прямые затраты на одно изделие.", how: "Сырьё + труд + накладные + потери." }} />
            <Kpi label="Маржа с единицы" value={`${formatNumber(result.marginUnit)} сом`} sub={formatPercent(result.marginPct)} accent
              t={{ what: "Сколько остаётся с одного проданного изделия после всех прямых затрат и комиссии канала.", how: "Цена − себестоимость − комиссия − доставка − упаковка.", read: "Меньше 20% — мало, больше 40% — отлично." }} />
            <Kpi label="Выручка в месяц" value={`${formatNumber(result.revenueMonth)} сом`} t={{ what: "Цена × продажи в месяц." }} />
            <Kpi label="Маржинальная прибыль в месяц" value={`${formatNumber(result.profitMonth)} сом`} t={{ what: "Маржа с единицы × продажи в месяц. Постоянные расходы (аренда, офис) из неё ещё не вычтены." }} />
          </div>

          {result.marginPct < 20 && <Alert kind="warn">Маржа {formatPercent(result.marginPct)} — ниже 20%. Снизьте себестоимость (потери, закупки) или пересмотрите цену и канал продаж.</Alert>}
          {result.marginPct > 40 && <Alert kind="ok">Маржа {formatPercent(result.marginPct)} — высокая. Изделие можно масштабировать.</Alert>}

          <div className={card}>
            <h3 className="mb-1 font-display text-sm font-semibold text-fl-cream">Из чего складывается цена<Info k="lean:unit" /></h3>
            <p className="mb-2 text-xs text-fl-cream/55">От цены к марже с единицы, сом.</p>
            <Waterfall bars={bars} height={320} />
          </div>

          <div className={`overflow-x-auto ${card}`}>
            <h3 className="mb-2 font-display text-sm font-semibold text-fl-cream">Сравнение каналов продаж</h3>
            <table className="w-full min-w-[480px] text-left text-sm">
              <thead><tr className="text-xs text-fl-cream/55"><th className="py-1.5 pr-3 font-medium">Канал</th><th className="py-1.5 pr-3 text-right font-medium">Комиссия, сом</th><th className="py-1.5 pr-3 text-right font-medium">Маржа, сом</th><th className="py-1.5 text-right font-medium">Маржа, %</th></tr></thead>
              <tbody>
                {cmp.map((c) => (
                  <tr key={c.channel} className="border-t border-fl-line">
                    <td className="py-1.5 pr-3 text-fl-cream/85">{c.channel}</td>
                    <td className="num py-1.5 pr-3 text-right text-fl-cream">{formatNumber(c.commission)}</td>
                    <td className={`num py-1.5 pr-3 text-right ${c.margin > 0 ? "text-fl-green" : "text-fl-red"}`}>{formatNumber(c.margin)}</td>
                    <td className="num py-1.5 text-right text-fl-cream/75">{formatPercent(c.marginPct)}</td>
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

// ── 4. Сводка и план ────────────────────────────────────────────────────

const ROADMAP: Array<[string, string, string, string]> = [
  ["Месяц 1", "Карта потока создания ценности", "Пройти путь изделия от склада сырья до покупателя, найти три главные потери.", "lean:vsm"],
  ["Месяц 1", "Система 5S", "Сортировка, порядок, чистота, стандарт рабочего места, дисциплина.", "lean:5s"],
  ["Месяц 2", "Нормирование", "Нормы расхода сырья и допустимый процент брака по каждому изделию.", "lean:loss"],
  ["Месяц 2", "Канбан", "Производить по фактическим заказам, а не на склад.", "lean:kanban"],
  ["Месяц 3", "Кайдзен (постоянные улучшения)", "Ежедневные 15-минутные разборы: что мешало вчера и как это убрать.", "lean:muda"],
  ["Месяц 3", "Контроль", "Ежемесячно повторять аудит потерь и сравнивать с прошлым месяцем.", "lean:mudaIndex"],
];

function DashboardTab({ stockResult, mudaResult, ueResult }: {
  stockResult: StockLossResult | null; mudaResult: MudaResult | null; ueResult: UnitEconomicsResult | null;
}) {
  return (
    <section className="space-y-6">
      {!stockResult && !mudaResult && !ueResult ? (
        <Alert kind="info">Заполните вкладки «Остатки и потери», «Аудит потерь» и «Юнит-экономика» — здесь появится сводка.</Alert>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {stockResult && <Kpi label="Потери производства" value={formatPercent(stockResult.lossPct)} />}
            {stockResult && <Kpi label="Стоимость отходов" value={`${formatNumber(stockResult.wasteValue)} сом`} />}
            {mudaResult && <Kpi label="Индекс бережливости" value={`${mudaResult.leanIdx.toFixed(0)} из 100`} />}
            {ueResult && <Kpi label="Маржа с единицы" value={formatPercent(ueResult.marginPct)} />}
          </div>
          <div className={`${card} space-y-1.5 text-sm`}>
            <p className="font-display text-base font-semibold text-fl-gold">Сводка по бережливому производству</p>
            {stockResult && <p><b>Потери:</b> {formatNumber(stockResult.lossTotal)} сом ({formatPercent(stockResult.lossPct)} стоимости выпуска).</p>}
            {stockResult && stockResult.wasteValue > 0 && <p><b>Продажа отходов:</b> до {formatNumber(stockResult.wasteValue)} сом дополнительного дохода.</p>}
            {mudaResult && <p><b>Индекс бережливости:</b> {mudaResult.leanIdx.toFixed(0)} из 100 — {mudaResult.maturity.name.toLowerCase()}.</p>}
            {ueResult && <p><b>Маржа с единицы:</b> {formatNumber(ueResult.marginUnit)} сом ({formatPercent(ueResult.marginPct)}), маржинальная прибыль в месяц — {formatNumber(ueResult.profitMonth)} сом.</p>}
            <p className="pt-1 text-xs text-fl-cream/55">
              Связь с отчётностью: потери от брака отражаются в себестоимости (ОПиУ), продажа отходов — в прочих доходах, остатки сырья и
              готовой продукции — в запасах баланса. Внесите их проводками в «Журнале», и они попадут во все отчёты.
            </p>
          </div>
        </>
      )}

      <div className={`overflow-x-auto ${card}`}>
        <h3 className="mb-3 font-display text-base font-semibold text-fl-cream">План внедрения на 3 месяца</h3>
        <table className="w-full min-w-[520px] text-left text-sm">
          <thead><tr className="text-xs text-fl-cream/55"><th className="py-1.5 pr-3 font-medium">Срок</th><th className="py-1.5 pr-3 font-medium">Инструмент</th><th className="py-1.5 font-medium">Что сделать</th></tr></thead>
          <tbody>
            {ROADMAP.map(([period, tool, action, k], i) => (
              <tr key={i} className="border-t border-fl-line">
                <td className="py-2 pr-3 font-semibold text-fl-gold">{period}</td>
                <td className="py-2 pr-3 font-semibold text-fl-cream">{tool}<Info k={k} label={tool} /></td>
                <td className="py-2 text-fl-cream/75">{action}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

// ── shared bits ─────────────────────────────────────────────────────────

const round = (n: number) => Math.round(n * 100) / 100;

function NumField({ k, label, value, onChange }: { k: string; label: string; value: number; onChange: (v: number) => void }) {
  const [text, setText] = useState(value ? String(value).replace(".", ",") : "");
  const [focused, setFocused] = useState(false);
  const shown = focused ? text : value ? String(value).replace(".", ",") : "";
  return (
    <label className="block flex-1">
      <span className="text-xs text-fl-cream/70">{label}{F[k] && <Info t={F[k]} label={label} />}</span>
      <input inputMode="decimal" value={shown} placeholder="0"
        onFocus={() => { setText(value ? String(value).replace(".", ",") : ""); setFocused(true); }}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); const n = Number(e.target.value.replace(/\s/g, "").replace(",", ".")); onChange(Number.isFinite(n) && n >= 0 ? n : 0); }}
        className="num mt-1 w-full rounded-md border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream placeholder:text-fl-cream/30 focus:border-fl-info focus:outline-none" />
    </label>
  );
}

function Kpi({ label, value, sub, accent, t, valueClass }: { label: string; value: string; sub?: string; accent?: boolean; t?: Term; valueClass?: string }) {
  return (
    <div className="rounded-lg border border-fl-line bg-fl-charcoal-2 p-3 shadow-card">
      <div className="text-xs text-fl-cream/60">{label}{t && <Info t={t} label={label} />}</div>
      <div className={`num mt-1 text-lg font-semibold ${valueClass ?? (accent ? "text-fl-gold" : "text-fl-cream")}`}>{value}</div>
      {sub && <div className="text-xs text-fl-cream/55">{sub}</div>}
    </div>
  );
}

function Alert({ kind, children }: { kind: "ok" | "warn" | "err" | "info"; children: React.ReactNode }) {
  const styles = {
    ok: "border-fl-green/40 bg-fl-green/10",
    warn: "border-fl-gold/40 bg-fl-gold/10",
    err: "border-fl-red/40 bg-fl-red/10",
    info: "border-fl-line bg-fl-charcoal-2",
  };
  return <div className={`rounded-lg border p-3 text-sm text-fl-cream ${styles[kind]}`}>{children}</div>;
}
