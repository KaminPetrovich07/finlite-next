"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
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
import { REGIMES, type RegimeKey } from "@/lib/tax-engine";
import { formatNumber } from "@/lib/format";
import { useToast } from "@/components/Toast";

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
      if (!res.ok) throw new Error(body.error ?? "Не удалось построить отчётность");
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
    if (!res.ok) { toast.show("Не удалось сохранить режим", "error"); return; }
    toast.show("Режим сохранён. Пересчитайте налоги за период", "info");
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
      toast.show(`Налоги начислены: ${formatNumber(body.accrual.total, 0)} сом`);
      await load();
    } catch (e: any) {
      toast.show(e.message ?? "Ошибка начисления", "error");
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
      setDrill({ title: "Невыясненные суммы", subtitle: "Счета 1595 и 3615", accounts: ["1595", "3615"] });
      return;
    }
    const t = CHECK_TAB[c.id];
    if (t) {
      setTab(t);
      document.getElementById("statement")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  const s = data?.statements;
  const tabInfo = TABS.find((t) => t.key === tab)!;
  const cashEnd = s ? (s.balanceSheet.closing[110] ?? 0) + (s.balanceSheet.closing[120] ?? 0) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">Отчётность</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            Все формы строятся из одного журнала проводок, поэтому каждая цифра раскрывается до операций,
            а формы сверяются друг с другом автоматически.
          </p>
        </div>
        <a href="/ledger" className="text-sm text-fl-gold underline-offset-4 hover:underline">Открыть журнал проводок</a>
      </header>

      {/* controls */}
      <section className="mb-5 flex flex-col gap-3 rounded-xl border border-fl-gold/15 bg-fl-charcoal-2 p-4 sm:p-5 lg:flex-row lg:flex-wrap lg:items-center">
        <label className="flex flex-col gap-1 text-xs text-fl-cream/50 lg:min-w-[220px]">
          Компания
          <select
            value={companyId}
            onChange={(e) => { setCompanyId(e.target.value); setRegimeOverride(null); }}
            className="rounded-md border border-fl-gold/25 bg-fl-charcoal px-2.5 py-2 text-sm text-fl-cream"
          >
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">
          Период
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        <label className="flex flex-col gap-1 text-xs text-fl-cream/50 lg:ml-auto lg:min-w-[260px]">
          Налоговый режим
          <select
            value={data?.company.regime ?? ""}
            onChange={(e) => changeRegime(e.target.value)}
            disabled={!data}
            className="rounded-md border border-fl-gold/25 bg-fl-charcoal px-2.5 py-2 text-sm text-fl-cream"
          >
            <option value="" disabled>Не выбран</option>
            {(Object.keys(REGIMES) as RegimeKey[]).map((k) => <option key={k} value={k}>{REGIMES[k]}</option>)}
          </select>
        </label>
      </section>

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}
      {!s && loading && <p className="text-sm text-fl-cream/50">Строю отчётность…</p>}

      {s && data && period && (
        <div className={`space-y-6 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {data.demo && (
            <Notice>
              Демо-компания: швейный цех на едином налоге, данные за июль 2026. Её нельзя изменить — чтобы попробовать
              на своих данных, создайте копию в «Журнале».
            </Notice>
          )}

          {/* period headline */}
          <section aria-label="Итоги периода" className="grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-fl-gold/15 bg-fl-gold/10 lg:grid-cols-4">
            <Figure label="Выручка и прочие доходы" value={s.incomeStatement.revenueTotal} />
            <Figure label="Чистая прибыль" value={s.incomeStatement.netProfit} note={`${s.incomeStatement.margin.toFixed(1)}% от выручки`} tone={s.incomeStatement.netProfit >= 0 ? "pos" : "neg"} />
            <Figure label="Деньги на конец периода" value={cashEnd} note={`касса и банк, ${periodLabel(period.from, period.to)}`} />
            <Figure label="Налоги начислены" value={s.taxes.posted} note={s.taxes.computed ? `расчёт ${formatNumber(s.taxes.computed.total, 0)}` : "режим не выбран"} />
          </section>

          <ChecksStrip checks={s.checks} onSelect={onCheck} />

          {/* statements */}
          <section id="statement" className="scroll-mt-20">
            <div role="tablist" aria-label="Формы отчётности" className="mb-4 flex gap-1 overflow-x-auto border-b border-fl-gold/15">
              {TABS.map((t) => (
                <button
                  key={t.key}
                  role="tab"
                  aria-selected={tab === t.key}
                  onClick={() => setTab(t.key)}
                  className={`-mb-px whitespace-nowrap border-b-2 px-3.5 py-2.5 text-sm transition-colors ${
                    tab === t.key ? "border-fl-gold text-fl-gold-bright" : "border-transparent text-fl-cream/55 hover:text-fl-cream"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <h2 className="mb-3 font-display text-xl font-semibold text-fl-cream">
              {tabInfo.full}
              <span className="ml-2 font-body text-sm font-normal text-fl-cream/45">{periodLabel(period.from, period.to)}</span>
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
          <p className="text-sm text-fl-cream/50">За период нет проводок по этой строке — сумма сложилась из начальных остатков.</p>
        ) : (
          drillEntries.map((e) => <EntryCard key={e.id} entry={e} highlight={drill?.accounts} />)
        )}
      </Drawer>

      <toast.ToastContainer />
    </main>
  );
}

function Figure({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: "pos" | "neg" }) {
  return (
    <div className="bg-fl-charcoal-2 px-4 py-4 sm:px-5">
      <p className="text-xs text-fl-cream/50">{label}</p>
      <p className={`num mt-1 text-xl font-semibold sm:text-2xl ${tone === "neg" ? "text-fl-red" : tone === "pos" ? "text-fl-green" : "text-fl-cream"}`}>
        {formatNumber(value, 0)}
        <span className="ml-1 font-body text-sm font-normal text-fl-cream/40">сом</span>
      </p>
      {note && <p className="mt-0.5 text-xs text-fl-cream/40">{note}</p>}
    </div>
  );
}
