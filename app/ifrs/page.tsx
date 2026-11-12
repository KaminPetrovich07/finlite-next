"use client";

import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { AccountViewToggle, useAccountView } from "@/components/AccountView";
import { useToast } from "@/components/Toast";
import { downloadGet } from "@/components/download";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { buildIfrs, type IfrsRow, type IfrsStatements } from "@/lib/ledger/ifrs";
import type { Statements } from "@/lib/ledger/engine";
import type { LedgerEntry } from "@/lib/ledger/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => iso.split("-").reverse().join(".");
const money = (n: number) => (Math.abs(n) < 0.005 ? "—" : n < 0 ? `(${formatNumber(-n, 0)})` : formatNumber(n, 0));

type Tab = "sfp" | "pl" | "cf" | "eq";
const TABS: Array<{ key: Tab; title: string; std: string }> = [
  { key: "sfp", title: "Финансовое положение", std: "МСФО (IAS) 1, п. 54" },
  { key: "pl", title: "Прибыль или убыток", std: "МСФО (IAS) 1, п. 81А–103" },
  { key: "cf", title: "Движение денежных средств", std: "МСФО (IAS) 7, прямой метод" },
  { key: "eq", title: "Изменения в капитале", std: "МСФО (IAS) 1, п. 106" },
];

