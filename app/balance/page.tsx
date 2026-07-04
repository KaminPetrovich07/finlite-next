"use client";

import { useEffect, useState } from "react";
import { useReportPicker, ReportPickerBar } from "@/components/ReportPicker";
import { balanceSections, computeBalanceTotals, BALANCE_ROWS } from "@/lib/balance-sheet";
import { formatNumber } from "@/lib/format";

const DEFAULT_OPEN = ["1. ОБОРОТНЫЕ АКТИВЫ", "3. КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА", "5. СОБСТВЕННЫЙ КАПИТАЛ"];

export default function BalanceSheetPage() {
  const picker = useReportPicker();
  const [values, setValues] = useState<Record<number, number>>({});
  const [openSections, setOpenSections] = useState<Set<string>>(new Set(DEFAULT_OPEN));
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!picker.reportId) { setValues({}); return; }
    fetch(`/api/reports/${picker.reportId}`).then((r) => r.json()).then((report) => {
      setValues(report.balanceSheet ?? {});
    });
  }, [picker.reportId]);

  const totals = computeBalanceTotals(values);
  const totalAssets = totals[299] ?? 0;
  const totalLiabEquity = totals[599] ?? 0;
  const diff = Math.abs(totalAssets - totalLiabEquity);
  const balanced = diff < 1;

  function setValue(code: number, v: number) {
    setValues((s) => ({ ...s, [code]: v }));
  }

  function toggle(title: string) {
    setOpenSections((s) => {
      const next = new Set(s);
      next.has(title) ? next.delete(title) : next.add(title);
      return next;
    });
  }

  async function save() {
    if (!picker.reportId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/reports/${picker.reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ balanceSheet: values }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setSaveMsg("✅ Баланс сохранён");
    } catch (e: any) {
      setSaveMsg(`❌ ${e.message}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          Баланс · ФОСАМК Ф.№1
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">IAS 1.54 — Активы = Обязательства + Капитал</p>
      </header>

      <ReportPickerBar {...picker} />

      {!picker.reportId ? (
        <p className="text-sm text-fl-cream/50">Выберите отчёт, чтобы заполнить баланс.</p>
      ) : (
        <>
          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Итого активы (299)" value={formatNumber(totalAssets)} />
            <Metric label="Обяз. + Капитал (599)" value={formatNumber(totalLiabEquity)} />
            <Metric label="Расхождение" value={formatNumber(diff)} accent={!balanced} />
          </section>

          <div className={`mb-6 rounded-lg border p-3 text-sm ${
            balanced ? "border-fl-green/40 bg-fl-green/10 text-fl-cream" : "border-fl-red/40 bg-fl-red/10 text-fl-cream"
          }`}>
            {balanced
              ? "✅ Баланс сведён: Активы = Обязательства + Капитал (IAS 1.54)"
              : `❌ Баланс не сведён! Разница: ${formatNumber(diff)} сом`}
          </div>

          {balanceSections().map((section) => (
            <section key={section.title} className="mb-4 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2">
              <button
                onClick={() => toggle(section.title)}
                className="flex w-full items-center justify-between px-4 py-3 text-left font-display text-base font-semibold text-fl-gold-bright sm:px-5"
              >
                <span>{section.title}</span>
                <span className="text-fl-cream/50">{openSections.has(section.title) ? "−" : "+"}</span>
              </button>
              {openSections.has(section.title) && (
                <div className="grid grid-cols-1 gap-3 border-t border-fl-gold/10 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-3">
                  {section.rows.map((row) => (
                    <label key={row.code}>
                      <span className={`text-xs ${row.isSub ? "text-fl-cream/40" : "text-fl-cream/70"}`}>
                        [{row.code}] {row.label}
                      </span>
                      <input
                        type="number"
                        value={values[row.code!] ?? 0}
                        onChange={(e) => setValue(row.code!, Number(e.target.value))}
                        className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2 text-sm text-fl-cream tabular-nums"
                      />
                    </label>
                  ))}
                </div>
              )}
            </section>
          ))}

          <button
            onClick={save}
            disabled={saving}
            className="mb-6 w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {saving ? "Сохранение…" : "💾 Сохранить баланс"}
          </button>
          {saveMsg && <p className="mb-6 text-sm text-fl-cream/80">{saveMsg}</p>}

          <section className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">📋 ФОСАМК Форма №1 (полная)</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-1.5 pr-2 w-12">Код</th>
                  <th className="py-1.5 pr-2">Наименование показателей</th>
                  <th className="py-1.5 pr-2 text-right">На конец периода</th>
                </tr>
              </thead>
              <tbody>
                {BALANCE_ROWS.map((row, i) =>
                  row.code === null ? (
                    <tr key={`sec-${i}`} className="border-t border-fl-gold/10">
                      <td colSpan={3} className="py-2 font-medium text-fl-gold-bright">{row.label}</td>
                    </tr>
                  ) : (
                    <tr key={row.code} className={`border-t border-fl-gold/5 ${row.isTotal ? "font-semibold text-fl-gold" : "text-fl-cream/80"}`}>
                      <td className="py-1.5 pr-2 text-fl-cream/40">{row.code}</td>
                      <td className="py-1.5 pr-2">{row.label}</td>
                      <td className="py-1.5 pr-2 text-right font-mono tabular-nums">{formatNumber(totals[row.code] ?? 0)}</td>
                    </tr>
                  )
                )}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-fl-red/30" : "border-fl-gold/10"} bg-fl-charcoal-2`}>
      <div className="text-xs text-fl-cream/50">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${accent ? "text-fl-red" : "text-fl-cream"}`}>{value}</div>
    </div>
  );
}
