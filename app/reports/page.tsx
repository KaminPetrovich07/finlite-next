"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Drawer } from "@/components/ledger/Drawer";
import { EntryCard } from "@/components/ledger/EntryCard";
import {
  BalanceSheetTable, CashFlowTable, ChecksStrip, EquityTable, IncomeStatementTable,
  Notice, TaxPanel, TrialBalanceTable, type DrillRequest, type TabKey,
} from "@/components/ledger/statements";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { entriesForAccounts, type Check, type Statements } from "@/lib/ledger/engine";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import type { LedgerEntry } from "@/lib/ledger/types";
import { REGIME_INFO, REGIMES, type RegimeKey } from "@/lib/tax-engine";
import { Dashboard } from "@/components/ledger/Dashboard";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/components/Toast";
import { useT } from "@/components/i18n";

interface Payload {
  company: { id: string; name: string; regime: RegimeKey | null; patentAmount: number };
  demo: boolean;
  statements: Statements;
  entries: LedgerEntry[];
}

const TABS: Array<{ key: TabKey; label: string; full: string }> = [
  { key: "bs", label: "Баланс", full: "Отчёт о финансовом положении · Ф.1" },
  { key: "is", label: "ОПиУ", full: "Отчёт о прибылях и убытках · Ф.2" },
  { key: "cf", label: "ОДДС", full: "Отчёт о движении денежных средств · Ф.3" },
  { key: "eq", label: "Капитал", full: "Отчёт об изменениях в капитале · Ф.4" },
  { key: "tax", label: "Налоги", full: "Начисление налогов по режиму" },
  { key: "tb", label: "ОСВ", full: "Оборотно-сальдовая ведомость" },
];

const CHECK_TAB: Record<string, TabKey> = {
  entries: "tb", accounts: "tb", tb: "tb", bs: "bs", "cf-bs": "cf", "eq-bs": "eq", "eq-is": "eq",
  tax: "tax", suspense: "tb", "cash-negative": "bs",
};

function currentMonth() {
  const d = new Date();
  return monthPeriod(d.getFullYear(), d.getMonth() + 1);
}

