// Общее для отраслевых расширений: показатель с порогом и статусом.
export type Rule = { op: ">=" | "<=" | "between"; min?: number; max?: number };

export interface Metric {
  key: string;
  title: string;
  value: number | null; // в процентах, если unit = "%"
  unit: "%" | "сом" | "x" | "";
  rule?: Rule;
  /** откуда норма */
  source?: string;
  note?: string;
}

export type Status = "ok" | "breach" | "na";

export function status(m: Metric): Status {
  if (m.value === null || !Number.isFinite(m.value) || !m.rule) return "na";
  const v = m.value, r = m.rule;
  if (r.op === ">=") return v >= (r.min ?? -Infinity) - 1e-9 ? "ok" : "breach";
  if (r.op === "<=") return v <= (r.max ?? Infinity) + 1e-9 ? "ok" : "breach";
  return v >= (r.min ?? -Infinity) - 1e-9 && v <= (r.max ?? Infinity) + 1e-9 ? "ok" : "breach";
}

export const ruleText = (r?: Rule, unit = "%") => !r ? "" : r.op === ">=" ? `не ниже ${r.min}${unit}` : r.op === "<=" ? `не выше ${r.max}${unit}` : `от ${r.min} до ${r.max}${unit}`;

/** a / b × 100, null when b is zero */
export const pct = (a: number, b: number) => (b ? Math.round((a / b) * 10000) / 100 : null);
export const n = (v: unknown) => { const x = Number(v); return Number.isFinite(x) ? x : 0; };
