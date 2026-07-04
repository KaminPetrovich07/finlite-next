"use client";

import { useEffect, useMemo, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import {
  calculate,
  REGIMES,
  MONTHS,
  breakEven,
  safetyMargin,
  grossMargin,
  taxBurden,
  validateInputs,
  type RegimeKey,
  type CalculateResult,
} from "@/lib/tax-engine";
import { formatNumber, formatPercent } from "@/lib/format";

interface Company {
  id: string;
  name: string;
}

type PeriodType = "Месяц" | "Квартал" | "Год";

const emptyInputs = {
  revenue: 0, otherIncome: 0, cogs: 0, salaries: 0, rent: 0,
  sellingExp: 0, adminExp: 0, otherOpExp: 0, interestExp: 0,
  otherNonOp: 0, investInc: 0, cashPct: 70, patentAmount: 0,
};

function periodDates(ptype: PeriodType, year: number, monthIdx: number, quarter: number) {
  if (ptype === "Месяц") {
    const from = new Date(Date.UTC(year, monthIdx, 1));
    const to = new Date(Date.UTC(year, monthIdx + 1, 0));
    return { from, to, label: `${MONTHS[monthIdx]} ${year}` };
  }
  if (ptype === "Квартал") {
    const m1 = (quarter - 1) * 3;
    const from = new Date(Date.UTC(year, m1, 1));
    const to = new Date(Date.UTC(year, m1 + 3, 0));
    return { from, to, label: `Q${quarter} ${year}` };
  }
  const from = new Date(Date.UTC(year, 0, 1));
  const to = new Date(Date.UTC(year, 11, 31));
  return { from, to, label: String(year) };
}

export default function CalculatorPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState<string>("");
  const [newCompanyName, setNewCompanyName] = useState("");

  const [regimeKey, setRegimeKey] = useState<RegimeKey>("general");
  const [ptype, setPtype] = useState<PeriodType>("Месяц");
  const [year, setYear] = useState(new Date().getFullYear());
  const [monthIdx, setMonthIdx] = useState(new Date().getMonth());
  const [quarter, setQuarter] = useState(Math.ceil((new Date().getMonth() + 1) / 3));

  const [inputs, setInputs] = useState(emptyInputs);
  const [result, setResult] = useState<CalculateResult | null>(null);
  const [history, setHistory] = useState<any[]>([]);
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((data) => {
      setCompanies(data);
      if (data[0]) setCompanyId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/reports?companyId=${companyId}&limit=10`).then((r) => r.ok ? r.json() : []).then(setHistory).catch(() => {});
  }, [companyId, saveMsg]);

  const warnings = useMemo(
    () => validateInputs(inputs.revenue, inputs.cogs, inputs.salaries),
    [inputs.revenue, inputs.cogs, inputs.salaries]
  );

  const period = periodDates(ptype, year, monthIdx, quarter);

  function handleCalculate() {
    const fr = calculate({ regimeKey, ...inputs });
    setResult(fr);
    setSaveMsg(null);
  }

  async function createCompany() {
    const name = newCompanyName.trim();
    if (!name) return;
    const res = await fetch("/api/companies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name }),
    });
    const company = await res.json();
    setCompanies((c) => [company, ...c]);
    setCompanyId(company.id);
    setNewCompanyName("");
  }

  async function saveReport() {
    if (!result || !companyId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId,
          periodLabel: period.label,
          periodFrom: period.from.toISOString(),
          periodTo: period.to.toISOString(),
          regimeKey,
          ...inputs,
        }),
      });
      if (!res.ok) throw new Error((await res.json()).error ?? "Ошибка сохранения");
      setSaveMsg("✅ Отчёт сохранён");
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          FinLite KG
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">
          Расчёт по НК КР · {period.label}
        </p>
      </header>

      {/* Company picker */}
      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Компания</h2>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex-1">
            <span className="text-sm text-fl-cream/70">Выбрать</span>
            <select
              value={companyId}
              onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream"
            >
              {companies.length === 0 && <option value="">— нет компаний —</option>}
              {companies.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
          </label>
          <div className="flex flex-1 gap-2">
            <input
              value={newCompanyName}
              onChange={(e) => setNewCompanyName(e.target.value)}
              placeholder="Новая компания…"
              className="flex-1 rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream placeholder:text-fl-cream/30"
            />
            <button
              onClick={createCompany}
              className="rounded-md bg-fl-gold px-4 py-2.5 font-medium text-fl-charcoal hover:bg-fl-gold-bright"
            >
              + Добавить
            </button>
          </div>
        </div>
      </section>

      {/* Period + regime */}
      <section className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:grid-cols-3 sm:p-5">
        <label>
          <span className="text-sm text-fl-cream/70">Период</span>
          <select value={ptype} onChange={(e) => setPtype(e.target.value as PeriodType)}
            className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
            {(["Месяц", "Квартал", "Год"] as PeriodType[]).map((p) => <option key={p}>{p}</option>)}
          </select>
        </label>
        {ptype === "Месяц" && (
          <label>
            <span className="text-sm text-fl-cream/70">Месяц</span>
            <select value={monthIdx} onChange={(e) => setMonthIdx(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
              {MONTHS.map((m, i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </label>
        )}
        {ptype === "Квартал" && (
          <label>
            <span className="text-sm text-fl-cream/70">Квартал</span>
            <select value={quarter} onChange={(e) => setQuarter(Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
              {[1, 2, 3, 4].map((q) => <option key={q} value={q}>Q{q}</option>)}
            </select>
          </label>
        )}
        <label>
          <span className="text-sm text-fl-cream/70">Год</span>
          <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream" />
        </label>
        <label className="sm:col-span-3">
          <span className="text-sm text-fl-cream/70">Налоговый режим</span>
          <select value={regimeKey} onChange={(e) => setRegimeKey(e.target.value as RegimeKey)}
            className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
            {Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select>
        </label>
      </section>

      {/* Financial inputs */}
      <section className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:grid-cols-2 sm:p-5">
        <MoneyInput label="Выручка" value={inputs.revenue} onChange={(v) => setInputs((s) => ({ ...s, revenue: v }))} required />
        <MoneyInput label="Прочие доходы" value={inputs.otherIncome} onChange={(v) => setInputs((s) => ({ ...s, otherIncome: v }))} />
        <MoneyInput label="Себестоимость" value={inputs.cogs} onChange={(v) => setInputs((s) => ({ ...s, cogs: v }))} required />
        <MoneyInput label="Зарплата (ФОТ без соцфонда)" value={inputs.salaries} onChange={(v) => setInputs((s) => ({ ...s, salaries: v }))} />
        <MoneyInput label="Аренда" value={inputs.rent} onChange={(v) => setInputs((s) => ({ ...s, rent: v }))} />
        <MoneyInput label="Расходы по реализации" value={inputs.sellingExp} onChange={(v) => setInputs((s) => ({ ...s, sellingExp: v }))} />
        <MoneyInput label="Адм. расходы" value={inputs.adminExp} onChange={(v) => setInputs((s) => ({ ...s, adminExp: v }))} />
        <MoneyInput label="Прочие операц. расходы" value={inputs.otherOpExp} onChange={(v) => setInputs((s) => ({ ...s, otherOpExp: v }))} />
        <MoneyInput label="Проценты к уплате" value={inputs.interestExp} onChange={(v) => setInputs((s) => ({ ...s, interestExp: v }))} />
        <MoneyInput label="Доходы от инвестиций" value={inputs.investInc} onChange={(v) => setInputs((s) => ({ ...s, investInc: v }))} />
        {regimeKey in { unified_trade_s: 1, unified_trade_l: 1, unified_catering_b: 1, unified_catering_o: 1, unified_production: 1, unified_services: 1, unified_foreign: 1 } && (
          <MoneyInput label="Доля наличных, %" value={inputs.cashPct} onChange={(v) => setInputs((s) => ({ ...s, cashPct: v }))} hint="Остальное — безналичная выручка" />
        )}
        {regimeKey === "patent" && (
          <MoneyInput label="Сумма патента" value={inputs.patentAmount} onChange={(v) => setInputs((s) => ({ ...s, patentAmount: v }))} />
        )}
      </section>

      {warnings.length > 0 && (
        <div className="mb-6 space-y-1 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-cream">
          {warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}

      <button
        onClick={handleCalculate}
        className="mb-6 w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright sm:w-auto sm:px-8"
      >
        🧮 Рассчитать
      </button>

      {result && (
        <section className="mb-10 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-6">
          <h2 className="mb-4 font-display text-xl font-semibold text-fl-gold-bright">Результат</h2>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            <Kpi label="Выручка" value={formatNumber(result.totalRevenue)} />
            <Kpi label="Валовая прибыль" value={formatNumber(result.grossProfit)} />
            <Kpi label="Чистая прибыль" value={formatNumber(result.netProfit)} gold />
            <Kpi label="Рентабельность" value={formatPercent(result.profitability)} />
            <Kpi label="Валовая маржа" value={formatPercent(grossMargin(result))} />
            <Kpi label="Точка безубыточности" value={formatNumber(breakEven(result))} />
            <Kpi label="Запас прочности" value={formatPercent(safetyMargin(result))} />
            <Kpi label="Нал. нагрузка" value={formatPercent(taxBurden(result))} />
          </div>

          <h3 className="mb-2 mt-6 font-display text-base font-semibold text-fl-cream">Налоги</h3>
          <ul className="space-y-1 text-sm text-fl-cream/80">
            {Object.entries(result.details).map(([k, v]) => (
              <li key={k} className="flex justify-between border-b border-fl-gold/10 py-1.5">
                <span>{k}</span>
                <span className="font-mono tabular-nums">{formatNumber(v as number)} сом</span>
              </li>
            ))}
          </ul>

          <div className="mt-6 flex items-center gap-3">
            <button
              onClick={saveReport}
              disabled={saving || !companyId}
              className="rounded-md bg-fl-gold px-5 py-2.5 font-medium text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50"
            >
              {saving ? "Сохранение…" : "💾 Сохранить отчёт"}
            </button>
            {saveMsg && <span className="text-sm text-fl-cream/80">{saveMsg}</span>}
          </div>
        </section>
      )}

      {/* History */}
      <section className="rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">📅 История отчётов</h2>
        {history.length === 0 ? (
          <p className="text-sm text-fl-cream/50">Пока нет сохранённых отчётов для этой компании.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-2 pr-4">Период</th>
                  <th className="py-2 pr-4">Режим</th>
                  <th className="py-2 pr-4 text-right">Выручка</th>
                  <th className="py-2 pr-4 text-right">Чистая прибыль</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => (
                  <tr key={h.id} className="border-t border-fl-gold/10">
                    <td className="py-2 pr-4">{h.periodLabel}</td>
                    <td className="py-2 pr-4 text-fl-cream/70">{h.regimeName}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums">{formatNumber(h.totalRevenue)}</td>
                    <td className="py-2 pr-4 text-right font-mono tabular-nums text-fl-gold">{formatNumber(h.netProfit)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}

function Kpi({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-fl-gold/10 bg-fl-charcoal p-3">
      <div className="text-xs text-fl-cream/50">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${gold ? "text-fl-gold-bright" : "text-fl-cream"}`}>
        {value}
      </div>
    </div>
  );
}

