"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Notice } from "@/components/ledger/statements";
import { useToast } from "@/components/Toast";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import type { Statements } from "@/lib/ledger/engine";
import { computeEsg, DEFAULT_FACTORS, EMPTY_ESG, PILLAR_LABEL, type EsgInput, type EsgMetric, type Pillar } from "@/lib/esg";
import { formatNumber } from "@/lib/format";

type NumKey = Exclude<{ [K in keyof EsgInput]-?: EsgInput[K] extends number | undefined ? K : never }[keyof EsgInput], undefined>;
type BoolKey = Exclude<{ [K in keyof EsgInput]-?: EsgInput[K] extends boolean ? K : never }[keyof EsgInput], undefined>;

const GROUPS: Array<{ title: string; fields: Array<[NumKey, string]> }> = [
  { title: "Энергия и ресурсы", fields: [
    ["electricityKwh", "Электроэнергия, кВт·ч"], ["heatGcal", "Тепловая энергия, Гкал"],
    ["dieselL", "Дизельное топливо, л"], ["petrolL", "Бензин, л"], ["gasM3", "Природный газ, м³"], ["coalT", "Уголь, т"],
    ["waterM3", "Вода, м³"], ["wasteT", "Отходы, т"], ["wasteRecycledT", "из них на переработку, т"],
  ] },
  { title: "Персонал", fields: [
    ["employees", "Численность на конец периода"], ["women", "из них женщин"],
    ["managers", "Руководителей"], ["womenManagers", "из них женщин"],
    ["hires", "Принято за период"], ["leavers", "Уволилось за период"],
    ["trainingHours", "Часов обучения всего"], ["injuries", "Несчастных случаев"],
  ] },
  { title: "Органы управления", fields: [
    ["boardMembers", "Членов органа управления"], ["independentBoard", "из них независимых"], ["womenBoard", "из них женщин"],
  ] },
  { title: "Коэффициенты выбросов", fields: [
    ["gridFactor", "Электросеть, кг CO₂/кВт·ч"], ["dieselFactor", "Дизель, кг CO₂/л"], ["petrolFactor", "Бензин, кг CO₂/л"],
    ["gasFactor", "Газ, кг CO₂/м³"], ["coalFactor", "Уголь, кг CO₂/т"],
  ] },
];

const POLICIES: Array<[BoolKey, string]> = [
  ["antiCorruptionPolicy", "Антикоррупционная политика"],
  ["codeOfConduct", "Кодекс этики"],
  ["dataProtectionPolicy", "Политика защиты персональных данных"],
];

const SOURCE: Record<EsgMetric["source"], { label: string; cls: string }> = {
  ledger: { label: "из учёта", cls: "bg-fl-info/10 text-fl-info" },
  calc: { label: "расчёт", cls: "bg-fl-surface-2 text-fl-cream/60" },
  input: { label: "введено", cls: "bg-fl-gold/10 text-fl-gold" },
};

const field = "w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";

