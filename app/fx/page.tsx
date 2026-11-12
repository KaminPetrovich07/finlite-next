"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { useAccountLabel } from "@/components/AccountView";
import { usePlanFeature, PlanNotice } from "@/components/PlanGate";
import { formatNumber } from "@/lib/format";
import { CURRENCY_NAME, type RevalRow } from "@/lib/fx/fx";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => iso.split("-").reverse().join(".");
const monthEnd = () => { const n = new Date(Date.now() + 6 * 3600 * 1000); return new Date(Date.UTC(n.getUTCFullYear(), n.getUTCMonth() + 1, 0)).toISOString().slice(0, 10); };

export default function FxPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [rates, setRates] = useState<{ latest: Array<{ date: string; code: string; rate: number }>; history: Array<{ date: string; code: string; rate: number }> } | null>(null);
  const [date, setDate] = useState(monthEnd());
  const [reval, setReval] = useState<{ rows: RevalRow[]; missing: string[]; lines: Array<{ account: string; debit: number; credit: number }>; posted: boolean } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const allowed = usePlanFeature("fx");
  const label = useAccountLabel();
  const { show, ToastContainer } = useToast();

  const loadRates = useCallback(async () => {
    const r = await fetch("/api/fx/rates");
    if (r.ok) setRates(await r.json());
  }, []);
  useEffect(() => { loadRates(); }, [loadRates]);

  const loadReval = useCallback(async () => {
    if (!companyId) return;
    setErr(null);
    const r = await fetch(`/api/fx/revalue?companyId=${encodeURIComponent(companyId)}&date=${date}`);
    const b = await r.json();
    if (r.ok) setReval(b); else { setErr(b.error); setReval(null); }
  }, [companyId, date]);
  useEffect(() => { if (loaded) loadReval(); }, [loaded, loadReval]);

  async function fetchNbkr() {
    setBusy("nbkr");
    try {
      const r = await fetch("/api/fx/rates", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "nbkr" }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(`Курсы НБКР загружены: ${b.loaded.map((x: any) => `${d(x.date)} — ${x.count}`).join("; ")}`);
      await loadRates(); await loadReval();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }
  async function post() {
    setBusy("post");
    try {
      const r = await fetch("/api/fx/revalue", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, date }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(b.replaced ? "Переоценка перепроведена" : "Курсовые разницы проведены"); await loadReval();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const sums = (reval?.lines ?? []).filter((l) => ["6240", "9140", "9520"].includes(l.account));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Валюта и курсовые разницы</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Официальные курсы Национального банка КР и переоценка валютных статей на отчётную дату по МСФО (IAS) 21. В проводке
          укажите валюту и сумму в валюте — сумма в сомах посчитается по курсу на дату операции.
        </p>
      </header>
      {allowed === false && <PlanNotice feature="fx" />}

      <section className={`${card} mb-5 p-4 sm:p-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-lg font-semibold text-fl-cream">Курсы НБКР</h2>
          <button type="button" onClick={fetchNbkr} disabled={busy !== null} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "nbkr" ? "Загружаю…" : "Загрузить сегодняшние курсы"}</button>
        </div>
        {rates && rates.latest.length > 0 ? (
          <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-5">
            {rates.latest.filter((r) => ["USD", "EUR", "RUB", "KZT", "CNY"].includes(r.code)).map((r) => (
              <div key={r.code} className="rounded-lg border border-fl-line px-3 py-2">
                <p className="text-xs text-fl-cream/50">{r.code} · {CURRENCY_NAME[r.code] ?? ""}</p>
                <p className="num font-display text-xl font-semibold text-fl-cream">{r.rate.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}</p>
                <p className="text-xs text-fl-cream/45">на {d(r.date)}</p>
              </div>
            ))}
          </div>
        ) : <p className="mt-2 text-sm text-fl-cream/60">Курсов в базе ещё нет — нажмите «Загрузить сегодняшние курсы». Дальше они загружаются каждый день автоматически.</p>}
        {rates && rates.latest.some((r) => !["USD", "EUR", "RUB", "KZT", "CNY"].includes(r.code)) && (
          <details className="mt-3 text-sm text-fl-cream/70">
            <summary className="cursor-pointer text-fl-gold">Прочие валюты (еженедельные курсы)</summary>
            <div className="mt-2 grid grid-cols-2 gap-x-6 gap-y-1 sm:grid-cols-4">
              {rates.latest.filter((r) => !["USD", "EUR", "RUB", "KZT", "CNY"].includes(r.code)).map((r) => <p key={r.code} className="num">{r.code} {r.rate.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}</p>)}
            </div>
          </details>
        )}
      </section>

      <section className={`${card} p-4 sm:p-5`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Переоценка на отчётную дату</h2>
        <div className="mt-3 flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW_COMPANY}>+ Добавить компанию…</option>
            </select></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Дата</span>
            <input type="date" value={date} onChange={(e) => e.target.value && setDate(e.target.value)} className={field} /></label>
          {!company?.demo && company?.access !== "view" && (
            <button type="button" onClick={post} disabled={busy !== null || !reval?.lines.length || (reval?.missing.length ?? 0) > 0} className="ml-auto rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
              {busy === "post" ? "Провожу…" : reval?.posted ? "Перепровести" : "Провести курсовые разницы"}
            </button>
          )}
        </div>
        {err && <p className="mt-3 text-sm text-fl-red">{err}</p>}
        {reval && (reval.rows.length === 0 ? (
          <p className="mt-3 text-sm text-fl-cream/60">Валютных остатков нет. Чтобы они появились, в проводках по валютным счетам, расчётам и займам указывайте валюту и сумму в валюте.</p>
        ) : (
          <>
            {reval.missing.length > 0 && <p className="mt-3 text-sm text-fl-amber">Нет курса на эту дату для: {reval.missing.join(", ")}.</p>}
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[760px] text-sm">
                <thead><tr className="text-xs text-fl-cream/50">{["Статья", "Валюта", "Остаток в валюте", "Курс", "По курсу, сом", "В учёте, сом", "Разница"].map((h, i) => <th key={h} className={`py-1.5 font-medium ${i >= 2 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                <tbody>
                  {reval.rows.map((r) => (
                    <tr key={`${r.account}|${r.currency}`} className="border-t border-fl-line/60">
                      <td className="py-1.5 text-fl-cream/85">{label(r.account)}</td>
                      <td className="py-1.5">{r.currency}</td>
                      <td className="num py-1.5 text-right">{formatNumber(r.balanceCur, 2)}</td>
                      <td className="num py-1.5 text-right">{r.rate.toLocaleString("ru-RU", { maximumFractionDigits: 4 })}</td>
                      <td className="num py-1.5 text-right">{formatNumber(r.target, 2)}</td>
                      <td className="num py-1.5 text-right">{formatNumber(r.balanceSom, 2)}</td>
                      <td className={`num py-1.5 text-right font-semibold ${r.diff > 0 ? "text-fl-green" : r.diff < 0 ? "text-fl-red" : "text-fl-cream/60"}`}>{r.diff > 0 ? "+" : ""}{formatNumber(r.diff, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {sums.length > 0 && <p className="mt-3 text-sm text-fl-cream/75">{sums.map((l) => `${label(l.account)}: ${formatNumber(l.debit || l.credit, 2)}`).join(" · ")}</p>}
            <p className="mt-2 text-xs text-fl-cream/50">Авансы выданные и полученные — неденежные статьи (IAS 21.16): они остаются по курсу на дату оплаты и не переоцениваются.{reval.posted ? " Переоценка на эту дату уже проведена." : ""}</p>
          </>
        ))}
      </section>
    </main>
  );
}
