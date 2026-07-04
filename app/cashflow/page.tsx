"use client";

import { useEffect, useState } from "react";
import { useReportPicker, ReportPickerBar } from "@/components/ReportPicker";
import { CF_TABLE, OP_IN, OP_OUT, INV_IN, INV_OUT, FIN_IN, FIN_OUT, computeCashFlowTotals } from "@/lib/cash-flow";
import { formatNumber } from "@/lib/format";

const CF_LABELS: Record<number, string> = Object.fromEntries(
  CF_TABLE.filter((r) => r.code !== null).map((r) => [r.code as number, r.label])
);

function FieldGroup({
  title, codes, values, onChange,
}: { title: string; codes: number[]; values: Record<number, number>; onChange: (code: number, v: number) => void }) {
  return (
    <div>
      <h3 className="mb-2 text-sm font-medium text-fl-cream/70">{title}</h3>
      <div className="space-y-2">
        {codes.map((code) => (
          <label key={code} className="block">
            <span className="text-xs text-fl-cream/50">[{code}] {CF_LABELS[code]}</span>
            <input
              type="number"
              value={values[code] ?? 0}
              onChange={(e) => onChange(code, Number(e.target.value))}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2 text-sm text-fl-cream tabular-nums"
            />
          </label>
        ))}
      </div>
    </div>
  );
}

export default function CashFlowPage() {
  const picker = useReportPicker();
  const [values, setValues] = useState<Record<number, number>>({});
  const [saving, setSaving] = useState(false);
  const [saveMsg, setSaveMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!picker.reportId) { setValues({}); return; }
    fetch(`/api/reports/${picker.reportId}`).then((r) => r.json()).then((report) => {
      setValues(report.cashFlow ?? {});
    });
  }, [picker.reportId]);

  const totals = computeCashFlowTotals(values);
  const setValue = (code: number, v: number) => setValues((s) => ({ ...s, [code]: v }));

  async function save() {
    if (!picker.reportId) return;
    setSaving(true);
    setSaveMsg(null);
    try {
      const res = await fetch(`/api/reports/${picker.reportId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashFlow: values }),
      });
      if (!res.ok) throw new Error("Ошибка сохранения");
      setSaveMsg("✅ ОДДС сохранён");
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
          ОДДС · ФОСАМК Ф.№3
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">IAS 7, прямой метод</p>
      </header>

      <ReportPickerBar {...picker} />

      {!picker.reportId ? (
        <p className="text-sm text-fl-cream/50">Выберите отчёт, чтобы заполнить ОДДС.</p>
      ) : (
        <>
          <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Операционная деятельность</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FieldGroup title="Поступления" codes={OP_IN} values={values} onChange={setValue} />
              <FieldGroup title="Платежи" codes={OP_OUT} values={values} onChange={setValue} />
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Инвестиционная деятельность</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FieldGroup title="Поступления" codes={INV_IN} values={values} onChange={setValue} />
              <FieldGroup title="Платежи" codes={INV_OUT} values={values} onChange={setValue} />
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-base font-semibold text-fl-cream">Финансовая деятельность</h2>
            <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
              <FieldGroup title="Поступления" codes={FIN_IN} values={values} onChange={setValue} />
              <FieldGroup title="Платежи" codes={FIN_OUT} values={values} onChange={setValue} />
            </div>
          </section>

          <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <FieldGroup title="Прочее" codes={[600, 720]} values={values} onChange={setValue} />
          </section>

          <section className="mb-6 grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Metric label="Чистый опер. поток (190)" value={formatNumber(totals[190] ?? 0)} />
            <Metric label="Чистое изм. денег (700)" value={formatNumber(totals[700] ?? 0)} />
            <Metric label="Остаток на конец (710)" value={formatNumber(totals[710] ?? 0)} gold />
          </section>

          <button
            onClick={save}
            disabled={saving}
            className="mb-6 w-full rounded-md bg-fl-gold py-3 font-display text-lg font-semibold text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50 sm:w-auto sm:px-8"
          >
            {saving ? "Сохранение…" : "💾 Сохранить ОДДС"}
          </button>
          {saveMsg && <p className="mb-6 text-sm text-fl-cream/80">{saveMsg}</p>}

          <section className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">📋 ФОСАМК Форма №3</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-1.5 pr-2 w-12">Код</th>
                  <th className="py-1.5 pr-2">Наименование показателей</th>
                  <th className="py-1.5 pr-2 text-right">За отчётный период</th>
                </tr>
              </thead>
              <tbody>
                {CF_TABLE.map((row, i) =>
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

function Metric({ label, value, gold }: { label: string; value: string; gold?: boolean }) {
  return (
    <div className="rounded-lg border border-fl-gold/10 bg-fl-charcoal-2 p-3">
      <div className="text-xs text-fl-cream/50">{label}</div>
      <div className={`mt-1 font-mono text-lg font-semibold tabular-nums ${gold ? "text-fl-gold-bright" : "text-fl-cream"}`}>{value}</div>
    </div>
  );
}
