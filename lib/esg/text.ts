// Small Russian text helpers for generated report prose.

const NBSP = " ";

export function plural(n: number, forms: [string, string, string]): string {
  const a = Math.abs(Math.round(n)) % 100, b = a % 10;
  if (a > 10 && a < 20) return forms[2];
  if (b > 1 && b < 5) return forms[1];
  if (b === 1) return forms[0];
  return forms[2];
}

export function num(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return n.toLocaleString("ru-RU", { maximumFractionDigits: d }).replace(/ /g, NBSP);
}

export function som(n: number | null | undefined): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${Math.round(n).toLocaleString("ru-RU").replace(/ /g, NBSP)}${NBSP}сом`;
}

export function mln(n: number): string {
  return `${num(n / 1e6, 2)}${NBSP}млн сом`;
}

export function pct(n: number | null | undefined, d = 1): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return "—";
  return `${num(n, d)}%`;
}

export function t(n: number, d = 2): string {
  return `${num(n, d)}${NBSP}т${NBSP}CO₂-экв.`;
}

/** «выросли на 12,3% (с 10 до 11,2)» / «не изменились» / "" when no comparison. */
export function change(cur: number | null, prev: number | null, opts: { fem?: boolean; plural?: boolean; unit?: string; d?: number } = {}): string {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev) || prev === 0) return "";
  const diff = ((cur - prev) / Math.abs(prev)) * 100;
  const verbUp = opts.plural ? "выросли" : opts.fem ? "выросла" : "вырос";
  const verbDown = opts.plural ? "снизились" : opts.fem ? "снизилась" : "снизился";
  const same = opts.plural ? "не изменились" : opts.fem ? "не изменилась" : "не изменился";
  const u = opts.unit ? `${NBSP}${opts.unit}` : "";
  if (Math.abs(diff) < 0.5) return `${same} по сравнению с предыдущим периодом`;
  return `${diff > 0 ? verbUp : verbDown} на ${pct(Math.abs(diff))} к предыдущему периоду (с ${num(prev, opts.d ?? 1)}${u} до ${num(cur, opts.d ?? 1)}${u})`;
}

export function share(part: number, total: number): number | null {
  return total > 0 ? (part / total) * 100 : null;
}

export function listRu(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} и ${items[items.length - 1]}`;
}

export function cap(s: string): string {
  return s ? s[0].toUpperCase() + s.slice(1) : s;
}
