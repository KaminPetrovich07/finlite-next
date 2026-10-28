"use client";

// «Взять данные из журнала»: компания + период → поля калькулятора.
// Используется калькулятором, сравнением режимов и сводкой руководителя,
// чтобы они считали по тем же проводкам, что и отчётность.
import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "./useCompanies";
import { PeriodPicker } from "./PeriodPicker";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import { calcInputFromStatements, type Bridge } from "@/lib/ledger/calc-bridge";
import { isRegimeKey, REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import type { Statements } from "@/lib/ledger/engine";
import { formatNumber } from "@/lib/format";

export interface LedgerLoad {
  bridge: Bridge;
  regime: RegimeKey;
  regimeMissing: boolean;
  companyName: string;
  period: { from: string; to: string };
  periodLabel: string;
  statements: Statements;
  entryCount: number;
}

const field = "rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

export function LedgerSource({ onLoad, onSelect, auto = false, title = "Данные из журнала проводок", note }: {
  onLoad: (d: LedgerLoad) => void;
  /** current company and period, whenever either changes */
  onSelect?: (s: { companyId: string; companyName: string; demo: boolean; period: { from: string; to: string } }) => void;
  /** load on every change of company/period (Сводка руководителя) instead of on button press */
  auto?: boolean;
  title?: string;
  note?: string;
}) {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch(`/api/statements?companyId=${companyId}&from=${period.from}&to=${period.to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Не удалось загрузить журнал");
      const s: Statements = body.statements;
      const regimeMissing = !isRegimeKey(body.company?.regime);
      const regime: RegimeKey = regimeMissing ? "general" : body.company.regime;
      const bridge = calcInputFromStatements(s, regime, body.company?.patentAmount ?? 0);
      const label = periodLabel(period.from, period.to);
      onLoad({ bridge, regime, regimeMissing, companyName: body.company?.name ?? "", period, periodLabel: label, statements: s, entryCount: s.entryCount });
      setMsg(s.entryCount === 0
        ? { ok: false, text: `За ${label.toLowerCase()} проводок нет — поля заполнены нулями. Выберите другой период или добавьте операции в «Журнале».` }
        : { ok: true, text: `Загружено: ${s.entryCount} проводок, выручка ${formatNumber(bridge.input.revenue)} сом.${regimeMissing ? " Налоговый режим компании не выбран — взят общий." : ""}` });
    } catch (e: any) {
      setMsg({ ok: false, text: e.message });
    } finally {
      setBusy(false);
    }
  }, [companyId, period, onLoad]);

  useEffect(() => { if (auto) load(); }, [auto, load]);
  useEffect(() => {
    if (onSelect && company && period) onSelect({ companyId: company.id, companyName: company.name, demo: !!company.demo, period });
  }, [onSelect, company, period]);

  return (
    <section className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5">
      <p className="label-caps mb-1">{title}</p>
      {note && <p className="mb-3 text-xs text-fl-cream/55">{note}</p>}
      <div className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end">
        <label className="flex flex-col gap-1 text-xs text-fl-cream/55 lg:min-w-[220px]">
          Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={field}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/55">
          Период
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
        {!auto && (
          <button onClick={load} disabled={busy || !period}
            className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50 lg:ml-auto">
            {busy ? "Загружаю…" : "Заполнить из журнала"}
          </button>
        )}
      </div>
      {company && company.defaultRegime && isRegimeKey(company.defaultRegime) && (
        <p className="mt-2 text-xs text-fl-cream/50">Режим компании: {REGIME_INFO[company.defaultRegime].name}</p>
      )}
      {msg && <p className={`mt-2 text-sm ${msg.ok ? "text-fl-green" : "text-fl-amber"}`}>{msg.text}</p>}
    </section>
  );
}
