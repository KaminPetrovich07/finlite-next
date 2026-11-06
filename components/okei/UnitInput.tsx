"use client";

import { useMemo, useState } from "react";
import { findUnit, normalizeUnit, unitName, unitSuggestions, unitSymbol } from "@/lib/okei";
import { OkeiPicker } from "./OkeiPicker";

export const OKEI_LIST_ID = "fl-okei-units";

/** Общий список подсказок для всех полей «Ед. изм.» на странице — вставить один раз. */
export function OkeiDatalist() {
  const opts = useMemo(() => unitSuggestions(), []);
  return <datalist id={OKEI_LIST_ID}>{opts.map((o) => <option key={o.value} value={o.value} label={o.label} />)}</datalist>;
}

interface Props {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  placeholder?: string;
  "aria-label"?: string;
}

/**
 * Поле «Ед. изм.» с подсказками из ОКЕИ и кнопкой подбора из классификатора.
 * При выходе из поля обозначение приводится к ОКЕИ (шт. → шт, м² → м2);
 * единица не из классификатора допускается, но подсвечивается.
 */
export function UnitInput({ value, onChange, className = "", placeholder = "Ед.", ...rest }: Props) {
  const [open, setOpen] = useState(false);
  const u = findUnit(value);
  const unknown = !!value.trim() && !u;
  const hint = u ? `${u.code} · ${unitName(u)} (ОКЕИ)` : unknown ? "Нет в классификаторе ОКЕИ — выберите единицу из списка" : "Единица измерения по ОКЕИ";
  return (
    <div className="relative">
      <input
        {...rest}
        list={OKEI_LIST_ID}
        placeholder={placeholder}
        value={value}
        title={hint}
        onChange={(e) => onChange(e.target.value)}
        onBlur={() => { const n = normalizeUnit(value); if (n !== value) onChange(n); }}
        className={`${className} ${u ? "pr-14" : "pr-7"} ${unknown ? "!border-fl-amber/70" : ""}`}
      />
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="Подобрать из классификатора ОКЕИ"
        aria-label="Подобрать единицу из классификатора ОКЕИ"
        className="absolute inset-y-0 right-0 flex w-7 items-center justify-center text-xs text-fl-cream/45 hover:text-fl-gold"
      >
        ⋯
      </button>
      {u && <span aria-hidden className="num pointer-events-none absolute inset-y-0 right-7 flex items-center text-[10px] text-fl-cream/35">{u.code}</span>}
      <OkeiPicker open={open} value={value} onClose={() => setOpen(false)} onPick={(x) => onChange(unitSymbol(x))} />
    </div>
  );
}
