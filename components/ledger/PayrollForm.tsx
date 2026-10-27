"use client";

import { useMemo, useState } from "react";
import { DEPARTMENTS, payrollLines, type Department } from "@/lib/ledger/payroll";
import { formatNumber, parseFormattedNumber } from "@/lib/format";

interface Props {
  defaultDate: string;
  onSubmit: (p: { date: string } & Record<Department, number>) => Promise<boolean>;
  onCancel: () => void;
}

const field = "w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";

export function PayrollForm({ defaultDate, onSubmit, onCancel }: Props) {
  const [date, setDate] = useState(defaultDate);
  const [gross, setGross] = useState<Record<Department, string>>({ production: "", sales: "", admin: "" });
  const [saving, setSaving] = useState(false);
  const nums = useMemo(() => ({
    production: parseFormattedNumber(gross.production), sales: parseFormattedNumber(gross.sales), admin: parseFormattedNumber(gross.admin),
  }), [gross]);
  const p = payrollLines(nums);

  return (
    <form
      onSubmit={async (e) => { e.preventDefault(); if (p.gross <= 0) return; setSaving(true); await onSubmit({ date, ...nums }); setSaving(false); }}
      className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5"
    >
      <h2 className="font-display text-lg font-semibold text-fl-cream">Начисление зарплаты</h2>
      <p className="mt-1 text-sm text-fl-cream/60">
        Введите начисленную зарплату до удержаний. Взносы работника 10%, подоходный налог 10% и взносы работодателя 2,25%
        посчитаются и проведутся одной проводкой.
      </p>
      <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-4">
        <label className="text-xs font-medium text-fl-cream/55">Дата начисления
          <input type="date" required value={date} onChange={(e) => setDate(e.target.value)} className={`${field} mt-1`} />
        </label>
        {(Object.keys(DEPARTMENTS) as Department[]).map((d) => (
          <label key={d} className="text-xs font-medium text-fl-cream/55">{DEPARTMENTS[d].label} <span className="text-fl-cream/40">({DEPARTMENTS[d].wages})</span>
            <input inputMode="decimal" placeholder="0" value={gross[d]} onChange={(e) => setGross((g) => ({ ...g, [d]: e.target.value }))} className={`${field} num mt-1 text-right`} />
          </label>
        ))}
      </div>
      {p.gross > 0 && (
        <dl className="mt-4 grid grid-cols-2 gap-x-6 gap-y-1 rounded-lg bg-fl-surface-2 px-4 py-3 text-sm sm:grid-cols-4">
          <Item label="Начислено" value={p.gross} />
          <Item label="Удержано: взносы + подоходный" value={p.employeeSocial + p.pit} />
          <Item label="К выплате на руки (3520)" value={p.net} />
          <Item label="Взносы работодателя" value={p.employerSocial} />
        </dl>
      )}
      <div className="mt-4 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="rounded-lg px-4 py-2.5 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
        <button type="submit" disabled={p.gross <= 0 || saving} className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
          {saving ? "Провожу…" : "Начислить"}
        </button>
      </div>
    </form>
  );
}

function Item({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <dt className="text-xs text-fl-cream/55">{label}</dt>
      <dd className="num font-semibold text-fl-cream">{formatNumber(value, 2)}</dd>
    </div>
  );
}
