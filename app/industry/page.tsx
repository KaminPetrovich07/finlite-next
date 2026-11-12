"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { ruleText, status, type Metric } from "@/lib/industry/common";
import { BANK_FIELDS, bankMetrics, bankStress } from "@/lib/industry/bank";
import { insurerMetrics, insurerStress, mack, parseTriangle } from "@/lib/industry/insurance";
import { execution, publicMetrics, type BudgetLine } from "@/lib/industry/public";
import type { BankData, InsurerData, PublicData } from "@/lib/industry/samples";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const m0 = (v: number) => formatNumber(v, 0);
const p2 = (v: number | null) => (v === null ? "—" : `${v.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} %`);
type Sector = "bank" | "insurer" | "public";
const TITLE: Record<Sector, string> = { bank: "Банк", insurer: "Страховщик", public: "Госсектор" };

function Num({ value, onChange, className = "" }: { value: number; onChange: (v: number) => void; className?: string }) {
  const [t, setT] = useState(value ? formatNumber(value, 0) : "");
  useEffect(() => { setT(value ? formatNumber(value, 0) : ""); }, [value]);
  return <input inputMode="decimal" value={t} onChange={(e) => setT(e.target.value)} onBlur={() => onChange(parseFormattedNumber(t))} className={`${field} num text-right ${className}`} />;
}

