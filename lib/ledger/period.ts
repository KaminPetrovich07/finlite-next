// Period presets for the ledger pages (client-safe, no dependencies).
import { MONTHS } from "@/lib/tax-engine";

export type PeriodKind = "month" | "quarter" | "year" | "custom";

const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate(); // m is 1-based

export function monthPeriod(year: number, month: number) {
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay(year, month))}` };
}

export function quarterPeriod(year: number, q: number) {
  const m1 = (q - 1) * 3 + 1;
  return { from: `${year}-${pad(m1)}-01`, to: `${year}-${pad(m1 + 2)}-${pad(lastDay(year, m1 + 2))}` };
}

export function yearPeriod(year: number) {
  return { from: `${year}-01-01`, to: `${year}-12-31` };
}

export function periodLabel(from: string, to: string): string {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  if (fy === ty && fd === 1 && td === lastDay(ty, tm)) {
    if (fm === tm) return `${MONTHS[fm - 1]} ${fy}`;
    if (fm === 1 && tm === 12) return `${fy} год`;
    if ((fm - 1) % 3 === 0 && tm === fm + 2) return `${(fm - 1) / 3 + 1} квартал ${fy}`;
  }
  return `${formatDate(from)} — ${formatDate(to)}`;
}

export function formatDate(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${d}.${m}.${y}`;
}
