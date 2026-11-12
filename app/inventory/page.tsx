"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { useAccountLabel } from "@/components/AccountView";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import type { CogsProposal } from "@/lib/stock/cogs";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => iso.split("-").reverse().join(".");
const q = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");

interface Data {
  stock: Array<{ account: string; item: string; unit: string; qty: number; amount: number; avg: number }>;
  pending: CogsProposal[];
  settings: { auto: boolean };
  readOnly: boolean;
}

export default function InventoryPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const label = useAccountLabel();
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => setPeriodState((c) => (c && c.from === p.from && c.to === p.to ? c : p)), []);
  useEffect(() => {
    if (!loaded || period) return;
    const now = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(now.getFullYear(), now.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    try {
      const r = await fetch(`/api/stock?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
      setData(b);
    } catch (e: any) { setError(e.message); setData(null); }
  }, [companyId, period]);
  useEffect(() => { load(); }, [load]);

  async function postAll() {
    if (!period) return;
    setBusy(true);
    try {
      const r = await fetch("/api/stock", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...period }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(`Списано продаж: ${b.count}, себестоимость ${formatNumber(b.total, 2)} сом`); await load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }
  async function setAuto(auto: boolean) {
    try {
      const r = await fetch("/api/stock", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, auto }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(auto ? "Себестоимость будет списываться при каждой продаже" : "Автосписание выключено"); await load();
    } catch (e: any) { show(e.message, "error"); }
  }

  const ready = data?.pending.filter((p) => !p.problem) ?? [];
  const total = (data?.stock ?? []).reduce((s, r) => s + r.amount, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Склад</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Остатки по номенклатуре со средней себестоимостью и списание себестоимости проданного по средней (МСФО (IAS) 2).
          Продажа — проводка по выручке, где указаны номенклатура и количество; себестоимость берётся по остатку той же
          номенклатуры на дату продажи.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-fl-cream/55">Период</span>
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        {data && !data.readOnly && (
          <label className="ml-auto flex cursor-pointer items-center gap-2 text-sm text-fl-cream/80">
            <input type="checkbox" checked={data.settings.auto} onChange={(e) => setAuto(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-gold-fill))]" />
            Списывать автоматически при каждой продаже
          </label>
        )}
      </div>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {data && (
        <div className="space-y-5">
          <section className={`${card} p-4 sm:p-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display text-lg font-semibold text-fl-cream">Продажи без списания себестоимости: {data.pending.length}</h2>
                <p className="text-sm text-fl-cream/55">{ready.length ? `Готово к списанию ${ready.length} на ${formatNumber(ready.reduce((s, p) => s + p.amount, 0), 2)} сом.` : "Все продажи периода списаны."}</p>
              </div>
              {!data.readOnly && <button type="button" onClick={postAll} disabled={busy || !ready.length} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Списываю…" : `Списать (${ready.length})`}</button>}
            </div>
            {data.pending.length > 0 && (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[760px] text-sm">
                  <thead><tr className="text-xs text-fl-cream/50">{["Дата", "Номенклатура", "Продано", "На остатке", "Средняя цена", "Себестоимость", ""].map((h, i) => <th key={i} className={`py-1.5 font-medium ${i >= 2 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {data.pending.map((p) => (
                      <tr key={`${p.saleEntryId}:${p.lineIndex}`} className="border-t border-fl-line/60 align-top">
                        <td className="num py-1.5 text-fl-cream/70">{d(p.date)}</td>
                        <td className="py-1.5 text-fl-cream">{p.item}{p.stockAccount && <span className="block text-xs text-fl-cream/45">со счёта: {label(p.stockAccount)}</span>}</td>
                        <td className="num py-1.5 text-right">{q(p.qty)} {p.unit}</td>
                        <td className="num py-1.5 text-right text-fl-cream/70">{q(p.onHand)}</td>
                        <td className="num py-1.5 text-right">{p.avgCost ? formatNumber(p.avgCost, 2) : "—"}</td>
                        <td className="num py-1.5 text-right font-medium text-fl-cream">{p.amount ? formatNumber(p.amount, 2) : "—"}</td>
                        <td className="py-1.5 pl-3 text-xs text-fl-amber">{p.problem}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className={`${card} overflow-x-auto`}>
            <div className="flex items-baseline justify-between border-b border-fl-line px-4 py-3">
              <h2 className="font-display text-lg font-semibold text-fl-cream">Остатки на {period ? d(period.to) : ""}</h2>
              <span className="num text-sm text-fl-cream/70">{formatNumber(total, 2)} сом</span>
            </div>
            {data.stock.length === 0 ? (
              <p className="p-5 text-sm text-fl-cream/60">Нет остатков с номенклатурой. Указывайте номенклатуру и количество в проводках по счетам запасов — тогда здесь появятся остатки и средняя цена.</p>
            ) : (
              <table className="w-full min-w-[680px] text-sm">
                <thead><tr className="text-xs text-fl-cream/50">{["Счёт / статья", "Номенклатура", "Количество", "Средняя цена", "Сумма"].map((h, i) => <th key={h} className={`px-4 py-2 font-medium ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {data.stock.map((s) => (
                    <tr key={`${s.account}|${s.item}`} className="border-t border-fl-line/60">
                      <td className="px-4 py-1.5 text-xs text-fl-cream/55">{label(s.account)}</td>
                      <td className="px-4 py-1.5 text-fl-cream">{s.item}</td>
                      <td className={`num px-4 py-1.5 text-right ${s.qty < 0 ? "text-fl-red" : ""}`}>{q(s.qty)} {s.unit}</td>
                      <td className="num px-4 py-1.5 text-right">{s.avg ? formatNumber(s.avg, 2) : "—"}</td>
                      <td className="num px-4 py-1.5 text-right">{formatNumber(s.amount, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
