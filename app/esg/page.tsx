"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Notice } from "@/components/ledger/statements";
import { useToast } from "@/components/Toast";
import { ReportView, sectionId } from "@/components/reports/ReportView";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import type { Statements } from "@/lib/ledger/engine";
import type { CompanyInfo } from "@/lib/ledger/load";
import type { FormatKey } from "@/lib/reports/model";
import { buildEsgReport } from "@/lib/esg/report";
import { DEFAULT_FACTORS, FUELS, type CoalType } from "@/lib/esg/factors";
import { EMPTY_ESG, INDUSTRY_LABEL, normalizeEsgInput, type BooleanEsgKey, type EsgInput, type Industry, type NumericEsgKey } from "@/lib/esg/input";
import { scoreTopics, TOPICS } from "@/lib/esg/materiality";

// ── form layout ────────────────────────────────────────────────────────────

type F = { k: NumericEsgKey; label: string; hint?: string };

const GROUPS: Array<{ title: string; note: string; fields: F[] }> = [
  { title: "Энергия и топливо", note: "По счетам поставщиков, счётчикам и путевым листам за период. Это основа расчёта выбросов Охватов 1 и 2.", fields: [
    { k: "electricityKwh", label: "Электроэнергия из сети, кВт·ч", hint: "сумма по счетам энергосбыта" },
    { k: "renewableKwh", label: "из неё подтверждённая ВИЭ, кВт·ч", hint: "своя СЭС или договор с подтверждением" },
    { k: "heatGcal", label: "Тепловая энергия, Гкал", hint: "счета теплосети" },
    { k: "vehiclePetrolL", label: "Бензин автопарка, л" },
    { k: "vehicleDieselL", label: "Дизель автопарка, л" },
    { k: "generatorDieselL", label: "Дизель генераторов и котлов, л" },
    { k: "gasM3", label: "Природный газ, м³" },
    { k: "coalT", label: "Уголь, т" },
  ] },
  { title: "Вода и отходы", note: "По водомерам и актам вывоза отходов.", fields: [
    { k: "waterM3", label: "Водопотребление, м³" },
    { k: "wasteT", label: "Образовано отходов, т" },
    { k: "wasteRecycledT", label: "из них на переработку, т" },
    { k: "hazardousWasteT", label: "из них опасных, т", hint: "люминесцентные лампы, масла, аккумуляторы" },
  ] },
  { title: "Персонал", note: "По кадровому учёту. Зарплата и взносы берутся из журнала автоматически.", fields: [
    { k: "employeesStart", label: "Численность на начало периода" },
    { k: "employees", label: "Численность на конец периода" },
    { k: "women", label: "из них женщин" },
    { k: "managers", label: "Руководителей" },
    { k: "womenManagers", label: "из них женщин" },
    { k: "under30", label: "Возраст до 30 лет" },
    { k: "age30to50", label: "30–50 лет" },
    { k: "over50", label: "старше 50 лет" },
    { k: "contractors", label: "По договорам ГПХ" },
    { k: "hires", label: "Принято за период" },
    { k: "leavers", label: "Уволилось за период" },
    { k: "nationalAvgWage", label: "Средняя зарплата по КР, сом", hint: "Нацстатком: январь–май 2026 — около 51 900" },
  ] },
  { title: "Обучение и охрана труда", note: "Если человеко-часы не указаны, они оцениваются как среднесписочная × рабочие дни × 8.", fields: [
    { k: "trainingHours", label: "Часов обучения всего" },
    { k: "employeesTrained", label: "Сотрудников обучено" },
    { k: "hoursWorked", label: "Отработано человеко-часов", hint: "из табеля" },
    { k: "workDays", label: "Рабочих дней в периоде", hint: "0 — посчитать автоматически" },
    { k: "injuries", label: "Несчастных случаев" },
    { k: "lostDays", label: "Дней нетрудоспособности" },
  ] },
  { title: "Поездки (Охват 3)", note: "Категория 7 — дорога сотрудников на работу; категория 6 — командировки.", fields: [
    { k: "commuteKmOneWay", label: "Дорога до работы в одну сторону, км" },
    { k: "commuteShareCar", label: "Доля на личном авто, %" },
    { k: "commuteSharePublic", label: "Доля на общественном транспорте, %" },
    { k: "businessAirKm", label: "Авиаперелёты, пасс.-км" },
    { k: "businessRailKm", label: "Железная дорога, пасс.-км" },
    { k: "businessCarKm", label: "Автомобиль в командировках, км" },
  ] },
  { title: "Управление и деловая этика", note: "Орган управления — совет директоров, наблюдательный совет или общее собрание участников.", fields: [
    { k: "boardMembers", label: "Членов органа управления" },
    { k: "independentBoard", label: "из них независимых" },
    { k: "womenBoard", label: "из них женщин" },
    { k: "corruptionCases", label: "Подтверждённых случаев коррупции" },
    { k: "discriminationCases", label: "Обращений о дискриминации" },
    { k: "dataBreaches", label: "Утечек персональных данных" },
    { k: "customerComplaints", label: "Жалоб клиентов" },
    { k: "localSuppliersPct", label: "Закупки у поставщиков КР, %" },
    { k: "donations", label: "Благотворительность, сом" },
  ] },
  { title: "Цель по выбросам", note: "Ориентир — сокращение на 4,2% в год (траектория 1,5 °C).", fields: [
    { k: "emissionTargetPct", label: "Сократить Охваты 1+2 на, %" },
    { k: "emissionTargetYear", label: "к году" },
  ] },
];

