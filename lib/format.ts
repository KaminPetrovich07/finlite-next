// ════════════════════════════════════════════════════════════════════════
// lib/format.ts
// Thousands-separator formatting for currency inputs/outputs. This is the
// direct fix for the feedback: "отсутствие маски ввода... количество
// нулей можно спутать". Uses a narrow no-break space (U+202F), standard
// for ru/ky number formatting (1 234 567 not 1,234,567).
// ════════════════════════════════════════════════════════════════════════

const THIN_SPACE = "\u202F";

/** 1234567.5 -> "1 234 567,5" */
export function formatNumber(value: number, decimals = 0): string {
  if (!Number.isFinite(value)) return "—";
  const fixed = value.toFixed(decimals);
  const [intPart, decPart] = fixed.split(".");
  const negative = intPart.startsWith("-");
  const digits = negative ? intPart.slice(1) : intPart;
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, THIN_SPACE);
  const sign = negative ? "-" : "";
  return decPart ? `${sign}${grouped},${decPart}` : `${sign}${grouped}`;
}

/** "1 234 567,5" or "1,234,567.5" or raw "1234567.5" -> 1234567.5 */
export function parseFormattedNumber(input: string): number {
  if (!input) return 0;
  const cleaned = input
    .replace(/[\s\u202F\u00A0]/g, "") // strip thin/regular spaces used as grouping
    .replace(/,(\d{1,2})$/, ".$1") // trailing comma-decimal -> dot-decimal
    .replace(/,/g, ""); // any remaining commas are thousands separators
  const n = parseFloat(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function formatPercent(value: number, decimals = 1): string {
  if (!Number.isFinite(value)) return "—";
  return `${value.toFixed(decimals)}%`;
}
