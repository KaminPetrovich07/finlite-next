"use client";

import { useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { compareRegimes } from "@/lib/tax-engine";
import { formatNumber, formatPercent } from "@/lib/format";

const empty = { revenue: 0, otherIncome: 0, cogs: 0, salaries: 0, rent: 0, sellingExp: 0, adminExp: 0 };

export default function ComparePage() {
  const [inputs, setInputs] = useState(empty);
  const results = compareRegimes(inputs);
  const best = results[0];

  return (
    <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          💡 Оптимальный налоговый режим
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">Сравнение всех режимов НК КР по введённым данным</p>
      </header>

      <section className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:grid-cols-2 sm:p-5">
        <MoneyInput label="Выручка" value={inputs.revenue} onChange={(v) => setInputs((s) => ({ ...s, revenue: v }))} required />
        <MoneyInput label="Прочие доходы" value={inputs.otherIncome} onChange={(v) => setInputs((s) => ({ ...s, otherIncome: v }))} />
        <MoneyInput label="Себестоимость" value={inputs.cogs} onChange={(v) => setInputs((s) => ({ ...s, cogs: v }))} required />
        <MoneyInput label="Зарплата" value={inputs.salaries} onChange={(v) => setInputs((s) => ({ ...s, salaries: v }))} />
        <MoneyInput label="Аренда" value={inputs.rent} onChange={(v) => setInputs((s) => ({ ...s, rent: v }))} />
        <MoneyInput label="Расходы по реализации" value={inputs.sellingExp} onChange={(v) => setInputs((s) => ({ ...s, sellingExp: v }))} />
        <MoneyInput label="Адм. расходы" value={inputs.adminExp} onChange={(v) => setInputs((s) => ({ ...s, adminExp: v }))} />
      </section>

      {inputs.revenue > 0 && (
        <>
          <div className={`mb-6 rounded-lg border p-3 text-sm ${
            results[0] ? "border-fl-gold/40 bg-fl-gold/10 text-fl-cream" : ""
          }`}>
            💡 Выгоднее всего: <span className="font-semibold text-fl-gold-bright">{best.name}</span>
            {" — чистая прибыль "}
            <span className="font-mono">{formatNumber(best.net)}</span> сом
          </div>

          <section className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-2 pr-3">Режим</th>
                  <th className="py-2 pr-3 text-right">Прямые налоги</th>
                  <th className="py-2 pr-3 text-right">Чистая прибыль</th>
                  <th className="py-2 pr-3 text-right">Рент., %</th>
                  <th className="py-2 pr-2 text-center">✓</th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.key} className={`border-t border-fl-gold/10 ${r.key === best.key ? "bg-fl-gold/5" : ""}`}>
                    <td className="py-2 pr-3 text-fl-cream/90">{r.name}</td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums">{formatNumber(r.tax)}</td>
                    <td className={`py-2 pr-3 text-right font-mono tabular-nums ${r.key === best.key ? "text-fl-gold-bright font-semibold" : "text-fl-cream"}`}>
                      {formatNumber(r.net)}
                    </td>
                    <td className="py-2 pr-3 text-right font-mono tabular-nums text-fl-cream/70">{formatPercent(r.pct)}</td>
                    <td className="py-2 pr-2 text-center">{r.key === best.key ? "✅" : ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
