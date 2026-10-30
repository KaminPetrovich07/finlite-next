"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Info } from "@/components/Info";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { normMaterials, OVERHEAD_LABEL, type CostingResult, type Product } from "@/lib/costing/calc";
import { COSTING_METHOD, OVERHEAD_BASE } from "@/lib/policy/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const C = { materials: "#2a78d6", labor: "#1baf7a", social: "#eda100", overhead: "#eb6834" };

const newProduct = (): Product => ({ id: `p${Date.now().toString(36)}`, name: "", unit: "шт.", price: 0, laborPerUnit: 0, machineHours: 0, materials: [{ name: "", unit: "", qty: 0, price: 0 }] });

export default function CostingPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [products, setProducts] = useState<Product[]>([]);
  const [outputs, setOutputs] = useState<Record<string, number>>({});
  const [result, setResult] = useState<CostingResult | null>(null);
  const [demo, setDemo] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  useEffect(() => {
    if (!companyId || !period) return;
    setError(null);
    fetch(`/api/costing?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить"); return b; })
      .then((b) => { setProducts(b.products); setOutputs(b.outputs); setResult(b.result); setDemo(b.demo); setDirty(false); })
      .catch((e) => { setError(e.message); setResult(null); });
  }, [companyId, period]);

  // live recalculation of what is on screen
  const recalc = useCallback((ps: Product[], os: Record<string, number>) => {
    if (!period) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(async () => {
      try {
        const r = await fetch("/api/costing/calc", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from: period.from, to: period.to, products: ps, outputs: os }) });
        const b = await r.json();
        if (r.ok) setResult(b.result);
      } catch { /* keep the last result */ }
    }, 350);
  }, [companyId, period]);

  const updProducts = (ps: Product[]) => { setProducts(ps); setDirty(true); recalc(ps, outputs); };
  const updOutput = (id: string, v: number) => { const os = { ...outputs, [id]: v }; setOutputs(os); setDirty(true); recalc(products, os); };
  const updP = (id: string, patch: Partial<Product>) => updProducts(products.map((p) => (p.id === id ? { ...p, ...patch } : p)));

  async function save() {
    if (!period) return;
    setBusy("save");
    try {
      const r = await fetch("/api/costing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from: period.from, to: period.to, products, outputs }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось сохранить");
      setProducts(b.products); setOutputs(b.outputs); setResult(b.result); setDirty(false);
      show("Нормы и выпуск сохранены");
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  async function download(format: "pdf" | "docx", productId?: string) {
    if (!period) return;
    const key = `${format}:${productId ?? "all"}`;
    setBusy(key);
    try { await downloadPost(`/api/costing/export?format=${format}`, { companyId, from: period.from, to: period.to, products, outputs, productId }, `Калькуляция.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const pools = result?.pools;
  const poolTotal = pools ? pools.materials + pools.labor + pools.social + pools.overhead : 0;
  const chart = (result?.products ?? []).map((p) => ({ name: p.name.length > 18 ? `${p.name.slice(0, 17)}…` : p.name, Материалы: p.unit_.materials, "Оплата труда": p.unit_.labor, "Взносы СФ": p.unit_.social, ОПР: p.unit_.overhead, price: p.price }));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Калькуляция себестоимости</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Фактические затраты на производство берутся из журнала проводок, а распределяются по изделиям по нормам расхода и
          базе из учётной политики. Видно, сколько стоит каждая единица, где перерасход против норм и какие изделия
          продаются с малой маржой.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px] py-2`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-fl-cream/55">Период калькуляции</span>
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
      </div>
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      {result && pools && (
        <>
          <section className={`${card} mb-5`}>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <h2 className="font-display text-[15px] font-semibold text-fl-cream">Затраты на производство за период<Info t={{ what: "Сумма производственных затрат из журнала проводок.", how: "Материалы — списания со складских счетов в производство и Дт 7110; оплата труда — Дт 7120; взносы — Дт 7130; ОПР — Дт 7140–7170." }} /></h2>
              <span className="text-xs text-fl-cream/55">{COSTING_METHOD[result.method]} · ОПР {OVERHEAD_BASE[result.base]} · <a href="/policy" className="text-fl-gold hover:underline">изменить в политике</a></span>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
              <Kpi label="Материалы" v={pools.materials} color={C.materials} />
              <Kpi label="Оплата труда" v={pools.labor} color={C.labor} />
              <Kpi label="Взносы СФ" v={pools.social} color={C.social} />
              <Kpi label="ОПР" v={pools.overhead} color={C.overhead} sub={Object.entries(pools.overheadBy).map(([k, v]) => `${OVERHEAD_LABEL[k] ?? k}: ${formatNumber(v)}`).join("; ")} />
              <Kpi label="Всего" v={poolTotal} />
            </div>
          </section>

          <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
            <div className="flex flex-col gap-5">
              <section className={card}>
                <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="font-display text-[15px] font-semibold text-fl-cream">Изделия, нормы и выпуск</h2>
                  <button type="button" onClick={() => { const p = newProduct(); updProducts([...products, p]); setOpenId(p.id); }} className="text-sm text-fl-gold hover:underline">+ Добавить изделие</button>
                </div>
                {products.length === 0 && <p className="py-3 text-sm text-fl-cream/55">Добавьте изделия и нормы расхода материалов и труда на единицу — затем укажите выпуск за период.</p>}
                <ul className="flex flex-col gap-3">
                  {products.map((p) => {
                    const open = openId === p.id;
                    return (
                      <li key={p.id} className="rounded-lg border border-fl-line p-3">
                        <div className="grid grid-cols-1 items-end gap-2 sm:grid-cols-[1fr_110px_120px_auto]">
                          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Изделие</span><input className={field} value={p.name} placeholder="Например, шкаф-купе" onChange={(e) => updP(p.id, { name: e.target.value })} /></label>
                          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Выпуск, {p.unit}</span><input type="number" min={0} className={`${field} num`} value={outputs[p.id] ?? 0} onChange={(e) => updOutput(p.id, Math.max(0, Number(e.target.value) || 0))} /></label>
                          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Цена, сом</span><input type="number" min={0} className={`${field} num`} value={p.price} onChange={(e) => updP(p.id, { price: Math.max(0, Number(e.target.value) || 0) })} /></label>
                          <button type="button" onClick={() => setOpenId(open ? null : p.id)} className="rounded-md border border-fl-line px-3 py-1.5 text-xs text-fl-cream hover:border-fl-gold">{open ? "Скрыть нормы" : `Нормы · ${formatNumber(normMaterials(p) + p.laborPerUnit)} сом`}</button>
                        </div>
                        {open && (
                          <div className="mt-3 border-t border-fl-line pt-3">
                            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                              <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Ед. изм.</span><input className={field} value={p.unit} onChange={(e) => updP(p.id, { unit: e.target.value })} /></label>
                              <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Зарплата на ед., сом</span><input type="number" min={0} className={`${field} num`} value={p.laborPerUnit} onChange={(e) => updP(p.id, { laborPerUnit: Math.max(0, Number(e.target.value) || 0) })} /></label>
                              <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Машино-часы на ед.</span><input type="number" min={0} step="0.1" className={`${field} num`} value={p.machineHours} onChange={(e) => updP(p.id, { machineHours: Math.max(0, Number(e.target.value) || 0) })} /></label>
                              <div className="flex items-end"><button type="button" onClick={() => updProducts(products.filter((x) => x.id !== p.id))} className="pb-2 text-xs text-fl-red hover:underline">Удалить изделие</button></div>
                            </div>
                            <p className="mb-1 mt-3 text-xs text-fl-cream/55">Нормы расхода материалов на единицу</p>
                            <div className="flex flex-col gap-1.5">
                              {p.materials.map((m, i) => (
                                <div key={i} className="grid grid-cols-[1fr_70px_80px_90px_auto] gap-1.5">
                                  <input className={field} placeholder="Материал" value={m.name} onChange={(e) => updP(p.id, { materials: p.materials.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)) })} />
                                  <input className={field} placeholder="ед." value={m.unit} onChange={(e) => updP(p.id, { materials: p.materials.map((x, j) => (j === i ? { ...x, unit: e.target.value } : x)) })} />
                                  <input type="number" min={0} step="0.01" className={`${field} num`} placeholder="кол-во" value={m.qty} onChange={(e) => updP(p.id, { materials: p.materials.map((x, j) => (j === i ? { ...x, qty: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                                  <input type="number" min={0} className={`${field} num`} placeholder="цена" value={m.price} onChange={(e) => updP(p.id, { materials: p.materials.map((x, j) => (j === i ? { ...x, price: Math.max(0, Number(e.target.value) || 0) } : x)) })} />
                                  <button type="button" aria-label="Убрать материал" onClick={() => updP(p.id, { materials: p.materials.filter((_, j) => j !== i) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>
                                </div>
                              ))}
                              <button type="button" onClick={() => updP(p.id, { materials: [...p.materials, { name: "", unit: "", qty: 0, price: 0 }] })} className="self-start text-xs text-fl-gold hover:underline">+ материал</button>
                            </div>
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {result.products.length > 0 && (
                <section className={card}>
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h2 className="font-display text-[15px] font-semibold text-fl-cream">Себестоимость единицы и цена</h2>
                    <span className="text-xs text-fl-cream/55">сом за единицу</span>
                  </div>
                  <div className="h-[280px]">
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={chart} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgb(var(--c-line))" vertical={false} />
                        <XAxis dataKey="name" tick={{ fontSize: 12, fill: "rgb(var(--c-ink) / 0.7)" }} />
                        <YAxis tickFormatter={(v) => formatNumber(v)} tick={{ fontSize: 11, fill: "rgb(var(--c-ink) / 0.6)" }} width={70} />
                        <Tooltip formatter={(v: number) => `${formatNumber(v)} сом`} contentStyle={{ background: "rgb(var(--c-surface))", border: "1px solid rgb(var(--c-line))", borderRadius: 8, fontSize: 12 }} />
                        <Legend wrapperStyle={{ fontSize: 12 }} />
                        <Bar dataKey="Материалы" stackId="c" fill={C.materials} isAnimationActive={false} />
                        <Bar dataKey="Оплата труда" stackId="c" fill={C.labor} isAnimationActive={false} />
                        <Bar dataKey="Взносы СФ" stackId="c" fill={C.social} isAnimationActive={false} />
                        <Bar dataKey="ОПР" stackId="c" fill={C.overhead} isAnimationActive={false} />
                        <Bar dataKey="price" name="Цена продажи" fill="rgb(var(--c-ink) / 0.25)" isAnimationActive={false} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[720px] text-sm">
                      <thead><tr className="text-xs text-fl-cream/55"><th className="py-1.5 text-left font-medium">Изделие</th><th className="text-right font-medium">Выпуск</th><th className="text-right font-medium">Себестоимость выпуска</th><th className="text-right font-medium">На единицу</th><th className="text-right font-medium">Отклонение материалов от нормы<Info t={{ what: "Фактические материалы на единицу против нормы. Плюс — перерасход." }} /></th><th className="text-right font-medium">Цена</th><th className="text-right font-medium">Рентабельность<Info t={{ what: "(Цена − себестоимость единицы) / цена." }} /></th><th /></tr></thead>
                      <tbody>
                        {result.products.map((p) => (
                          <tr key={p.id} className="border-t border-fl-line">
                            <td className="py-2 text-fl-cream/90">{p.name}</td>
                            <td className="num text-right text-fl-cream/75">{formatNumber(p.qty)} {p.unit}</td>
                            <td className="num text-right text-fl-cream">{formatNumber(p.total)}</td>
                            <td className="num text-right font-semibold text-fl-cream">{formatNumber(p.unit_.total)}</td>
                            <td className={`num text-right ${p.variance.materialsPct !== null && p.variance.materialsPct > 5 ? "text-fl-red" : "text-fl-cream/75"}`}>{p.variance.materialsPct === null ? "—" : `${p.variance.materialsPct > 0 ? "+" : ""}${p.variance.materialsPct.toFixed(1).replace(".", ",")}%`}</td>
                            <td className="num text-right text-fl-cream/75">{p.price ? formatNumber(p.price) : "—"}</td>
                            <td className={`num text-right ${p.margin !== null && p.margin < 10 ? "text-fl-red" : "text-fl-green"}`}>{p.margin === null ? "—" : `${p.margin.toFixed(1).replace(".", ",")}%`}</td>
                            <td className="text-right"><button type="button" disabled={busy !== null} onClick={() => download("pdf", p.id)} className="text-xs text-fl-gold hover:underline disabled:opacity-40">карточка PDF</button></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              )}
            </div>

            <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
              <section className={card}>
                <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream">Документы</h2>
                <button type="button" onClick={save} disabled={demo || busy !== null || !dirty} className="mb-2 w-full rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{demo ? "Демо: сохранить нельзя" : busy === "save" ? "Сохраняю…" : dirty ? "Сохранить нормы и выпуск" : "Сохранено"}</button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" disabled={busy !== null || !result.products.length} onClick={() => download("pdf")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "pdf:all" ? "…" : "PDF"}</button>
                  <button type="button" disabled={busy !== null || !result.products.length} onClick={() => download("docx")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "docx:all" ? "…" : "Word"}</button>
                </div>
                <p className="mt-2 text-xs text-fl-cream/50">Производственно-калькуляционный отчёт и карточки-калькуляции фактической себестоимости по каждому изделию.</p>
              </section>
              <section className={card}>
                <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream">Выводы и рекомендации</h2>
                <ul className="flex flex-col gap-3">
                  {result.advice.map((a, i) => (
                    <li key={i} className={`border-l-4 pl-3 ${a.level === "error" ? "border-fl-red" : a.level === "warn" ? "border-fl-amber" : "border-fl-info"}`}>
                      <p className="text-sm font-medium text-fl-cream">{a.title}</p>
                      <p className="mt-0.5 text-xs leading-relaxed text-fl-cream/65">{a.detail}</p>
                    </li>
                  ))}
                </ul>
              </section>
            </aside>
          </div>
        </>
      )}
    </main>
  );
}

function Kpi({ label, v, color, sub }: { label: string; v: number; color?: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-fl-line p-3">
      <p className="flex items-center gap-1.5 text-xs text-fl-cream/60">{color && <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: color }} />}{label}</p>
      <p className="num mt-1 text-lg font-semibold text-fl-cream">{formatNumber(v)}</p>
      {sub && <p className="mt-0.5 text-[11px] leading-snug text-fl-cream/50">{sub}</p>}
    </div>
  );
}