const FACTORS: F[] = [
  { k: "gridFactor", label: "Электросеть, кг CO₂/кВт·ч" },
  { k: "heatFactor", label: "Тепло, кг CO₂/Гкал" },
  { k: "petrolFactor", label: "Бензин, кг CO₂/л" },
  { k: "dieselFactor", label: "Дизель, кг CO₂/л" },
  { k: "gasFactor", label: "Газ, кг CO₂/м³" },
  { k: "coalFactor", label: "Уголь, кг CO₂/т", hint: "0 — по типу угля" },
  { k: "carFactor", label: "Автомобиль, кг CO₂/км" },
  { k: "busFactor", label: "Автобус, кг CO₂/пасс.-км" },
  { k: "airFactor", label: "Самолёт, кг CO₂/пасс.-км" },
  { k: "railFactor", label: "Поезд, кг CO₂/пасс.-км" },
];

const POLICIES: Array<[BooleanEsgKey, string]> = [
  ["antiCorruptionPolicy", "Антикоррупционная политика"],
  ["codeOfConduct", "Кодекс этики"],
  ["environmentalPolicy", "Экологическая политика"],
  ["hrPolicy", "Кадровая политика (равные возможности, охрана труда)"],
  ["dataProtectionPolicy", "Политика защиты персональных данных"],
];

const field = "w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 p-5 shadow-card sm:p-6";

interface Loaded {
  company: CompanyInfo;
  statements: Statements;
  previous: Statements;
  prevEsg: EsgInput | null;
  savedEsg: boolean;
}

