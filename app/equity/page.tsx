"use client";

import { useEffect, useState } from "react";
import { useReportPicker, ReportPickerBar } from "@/components/ReportPicker";
import { EQUITY_ROWS, EQUITY_COLUMNS, equityKey, defaultEquityValues, type EquityValues } from "@/lib/equity";

export default function EquityPage() {
  const picker = useReportPicker();
  const [values, setValues] = useState<EquityValues>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!picker.reportId) { setValues({}); return; }
    fetch(`/api/reports/${picker.reportId}`).then((r) => r.json()).then((report) => {
      const existing = report.equityStatement as EquityValues | null;
      setValues(existing && Object.keys(existing).length > 0 ? existing : defaultEquityValues(report.netProfit ?? 0));
    });
  }, [picker.reportId]);

  function setValue(code: number, col: number, v: number) {
    setValues((s) => ({ ...s, [equityKey(code, col)]: v }));
  }

  async function save() {
    if (!picker.reportId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/reports/${picker.reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ equityStatement: values }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setSaveMsg("✅ Капитал сохранён");
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
          Капитал · ФОСАМК Ф.№4
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">Изменения в собственном капитале</p>
      </header>

      <ReportPickerBar {...picker} />

      {!picker.reportId ? (
        <p className="text-sm text-fl-cream/50">Выберите отчёт, чтобы заполнить отчёт о капитале.</p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-2 pr-3 w-12">Код</th>
                  <th className="py-2 pr-3">Показатель</th>
                  {EQUITY_COLUMNS.map((c) => <th key={c} className="py-2 pr-3 text-right">{c}</th>)}
                </tr>
              </thead>
              <tbody>
                {EQUITY_ROWS.map((row) => (
                  <tr key={row.code} className={`border-t border-fl-gold/10 ${row.isTotal ? "font-semibold text-fl-gold" : "text-fl-cream/80"}`}>
                    <td className="py-2 pr-3 text-fl-cream/40">{row.code}</td>
                    <td className="py-2 pr-3">{row.label}</td>
                    {EQUITY_COLUMNS.map((_, ci) => (
                      <td key={ci} className="py-1.5 pr-3">
                        <input
                          type="number"
                          value={values[equityKey(row.code, ci)] ?? 0}
                          onChange={(e) => setValue(row.code, ci, Number(e.target.value))}
                          className="w-28 rounded-md border border-fl-gold/30 bg-fl-charcoal px-2 py-1.5 text-right text-sm text-fl-cream tabular-nums"
                        />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          <button
            onClick={save}
            disabled={saving}
            className="mt-6 w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {saving ? "Сохранение…" : "💾 Сохранить"}
          </button>
          {saveMsg && <p className="mt-3 text-sm text-fl-cream/80">{saveMsg}</p>}
        </>
      )}
    </main>
  );
}