export default function ReportsPage() {
  const t = useT();
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);
  const [pickerKey, setPickerKey] = useState(0);
  const [regimeOverride, setRegimeOverride] = useState<string | null>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TabKey>("bs");
  useEffect(() => {
    // /reports#cf opens the cash-flow tab (old /balance, /cashflow, /equity links land here)
    const h = window.location.hash.slice(1);
    if (TABS.some((t) => t.key === h)) setTab(h as TabKey);
  }, []);
  const [drill, setDrill] = useState<DrillRequest | null>(null);
  const [posting, setPosting] = useState(false);
  const toast = useToast();
  const closeDrill = useCallback(() => setDrill(null), []);

  // first load: demo company opens on the month its data lives in
  useEffect(() => {
    if (!loaded || period) return;
    setPeriod(company?.demo ? DEMO_PERIOD : currentMonth());
    setPickerKey((k) => k + 1);
  }, [loaded, company, period]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setLoading(true);
    setError(null);
    const qs = new URLSearchParams({ companyId, from: period.from, to: period.to });
    if (regimeOverride) qs.set("regime", regimeOverride);
    try {
      const res = await fetch(`/api/statements?${qs}`);
      const body = await res.json();
      if (!res.ok) throw new Error(t(body.error ?? "Не удалось построить отчётность"));
      setData(body);
    } catch (e: any) {
      setError(e.message);
      setData(null);
    } finally {
      setLoading(false);
    }
  }, [companyId, period, regimeOverride]);

  useEffect(() => { load(); }, [load]);

  async function changeRegime(regime: string) {
    if (!data) return;
    if (data.demo) { setRegimeOverride(regime); return; }
    const res = await fetch(`/api/companies/${data.company.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ defaultRegime: regime }),
    });
    if (!res.ok) { toast.show(t("Не удалось сохранить режим"), "error"); return; }
    toast.show(t("Режим сохранён. Пересчитайте налоги за период"), "info");
    load();
  }

  async function postTaxes() {
    if (!data || !period) return;
    setPosting(true);
    try {
      const res = await fetch("/api/statements/taxes", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId: data.company.id, from: period.from, to: period.to }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      toast.show(t("Налоги начислены: {s} сом", { s: formatNumber(body.accrual.total, 0) }));
      await load();
    } catch (e: any) {
      toast.show(t(e.message ?? "Ошибка начисления"), "error");
    } finally {
      setPosting(false);
    }
  }

  const drillEntries = useMemo(() => {
    if (!drill || !data || !period) return [];
    if (drill.entryIds) {
      const set = new Set(drill.entryIds);
      return data.entries.filter((e) => set.has(e.id)).sort((a, b) => a.date.localeCompare(b.date));
    }
    return entriesForAccounts(data.entries, drill.accounts ?? [], period, true);
  }, [drill, data, period]);

  function onCheck(c: Check) {
    if (c.id === "bank") { window.location.href = "/transactions"; return; }
    if (c.id === "suspense") {
      setDrill({ title: t("Невыясненные суммы"), subtitle: t("Счета 1595 и 3615"), accounts: ["1595", "3615"] });
      return;
    }
    const tab0 = CHECK_TAB[c.id];
    if (tab0) {
      setTab(tab0);
      document.getElementById("statement")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const s = data?.statements;
  const tabInfo = TABS.find((t) => t.key === tab)!;
  const cashEnd = s ? (s.balanceSheet.closing[110] ?? 0) + (s.balanceSheet.closing[120] ?? 0) : 0;

  const okChecks = s ? s.checks.filter((c) => c.status === "ok").length : 0;
  const anyError = s ? s.checks.some((c) => c.status === "error") : false;
  const field = "rounded-lg border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream shadow-card focus:border-fl-info focus:outline-none";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      {/* controls */}
      <section aria-label={t("Компания и период")} className="mb-6 flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55 lg:min-w-[240px]">
          {t("Компания")}
          <select
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setRegimeOverride(null); }}
            className={field}
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.access === "view" && !c.demo ? ` · ${t("просмотр")}` : ""}</option>)}
            <option value={NEW_COMPANY}>{t("+ Добавить компанию…")}</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55">
          {t("Период")}
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        <label className="flex flex-col gap-1 text-xs font-medium text-fl-cream/55 lg:ml-auto lg:w-[330px]">
          {t("Налоговый режим")}
          <select
            value={data?.company.regime ?? ""}
            onChange={(e) => changeRegime(e.target.value)}
            disabled={!data}
            className={field}
          >
            <option value="" disabled>{t("Не выбран")}</option>
            {(Object.keys(REGIMES) as RegimeKey[]).map((k) => <option key={k} value={k}>{t(REGIMES[k])}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}
      {!s && loading && <p className="text-sm text-fl-cream/50">{t("Строю отчётность…")}</p>}

      {s && data && period && (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {/* hero */}
          <section aria-label={t("Итоги периода")} className="overflow-hidden rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card">
            <div className="flex flex-col gap-6 p-5 sm:p-7 md:flex-row md:items-center">
              <div className="min-w-0 flex-1">
                <p className="text-sm text-fl-cream/60">
                  {data.company.name} · {t(periodLabel(period.from, period.to))}
                </p>
                <p className="mt-3 text-sm font-medium text-fl-cream/70">{t("Чистая прибыль")}</p>
                <p className={`mt-1 text-5xl font-semibold tracking-tight sm:text-6xl ${s.incomeStatement.netProfit < 0 ? "text-fl-red" : "text-fl-cream"}`}>
                  {formatNumber(s.incomeStatement.netProfit, 0)}
                  <span className="ml-2 text-xl font-normal text-fl-cream/45">{t("сом")}</span>
                </p>
                <p className="mt-2 text-sm text-fl-cream/60">
                  {t("{p}% от чистой выручки", { p: s.incomeStatement.margin.toLocaleString("ru-RU", { maximumFractionDigits: 1 }) })}
                  {data.company.regime && <> · {t(REGIME_INFO[data.company.regime].short)}</>}
                </p>
              </div>
              <button
                onClick={() => document.getElementById("checks")?.scrollIntoView({ behavior: "smooth", block: "start" })}
                className="group flex items-center gap-4 self-start rounded-xl border border-fl-line bg-fl-charcoal px-4 py-3 text-left hover:border-fl-gold/40 md:self-center"
              >
                <Seal ok={okChecks} total={s.checks.length} error={anyError} />
                <span>
                  <span className="block text-sm font-semibold text-fl-cream">
                    {okChecks === s.checks.length ? t("Отчётность сходится") : anyError ? t("Есть расхождения") : t("Есть замечания")}
                  </span>
                  <span className="block text-xs text-fl-cream/55">{t("{a} из {b} сверок · подробнее", { a: okChecks, b: s.checks.length })}</span>
                </span>
              </button>
            </div>
            <div className="grid grid-cols-1 border-t border-fl-line sm:grid-cols-3">
              <Figure label={t("Чистая выручка")} value={s.incomeStatement.netRevenue} note={s.incomeStatement.byLine.otherOpIncome ? t("и прочие доходы {s}", { s: formatNumber(s.incomeStatement.byLine.otherOpIncome, 0) }) : t("за период")} />
              <Figure label={t("Деньги на конец периода")} value={cashEnd} note={t("касса и банк")} border />
              <Figure label={t("Налоги начислены")} value={s.taxes.posted} note={s.taxes.computed ? t("расчёт по режиму {s}", { s: formatNumber(s.taxes.computed.total, 0) }) : t("режим не выбран")} border />
            </div>
          </section>

          {data.demo && (
            <Notice>
              {t("Демо-компания: мебельное производство на едином налоге, III квартал 2026. Изменить её нельзя — чтобы попробовать на своих данных, создайте копию в «Журнале».")}
            </Notice>
          )}

          <Dashboard s={s} />

          <div id="checks" className="scroll-mt-20">
            <ChecksStrip checks={s.checks} onSelect={onCheck} />
          </div>

          {/* statements */}
          <section id="statement" className="scroll-mt-20">
            <div className="mb-4 flex flex-wrap items-end justify-between gap-3 border-b border-fl-line">
              <div role="tablist" aria-label={t("Формы отчётности")} className="-mb-px flex gap-1 overflow-x-auto">
                {TABS.map((tb) => (
                  <button
                    key={tb.key}
                    role="tab"
                    aria-selected={tab === tb.key}
                    onClick={() => setTab(tb.key)}
                    className={`whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm font-medium transition-colors ${
                      tab === tb.key ? "border-fl-accent text-fl-cream" : "border-transparent text-fl-cream/55 hover:text-fl-cream"
                    }`}
                  >
                    {t(tb.label)}
                  </button>
                ))}
              </div>
              <a
                href={`/packages?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`}
                className="mb-2 rounded-lg bg-fl-accent px-3.5 py-2 text-sm font-semibold text-fl-on-accent shadow-card hover:bg-fl-accent-hover"
              >
                {t("Скачать отчёты")}
              </a>
            </div>
            <h2 className="mb-3 font-display text-xl font-semibold text-fl-cream">
              {t(tabInfo.full)}
              <span className="ml-2 font-body text-sm font-normal text-fl-cream/45">{t(periodLabel(period.from, period.to))}</span>
            </h2>

            {tab === "tb" && <TrialBalanceTable s={s} onDrill={setDrill} onGoto={setTab} />}
            {tab === "is" && <IncomeStatementTable s={s} onDrill={setDrill} onGoto={setTab} />}
            {tab === "bs" && <BalanceSheetTable s={s} onDrill={setDrill} onGoto={setTab} />}
            {tab === "cf" && <CashFlowTable s={s} onDrill={setDrill} onGoto={setTab} />}
            {tab === "eq" && <EquityTable s={s} onDrill={setDrill} onGoto={setTab} />}
            {tab === "tax" && (
              <TaxPanel s={s} onDrill={setDrill} onGoto={setTab} canPost={!data.demo} posting={posting} onPost={postTaxes} />
            )}
          </section>
        </div>
      )}

      <Drawer open={!!drill} title={drill?.title ?? ""} subtitle={drill?.subtitle} onClose={closeDrill}>
        {drillEntries.length === 0 ? (
          <p className="text-sm text-fl-cream/50">{t("За период нет проводок по этой строке — сумма сложилась из начальных остатков.")}</p>
        ) : (
          drillEntries.map((e) => <EntryCard key={e.id} entry={e} highlight={drill?.accounts} />)
        )}
      </Drawer>

      <toast.ToastContainer />
    </main>
  );
}

/** Reconciliation seal: ring fills with passing checks. */
function Seal({ ok, total, error }: { ok: number; total: number; error: boolean }) {
  const r = 22, c = 2 * Math.PI * r;
  const tone = ok === total ? "rgb(var(--c-pos))" : error ? "rgb(var(--c-neg))" : "rgb(var(--c-warn))";
  return (
    <svg width="56" height="56" viewBox="0 0 56 56" aria-hidden>
      <circle cx="28" cy="28" r={r} fill="none" stroke="rgb(var(--c-line))" strokeWidth="5" />
      <circle
        cx="28" cy="28" r={r} fill="none" stroke={tone} strokeWidth="5" strokeLinecap="round"
        strokeDasharray={`${(c * ok) / Math.max(1, total)} ${c}`} transform="rotate(-90 28 28)"
      />
      {ok === total ? (
        <path d="M20 28.5l5.5 5.5L37 22.5" fill="none" stroke={tone} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
      ) : (
        <text x="28" y="33" textAnchor="middle" fontSize="14" fontWeight="700" fill="rgb(var(--c-ink))">{ok}/{total}</text>
      )}
    </svg>
  );
}

function Figure({ label, value, note, border }: { label: string; value: number; note?: string; border?: boolean }) {
  const t = useT();
  return (
    <div className={`px-5 py-4 sm:px-7 ${border ? "border-t border-fl-line sm:border-l sm:border-t-0" : ""}`}>
      <p className="text-xs font-medium text-fl-cream/55">{label}</p>
      <p className="mt-1 text-2xl font-semibold text-fl-cream">
        {formatNumber(value, 0)}
        <span className="ml-1 text-sm font-normal text-fl-cream/45">{t("сом")}</span>
      </p>
      {note && <p className="mt-0.5 text-xs text-fl-cream/50">{note}</p>}
    </div>
  );
}