export default function EsgPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<Loaded | null>(null);
  const [input, setInput] = useState<EsgInput>(EMPTY_ESG);
  const [demo, setDemo] = useState(false);
  const [tab, setTab] = useState<"report" | "data">("report");
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pending, setPending] = useState<FormatKey | null>(null);
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
      setData({ company: body.company, statements: body.statements, previous: body.previous, prevEsg: body.prevEsg ? normalizeEsgInput(body.prevEsg) : null, savedEsg: !!body.esg });
      setDemo(body.demo);
      setInput(body.esg ? normalizeEsgInput(body.esg) : { ...EMPTY_ESG });
      setDirty(false);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить данные");
      setData(null);
    }
  }, [companyId, period]);

  useEffect(() => { load(); }, [load]);

  // The report is rebuilt on every edit — the same builder the PDF/Word export uses.
  const doc = useMemo(() => {
    if (!data || !period) return null;
    const hasAny = data.savedEsg || dirty || demo;
    return buildEsgReport({
      company: data.company, period, statements: data.statements, previous: data.previous,
      esg: hasAny ? input : null, prevEsg: data.prevEsg,
    });
  }, [data, period, input, dirty, demo]);

  const set = <K extends keyof EsgInput>(k: K, v: EsgInput[K]) => { setInput((s) => ({ ...s, [k]: v })); setDirty(true); };
  const setNum = (k: NumericEsgKey, raw: string) => {
    const v = Number(raw.replace(/\s/g, "").replace(",", "."));
    set(k, (Number.isFinite(v) && v >= 0 ? v : 0) as never);
  };

  async function save() {
    if (!period) return;
    setSaving(true);
    const res = await fetch("/api/esg", {
      method: "PUT", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId, ...period, data: input }),
    });
    const body = await res.json().catch(() => ({}));
    setSaving(false);
    if (!res.ok) { toast.show(body.error ?? "Не удалось сохранить", "error"); return; }
    toast.show("Данные ESG сохранены");
    setDirty(false);
    setData((d) => (d ? { ...d, savedEsg: true } : d));
  }

  async function download(format: FormatKey) {
    if (!period) return;
    setPending(format);
    try {
      const qs = new URLSearchParams({ companyId, from: period.from, to: period.to, package: "esg", format });
      const useScreen = dirty || demo;
      const res = await fetch(`/api/export?${qs}`, useScreen
        ? { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ esg: input }) }
        : undefined);
      if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? "Не удалось сформировать отчёт");
      const blob = await res.blob();
      const m = (res.headers.get("Content-Disposition") ?? "").match(/filename\*=UTF-8''([^;]+)/);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = m ? decodeURIComponent(m[1]) : `esg.${format}`;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      toast.show(e.message, "error");
    } finally {
      setPending(null);
    }
  }

  const topics = useMemo(() => scoreTopics(input.industry, input.materiality), [input.industry, input.materiality]);
  const defaults = useMemo(() => scoreTopics(input.industry, {}), [input.industry]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <p className="text-xs font-semibold uppercase tracking-wider text-fl-gold">GRI 2021 · IFRS S1/S2 · GHG Protocol</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-fl-cream sm:text-4xl">Отчёт об устойчивом развитии</h1>
        <p className="mt-2 max-w-3xl text-sm text-fl-cream/60">
          Полный ESG-отчёт: резюме, анализ выбросов, энергии, персонала и управления, рекомендации и приложения с методикой.
          У каждого показателя — сноска с формулой и источником. Денежные данные берутся из журнала, нефинансовые — из вкладки «Данные для отчёта».
        </p>
      </header>

      <section className="mb-5 flex flex-col gap-3 lg:flex-row lg:items-end">
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
        {doc && (
          <div className="flex flex-wrap gap-2 lg:ml-auto">
            {(["pdf", "docx", "xlsx"] as FormatKey[]).map((f) => (
              <button
                key={f}
                onClick={() => download(f)}
                disabled={pending !== null}
                className={f === "pdf"
                  ? "rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent shadow-card hover:bg-fl-accent-hover disabled:opacity-50"
                  : "rounded-lg border border-fl-line bg-fl-charcoal-2 px-3.5 py-2 text-sm font-medium text-fl-cream shadow-card hover:border-fl-gold/40 disabled:opacity-50"}
              >
                {pending === f ? "Готовлю…" : f === "pdf" ? "Скачать PDF" : f === "docx" ? "Word" : "Excel"}
              </button>
            ))}
          </div>
        )}
      </section>

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}

      {doc && (
        <>
          <div role="tablist" className="mb-5 inline-flex rounded-xl border border-fl-line bg-fl-charcoal-2 p-1 shadow-card">
            {([["report", "Отчёт"], ["data", "Данные для отчёта"]] as const).map(([k, label]) => (
              <button
                key={k}
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${tab === k ? "bg-fl-accent text-fl-on-accent" : "text-fl-cream/70 hover:text-fl-cream"}`}
              >
                {label}{k === "data" && dirty ? " •" : ""}
              </button>
            ))}
          </div>

          {tab === "report" ? (
            <div className="grid grid-cols-1 gap-6 lg:grid-cols-[230px_1fr]">
              <nav aria-label="Содержание отчёта" className="hidden lg:block">
                <div className="sticky top-20 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card">
                  <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-fl-cream/50">Содержание</p>
                  <ol className="space-y-1 text-sm">
                    {doc.sections.map((s, i) => (
                      <li key={s.title}>
                        <a href={`#${sectionId(i)}`} className="flex gap-2 rounded-md px-1.5 py-1 text-fl-cream/75 hover:bg-fl-surface-2 hover:text-fl-cream">
                          <span className="num w-5 shrink-0 text-fl-cream/40">{i + 1}</span>
                          <span className="leading-snug">{s.title.replace(/^Приложение \d+\. /, "")}</span>
                        </a>
                      </li>
                    ))}
                  </ol>
                </div>
              </nav>
              <div className="min-w-0 space-y-6">
                <Cover title={doc.title} company={doc.company} subtitle={doc.subtitle ?? ""} regime={doc.regime} />
                {doc.disclaimer && <Notice>{doc.disclaimer}</Notice>}
                <ReportView doc={doc} />
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              <p className="text-sm text-fl-cream/60">
                {demo
                  ? "У демо-компании данные заполнены. Меняйте их — отчёт и скачиваемые файлы пересчитаются сразу. Сохранить демо нельзя."
                  : "Данные сохраняются отдельно для каждого периода. Отчёт пересчитывается сразу; файлы скачиваются с данными, которые на экране."}
              </p>

              <section className={card}>
                <h2 className="font-display text-lg font-semibold text-fl-cream">Профиль и тексты</h2>
                <div className="mt-4 grid gap-4 sm:grid-cols-2">
                  <label className="text-xs text-fl-cream/60">
                    Отрасль
                    <select value={input.industry} onChange={(e) => set("industry", e.target.value as Industry)} className={`${field} mt-1`}>
                      {(Object.keys(INDUSTRY_LABEL) as Industry[]).map((k) => <option key={k} value={k}>{INDUSTRY_LABEL[k]}</option>)}
                    </select>
                  </label>
                  <label className="text-xs text-fl-cream/60">
                    Регион
                    <input value={input.region} onChange={(e) => set("region", e.target.value)} placeholder="например, г. Бишкек" className={`${field} mt-1`} />
                  </label>
                  <label className="text-xs text-fl-cream/60 sm:col-span-2">
                    Ответственный за ESG (должность)
                    <input value={input.esgOwner} onChange={(e) => set("esgOwner", e.target.value)} placeholder="например, финансовый директор" className={`${field} mt-1`} />
                  </label>
                  <label className="text-xs text-fl-cream/60 sm:col-span-2">
                    О компании — деятельность, продукция, клиенты, цепочка поставок
                    <textarea rows={5} value={input.companyDescription} onChange={(e) => set("companyDescription", e.target.value)} className={`${field} mt-1 leading-relaxed`} placeholder="Абзацы разделяйте пустой строкой. Пусто — короткий профиль по отрасли и режиму." />
                  </label>
                  <label className="text-xs text-fl-cream/60 sm:col-span-2">
                    Обращение руководителя
                    <textarea rows={5} value={input.ceoMessage} onChange={(e) => set("ceoMessage", e.target.value)} className={`${field} mt-1 leading-relaxed`} placeholder="Пусто — в отчёт попадёт черновик, собранный по цифрам отчёта." />
                  </label>
                </div>
              </section>

              <div className="grid gap-5 lg:grid-cols-2">
                {GROUPS.map((g) => (
                  <section key={g.title} className={card}>
                    <h2 className="font-display text-lg font-semibold text-fl-cream">{g.title}</h2>
                    <p className="mt-1 text-xs text-fl-cream/55">{g.note}</p>
                    <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
                      {g.fields.map((f) => <NumField key={f.k} f={f} value={input[f.k]} onChange={setNum} />)}
                      {g.title === "Энергия и топливо" && (
                        <label className="text-xs text-fl-cream/60">
                          Тип угля
                          <select value={input.coalType} onChange={(e) => set("coalType", e.target.value as CoalType)} className={`${field} mt-1`}>
                            {(["coalBituminous", "coalSubBituminous", "coalLignite"] as CoalType[]).map((k) => <option key={k} value={k}>{FUELS[k].label}</option>)}
                          </select>
                        </label>
                      )}
                    </div>
                  </section>
                ))}
                <section className={card}>
                  <h2 className="font-display text-lg font-semibold text-fl-cream">Политики компании</h2>
                  <p className="mt-1 text-xs text-fl-cream/55">Отметьте документы, утверждённые приказом или решением участников.</p>
                  <div className="mt-3 space-y-1">
                    {POLICIES.map(([k, label]) => (
                      <label key={k} className="flex items-center gap-2.5 py-1 text-sm text-fl-cream/85">
                        <input type="checkbox" className="h-4 w-4 accent-[rgb(var(--c-accent))]" checked={Boolean(input[k])} onChange={(e) => set(k, e.target.checked)} />
                        {label}
                      </label>
                    ))}
                  </div>
                </section>
              </div>

              <section className={card}>
                <h2 className="font-display text-lg font-semibold text-fl-cream">Существенные темы</h2>
                <p className="mt-1 max-w-3xl text-xs text-fl-cream/55">
                  Двойная существенность: воздействие компании на людей и среду и влияние темы на финансы компании, от 1 до 5.
                  По умолчанию — типовые оценки для отрасли; поставьте свои по итогам опроса сотрудников, клиентов и партнёров.
                </p>
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[560px] text-sm">
                    <thead>
                      <tr className="text-left text-xs text-fl-cream/55">
                        <th className="py-2 pr-3 font-medium">Тема</th>
                        <th className="px-2 py-2 font-medium">Воздействие</th>
                        <th className="px-2 py-2 font-medium">Фин. значимость</th>
                        <th className="px-2 py-2 text-right font-medium">Итог</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-fl-line">
                      {TOPICS.map((t) => {
                        const cur = topics.find((x) => x.key === t.key)!;
                        const def = defaults.find((x) => x.key === t.key)!;
                        const setScore = (axis: "impact" | "financial", v: number) => {
                          const next = { ...input.materiality };
                          const base = next[t.key] ?? { impact: def.impact, financial: def.financial };
                          next[t.key] = { ...base, [axis]: v };
                          set("materiality", next);
                        };
                        return (
                          <tr key={t.key}>
                            <td className="py-2 pr-3 text-fl-cream/85"><span className="mr-2 text-xs font-semibold text-fl-gold">{t.pillar}</span>{t.title}</td>
                            {(["impact", "financial"] as const).map((axis) => (
                              <td key={axis} className="px-2 py-1.5">
                                <select value={cur[axis]} onChange={(e) => setScore(axis, Number(e.target.value))} className={`${field} w-20 py-1`}>
                                  {[1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
                                </select>
                              </td>
                            ))}
                            <td className="num px-2 py-2 text-right font-semibold text-fl-cream">{cur.total.toLocaleString("ru-RU")}{cur.custom ? "" : <span className="ml-1 text-xs font-normal text-fl-cream/40">типовая</span>}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {Object.keys(input.materiality).length > 0 && (
                  <button onClick={() => set("materiality", {})} className="mt-3 text-sm text-fl-info hover:underline">Вернуть типовые оценки</button>
                )}
              </section>

              <section className={card}>
                <h2 className="font-display text-lg font-semibold text-fl-cream">Коэффициенты выбросов</h2>
                <p className="mt-1 max-w-3xl text-xs text-fl-cream/55">
                  По умолчанию — IPCC 2006, Ember/OWID (сеть КР), DEFRA. Меняйте, только если есть данные поставщика или паспорт топлива — в отчёте будет отмечено, что коэффициент задан компанией.
                </p>
                <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
                  {FACTORS.map((f) => <NumField key={f.k} f={f} value={input[f.k]} onChange={setNum} />)}
                </div>
                <button
                  onClick={() => { setInput((s) => ({ ...s, ...DEFAULT_FACTORS, coalFactor: 0 })); setDirty(true); }}
                  className="mt-3 text-sm text-fl-info hover:underline"
                >
                  Вернуть значения по умолчанию
                </button>
              </section>
            </div>
          )}

          {!demo && (dirty || tab === "data") && (
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-fl-line bg-fl-charcoal-2/95 backdrop-blur">
              <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
                <p className="text-sm text-fl-cream/60">{dirty ? "Есть несохранённые изменения" : "Все данные сохранены"}</p>
                <button
                  onClick={save}
                  disabled={!dirty || saving}
                  className="ml-auto rounded-lg bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40"
                >
                  {saving ? "Сохраняю…" : "Сохранить данные ESG"}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

function NumField({ f, value, onChange }: { f: F; value: number; onChange: (k: NumericEsgKey, raw: string) => void }) {
  // Keep the raw text while typing so "1," or "0.0" can be entered.
  const [text, setText] = useState(String(value ?? 0).replace(".", ","));
  const [focused, setFocused] = useState(false);
  useEffect(() => { if (!focused) setText(String(value ?? 0).replace(".", ",")); }, [value, focused]);
  return (
    <label className="text-xs text-fl-cream/60">
      {f.label}
      <input
        inputMode="decimal"
        value={text}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        onChange={(e) => { setText(e.target.value); onChange(f.k, e.target.value); }}
        className={`${field} num mt-1 text-right`}
      />
      {f.hint && <span className="mt-0.5 block text-[11px] text-fl-cream/40">{f.hint}</span>}
    </label>
  );
}

function Cover({ title, company, subtitle, regime }: { title: string; company: string; subtitle: string; regime: string }) {
  return (
    <section className="relative overflow-hidden rounded-2xl border border-fl-line bg-fl-charcoal-2 px-6 py-8 shadow-card sm:px-10 sm:py-12">
      <div className="absolute inset-x-0 top-0 h-1.5 bg-fl-gold" aria-hidden />
      <p className="text-sm text-fl-cream/60">{company}</p>
      <h2 className="mt-2 font-display text-3xl font-bold text-fl-cream sm:text-4xl">{title}</h2>
      <p className="mt-2 text-lg font-medium text-fl-gold">{subtitle}</p>
      <p className="mt-6 text-xs text-fl-cream/50">Налоговый режим: {regime}</p>
    </section>
  );
}
