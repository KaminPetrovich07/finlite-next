"use client";

import { useState, useEffect } from "react";
import { formatNumber, parseFormattedNumber } from "@/lib/format";

interface MoneyInputProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
  required?: boolean;
}

/**
 * Numeric input with live thousands-separator formatting.
 * Uses inputMode="decimal" (not type="number") so mobile keyboards show
 * the numeric pad while we keep full control over display formatting —
 * native <input type="number"> cannot show grouped digits at all.
 */
export function MoneyInput({ label, value, onChange, hint, required }: MoneyInputProps) {
  const [display, setDisplay] = useState(value ? formatNumber(value) : "");
  const [focused, setFocused] = useState(false);

  useEffect(() => {
    if (!focused) setDisplay(value ? formatNumber(value) : "");
  }, [value, focused]);

  return (
    <label className="block">
      <span className="text-sm font-medium text-fl-cream/80">
        {label}
        {required && <span className="text-fl-gold ml-1">*</span>}
      </span>
      <input
        type="text"
        inputMode="decimal"
        value={display}
        required={required}
        onFocus={() => setFocused(true)}
        onChange={(e) => setDisplay(e.target.value)}
        onBlur={() => {
          setFocused(false);
          const parsed = parseFormattedNumber(display);
          onChange(parsed);
          setDisplay(parsed ? formatNumber(parsed) : "");
        }}
        className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal
                   px-3 py-2.5 text-base text-fl-cream tabular-nums
                   placeholder:text-fl-cream/30
                   focus:border-fl-gold focus:outline-none focus:ring-1 focus:ring-fl-gold/50"
        placeholder="0"
      />
      {hint && <span className="mt-1 block text-xs text-fl-cream/50">{hint}</span>}
    </label>
  );
}