export default function EsgPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [statements, setStatements] = useState<Statements | null>(null);
  const [input, setInput] = useState<EsgInput>(EMPTY_ESG);
  const [demo, setDemo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    try {
      const res = await fetch(`/api/statements?companyId=${companyId}&from=${period.from}&to=${period.to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setStatements(body.statements);
      setDemo(body.demo);
      setInput({ ...EMPTY_ESG, ...(body.esg ?? {}) });
      setDirty(false);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить данные");
      setStatements(null);
    }
  }, [companyId, period]);

  useEffect(() => { load(); }, [load]);

  const report = useMemo(() => (statements ? computeEsg(statements, input) : null), [statements, input]);

  function setNum(k: NumKey, raw: string) {
    const v = Number(raw.replace(/\s/g, "").replace(",", "."));
    setInput((s) => ({ ...s, [k]: Number.isFinite(v) && v >= 0 ? v : 0 }));
    setDirty(true);
  }

  async function save() {
    if (!period) return;
    setSaving(true);
    const res = await fetch("/api/esg", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, ...period, data: { ...DEFAULT_FACTORS, ...input } }),
    });
    const body = await res.json();
    setSaving(false);
    if (!res.ok) { toast.show(body.error ?? "Не удалось сохранить", "error"); return; }
    toast.show("Данные ESG сохранены");
    setDirty(false);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">ESG-отчёт</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Экология, социальная сфера и управление. Денежные показатели — энергия, зарплата, взносы, налоги, штрафы —
          берутся из журнала; остальное вводится справа. Показатели размечены по стандартам GRI.
        </p>
      </header>

      <section className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55 lg:min-w-[240px]">
          Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} bg-fl-charcoal-2 shadow-card`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55">
          Период
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        {period && (
          <a
            href={`/packages?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}#esg`}
            className="rounded-lg border border-fl-line bg-fl-charcoal-2 px-3.5 py-2 text-sm font-medium text-fl-cream shadow-card hover:border-fl-gold/40 lg:ml-auto"
          >
            Скачать ESG-отчёт
          </a>
        )}
      </section>

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}

      {report && statements && period && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[1fr_360px]">
          <div className="space-y-6">
            {/* emissions hero */}
            <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-5 shadow-card sm:p-7">
              <p className="text-sm text-fl-cream/60">{periodLabel(period.from, period.to)} · выбросы парниковых газов</p>
              <p className="mt-2 text-5xl font-semibold tracking-tight text-fl-cream">
                {report.emissions.total.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}
                <span className="ml-2 text-xl font-normal text-fl-cream/45">т CO₂</span>
              </p>
              <ScopeBar scope1={report.emissions.scope1} scope2={report.emissions.scope2} />
              <p className="mt-3 text-sm text-fl-cream/60">
                {report.emissions.intensity !== null
                  ? <>Углеродоёмкость {report.emissions.intensity.toLocaleString("ru-RU")} т CO₂ на 1 млн сом выручки. </>
                  : null}
                Заполнено {report.completeness.filled} из {report.completeness.total} ключевых нефинансовых полей.
              </p>
            </section>

            {(["E", "S", "G"] as Pillar[]).map((p) => (
              <section key={p} className="overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card">
                <h2 className="flex items-center gap-3 border-b border-fl-line px-5 py-3.5 font-display text-lg font-semibold text-fl-cream">
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-fl-accent text-sm font-bold text-fl-on-accent">{p}</span>
                  {PILLAR_LABEL[p]}
                </h2>
                <ul className="divide-y divide-fl-line">
                  {report.metrics.filter((m) => m.pillar === p).map((m) => (
                    <li key={m.key} className="grid grid-cols-[1fr_auto] items-baseline gap-x-4 gap-y-0.5 px-5 py-2.5 sm:grid-cols-[1fr_auto_auto]">
                      <span className="text-sm text-fl-cream/85">
                        {m.label}
                        <span className="ml-2 text-[11px] text-fl-cream/40">{m.gri}</span>
                        {m.note && <span className="block text-xs text-fl-cream/45">{m.note}</span>}
                      </span>
                      <span className="num text-right text-sm font-semibold text-fl-cream">
                        {fmt(m.value)}{m.value !== null && m.unit ? <span className="ml-1 font-normal text-fl-cream/50">{m.unit}</span> : null}
                      </span>
                      <span className={`hidden rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${SOURCE[m.source].cls}`}>{SOURCE[m.source].label}</span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}

            <section className="overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card">
              <h2 className="border-b border-fl-line px-5 py-3.5 font-display text-lg font-semibold text-fl-cream">
                Созданная и распределённая экономическая стоимость
                <span className="ml-2 font-body text-xs font-normal text-fl-cream/45">GRI 201-1</span>
              </h2>
              <table className="w-full text-sm">
                <tbody className="divide-y divide-fl-line">
                  {[
                    ["Создано: выручка и прочие доходы", report.economic.generated, true],
                    ["Операционные затраты (поставщики)", report.economic.operatingCosts],
                    ["Работникам: зарплата и взносы", report.economic.employees],
                    ["Кредиторам и собственникам: проценты и дивиденды", report.economic.capitalProviders],
                    ["Государству: налоги и штрафы", report.economic.government],
                    ["Осталось в компании", report.economic.retained, true],
                  ].map(([label, v, strong]) => (
                    <tr key={label as string} className={strong ? "font-semibold text-fl-cream" : "text-fl-cream/80"}>
                      <td className="px-5 py-2.5">{label as string}</td>
                      <td className="num px-5 py-2.5 text-right">{formatNumber(v as number, 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </section>
          </div>

          {/* inputs */}
          <aside className="space-y-4 lg:sticky lg:top-20 lg:self-start">
            <div className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card">
              <h2 className="font-display text-base font-semibold text-fl-cream">Нефинансовые данные</h2>
              <p className="mt-1 text-xs text-fl-cream/55">
                {demo ? "У демо-компании данные заполнены. Можно менять для примера — сохранить их нельзя." : "Сохраняются отдельно для каждого периода."}
              </p>
              <div className="mt-3 max-h-[60vh] space-y-4 overflow-y-auto pr-1">
                {GROUPS.map((g) => (
                  <fieldset key={g.title}>
                    <legend className="mb-2 text-xs font-semibold text-fl-cream/70">{g.title}</legend>
                    <div className="grid grid-cols-2 gap-2">
                      {g.fields.map(([k, label]) => (
                        <label key={k} className="text-[11px] text-fl-cream/55">
                          {label}
                          <input
                            inputMode="decimal"
                            value={String(input[k] ?? 0)}
                            onChange={(e) => setNum(k, e.target.value)}
                            className={`${field} num mt-0.5 py-1.5 text-right`}
                          />
                        </label>
                      ))}
                    </div>
                  </fieldset>
                ))}
                <fieldset>
                  <legend className="mb-2 text-xs font-semibold text-fl-cream/70">Политики</legend>
                  {POLICIES.map(([k, label]) => (
                    <label key={k} className="flex items-center gap-2 py-1 text-sm text-fl-cream/80">
                      <input type="checkbox" checked={Boolean(input[k])} onChange={(e) => { setInput((s) => ({ ...s, [k]: e.target.checked })); setDirty(true); }} />
                      {label}
                    </label>
                  ))}
                  <label className="mt-2 block text-[11px] text-fl-cream/55">
                    Ответственный за ESG
                    <input value={input.esgOwner} onChange={(e) => { setInput((s) => ({ ...s, esgOwner: e.target.value })); setDirty(true); }} className={`${field} mt-0.5 py-1.5`} />
                  </label>
                </fieldset>
              </div>
              {!demo && (
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="mt-4 w-full rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40"
                >
                  {saving ? "Сохраняю…" : dirty ? "Сохранить данные ESG" : "Сохранено"}
                </button>
              )}
            </div>
          </aside>
        </div>
      )}
      <toast.ToastContainer />
    </main>
  );
}

function fmt(v: number | string | null): string {
  if (v === null) return "—";
  if (typeof v === "string") return v;
  return v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
}

function ScopeBar({ scope1, scope2 }: { scope1: number; scope2: number }) {
  const total = scope1 + scope2;
  if (total <= 0) return <p className="mt-3 text-sm text-fl-cream/50">Введите расход энергии и топлива, чтобы посчитать выбросы.</p>;
  const p1 = (scope1 / total) * 100;
  return (
    <div className="mt-4">
      <div className="flex h-3 gap-0.5 overflow-hidden rounded-full" role="img" aria-label={`Scope 1 — ${scope1} т, Scope 2 — ${scope2} т`}>
        <div style={{ width: `${p1}%`, background: "rgb(var(--c-s2))" }} />
        <div style={{ width: `${100 - p1}%`, background: "rgb(var(--c-s1))" }} />
      </div>
      <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-fl-cream/70">
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgb(var(--c-s2))" }} />Scope 1, топливо — {scope1.toLocaleString("ru-RU")} т</li>
        <li className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: "rgb(var(--c-s1))" }} />Scope 2, электроэнергия — {scope2.toLocaleString("ru-RU")} т</li>
      </ul>
    </div>
  );
}
