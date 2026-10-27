"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { Collapsible } from "@/components/Collapsible";
import { StickyBar } from "@/components/StickyBar";
import { KpiCard } from "@/components/KpiCard";
import { useToast } from "@/components/Toast";
import {
  calculate, REGIMES, MONTHS,
  breakEven, safetyMargin, grossMargin, taxBurden, validateInputs,
  type RegimeKey, type CalculateResult,
} from "@/lib/tax-engine";
import { formatNumber, formatPercent } from "@/lib/format";

interface Company { id: string; name: string; }
type PeriodType = "Месяц" | "Квартал" | "Год";

const emptyInputs = {
  revenue: 0, otherIncome: 0, cogs: 0, salaries: 0, rent: 0,
  sellingExp: 0, adminExp: 0, otherOpExp: 0, interestExp: 0,
  otherNonOp: 0, investInc: 0, cashPct: 70, patentAmount: 0,
};

function periodDates(ptype: PeriodType, year: number, monthIdx: number, quarter: number) {
  if (ptype === "Месяц") {
    const from = new Date(Date.UTC(year, monthIdx, 1));
    const to   = new Date(Date.UTC(year, monthIdx + 1, 0));
    return { from, to, label: `${MONTHS[monthIdx]} ${year}` };
  }
  if (ptype === "Квартал") {
    const m1 = (quarter - 1) * 3;
    return {
      from: new Date(Date.UTC(year, m1, 1)),
      to: new Date(Date.UTC(year, m1 + 3, 0)),
      label: `Q${quarter} ${year}`,
    };
  }
  return {
    from: new Date(Date.UTC(year, 0, 1)),
    to: new Date(Date.UTC(year, 11, 31)),
    label: String(year),
  };
}

// ── Small helpers ────────────────────────────────────────────────────────────

function FieldRow({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="flex items-start justify-between gap-2 py-2.5 border-t border-fl-line first:border-0">
      <span className="text-sm text-fl-cream/60 flex-1">{label}</span>
      <div className="text-right">
        <span className="num text-sm text-fl-cream tabular-nums">{value}</span>
        {sub && <p className="text-xs text-fl-cream/40">{sub}</p>}
      </div>
    </div>
  );
}

function Badge({ label, variant }: { label: string; variant: "ok" | "warn" | "err" | "neutral" }) {
  const cls = {
    ok:      "border-fl-green/40 bg-fl-green/10 text-fl-green",
    warn:    "border-fl-gold/40 bg-fl-gold/10 text-fl-gold-bright",
    err:     "border-fl-red/40 bg-fl-red/10 text-fl-red",
    neutral: "border-fl-cream/20 bg-fl-cream/5 text-fl-cream/60",
  }[variant];
  return (
    <span className={`inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-medium ${cls}`}>
      {label}
    </span>
  );
}

// ── Main page ────────────────────────────────────────────────────────────────

