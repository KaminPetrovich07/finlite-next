"use client";

import { useCallback, useEffect, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { EntryCard } from "@/components/ledger/EntryCard";
import { EntryForm } from "@/components/ledger/EntryForm";
import { Notice } from "@/components/ledger/statements";
import { useToast } from "@/components/Toast";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import type { LedgerEntry } from "@/lib/ledger/types";

function currentMonth() {
  const d = new Date();
  return monthPeriod(d.getFullYear(), d.getMonth() + 1);
}

export default function LedgerPage() {
  const { companies, companyId, setCompanyId, company, loaded, reload } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<null | "manual" | "opening">(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    setPeriod(company?.demo ? DEMO_PERIOD : currentMonth());
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  const isDemo = !!company?.demo;

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    if (isDemo) {
      setEntries(
        demoEntries()
          .filter((e) => e.source === "opening" || (e.date >= period.from && e.date <= period.to))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      return;
    }
    try {
      const res = await fetch(`/api/ledger?companyId=${companyId}&from=${period.from}&to=${period.to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setEntries(body);
    } catch (e: any) {
      setError(e.message ?? "Не удалось загрузить журнал");
      setEntries([]);
    }
  }, [companyId, period, isDemo]);

  useEffect(() => { load(); }, [load]);

  async function save(entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string }> }) {
    const res = await fetch("/api/ledger", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...entry, companyId, source: form }),
    });
    const body = await res.json();
    if (!res.ok) { toast.show(body.error ?? "Проводка не сохранена", "error"); return false; }
    toast.show("Проводка сохранена — отчётность обновлена");
    setForm(null);
    load();
    return true;
  }

  async function remove(id: string) {
    if (!confirm("Удалить проводку? Все отчёты пересчитаются без неё.")) return;
    const res = await fetch(`/api/ledger/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) { toast.show(body.error ?? "Не удалось удалить", "error"); return; }
    toast.show("Проводка удалена", "info");
    load();
  }

  async function postBank() {
    setBusy(true);
    const res = await fetch("/api/ledger/post-bank", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.show(body.error ?? "Ошибка", "error"); return; }
    toast.show(body.posted ? `Проведено операций из выписок: ${body.posted}` : "Все операции выписок уже в журнале", "info");
    load();
  }

  async function createDemoCopy() {
    setBusy(true);
    const res = await fetch("/api/demo", { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.show(body.error ?? "Не удалось создать компанию", "error"); return; }
    toast.show("Создана редактируемая копия демо-компании");
    await reload(body.id);
  }

  const opening = entries.filter((e) => e.source === "opening");
  const inPeriod = entries.filter((e) => e.source !== "opening");

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-8 sm:px-6 sm:pt-10">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">Журнал проводок</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            Единственный источник данных для баланса, ОПиУ, ОДДС, отчёта о капитале и налогов. Операции из банковских
            выписок попадают сюда автоматически.
          </p>
        </div>
        <a href="/reports" className="text-sm text-fl-gold underline-offset-4 hover:underline">Открыть отчётность</a>
      </header>

      <section className="mb-5 flex flex-col gap-3 rounded-xl border border-fl-gold/15 bg-fl-charcoal-2 p-4 sm:p-5 lg:flex-row lg:items-center">
        <label className="flex flex-col gap-1 text-xs text-fl-cream/50 lg:min-w-[220px]">
          Компания
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setForm(null); }}
            className="rounded-md border border-fl-gold/25 bg-fl-charcoal px-2.5 py-2 text-sm text-fl-cream">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">
          Период
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
      </section>

      {isDemo ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fl-gold/15 bg-fl-gold/5 px-4 py-3">
          <p className="text-sm text-fl-cream/70">Демо-компания только для просмотра. Копию можно менять, удалять и дополнять.</p>
          <button onClick={createDemoCopy} disabled={busy}
            className="rounded-md bg-fl-gold px-4 py-2 text-sm font-semibold text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50">
            Создать редактируемую копию
          </button>
        </div>
      ) : (
        <div className="mb-5 flex flex-wrap gap-2">
          <button onClick={() => setForm("manual")} className="rounded-md bg-fl-gold px-4 py-2.5 text-sm font-semibold text-fl-charcoal hover:bg-fl-gold-bright">
            Новая проводка
          </button>
          <button onClick={() => setForm("opening")} className="rounded-md border border-fl-gold/40 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10">
            Ввести начальные остатки
          </button>
          <button onClick={postBank} disabled={busy} className="rounded-md border border-fl-gold/20 px-4 py-2.5 text-sm text-fl-cream/70 hover:text-fl-cream disabled:opacity-50">
            Провести операции из выписок
          </button>
        </div>
      )}

      {form && period && (
        <div className="mb-6">
          <EntryForm key={form} mode={form} defaultDate={period.from} onSubmit={save} onCancel={() => setForm(null)} />
        </div>
      )}

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}

      {period && (
        <section className="space-y-6">
          {opening.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Начальные остатки</h2>
              <div className="space-y-2.5">
                {opening.map((e) => <EntryCard key={e.id} entry={e} onDelete={isDemo ? undefined : remove} />)}
              </div>
            </div>
          )}
          <div>
            <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">
              Операции за {periodLabel(period.from, period.to).toLowerCase()}
              <span className="ml-2 font-body text-sm font-normal text-fl-cream/45">{inPeriod.length}</span>
            </h2>
            {inPeriod.length === 0 ? (
              <Notice>
                За период проводок нет. Начните с начальных остатков, затем добавьте операции вручную или загрузите
                выписку на странице «Выписки» — она проведётся сюда сама.
              </Notice>
            ) : (
              <div className="space-y-2.5">
                {inPeriod.map((e) => <EntryCard key={e.id} entry={e} onDelete={isDemo ? undefined : remove} />)}
              </div>
            )}
          </div>
        </section>
      )}

      <toast.ToastContainer />
    </main>
  );
}
