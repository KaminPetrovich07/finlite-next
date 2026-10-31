"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { SIZE_LABEL, filedKey, type RLine, type Size, type TaxReportsResult } from "@/lib/taxreports/build";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const d = (iso: string) => iso.split("-").reverse().join(".");
const pct = (r: number | null | undefined) => (r === null || r === undefined ? "" : `${String(Math.round(r * 10000) / 100).replace(".", ",")}%`);

export default function TaxReportsPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<(TaxReportsResult & { size: Size; demo: boolean }) | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);
  useEffect(() => {
    if (!loaded || period) return;
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setPeriod(company?.demo ? { from: "2026-09-01", to: DEMO_PERIOD.to } : monthPeriod(prev.getFullYear(), prev.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    try {
      const r = await fetch(`/api/taxreports?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}${size ? `&size=${size}` : ""}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось построить отчёты");
      setData(b);
    } catch (e: any) { setError(e.message); setData(null); }
  }, [companyId, period, size]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSize(null); }, [companyId]);

  async function put(body: Record<string, unknown>) {
    const r = await fetch("/api/taxreports", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "Не удалось сохранить");
  }

  async function changeSize(s: Size) {
    setSize(s);
    if (data && !data.demo) put({ size: s }).catch((e) => show(e.message, "error"));
  }

  async function markFiled(key: string, filed: boolean) {
    setBusy(`f:${key}`);
    try { await put({ filed: { key, date: filed ? new Date().toISOString().slice(0, 10) : null } }); await load(); show(filed ? "Отмечено: отчёт сдан" : "Отметка снята"); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  async function download(format: "pdf" | "docx", keys?: string[]) {
    if (!period) return;
    const k = `${format}:${keys?.[0] ?? "all"}`;
    setBusy(k);
    try { await downloadPost(`/api/taxreports/export?format=${format}`, { companyId, from: period.from, to: period.to, size: size ?? data?.size, keys }, `Налоговые отчёты.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const chip = (s: string, days: number) =>
    s === "done" ? <span className="rounded-full bg-fl-green/15 px-2 py-0.5 text-xs text-fl-green">сдан</span>
      : s === "overdue" ? <span className="rounded-full bg-fl-red/15 px-2 py-0.5 text-xs text-fl-red">срок прошёл {-days} дн. назад</span>
        : s === "due" ? <span className="rounded-full bg-fl-amber/20 px-2 py-0.5 text-xs text-fl-amber">осталось {days} дн.</span>
          : <span className="rounded-full bg-fl-line/60 px-2 py-0.5 text-xs text-fl-cream/70">через {days} дн.</span>;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Налоговые отчёты</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Суммы для отчётов в ГНС по данным журнала: единый налог, подоходный налог и страховые взносы, налог с продаж, НДС,
          ЕНД. Отчёты сдаются через Кабинет налогоплательщика — здесь готовые цифры по строкам, сроки, сверка с начислениями
          и расчёты с бюджетом.
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
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Субъект предпринимательства</span>
          <select value={size ?? data?.size ?? "small"} onChange={(e) => changeSize(e.target.value as Size)} className={field}>
            {(Object.keys(SIZE_LABEL) as Size[]).map((s) => <option key={s} value={s}>{SIZE_LABEL[s]}</option>)}
          </select>
        </label>
      </div>
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}{/режим/.test(error) && <> <a href="/companies" className="font-medium text-fl-gold underline">Открыть компании</a></>}</div>}

      {data && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex min-w-0 flex-col gap-4">
            <p className="text-sm text-fl-cream/60">Режим: <b className="text-fl-cream">{data.regimeName}</b> · отчётов за период: {data.reports.length}. Квартальный отчёт показывается за весь квартал, в который входит выбранный месяц.</p>
            {data.reports.map((r) => {
              const key = filedKey(r.form, r.period.from);
              return (
                <section key={key} className={card}>
                  <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className="text-xs font-semibold tracking-wide text-fl-gold">FORM {r.form}</p>
                      <h2 className="font-display text-[16px] font-semibold text-fl-cream">{r.title}</h2>
                      <p className="text-xs text-fl-cream/55">за {r.periodLabel} · сдать до {d(r.deadline)}</p>
                    </div>
                    {chip(r.status, r.daysLeft)}
                  </div>
                  <Lines lines={r.lines} />
                  {r.months && (
                    <details className="mt-3">
                      <summary className="cursor-pointer text-sm text-fl-gold">Приложение STI-091-001 — по месяцам</summary>
                      {r.months.map((m) => <div key={m.label} className="mt-2"><p className="mb-1 text-xs font-medium text-fl-cream/70">{m.label}</p><Lines lines={m.lines} /></div>)}
                    </details>
                  )}
                  {r.posted !== null && (
                    <p className={`mt-3 text-xs ${Math.abs(r.posted - r.computed) > 0.5 ? "text-fl-amber" : "text-fl-green"}`}>
                      {Math.abs(r.posted - r.computed) > 0.5 ? `В журнале начислено ${formatNumber(r.posted, 2)} — по расчёту ${formatNumber(r.computed, 2)}. Пересчитайте начисление в «Закрытии месяца».` : `✓ Начисление в журнале совпадает с расчётом: ${formatNumber(r.posted, 2)} сом`}
                    </p>
                  )}
                  {r.notes.length > 0 && <ul className="mt-2 flex flex-col gap-1">{r.notes.map((n, i) => <li key={i} className="text-[11px] leading-relaxed text-fl-cream/50">{n}</li>)}</ul>}
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-fl-line pt-3">
                    <button type="button" disabled={busy !== null} onClick={() => download("pdf", [key])} className="rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === `pdf:${key}` ? "…" : "PDF"}</button>
                    <button type="button" disabled={busy !== null} onClick={() => download("docx", [key])} className="rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === `docx:${key}` ? "…" : "Word"}</button>
                    <a href="https://cabinet.salyk.kg" target="_blank" rel="noopener noreferrer" className="rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream hover:border-fl-gold">Кабинет налогоплательщика ↗</a>
                    <button type="button" disabled={data.demo || busy !== null} onClick={() => markFiled(key, r.status !== "done")} className="ml-auto rounded-lg px-3 py-1.5 text-sm text-fl-gold hover:underline disabled:opacity-40">{r.status === "done" ? "Снять отметку «сдан»" : "Отметить сданным"}</button>
                  </div>
                </section>
              );
            })}
          </div>

          <aside className="flex flex-col gap-4">
            <section className={card}>
              <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Все отчёты одним файлом</h2>
              <div className="grid grid-cols-2 gap-2">
                <button type="button" disabled={busy !== null || !data.reports.length} onClick={() => download("pdf")} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === "pdf:all" ? "…" : "PDF"}</button>
                <button type="button" disabled={busy !== null || !data.reports.length} onClick={() => download("docx")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "docx:all" ? "…" : "Word"}</button>
              </div>
              <p className="mt-2 text-xs text-fl-cream/50">С листом расчётов с бюджетом и подписями.</p>
            </section>
            {data.budget.length > 0 && (
              <section className={card}>
                <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Расчёты с бюджетом</h2>
                <table className="w-full text-xs">
                  <thead><tr className="text-fl-cream/50"><th className="py-1 text-left font-medium">Налог</th><th className="text-right font-medium">Начислено</th><th className="text-right font-medium">Уплачено</th><th className="text-right font-medium">Долг</th></tr></thead>
                  <tbody>
                    {data.budget.map((b) => (
                      <tr key={b.account} className="border-t border-fl-line/60">
                        <td className="py-1.5 pr-1 text-fl-cream/80">{b.name}<span className="block text-[10px] text-fl-cream/40">сч. {b.account}</span></td>
                        <td className="num text-right text-fl-cream/80">{formatNumber(b.accrued)}</td>
                        <td className="num text-right text-fl-cream/80">{formatNumber(b.paid)}</td>
                        <td className={`num text-right font-semibold ${b.closing > 0.5 ? "text-fl-amber" : "text-fl-cream"}`}>{formatNumber(b.closing)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                <p className="mt-2 text-[11px] text-fl-cream/45">Долг — на конец периода, с учётом остатка на начало. Минус — переплата.</p>
              </section>
            )}
            <section className={card}>
              <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Важно</h2>
              <ul className="flex flex-col gap-2 text-xs leading-relaxed text-fl-cream/65">
                {data.notes.map((n, i) => <li key={i}>{n}</li>)}
                <li>Справки, заявления, решения и уведомления ГНС (STI-020, STI-181, ZVN, NEDOIMKA…) выдаёт или принимает сама служба — из журнала они не формируются.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}

function Lines({ lines }: { lines: RLine[] }) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr className="text-xs text-fl-cream/50"><th className="w-12 py-1 text-left font-medium">Код</th><th className="text-left font-medium">Показатель</th><th className="text-right font-medium">База</th><th className="text-right font-medium">Ставка</th><th className="text-right font-medium">Сумма</th></tr></thead>
        <tbody>
          {lines.map((l, i) => l.sub
            ? <tr key={i}><td /><td colSpan={4} className="pt-2 text-xs font-medium text-fl-cream/70">{l.label}</td></tr>
            : (
              <tr key={i} className={`border-t border-fl-line/50 ${l.total ? "font-semibold" : ""}`}>
                <td className="num py-1.5 text-fl-gold">{l.code ?? ""}</td>
                <td className="pr-2 text-fl-cream/85">{l.label}</td>
                <td className="num text-right text-fl-cream/75">{l.base === undefined ? "" : formatNumber(l.base, 2)}</td>
                <td className="num text-right text-fl-cream/75">{pct(l.rate)}</td>
                <td className="num text-right text-fl-cream">{l.amount === undefined ? "" : formatNumber(l.amount, 2)}</td>
              </tr>
            ))}
        </tbody>
      </table>
    </div>
  );
}
