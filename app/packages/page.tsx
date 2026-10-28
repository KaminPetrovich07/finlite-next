"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import { PACKAGE_INFO, type FormatKey, type PackageKey } from "@/lib/reports/model";

const ORDER: PackageKey[] = ["full", "executive", "audit", "management", "esg"];
const FORMATS: Array<{ key: FormatKey; label: string; hint: string }> = [
  { key: "pdf", label: "PDF", hint: "для печати и отправки" },
  { key: "docx", label: "Word", hint: "можно дописать и поправить" },
  { key: "xlsx", label: "Excel", hint: "числа, чтобы считать дальше" },
];

const field = "rounded-lg border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream shadow-card focus:border-fl-info focus:outline-none";

export default function PackagesPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  // company and period can arrive from the «Скачать отчёты» link on /reports
  useEffect(() => {
    if (!loaded || period) return;
    const sp = new URLSearchParams(window.location.search);
    const qId = sp.get("companyId"), qFrom = sp.get("from"), qTo = sp.get("to");
    if (qId && companies.some((c) => c.id === qId)) setCompanyId(qId);
    if (qFrom && qTo) setPeriod({ from: qFrom, to: qTo });
    else {
      const d = new Date();
      setPeriod(company?.demo || qId === "demo" ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    }
    setPickerKey((k) => k + 1);
    if (window.location.hash) setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "center" }), 50);
  }, [loaded, company, period, companies, setCompanyId, setPeriod]);

  async function download(pkg: PackageKey, format: FormatKey) {
    if (!period) return;
    const key = `${pkg}:${format}`;
    setPending(key);
    setError(null);
    try {
      const qs = new URLSearchParams({ companyId, from: period.from, to: period.to, package: pkg, format });
      const res = await fetch(`/api/export?${qs}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? "Не удалось сформировать отчёт");
      }
      const blob = await res.blob();
      const cd = res.headers.get("Content-Disposition") ?? "";
      const m = cd.match(/filename\*=UTF-8''([^;]+)/);
      const name = m ? decodeURIComponent(m[1]) : `report.${format}`;
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
    } catch (e: any) {
      setError(`${PACKAGE_INFO[pkg].title}: ${e.message}`);
    } finally {
      setPending(null);
    }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Отчёты для скачивания</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Каждый пакет собирается из журнала проводок в момент скачивания — в PDF, Word и Excel одни и те же цифры.
        </p>
      </header>

      <section className="mb-6 flex flex-col gap-3 lg:flex-row lg:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55 lg:min-w-[240px]">
          Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={field}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.access === "view" && !c.demo ? " · просмотр" : ""}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55">
          Период
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        {period && <p className="text-sm text-fl-cream/60 lg:ml-auto">{company?.name} · {periodLabel(period.from, period.to)}</p>}
      </section>

      {error && (
        <div role="alert" className="mb-5 rounded-lg border border-fl-red/30 bg-fl-red/10 px-4 py-3 text-sm text-fl-cream">{error}</div>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {ORDER.map((k, i) => {
          const info = PACKAGE_INFO[k];
          return (
            <article
              key={k}
              id={k}
              className={`flex flex-col rounded-2xl border border-fl-line bg-fl-charcoal-2 p-5 shadow-card sm:p-6 ${i === 0 ? "md:col-span-2" : ""}`}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-display text-xl font-semibold text-fl-cream">{info.title}</h2>
                  <p className="mt-1 text-sm text-fl-cream/65">{info.description}</p>
                </div>
                <PackageGlyph k={k} />
              </div>
              <ul className={`mt-4 grid gap-x-6 gap-y-1.5 text-sm text-fl-cream/80 ${i === 0 ? "sm:grid-cols-2" : ""}`}>
                {info.contents.map((c) => (
                  <li key={c} className="flex gap-2">
                    <span aria-hidden className="mt-2 h-1 w-1 flex-shrink-0 rounded-full bg-fl-gold" />
                    {c}
                  </li>
                ))}
              </ul>
              <div className="mt-auto flex flex-wrap gap-2 pt-5">
                {FORMATS.map((f) => {
                  const busy = pending === `${k}:${f.key}`;
                  return (
                    <button
                      key={f.key}
                      onClick={() => download(k, f.key)}
                      disabled={!!pending || !period}
                      title={f.hint}
                      className={`flex min-w-[96px] items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold transition-colors disabled:cursor-wait disabled:opacity-60 ${
                        f.key === "pdf"
                          ? "bg-fl-accent text-fl-on-accent hover:bg-fl-accent-hover"
                          : "border border-fl-line bg-fl-charcoal text-fl-cream hover:border-fl-gold/40"
                      }`}
                    >
                      {busy ? "Готовлю…" : f.label}
                    </button>
                  );
                })}
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}

/** Small distinct mark per package so the grid scans quickly. */
function PackageGlyph({ k }: { k: PackageKey }) {
  const common = { width: 40, height: 40, viewBox: "0 0 40 40", "aria-hidden": true } as const;
  const bg = <rect x="0" y="0" width="40" height="40" rx="10" fill="rgb(var(--c-surface-2))" />;
  const ink = "rgb(var(--c-ink) / 0.7)", gold = "rgb(var(--c-gold-fill))";
  switch (k) {
    case "full": return <svg {...common}>{bg}<rect x="11" y="9" width="18" height="22" rx="2" fill="none" stroke={ink} strokeWidth="2" /><path d="M15 15h10M15 19h10M15 23h6" stroke={ink} strokeWidth="2" strokeLinecap="round" /><path d="M15 27h10" stroke={gold} strokeWidth="2.5" strokeLinecap="round" /></svg>;
    case "executive": return <svg {...common}>{bg}<path d="M11 27l6-6 4 4 8-9" fill="none" stroke={gold} strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" /><path d="M11 31h18" stroke={ink} strokeWidth="2" strokeLinecap="round" /></svg>;
    case "audit": return <svg {...common}>{bg}<circle cx="18" cy="18" r="7" fill="none" stroke={ink} strokeWidth="2" /><path d="M23 23l6 6" stroke={ink} strokeWidth="2.5" strokeLinecap="round" /><path d="M15 18l2 2 4-4" fill="none" stroke={gold} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>;
    case "management": return <svg {...common}>{bg}<rect x="11" y="20" width="4" height="10" rx="1" fill={ink} /><rect x="18" y="14" width="4" height="16" rx="1" fill={ink} /><rect x="25" y="10" width="4" height="20" rx="1" fill={gold} /></svg>;
    case "esg": return <svg {...common}>{bg}<path d="M20 30c-6-3-8-8-7-15 6 0 10 3 11 8" fill="none" stroke={ink} strokeWidth="2" strokeLinejoin="round" /><path d="M20 30c1-7 5-11 9-12" fill="none" stroke={gold} strokeWidth="2.5" strokeLinecap="round" /></svg>;
  }
}
