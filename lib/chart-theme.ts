// Chart colours as CSS-variable strings, so Recharts follows the light/dark theme.
// Series slots s1–s3 are the first three slots of the validated categorical
// palette (dataviz skill; checked on #ffffff and #161a21: CVD ΔE ≥ 9.2,
// normal-vision ΔE ≥ 26.5). Slot 3 is below 3:1 on white, so every chart
// that uses it ships a legend and a table view (the statements themselves).
import type { CSSProperties } from "react";

export const CHART = {
  grid: "rgb(var(--c-line))",
  axis: "rgb(var(--c-ink) / 0.55)",
  axisFaint: "rgb(var(--c-ink) / 0.3)",
  surface: "rgb(var(--c-surface))",
  s1: "rgb(var(--c-s1))",
  s2: "rgb(var(--c-s2))",
  s3: "rgb(var(--c-s3))",
  s1Wash: "rgb(var(--c-s1) / 0.10)",
  pos: "rgb(var(--c-pos))",
  neg: "rgb(var(--c-neg))",
  ink: "rgb(var(--c-ink))",
  tooltip: {
    background: "rgb(var(--c-surface))",
    border: "1px solid rgb(var(--c-line))",
    borderRadius: 8,
    color: "rgb(var(--c-ink))",
    boxShadow: "0 8px 24px rgb(0 0 0 / 0.12)",
    fontSize: 12,
  } as CSSProperties,
};

export const SERIES = [CHART.s1, CHART.s2, CHART.s3];

/** 1 234 567 → «1,2 млн», 12 300 → «12 тыс.» for axis ticks. */
export function compactSom(n: number): string {
  const a = Math.abs(n);
  if (a >= 1e6) return `${(n / 1e6).toLocaleString("ru-RU", { maximumFractionDigits: a >= 1e8 ? 0 : 2 })} млн`;
  if (a >= 1e3) return `${Math.round(n / 1e3).toLocaleString("ru-RU")} тыс.`;
  return Math.round(n).toLocaleString("ru-RU");
}

const MONTHS_SHORT = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];
export function monthShort(ym: string): string {
  return MONTHS_SHORT[Number(ym.slice(5, 7)) - 1] ?? ym;
}
