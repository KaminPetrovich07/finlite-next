"use client";

import { useEffect, useState } from "react";
import { MONTHS } from "@/lib/tax-engine";
import { monthPeriod, quarterPeriod, yearPeriod, type PeriodKind } from "@/lib/ledger/period";

interface Props {
  from: string;
  to: string;
  onChange: (p: { from: string; to: string }) => void;
}

const KINDS: Array<{ kind: PeriodKind; label: string }> = [
  { kind: "month", label: "Месяц" },
  { kind: "quarter", label: "Квартал" },
  { kind: "year", label: "Год" },
  { kind: "custom", label: "Свой период" },
];

const YEARS = [2024, 2025, 2026, 2027];
const field = "rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

export function PeriodPicker({ from, to, onChange }: Props) {
  const [kind, setKind] = useState<PeriodKind>(() => inferKind(from, to));
  const [year, setYear] = useState(Number(from.slice(0, 4)));
  const [month, setMonth] = useState(Number(from.slice(5, 7)));
  const [quarter, setQuarter] = useState(Math.floor((Number(from.slice(5, 7)) - 1) / 3) + 1);

  useEffect(() => {
    if (kind === "month") onChange(monthPeriod(year, month));
    if (kind === "quarter") onChange(quarterPeriod(year, quarter));
    if (kind === "year") onChange(yearPeriod(year));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, year, month, quarter]);

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div role="tablist" aria-label="Тип периода" className="flex rounded-md border border-fl-line p-0.5">
        {KINDS.map((k) => (
          <button
            key={k.kind}
            role="tab"
            aria-selected={kind === k.kind}
            onClick={() => setKind(k.kind)}
            className={`rounded px-2.5 py-1.5 text-sm transition-colors ${
              kind === k.kind ? "bg-fl-gold/15 text-fl-gold-bright" : "text-fl-cream/55 hover:text-fl-cream"
            }`}
          >
            {k.label}
          </button>
        ))}
      </div>

      {kind !== "custom" && (
        <select aria-label="Год" value={year} onChange={(e) => setYear(Number(e.target.value))} className={field}>
          {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
        </select>
      )}
      {kind === "month" && (
        <select aria-label="Месяц" value={month} onChange={(e) => setMonth(Number(e.target.value))} className={field}>
          {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
        </select>
      )}
      {kind === "quarter" && (
        <select aria-label="Квартал" value={quarter} onChange={(e) => setQuarter(Number(e.target.value))} className={field}>
          {[1, 2, 3, 4].map((q) => <option key={q} value={q}>{q} квартал</option>)}
        </select>
      )}
      {kind === "custom" && (
        <>
          <input type="date" aria-label="С" value={from} max={to} onChange={(e) => e.target.value && onChange({ from: e.target.value, to })} className={field} />
          <span className="text-fl-cream/40">—</span>
          <input type="date" aria-label="По" value={to} min={from} onChange={(e) => e.target.value && onChange({ from, to: e.target.value })} className={field} />
        </>
      )}
    </div>
  );
}

/** Which preset the given dates correspond to, so the picker opens on it. */
function inferKind(from: string, to: string): PeriodKind {
  const y = Number(from.slice(0, 4)), m = Number(from.slice(5, 7));
  const same = (p: { from: string; to: string }) => p.from === from && p.to === to;
  if (same(monthPeriod(y, m))) return "month";
  if ((m - 1) % 3 === 0 && same(quarterPeriod(y, (m - 1) / 3 + 1))) return "quarter";
  if (same(yearPeriod(y))) return "year";
  return "custom";
}