function Metrics({ list, title }: { list: Metric[]; title: string }) {
  return (
    <section className={`${card} overflow-x-auto`}>
      <h2 className="border-b border-fl-line px-4 py-3 font-display text-lg font-semibold text-fl-cream">{title}</h2>
      <table className="w-full min-w-[640px] text-sm">
        <tbody>
          {list.map((x) => {
            const st = status(x);
            return (
              <tr key={x.key} className="border-t border-fl-line/60 first:border-t-0">
                <td className="px-4 py-2 text-fl-cream/85">{x.title}{x.source && <span className="block text-[11px] text-fl-cream/40">{x.source}</span>}</td>
                <td className="num whitespace-nowrap px-4 py-2 text-right font-semibold text-fl-cream">{x.value === null ? "—" : x.unit === "сом" ? m0(x.value) : `${x.value.toLocaleString("ru-RU", { maximumFractionDigits: 2 })} ${x.unit}`}</td>
                <td className="whitespace-nowrap px-4 py-2 text-right text-xs text-fl-cream/55">{ruleText(x.rule, x.unit === "сом" ? " сом" : " %")}</td>
                <td className="w-28 px-4 py-2 text-right">{st !== "na" && <span className={`rounded-full px-2 py-0.5 text-xs ${st === "ok" ? "bg-fl-green/15 text-fl-green" : "bg-fl-red/15 text-fl-red"}`}>{st === "ok" ? "выполнен" : "нарушен"}</span>}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </section>
  );
}

function Slider({ label, value, min, max, step = 1, unit = "%", onChange }: { label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }) {
  return (
    <label className="block text-sm">
      <span className="flex justify-between text-xs text-fl-cream/60"><span>{label}</span><span className="num text-fl-cream">{value}{unit}</span></span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[rgb(var(--c-gold-fill))]" />
    </label>
  );
}

export default function IndustryPage() {
  const { companies, companyId, setCompanyId, loaded } = useCompanies();
  const [sector, setSector] = useState<Sector>("insurer");
  const [state, setState] = useState<{ sector: Sector; data: any } | null>(null);
  // data belongs to the sector it was loaded for — never render one sector's numbers in another's view
  const data = state && state.sector === sector ? state.data : null;
  const setData = (x: any) => setState({ sector, data: x });
  const [sample, setSample] = useState(true);
  const [readOnly, setReadOnly] = useState(true);
  const [saving, setSaving] = useState(false);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    if (!companyId) return;
    const r = await fetch(`/api/industry?companyId=${encodeURIComponent(companyId)}&sector=${sector}`);
    const b = await r.json();
    if (r.ok) { setState({ sector, data: b.data }); setSample(b.sample); setReadOnly(b.readOnly); } else show(b.error, "error");
  }, [companyId, sector]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);

  async function save() {
    setSaving(true);
    try {
      const r = await fetch("/api/industry", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, sector, data }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setSample(false); show("Данные сохранены");
    } catch (e: any) { show(e.message, "error"); } finally { setSaving(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Отраслевые расширения</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Анализ и нормативы для организаций, которые ведут основной учёт в своих системах: банк — экономические нормативы НБКР
          и стресс-тест; страховщик — резервы по методу Мака, коэффициенты и стресс-тест капитала; госсектор — исполнение
          бюджета по МСФОГС (IPSAS) 24. Введите показатели из отчётности — расчёт обновляется сразу. Пороги можно изменить.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Организация</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить организацию…</option>
          </select></label>
        <div className="flex gap-1.5">
          {(Object.keys(TITLE) as Sector[]).map((s) => <button key={s} type="button" onClick={() => setSector(s)} className={`rounded-lg px-4 py-2 text-sm ${sector === s ? "bg-fl-gold/20 font-semibold text-fl-gold" : "border border-fl-line text-fl-cream/70 hover:text-fl-cream"}`}>{TITLE[s]}</button>)}
        </div>
        {!readOnly && <button type="button" onClick={save} disabled={saving || !data} className="ml-auto rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{saving ? "Сохраняю…" : "Сохранить данные"}</button>}
      </div>
      {sample && data && <p className="mb-4 rounded-lg border border-fl-gold/40 bg-fl-gold/10 px-4 py-2 text-sm text-fl-cream/80">Сейчас показан учебный пример. Замените цифры своими и нажмите «Сохранить данные».</p>}

      {data && sector === "bank" && <BankView d={data as BankData} set={setData} />}
      {data && sector === "insurer" && <InsurerView d={data as InsurerData} set={setData} />}
      {data && sector === "public" && <PublicView d={data as PublicData} set={setData} />}
    </main>
  );
}

function BankView({ d, set }: { d: BankData; set: (x: BankData) => void }) {
  const r = useMemo(() => bankMetrics(d.input, d.limits), [d]);
  const s = useMemo(() => bankStress(d.input, d.stress, d.limits), [d]);
  const groups = [...new Set(BANK_FIELDS.map((f) => f.group))];
  const setIn = (k: string, v: number) => set({ ...d, input: { ...d.input, [k]: v } });
  return (
    <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
      <section className={`${card} space-y-4 p-4`}>
        <p className="text-xs text-fl-cream/50">Суммы в сомах на отчётную дату.</p>
        {groups.map((g) => (
          <div key={g}>
            <h3 className="mb-1.5 text-sm font-semibold text-fl-cream">{g}</h3>
            <div className="space-y-1.5">{BANK_FIELDS.filter((f) => f.group === g).map((f) => (
              <label key={f.key} className="grid grid-cols-[1fr_140px] items-center gap-2 text-xs text-fl-cream/70">{f.label}<Num value={d.input[f.key] as number} onChange={(v) => setIn(f.key, v)} className="py-1 text-xs" /></label>
            ))}</div>
          </div>
        ))}
        <div>
          <h3 className="mb-1.5 text-sm font-semibold text-fl-cream">Открытые валютные позиции</h3>
          <p className="mb-1.5 text-[11px] text-fl-cream/45">Длинная — плюс, короткая — минус, в сомах</p>
          {d.input.fxPositions.map((p, i) => (
            <div key={i} className="mb-1.5 grid grid-cols-[70px_1fr_24px] gap-2">
              <input value={p.code} onChange={(e) => set({ ...d, input: { ...d.input, fxPositions: d.input.fxPositions.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase().slice(0, 3) } : x)) } })} className={`${field} py-1 text-xs`} />
              <input inputMode="decimal" defaultValue={p.position} onBlur={(e) => set({ ...d, input: { ...d.input, fxPositions: d.input.fxPositions.map((x, j) => (j === i ? { ...x, position: Number(e.target.value.replace(/\s/g, "").replace(",", ".")) || 0 } : x)) } })} className={`${field} num py-1 text-right text-xs`} />
              <button type="button" onClick={() => set({ ...d, input: { ...d.input, fxPositions: d.input.fxPositions.filter((_, j) => j !== i) } })} className="text-fl-cream/40 hover:text-fl-red">×</button>
            </div>
          ))}
          <button type="button" onClick={() => set({ ...d, input: { ...d.input, fxPositions: [...d.input.fxPositions, { code: "", position: 0 }] } })} className="text-xs text-fl-gold">+ валюта</button>
        </div>
      </section>
      <div className="space-y-5">
        <p className="text-sm text-fl-cream/70">Суммарный капитал: <b className="num text-fl-cream">{m0(r.capital)}</b> сом. Нарушено нормативов: <b className={r.normatives.some((x) => status(x) === "breach") ? "text-fl-red" : "text-fl-green"}>{r.normatives.filter((x) => status(x) === "breach").length}</b> из {r.normatives.length}.</p>
        <Metrics list={r.normatives} title="Экономические нормативы НБКР" />
        <section className={`${card} p-4`}>
          <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Стресс-тест</h2>
          <div className="grid gap-3 sm:grid-cols-4">
            <Slider label="Рост проблемных кредитов, п.п." value={d.stress.nplShock} min={0} max={40} onChange={(v) => set({ ...d, stress: { ...d.stress, nplShock: v } })} unit="" />
            <Slider label="Потери при дефолте (LGD)" value={d.stress.lgd} min={10} max={100} onChange={(v) => set({ ...d, stress: { ...d.stress, lgd: v } })} />
            <Slider label="Девальвация сома" value={d.stress.fxShock} min={-30} max={60} onChange={(v) => set({ ...d, stress: { ...d.stress, fxShock: v } })} />
            <Slider label="Отток депозитов" value={d.stress.outflow} min={0} max={50} onChange={(v) => set({ ...d, stress: { ...d.stress, outflow: v } })} />
          </div>
          <table className="mt-4 w-full text-sm">
            <thead><tr className="text-xs text-fl-cream/50"><th className="py-1 text-left font-medium">Сценарий</th><th className="py-1 text-right font-medium">Потери капитала, сом<span className="block font-normal text-fl-cream/40">минус — доход</span></th><th className="py-1 text-right font-medium">К2.1 после</th><th className="py-1 text-right font-medium">К2.3 после</th></tr></thead>
            <tbody>{s.rows.map((x) => (
              <tr key={x.title} className="border-t border-fl-line/60"><td className="py-1.5 text-fl-cream/85">{x.title}</td><td className="num py-1.5 text-right">{m0(x.loss)}</td>
                <td className={`num py-1.5 text-right ${x.k21 !== null && x.k21 < d.limits.k21 ? "text-fl-red" : "text-fl-cream"}`}>{p2(x.k21)}</td>
                <td className={`num py-1.5 text-right ${x.k23 !== null && x.k23 < d.limits.k23 ? "text-fl-red" : "text-fl-cream"}`}>{p2(x.k23)}</td></tr>
            ))}</tbody>
          </table>
          <p className="mt-2 text-sm text-fl-cream/70">Ликвидность К3.1 после оттока {m0(s.run)} сом: <b className={s.k31AfterRun !== null && s.k31AfterRun < d.limits.k31 ? "text-fl-red" : "text-fl-cream"}>{p2(s.k31AfterRun)}</b></p>
          {s.breaches.length > 0 && <ul className="mt-2 list-disc pl-5 text-sm text-fl-red">{s.breaches.map((b) => <li key={b}>{b}</li>)}</ul>}
          <p className="mt-2 text-[11px] text-fl-cream/45">Упрощённая модель: потери уменьшают базовый капитал, активы, взвешенные по риску, не пересчитываются; длинная валютная позиция при девальвации даёт доход.</p>
        </section>
        <Metrics list={r.ratios} title="Финансовые показатели" />
        <details className={`${card} p-4 text-sm`}>
          <summary className="cursor-pointer text-fl-gold">Пороги нормативов</summary>
          <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{(Object.keys(d.limits) as Array<keyof BankData["limits"]>).map((k) => (
            <label key={k} className="block text-xs text-fl-cream/60">{k.toUpperCase().replace(/^K(\d)(\d)$/, "К$1.$2")}<Num value={d.limits[k]} onChange={(v) => set({ ...d, limits: { ...d.limits, [k]: v } })} className="mt-1 py-1 text-xs" /></label>
          ))}</div>
        </details>
      </div>
    </div>
  );
}

const INS_FIELDS: Array<[keyof InsurerData["input"], string]> = [
  ["gpw", "Брутто-премии подписанные"], ["npw", "Нетто-премии подписанные"], ["npwPrev", "Нетто-премии прошлого года"], ["npe", "Нетто-премии заработанные"],
  ["claims", "Убытки (нетто), включая изменение резервов"], ["expenses", "Аквизиционные и административные расходы"], ["investIncome", "Инвестиционный доход"],
  ["surplus", "Собственный капитал"], ["reservesBooked", "Резервы убытков в отчётности (нетто)"], ["liabilities", "Обязательства всего"],
  ["liquidAssets", "Ликвидные активы"], ["investedAssets", "Инвестиционные активы"],
];

function InsurerView({ d, set }: { d: InsurerData; set: (x: InsurerData) => void }) {
  const [tri, setTri] = useState(d.triangle);
  useEffect(() => setTri(d.triangle), [d.triangle]);
  const mk = useMemo(() => { try { return { r: mack(parseTriangle(d.triangle, d.incremental)), e: null }; } catch (e: any) { return { r: null, e: e.message as string }; } }, [d.triangle, d.incremental]);
  const metrics = useMemo(() => insurerMetrics(d.input, mk.r?.total.reserve ?? null, d.limits), [d, mk]);
  const st = useMemo(() => insurerStress(d.input, d.stress, mk.r?.total.q995 ?? null, mk.r?.total.reserve ?? null), [d, mk]);
  return (
    <div className="space-y-5">
      <div className="grid gap-5 lg:grid-cols-[360px_1fr]">
        <section className={`${card} space-y-1.5 p-4`}>
          <p className="mb-2 text-xs text-fl-cream/50">Показатели за год, сом.</p>
          {INS_FIELDS.map(([k, label]) => <label key={k} className="grid grid-cols-[1fr_140px] items-center gap-2 text-xs text-fl-cream/70">{label}<Num value={d.input[k]} onChange={(v) => set({ ...d, input: { ...d.input, [k]: v } })} className="py-1 text-xs" /></label>)}
        </section>
        <div className="space-y-5">
          <Metrics list={metrics} title="Коэффициенты страховщика" />
          <section className={`${card} p-4`}>
            <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Стресс-тест капитала</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              <Slider label="Рост убыточности, п.п." value={d.stress.lossShock} min={0} max={50} unit="" onChange={(v) => set({ ...d, stress: { ...d.stress, lossShock: v } })} />
              <Slider label="Падение стоимости инвестиций" value={d.stress.investLoss} min={0} max={50} onChange={(v) => set({ ...d, stress: { ...d.stress, investLoss: v } })} />
            </div>
            <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
              <p className="text-fl-cream/75">Дополнительные убытки: <span className="num text-fl-cream">{m0(st.extraClaims)}</span></p>
              <p className="text-fl-cream/75">Потери по инвестициям: <span className="num text-fl-cream">{m0(st.investHit)}</span></p>
              <p className="text-fl-cream/75">Добор резервов до 99,5 %-квантиля Мака: <span className="num text-fl-cream">{m0(st.reserveHit)}</span></p>
              <p className="text-fl-cream/75">Капитал после шоков: <span className={`num font-semibold ${st.surplusAfter < 0 ? "text-fl-red" : "text-fl-cream"}`}>{m0(st.surplusAfter)}</span></p>
              <p className="sm:col-span-2">НПК после шоков: <b className={st.npkAfter === null || st.npkAfter > d.limits.npwSurplus || st.surplusAfter <= 0 ? "text-fl-red" : "text-fl-green"}>{st.surplusAfter <= 0 ? "капитал исчерпан" : p2(st.npkAfter)}</b> при пороге {d.limits.npwSurplus} %</p>
            </div>
          </section>
        </div>
      </div>

      <section className={`${card} p-4`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Резервы убытков по методу Мака</h2>
        <p className="mt-1 text-xs text-fl-cream/55">Вставьте треугольник из Excel: строки — годы наступления (старые сверху), столбцы — годы развития. Пример — классический треугольник Taylor–Ashe из работы Mack (1993).</p>
        <div className="mt-3 grid gap-4 lg:grid-cols-[1fr_1fr]">
          <div>
            <textarea rows={10} value={tri} onChange={(e) => setTri(e.target.value)} onBlur={() => set({ ...d, triangle: tri })} className={`${field} font-mono text-xs`} />
            <label className="mt-2 flex items-center gap-2 text-sm text-fl-cream/80"><input type="checkbox" checked={d.incremental} onChange={(e) => set({ ...d, incremental: e.target.checked })} />Значения по годам развития (не накопленные)</label>
          </div>
          {mk.e ? <p className="text-sm text-fl-red">{mk.e}</p> : mk.r && (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead><tr className="text-fl-cream/50"><th className="py-1 text-left font-medium">Год</th><th className="py-1 text-right font-medium">Известно</th><th className="py-1 text-right font-medium">Резерв</th><th className="py-1 text-right font-medium">Ст. ошибка</th><th className="py-1 text-right font-medium">CV</th></tr></thead>
                <tbody>{mk.r.rows.map((x, i) => (
                  <tr key={i} className="border-t border-fl-line/50"><td className="py-1">{i + 1}</td><td className="num py-1 text-right">{m0(x.latest)}</td><td className="num py-1 text-right">{m0(x.reserve)}</td><td className="num py-1 text-right">{m0(x.se)}</td><td className="num py-1 text-right">{x.cv === null ? "—" : `${(x.cv * 100).toFixed(1)} %`}</td></tr>
                ))}</tbody>
                <tfoot><tr className="border-t-2 border-fl-gold/40 font-semibold text-fl-cream"><td className="py-1">Итого</td><td className="num py-1 text-right">{m0(mk.r.total.latest)}</td><td className="num py-1 text-right">{m0(mk.r.total.reserve)}</td><td className="num py-1 text-right">{m0(mk.r.total.se)}</td><td className="num py-1 text-right">{mk.r.total.cv === null ? "—" : `${(mk.r.total.cv * 100).toFixed(1)} %`}</td></tr></tfoot>
              </table>
              <p className="mt-2 text-sm text-fl-cream/80">Квантили резерва (логнормальное приближение): 95 % — <b className="num">{m0(mk.r.total.q95)}</b>, 99,5 % — <b className="num">{m0(mk.r.total.q995)}</b>.</p>
              <p className="mt-1 text-[11px] text-fl-cream/45">Факторы развития: {mk.r.factors.map((f) => f.toFixed(3)).join(" · ")}</p>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

function PublicView({ d, set }: { d: PublicData; set: (x: PublicData) => void }) {
  const e = useMemo(() => execution(d.lines), [d]);
  const metrics = useMemo(() => publicMetrics(d.lines, d.extra), [d]);
  const setLine = (i: number, patch: Partial<BudgetLine>) => set({ ...d, lines: d.lines.map((l, j) => (j === i ? { ...l, ...patch } : l)) });
  return (
    <div className="space-y-5">
      <section className={`${card} overflow-x-auto`}>
        <h2 className="border-b border-fl-line px-4 py-3 font-display text-lg font-semibold text-fl-cream">Сопоставление бюджетных и фактических сумм (IPSAS 24)</h2>
        <table className="w-full min-w-[1040px] text-sm">
          <thead><tr className="text-xs text-fl-cream/50">{["Код", "Статья", "Вид", "Утверждено", "Уточнено", "Факт", "Отклонение", "%", ""].map((h, i) => <th key={i} className={`px-2 py-2 font-medium ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {e.rows.map((l, i) => (
              <tr key={i} className="border-t border-fl-line/60">
                <td className="px-2 py-1"><input value={l.code} onChange={(x) => setLine(i, { code: x.target.value })} className={`${field} w-16 py-1 text-xs`} /></td>
                <td className="px-2 py-1"><input value={l.name} title={l.name} onChange={(x) => setLine(i, { name: x.target.value })} className={`${field} min-w-[220px] py-1 text-xs`} /></td>
                <td className="px-2 py-1"><select value={l.kind} onChange={(x) => setLine(i, { kind: x.target.value as BudgetLine["kind"] })} className={`${field} py-1 text-xs`}><option value="revenue">доход</option><option value="expense">расход</option></select>
                  {l.kind === "revenue" && <label className="mt-0.5 flex items-center gap-1 text-[10px] text-fl-cream/55"><input type="checkbox" checked={!!l.own} onChange={(x) => setLine(i, { own: x.target.checked })} />собственный</label>}</td>
                <td className="px-2 py-1"><Num value={l.original} onChange={(v) => setLine(i, { original: v })} className="w-32 py-1 text-xs" /></td>
                <td className="px-2 py-1"><Num value={l.final} onChange={(v) => setLine(i, { final: v })} className="w-32 py-1 text-xs" /></td>
                <td className="px-2 py-1"><Num value={l.actual} onChange={(v) => setLine(i, { actual: v })} className="w-32 py-1 text-xs" /></td>
                <td className={`num px-2 py-1 text-right text-xs ${l.diff < 0 ? "text-fl-red" : "text-fl-cream/70"}`}>{m0(l.diff)}</td>
                <td className="num whitespace-nowrap px-2 py-1 text-right text-xs">{p2(l.pct)}</td>
                <td className="px-2 py-1"><button type="button" onClick={() => set({ ...d, lines: d.lines.filter((_, j) => j !== i) })} className="text-fl-cream/40 hover:text-fl-red">×</button></td>
              </tr>
            ))}
          </tbody>
          <tfoot className="text-sm font-semibold text-fl-cream">
            <tr className="border-t-2 border-fl-gold/40"><td /><td className="px-2 py-1.5">Доходы</td><td /><td className="num px-2 text-right">{m0(e.rev.original)}</td><td className="num px-2 text-right">{m0(e.rev.final)}</td><td className="num px-2 text-right">{m0(e.rev.actual)}</td><td colSpan={3} /></tr>
            <tr><td /><td className="px-2 py-1.5">Расходы</td><td /><td className="num px-2 text-right">{m0(e.exp.original)}</td><td className="num px-2 text-right">{m0(e.exp.final)}</td><td className="num px-2 text-right">{m0(e.exp.actual)}</td><td colSpan={3} /></tr>
            <tr><td /><td className="px-2 py-1.5">Профицит (+) / дефицит (−)</td><td /><td /><td className="num px-2 text-right">{m0(e.balance.final)}</td><td className="num px-2 text-right">{m0(e.balance.actual)}</td><td colSpan={3} /></tr>
          </tfoot>
        </table>
        <button type="button" onClick={() => set({ ...d, lines: [...d.lines, { code: "", name: "", kind: "expense", original: 0, final: 0, actual: 0 }] })} className="m-3 text-sm text-fl-gold">+ строка</button>
      </section>
      <div className="grid gap-5 lg:grid-cols-[320px_1fr]">
        <section className={`${card} space-y-1.5 p-4`}>
          {([["payables", "Кредиторская задолженность"], ["overduePayables", "в т. ч. просроченная"], ["receivables", "Дебиторская задолженность"], ["staffCost", "Расходы на оплату труда"]] as Array<[keyof PublicData["extra"], string]>).map(([k, label]) => (
            <label key={k} className="grid grid-cols-[1fr_130px] items-center gap-2 text-xs text-fl-cream/70">{label}<Num value={d.extra[k]} onChange={(v) => set({ ...d, extra: { ...d.extra, [k]: v } })} className="py-1 text-xs" /></label>
          ))}
        </section>
        <Metrics list={metrics} title="Показатели исполнения" />
      </div>
    </div>
  );
}
