"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { GROUPS, type Action, type CloseResult, type Step } from "@/lib/close/checklist";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const ICON = { ok: { s: "✓", c: "bg-fl-green/15 text-fl-green" }, warn: { s: "!", c: "bg-fl-amber/20 text-fl-amber" }, error: { s: "×", c: "bg-fl-red/15 text-fl-red" } } as const;

export default function ClosePage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<(CloseResult & { demo: boolean }) | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [onlyIssues, setOnlyIssues] = useState(false);
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);
  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    // по умолчанию — прошлый месяц: его и закрывают
    const prev = new Date(d.getFullYear(), d.getMonth() - 1, 1);
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(prev.getFullYear(), prev.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    try {
      const r = await fetch(`/api/close?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось проверить период");
      setData(b);
    } catch (e: any) { setError(e.message); setData(null); }
  }, [companyId, period]);
  useEffect(() => { load(); }, [load]);

  async function run(step: Step, a: Action) {
    if (!period || a.kind === "link") return;
    if (a.kind === "close" && data && data.warnings > 1 && !window.confirm(`Осталось замечаний: ${data.warnings - 1}. Закрыть период всё равно?`)) return;
    setBusy(step.id);
    try {
      const post = (url: string, body: unknown) => fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        .then(async (r) => { const b = await r.json().catch(() => ({})); if (!r.ok) throw new Error(b.error ?? "Не удалось выполнить"); return b; });
      if (a.kind === "bank") { const b = await post("/api/ledger/post-bank", { companyId }); show(`Проведено операций: ${b.posted}`); }
      if (a.kind === "taxes") { await post("/api/statements/taxes", { companyId, from: period.from, to: period.to }); show("Налоги начислены"); }
      if (a.kind === "close") { await post("/api/ledger/close", { companyId, from: period.from, to: period.to }); show("Период закрыт"); }
      if (a.kind === "entry") { await post("/api/ledger", { companyId, source: "manual", ...a.entry }); show("Проводка записана в журнал"); }
      await load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const total = data ? data.steps.length : 0;
  const pct = data && total ? Math.round((data.ok / total) * 100) : 0;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Закрытие месяца</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Одна проверка по всем разделам — в том порядке, в котором бухгалтер закрывает период: выписки, начисления, расчёты с
          контрагентами, производство, документы, налоги, сверка форм отчётности. Где исправление однозначно, его можно
          сделать прямо отсюда.
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
      </div>
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      {data && (
        <>
          <section className={`${card} mb-5`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="font-display text-lg font-semibold text-fl-cream">
                  {data.closed ? "Период закрыт" : data.errors ? "Есть ошибки — закрывать рано" : data.warnings > 1 ? "Можно закрывать после проверки замечаний" : "Всё готово к закрытию"}
                </p>
                <p className="text-sm text-fl-cream/60">
                  <span className="text-fl-green">{data.ok} в порядке</span>
                  {data.warnings ? <> · <span className="text-fl-amber">{data.warnings} замечаний</span></> : null}
                  {data.errors ? <> · <span className="text-fl-red">{data.errors} ошибок</span></> : null}
                </p>
              </div>
              <label className="flex items-center gap-2 text-sm text-fl-cream/70"><input type="checkbox" checked={onlyIssues} onChange={(e) => setOnlyIssues(e.target.checked)} /> Только требующие внимания</label>
            </div>
            <div className="mt-3 h-2 overflow-hidden rounded-full bg-fl-line/50"><div className="h-full rounded-full bg-fl-green transition-all" style={{ width: `${pct}%` }} /></div>
            {data.demo && <p className="mt-3 text-xs text-fl-cream/55">Демо открыто только для просмотра: действия доступны в своей компании или в копии демо.</p>}
          </section>

          <div className="flex flex-col gap-4">
            {GROUPS.map((g) => {
              const list = data.steps.filter((s) => s.group === g && (!onlyIssues || s.status !== "ok"));
              if (!list.length) return null;
              return (
                <section key={g} className={card}>
                  <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">{g}</h2>
                  <ul className="divide-y divide-fl-line/60">
                    {list.map((s) => (
                      <li key={s.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-start">
                        <span aria-label={s.status} className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-sm font-bold ${ICON[s.status].c}`}>{ICON[s.status].s}</span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-fl-cream">{s.title}</p>
                          <p className="mt-0.5 text-xs leading-relaxed text-fl-cream/65">{s.detail}</p>
                          {s.action?.kind === "entry" && (
                            <p className="mt-1.5 inline-flex flex-wrap gap-x-3 rounded-md bg-fl-gold/10 px-2 py-1 text-[11px] text-fl-cream/80">
                              {s.action.entry.lines.map((l, i) => <span key={i} className="num">{l.debit ? "Дт" : "Кт"} {l.account} {formatNumber(l.debit || l.credit, 2)}</span>)}
                            </p>
                          )}
                        </div>
                        {s.action && (s.action.kind === "link"
                          ? <a href={s.action.href} className="shrink-0 rounded-lg border border-fl-line px-3 py-1.5 text-center text-sm text-fl-cream hover:border-fl-gold">{s.action.label}</a>
                          : <button type="button" disabled={data.demo || busy !== null || (s.action.kind === "close" && !data.canClose)} onClick={() => run(s, s.action!)}
                              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-semibold disabled:opacity-40 ${s.action.kind === "close" ? "bg-fl-accent text-fl-on-accent hover:bg-fl-accent-hover" : "border border-fl-gold/60 text-fl-cream hover:bg-fl-gold/10"}`}>
                              {busy === s.id ? "…" : s.action.label}
                            </button>)}
                      </li>
                    ))}
                  </ul>
                </section>
              );
            })}
          </div>
        </>
      )}
    </main>
  );
}