export default function CalculatorPage() {
  const [companies, setCompanies]     = useState<Company[]>([]);
  const [companyId, setCompanyId]     = useState("");
  const [newName, setNewName]         = useState("");
  const [regimeKey, setRegimeKey]     = useState<RegimeKey>("general");
  const [ptype, setPtype]             = useState<PeriodType>("Месяц");
  const [year, setYear]               = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx]       = useState(new Date().getMonth());
  const [quarter, setQuarter]         = useState(Math.ceil((new Date().getMonth() + 1) / 3));
  const [inputs, setInputs]           = useState(emptyInputs);
  const [result, setResult]           = useState<CalculateResult | null>(null);
  const [history, setHistory]         = useState<any[]>([]);
  const [saving, setSaving]           = useState(false);
  const { show: showToast, ToastContainer } = useToast();

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((d) => {
      setCompanies(d);
      if (d[0]) setCompanyId(d[0].id);
    }).catch(() => {});
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/reports?companyId=${companyId}&limit=10`)
      .then((r) => r.json()).then(setHistory).catch(() => {});
  }, [companyId]);

  const warnings = useMemo(
    () => validateInputs(inputs.revenue, inputs.cogs, inputs.salaries),
    [inputs.revenue, inputs.cogs, inputs.salaries],
  );

  const period = periodDates(ptype, year, monthIdx, quarter);

  function set(k: keyof typeof inputs) {
    return (v: number) => setInputs((s) => ({ ...s, [k]: v }));
  }

  function handleCalculate() {
    setResult(calculate({ regimeKey, ...inputs }));
  }

  async function createCompany() {
    const name = newName.trim();
    if (!name) return;
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const c = await res.json();
    setCompanies((prev) => [c, ...prev]);
    setCompanyId(c.id);
    setNewName("");
    showToast(`Компания «${name}» создана`, "success");
  }

  async function saveReport() {
    if (!result || !companyId) return;
    setSaving(true);
    try {
      await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          periodLabel: period.label,
          periodFrom: period.from.toISOString(),
          periodTo: period.to.toISOString(),
          regimeKey, ...inputs,
        }),
      });
      showToast("Отчёт успешно сформирован", "success");
      fetch(`/api/reports?companyId=${companyId}&limit=10`)
        .then((r) => r.json()).then(setHistory).catch(() => {});
    } catch {
      showToast("Ошибка при сохранении", "error");
    } finally {
      setSaving(false);
    }
  }

  // Derived
  const gm   = result ? grossMargin(result) : null;
  const sm   = result ? safetyMargin(result) : null;
  const be   = result ? breakEven(result) : null;
  const tb   = result ? taxBurden(result) : null;

  const smVariant = sm === null ? "neutral" : sm > 30 ? "ok" : sm > 15 ? "warn" : "err";
  const profitVariant = result
    ? (result.netProfit > 0 ? "ok" : "err")
    : "neutral";

  const expensesTotal = inputs.sellingExp + inputs.adminExp + inputs.otherOpExp;
  const nonOpTotal    = inputs.interestExp + inputs.otherNonOp;

  return (
    <>
      <ToastContainer />

      <main className="mx-auto max-w-5xl px-4 py-8 pb-32 sm:px-6 sm:py-10">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="mb-8">
          <h1 className="font-display text-2xl font-bold text-fl-cream sm:text-3xl">
            Налоговый калькулятор
          </h1>
          <p className="mt-1 text-sm text-fl-cream/40">Ставки по НК КР в редакции от 06.08.2026</p>
        </header>

        <div className="space-y-4">

          {/* ── Компания ────────────────────────────────────────────────── */}
          <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
            <p className="label-caps mb-3">Организация</p>
            <div className="flex flex-wrap gap-2">
              <select
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value)}
                className="flex-1 min-w-[180px] rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
              >
                {companies.map((c) => (
                  <option key={c.id} value={c.id}>{c.name}</option>
                ))}
                {companies.length === 0 && <option value="">Нет компаний</option>}
              </select>
              <input
                type="text"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createCompany()}
                placeholder="Новая компания..."
                className="flex-1 min-w-[180px] rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream placeholder:text-fl-cream/25 focus:border-fl-gold focus:outline-none"
              />
              <button
                onClick={createCompany}
                className="rounded-lg border border-fl-gold/30 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10 transition-colors"
              >
                Добавить
              </button>
            </div>
          </div>

          {/* ── Период и режим ──────────────────────────────────────────── */}
          <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
            <p className="label-caps mb-3">Период и налоговый режим</p>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <label className="block">
                <span className="text-xs text-fl-cream/50">Период</span>
                <select
                  value={ptype}
                  onChange={(e) => setPtype(e.target.value as PeriodType)}
                  className="mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
                >
                  {(["Месяц","Квартал","Год"] as PeriodType[]).map(p => <option key={p}>{p}</option>)}
                </select>
              </label>

              <label className="block">
                <span className="text-xs text-fl-cream/50">Год</span>
                <select
                  value={year}
                  onChange={(e) => setYear(+e.target.value)}
                  className="mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
                >
                  {[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </label>

              {ptype === "Месяц" && (
                <label className="block">
                  <span className="text-xs text-fl-cream/50">Месяц</span>
                  <select
                    value={monthIdx}
                    onChange={(e) => setMonthIdx(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
                  >
                    {MONTHS.map((m, i) => <option key={i} value={i}>{m}</option>)}
                  </select>
                </label>
              )}

              {ptype === "Квартал" && (
                <label className="block">
                  <span className="text-xs text-fl-cream/50">Квартал</span>
                  <select
                    value={quarter}
                    onChange={(e) => setQuarter(+e.target.value)}
                    className="mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
                  >
                    {[1,2,3,4].map(q => <option key={q} value={q}>Q{q}</option>)}
                  </select>
                </label>
              )}

              <label className="block col-span-2 sm:col-span-1">
                <span className="text-xs text-fl-cream/50">Налоговый режим</span>
                <select
                  value={regimeKey}
                  onChange={(e) => setRegimeKey(e.target.value as RegimeKey)}
                  className="mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
                >
                  {Object.entries(REGIMES).map(([k, v]) => (
                    <option key={k} value={k}>{v}</option>
                  ))}
                </select>
              </label>
            </div>
          </div>

          {/* ── Доходы ──────────────────────────────────────────────────── */}
          <Collapsible title="Доходы" defaultOpen={true}>
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
              <MoneyInput label="Выручка от реализации" value={inputs.revenue} onChange={set("revenue")} required />
              <MoneyInput label="Прочие операционные доходы" value={inputs.otherIncome} onChange={set("otherIncome")} />
            </div>
          </Collapsible>

          {/* ── Себестоимость и ФОТ ─────────────────────────────────────── */}
          <Collapsible title="Себестоимость и ФОТ" defaultOpen={true}>
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
              <MoneyInput label="Себестоимость (материалы, производство)" value={inputs.cogs} onChange={set("cogs")} />
              <MoneyInput label="Фонд оплаты труда (до налогов)" value={inputs.salaries} onChange={set("salaries")}
                hint="Страховые взносы работодателя 2,25% начисляются автоматически; 10% взносов и 10% подоходного налога удерживаются из зарплаты" />
              <MoneyInput label="Аренда" value={inputs.rent} onChange={set("rent")} />
            </div>
          </Collapsible>

          {/* ── Операционные расходы ────────────────────────────────────── */}
          <Collapsible
            title="Операционные расходы"
            badge={expensesTotal > 0 ? formatNumber(expensesTotal) + " сом" : undefined}
          >
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
              <MoneyInput label="Коммерческие расходы" value={inputs.sellingExp} onChange={set("sellingExp")}
                hint="Маркетинг, реклама, доставка" />
              <MoneyInput label="Административные расходы" value={inputs.adminExp} onChange={set("adminExp")}
                hint="Офис, связь, канцелярия" />
              <MoneyInput label="Прочие операционные расходы" value={inputs.otherOpExp} onChange={set("otherOpExp")} />
            </div>
          </Collapsible>

          {/* ── Внереализационные ───────────────────────────────────────── */}
          <Collapsible
            title="Внереализационные и прочие"
            badge={nonOpTotal > 0 ? formatNumber(nonOpTotal) + " сом" : undefined}
          >
            <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
              <MoneyInput label="Проценты к уплате" value={inputs.interestExp} onChange={set("interestExp")} />
              <MoneyInput label="Прочие внереализационные расходы" value={inputs.otherNonOp} onChange={set("otherNonOp")} />
              <MoneyInput label="Инвестиционные доходы" value={inputs.investInc} onChange={set("investInc")} />
            </div>
          </Collapsible>

          {/* ── Спец. параметры ─────────────────────────────────────────── */}
          {(regimeKey.startsWith("unified_") || regimeKey === "patent") && (
            <Collapsible title="Параметры режима">
              <div className="grid grid-cols-1 gap-3 pt-3 sm:grid-cols-2">
                {regimeKey.startsWith("unified_") && (
                  <label className="block">
                    <span className="text-xs text-fl-cream/50">Доля наличной выручки (%)</span>
                    <div className="mt-2 flex items-center gap-3">
                      <input type="range" min={0} max={100} value={inputs.cashPct}
                        onChange={(e) => setInputs(s => ({ ...s, cashPct: +e.target.value }))}
                        className="flex-1" />
                      <span className="num w-10 text-right text-sm text-fl-cream">{inputs.cashPct}%</span>
                    </div>
                  </label>
                )}
                {regimeKey === "patent" && (
                  <MoneyInput label="Стоимость патента" value={inputs.patentAmount} onChange={set("patentAmount")} />
                )}
              </div>
            </Collapsible>
          )}

          {/* ── Предупреждения ──────────────────────────────────────────── */}
          {warnings.length > 0 && (
            <div className="space-y-1.5">
              {warnings.map((w, i) => (
                <div key={i} className="rounded-lg border border-fl-gold/30 bg-fl-gold/8 px-4 py-2.5 text-sm text-fl-gold-bright">
                  {w}
                </div>
              ))}
            </div>
          )}

          {/* ── Кнопка расчёта ──────────────────────────────────────────── */}
          <button
            onClick={handleCalculate}
            className="w-full rounded-xl bg-fl-accent py-4 font-display text-base font-bold
                       tracking-wide text-fl-on-accent hover:bg-fl-accent-hover
                       active:scale-[0.99] transition-all duration-150"
          >
            Рассчитать налоги
          </button>

          {/* ── Результат ───────────────────────────────────────────────── */}
          {result && (
            <section className="space-y-4">

              {/* KPI row */}
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <KpiCard label="Выручка" value={formatNumber(result.totalRevenue)} />
                <KpiCard
                  label="Валовая маржа"
                  value={formatPercent(gm!)}
                  trend={gm! > 40 ? "up" : gm! > 20 ? "neutral" : "down"}
                />
                <KpiCard
                  label="EBIT"
                  value={formatNumber(result.ebit)}
                  trend={result.ebit > 0 ? "up" : "down"}
                />
                <KpiCard
                  label="Чистая прибыль"
                  value={formatNumber(result.netProfit)}
                  sub={formatPercent(result.profitability) + " маржа"}
                  trend={result.netProfit > 0 ? "up" : "down"}
                  highlight
                />
              </div>

              {/* Детализация налогов */}
              <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
                <div className="flex items-center justify-between mb-3">
                  <p className="label-caps">Налоговая нагрузка</p>
                  <Badge
                    label={result.regimeName}
                    variant="neutral"
                  />
                </div>
                {Object.entries(result.details).map(([label, amount]) => (
                  <FieldRow
                    key={label}
                    label={label}
                    value={`${formatNumber(amount)} сом`}
                    sub={label.startsWith("НДС") ? "косвенный налог, не уменьшает прибыль" : undefined}
                  />
                ))}
                {result.salaries > 0 && (
                  <FieldRow
                    label="Удерживается из зарплаты (не расход компании)"
                    value={`${formatNumber(result.withheld.socialEmployee + result.withheld.pit)} сом`}
                    sub={`взносы работника 10% — ${formatNumber(result.withheld.socialEmployee)}, подоходный налог 10% — ${formatNumber(result.withheld.pit)}`}
                  />
                )}
                <div className="mt-3 flex items-center justify-between border-t border-fl-line pt-3">
                  <span className="text-sm font-semibold text-fl-cream">Прямые налоги итого</span>
                  <div className="flex items-center gap-2">
                    <span className="num text-sm font-bold text-fl-cream">{formatNumber(result.totalDirect)} сом</span>
                    <Badge
                      label={`${formatPercent(tb!)} от выручки`}
                      variant={tb! < 15 ? "ok" : tb! < 25 ? "warn" : "err"}
                    />
                  </div>
                </div>
              </div>

              {/* ОПУ */}
              <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
                <p className="label-caps mb-3">Отчёт о прибылях и убытках (сокр.)</p>
                <FieldRow label="Выручка" value={`${formatNumber(result.totalRevenue)} сом`} />
                <FieldRow label="Себестоимость" value={`(${formatNumber(result.cogs)}) сом`} />
                <FieldRow label="Валовая прибыль" value={`${formatNumber(result.grossProfit)} сом`} sub={`маржа ${formatPercent(gm!)}`} />
                <FieldRow label="Операционные расходы" value={`(${formatNumber(result.totalOpExp)}) сом`} />
                <FieldRow label="EBIT" value={`${formatNumber(result.ebit)} сом`} />
                <FieldRow label="Внереализационные расходы" value={`(${formatNumber(result.interestExp + result.otherNonOp)}) сом`} />
                <FieldRow label="EBT (прибыль до налога)" value={`${formatNumber(result.ebt)} сом`} />
                <FieldRow label="Налог на прибыль" value={`(${formatNumber(result.incomeTax)}) сом`} />
                <div className="mt-2 flex items-center justify-between border-t-2 border-fl-gold/30 pt-3">
                  <span className="font-display text-sm font-bold text-fl-cream">Чистая прибыль</span>
                  <span className={`num text-lg font-bold ${result.netProfit >= 0 ? "text-fl-green" : "text-fl-red"}`}>
                    {formatNumber(result.netProfit)} сом
                  </span>
                </div>
              </div>

              {/* CVP-метрики */}
              <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
                <p className="label-caps mb-3">CVP-анализ</p>
                <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                  <KpiCard label="Точка безубыточности" value={`${formatNumber(be!)} сом`} />
                  <KpiCard
                    label="Запас прочности"
                    value={formatPercent(sm!)}
                    trend={sm! > 30 ? "up" : sm! > 15 ? "neutral" : "down"}
                  />
                  <KpiCard label="Валовая маржа" value={formatPercent(gm!)} />
                  <KpiCard label="Налоговая нагрузка" value={formatPercent(tb!)} />
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Badge
                    label={sm! > 30 ? "Устойчив" : sm! > 15 ? "Требует внимания" : "Критический запас"}
                    variant={smVariant}
                  />
                  <Badge
                    label={result.netProfit > 0 ? "Прибыльный" : "Убыточный"}
                    variant={profitVariant}
                  />
                </div>
              </div>

              {/* Сохранить */}
              <button
                onClick={saveReport}
                disabled={saving || !companyId}
                className="w-full rounded-xl border border-fl-gold/30 py-3.5 font-display text-sm
                           font-semibold tracking-wide text-fl-gold-bright
                           hover:bg-fl-gold/10 disabled:opacity-40 transition-colors"
              >
                {saving ? "Сохранение..." : "Сохранить отчёт"}
              </button>

              {/* История */}
              {history.length > 0 && (
                <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
                  <p className="label-caps mb-3">История отчётов</p>
                  <div className="space-y-0">
                    {history.map((r: any) => (
                      <div key={r.id} className="flex items-center justify-between py-2.5 border-t border-fl-line first:border-0">
                        <span className="text-sm text-fl-cream/60">{r.periodLabel}</span>
                        <span className={`num text-sm font-medium ${r.netProfit >= 0 ? "text-fl-green" : "text-fl-red"}`}>
                          {formatNumber(r.netProfit)} сом
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </section>
          )}
        </div>
      </main>

      {/* Sticky bar — shows when result is available */}
      <StickyBar
        netProfit={result?.netProfit ?? 0}
        profitability={result?.profitability ?? 0}
        regimeName={result?.regimeName ?? ""}
        visible={!!result}
      />
    </>
  );
}