export default function IfrsPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<{ statements: Statements; previous: Statements | null; entries: LedgerEntry[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("sfp");
  const [open, setOpen] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState<string | null>(null);
  const [view] = useAccountView();
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);
  useEffect(() => {
    if (!loaded || period) return;
    const now = new Date();
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(prev.getFullYear(), prev.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  useEffect(() => {
    if (!companyId || !period) return;
    let cancelled = false;
    setError(null);
    fetch(`/api/statements?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Не удалось построить отчётность"); return b; })
      .then((b) => { if (!cancelled) setData({ statements: b.statements, previous: b.previous ?? null, entries: b.entries ?? [] }); })
      .catch((e) => { if (!cancelled) { setError(e.message); setData(null); } });
    return () => { cancelled = true; };
  }, [companyId, period]);

  const ifrs: IfrsStatements | null = useMemo(() => (data ? buildIfrs(data.statements, data.previous, data.entries) : null), [data]);
  const prevLabel = data?.previous ? `${d(data.previous.period.from)}–${d(data.previous.period.to)}` : "Предыдущий период";
  const curLabel = period ? `${d(period.from)}–${d(period.to)}` : "";
  const toggle = (k: string) => setOpen((s) => { const n = new Set(s); n.has(k) ? n.delete(k) : n.add(k); return n; });

  async function exportFile(format: "pdf" | "docx" | "xlsx") {
    if (!period) return;
    setBusy(format);
    try { await downloadGet(`/api/export?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}&package=ifrs&format=${format}`, `Отчётность по МСФО.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const rows = (list: IfrsRow[], pointInTime: boolean) => (
    <table className="w-full min-w-[620px] text-sm">
      <thead>
        <tr className="text-xs text-fl-cream/50">
          <th className="px-4 py-2 text-left font-medium">Статья</th>
          <th className="w-40 px-4 py-2 text-right font-medium">{pointInTime ? `на ${period ? d(period.to) : ""}` : curLabel}</th>
          <th className="w-40 px-4 py-2 text-right font-medium">{pointInTime ? `на ${period ? d(period.from) : ""}` : prevLabel}</th>
        </tr>
      </thead>
      <tbody>
        {list.map((r) => {
          const parts = ifrs?.breakdown[r.key] ?? [];
          const canOpen = r.kind === "line" && parts.length > 0;
          const isOpen = open.has(r.key);
          if (r.kind === "heading") {
            return <tr key={r.key}><td colSpan={3} className="px-4 pb-1 pt-4 text-xs font-semibold uppercase tracking-wide text-fl-gold/80">{r.label}</td></tr>;
          }
          const tone = r.kind === "total" ? "font-semibold text-fl-cream border-t-2 border-fl-gold/40" : r.kind === "subtotal" ? "font-medium text-fl-cream border-t border-fl-line" : "text-fl-cream/85";
          return (
            <Fragment key={r.key}>
              <tr className={`${tone} ${canOpen ? "cursor-pointer hover:bg-fl-charcoal/60" : ""}`} onClick={canOpen ? () => toggle(r.key) : undefined}>
                <td className="px-4 py-1.5">
                  {canOpen && <span className="mr-1.5 inline-block w-3 text-fl-cream/40">{isOpen ? "▾" : "▸"}</span>}
                  {r.label}
                </td>
                <td className="num px-4 py-1.5 text-right">{money(r.current)}</td>
                <td className="num px-4 py-1.5 text-right text-fl-cream/60">{money(r.previous)}</td>
              </tr>
              {isOpen && parts.map((p) => (
                <tr key={`${r.key}-${p.code}`} className="text-xs text-fl-cream/60">
                  <td className="py-1 pl-10 pr-4">{view === "codes" && p.code !== "pl" ? <span className="num mr-2 text-fl-cream/40">{p.code}</span> : null}{p.name}</td>
                  <td className="num px-4 py-1 text-right">{money(p.current)}</td>
                  <td className="num px-4 py-1 text-right">{money(p.previous)}</td>
                </tr>
              ))}
            </Fragment>
          );
        })}
      </tbody>
    </table>
  );

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Отчётность по МСФО</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Четыре отчёта по МСФО из того же журнала, без шифров счетов и строк ФОСАМК: статьи названы по МСФО, рядом —
          сравнительные данные. Нажмите на строку, чтобы раскрыть её до статей. Суммы в сомах; отрицательные — в скобках.
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
        <div>
          <span className="mb-1 block text-xs text-fl-cream/55">Статьи в расшифровке</span>
          <AccountViewToggle />
        </div>
        <div className="ml-auto flex gap-2">
          {(["pdf", "docx", "xlsx"] as const).map((f) => (
            <button key={f} type="button" onClick={() => exportFile(f)} disabled={busy !== null || !ifrs}
              className={`rounded-lg px-3 py-2 text-sm disabled:opacity-40 ${f === "pdf" ? "bg-fl-accent font-semibold text-fl-on-accent hover:bg-fl-accent-hover" : "border border-fl-line text-fl-cream hover:border-fl-gold"}`}>
              {busy === f ? "…" : f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}
            </button>
          ))}
        </div>
      </div>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {ifrs && (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TABS.map((t) => (
              <button key={t.key} type="button" onClick={() => setTab(t.key)}
                className={`rounded-lg px-3 py-2 text-sm ${tab === t.key ? "bg-fl-gold/20 font-semibold text-fl-gold" : "text-fl-cream/65 hover:text-fl-cream"}`}>
                {t.title}
              </button>
            ))}
          </div>

          <section className={`${card} overflow-x-auto`}>
            <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-fl-line px-4 py-3">
              <h2 className="font-display text-lg font-semibold text-fl-cream">
                {tab === "sfp" ? "Отчёт о финансовом положении" : tab === "pl" ? "Отчёт о прибыли или убытке и прочем совокупном доходе" : tab === "cf" ? "Отчёт о движении денежных средств" : "Отчёт об изменениях в капитале"}
              </h2>
              <span className="text-xs text-fl-cream/45">{TABS.find((t) => t.key === tab)?.std}</span>
            </div>
            {tab === "sfp" && rows(ifrs.sfp, true)}
            {tab === "pl" && rows(ifrs.pl, false)}
            {tab === "cf" && rows(ifrs.cf, false)}
            {tab === "eq" && (
              <table className="w-full min-w-[720px] text-sm">
                <thead>
                  <tr className="text-xs text-fl-cream/50">
                    <th className="px-4 py-2 text-left font-medium" />
                    {ifrs.equity.columns.map((c) => <th key={c} className="px-4 py-2 text-right font-medium">{c}</th>)}
                    <th className="px-4 py-2 text-right font-medium">Итого</th>
                  </tr>
                </thead>
                <tbody>
                  {ifrs.equity.rows.map((r) => (
                    <tr key={r.label} className={r.kind === "total" ? "border-t border-fl-line font-semibold text-fl-cream" : "text-fl-cream/85"}>
                      <td className="px-4 py-1.5">{r.label}</td>
                      {r.values.map((v, i) => <td key={i} className="num px-4 py-1.5 text-right">{money(v)}</td>)}
                      <td className="num px-4 py-1.5 text-right">{money(r.total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>

          <section className={`${card} mt-4 p-4`}>
            <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Проверки</h2>
            <ul className="space-y-1.5 text-sm">
              {ifrs.checks.map((c) => (
                <li key={c.title} className="flex gap-2">
                  <span className={c.ok ? "text-fl-green" : "text-fl-amber"}>{c.ok ? "✓" : "!"}</span>
                  <span className="text-fl-cream/85">{c.title}<span className="text-fl-cream/50"> — {c.detail}</span></span>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-4 text-xs leading-relaxed text-fl-cream/50">
            <p>
              Сравнительные данные: для отчёта о финансовом положении — на начало периода, для остальных отчётов — за
              предыдущий период такой же длины. Чрезвычайные статьи МСФО не выделяет (IAS 1, п. 87), поэтому они включены
              в прочие доходы и расходы. Проценты и курсовые разницы вне основной деятельности показаны как финансовые
              доходы и расходы.
            </p>
            <p className="mt-1.5">
              С 1 января 2027 года вместо МСФО (IAS) 1 применяется МСФО (IFRS) 18 «Представление и раскрытие информации в
              финансовой отчётности»: появятся обязательные промежуточные итоги «Операционная прибыль» и «Прибыль до
              финансирования и налога на прибыль». Отчёт о прибыли здесь уже показывает операционную прибыль отдельно.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
