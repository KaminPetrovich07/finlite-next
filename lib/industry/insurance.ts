// ════════════════════════════════════════════════════════════════════════
// lib/industry/insurance.ts — страховщик: резервы по методу Мака (chain
// ladder с ошибкой прогноза, Mack 1993), коэффициенты в духе NAIC IRIS
// (ориентиры США; национальные нормативы устанавливает Госфиннадзор —
// пороги меняются в настройках) и стресс-тест отношения нетто-премий к
// капиталу (НПК).
// ════════════════════════════════════════════════════════════════════════
import { pct, n, type Metric } from "./common";

export interface MackResult {
  factors: number[];
  sigma2: number[];
  rows: Array<{ latest: number; ultimate: number; reserve: number; se: number; cv: number | null }>;
  total: { latest: number; ultimate: number; reserve: number; se: number; cv: number | null; q95: number; q995: number };
}

/** Normal quantile (Acklam). */
export function normInv(p: number): number {
  const a = [-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239];
  const b = [-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572];
  const c = [-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783];
  const d = [0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416];
  const pl = 0.02425;
  if (p < pl) { const q = Math.sqrt(-2 * Math.log(p)); return (((((c[0] * q + c[1]) * q + c[2]) * q + c[3]) * q + c[4]) * q + c[5]) / ((((d[0] * q + d[1]) * q + d[2]) * q + d[3]) * q + 1); }
  if (p > 1 - pl) return -normInv(1 - p);
  const q = p - 0.5, r = q * q;
  return (((((a[0] * r + a[1]) * r + a[2]) * r + a[3]) * r + a[4]) * r + a[5]) * q / (((((b[0] * r + b[1]) * r + b[2]) * r + b[3]) * r + b[4]) * r + 1);
}

/** Cumulative triangle: row i (accident year, oldest first) has n − i known values. */
export function mack(tri: number[][]): MackResult {
  const N = tri.length;
  if (N < 3) throw new Error("Нужно не меньше трёх лет наступления");
  for (let i = 0; i < N; i++) if ((tri[i]?.length ?? 0) < N - i) throw new Error(`В строке ${i + 1} не хватает значений: нужно ${N - i}`);
  const f: number[] = [], s2: number[] = [];
  for (let k = 0; k < N - 1; k++) {
    let num = 0, den = 0;
    for (let i = 0; i < N - 1 - k; i++) { num += tri[i][k + 1]; den += tri[i][k]; }
    f[k] = den ? num / den : 1;
  }
  for (let k = 0; k < N - 1; k++) {
    const m = N - 1 - k; // rows with both k and k+1
    if (m > 1) {
      let s = 0;
      for (let i = 0; i < m; i++) { const c = tri[i][k]; if (c) s += c * (tri[i][k + 1] / c - f[k]) ** 2; }
      s2[k] = s / (m - 1);
    } else {
      const a = s2[k - 1] ?? 0, b = s2[k - 2] ?? 0;
      s2[k] = b ? Math.min((a * a) / b, Math.min(a, b)) : a;
    }
  }
  // full projected triangle
  const full = tri.map((r, i) => { const row = r.slice(0, N - i); for (let k = N - i; k < N; k++) row[k] = row[k - 1] * f[k - 1]; return row; });
  const colSum = (k: number) => { let s = 0; for (let i = 0; i < N - 1 - k; i++) s += tri[i][k]; return s; };
  const rows = full.map((row, i) => {
    const latest = tri[i][N - 1 - i], ult = row[N - 1];
    let acc = 0;
    for (let k = N - 1 - i; k < N - 1; k++) acc += (s2[k] / (f[k] * f[k])) * (1 / row[k] + 1 / colSum(k));
    const mse = ult * ult * acc;
    return { latest, ultimate: ult, reserve: ult - latest, se: Math.sqrt(mse), mse };
  });
  let totalMse = rows.reduce((s, r) => s + r.mse, 0);
  for (let i = 1; i < N; i++) {
    for (let j = i + 1; j < N; j++) {
      // i — older of the pair: its known diagonal starts later in development
      let acc = 0;
      for (let k = N - 1 - i; k < N - 1; k++) acc += (2 * s2[k] / (f[k] * f[k])) / colSum(k);
      totalMse += rows[i].ultimate * rows[j].ultimate * acc;
    }
  }
  const latest = rows.reduce((s, r) => s + r.latest, 0), ultimate = rows.reduce((s, r) => s + r.ultimate, 0);
  const reserve = ultimate - latest, se = Math.sqrt(totalMse);
  // lognormal quantiles with the same mean and s.e.
  const sl2 = Math.log(1 + (se / reserve) ** 2), mu = Math.log(reserve) - sl2 / 2;
  const q = (p: number) => (reserve > 0 ? Math.exp(mu + Math.sqrt(sl2) * normInv(p)) : 0);
  return {
    factors: f, sigma2: s2,
    rows: rows.map(({ mse: _m, ...r }) => ({ ...r, cv: r.reserve > 0 ? r.se / r.reserve : null })),
    total: { latest, ultimate, reserve, se, cv: reserve > 0 ? se / reserve : null, q95: q(0.95), q995: q(0.995) },
  };
}

/** Text from Excel (tabs, semicolons or spaces; comma or dot decimals) → cumulative triangle. */
export function parseTriangle(text: string, incremental: boolean): number[][] {
  const rows = text.trim().split(/\r?\n/).map((l) => l.trim()).filter(Boolean).map((l) =>
    l.split(/\t|;|\s{2,}|\s(?=[-\d])/).map((x) => x.replace(/\s/g, "").replace(",", ".")).filter((x) => x !== "").map(Number).filter((x) => Number.isFinite(x)));
  const tri = rows.filter((r) => r.length);
  if (!incremental) return tri;
  return tri.map((r) => { let s = 0; return r.map((x) => (s += x)); });
}

export interface InsurerInput {
  gpw: number; npw: number; npwPrev: number; npe: number; claims: number; expenses: number; investIncome: number;
  surplus: number; reservesBooked: number; liabilities: number; liquidAssets: number; investedAssets: number;
}

export type InsurerLimits = { npwSurplus: number; gpwSurplus: number; growth: number; combined: number; liqCover: number; deficiency: number };
export const INSURER_LIMITS: InsurerLimits = { npwSurplus: 300, gpwSurplus: 900, growth: 33, combined: 100, liqCover: 105, deficiency: 25 };
const IRIS = "ориентир NAIC IRIS (США); замените на норматив Госфиннадзора, если он есть";

export function insurerMetrics(i: InsurerInput, mackReserve: number | null, L: InsurerLimits = INSURER_LIMITS): Metric[] {
  const lossRatio = pct(i.claims, i.npe), expenseRatio = pct(i.expenses, i.npw);
  const combined = lossRatio !== null && expenseRatio !== null ? Math.round((lossRatio + expenseRatio) * 100) / 100 : null;
  const growth = i.npwPrev ? Math.round(((i.npw - i.npwPrev) / i.npwPrev) * 10000) / 100 : null;
  return [
    { key: "npwS", title: "Нетто-премии / капитал (НПК)", value: pct(i.npw, i.surplus), unit: "%", rule: { op: "<=", max: L.npwSurplus }, source: IRIS },
    { key: "gpwS", title: "Брутто-премии / капитал", value: pct(i.gpw, i.surplus), unit: "%", rule: { op: "<=", max: L.gpwSurplus }, source: IRIS },
    { key: "growth", title: "Изменение нетто-премий к прошлому году", value: growth, unit: "%", rule: { op: "between", min: -L.growth, max: L.growth }, source: IRIS },
    { key: "loss", title: "Коэффициент убыточности (нетто)", value: lossRatio, unit: "%" },
    { key: "exp", title: "Коэффициент расходов", value: expenseRatio, unit: "%" },
    { key: "comb", title: "Комбинированный коэффициент", value: combined, unit: "%", rule: { op: "<=", max: L.combined }, source: "выше 100 % — страховая деятельность убыточна" },
    { key: "yield", title: "Доходность инвестиций", value: pct(i.investIncome, i.investedAssets), unit: "%" },
    { key: "liq", title: "Обязательства / ликвидные активы", value: pct(i.liabilities, i.liquidAssets), unit: "%", rule: { op: "<=", max: L.liqCover }, source: IRIS },
    { key: "def", title: "Недостаток резервов (по Маку) / капитал", value: mackReserve === null ? null : pct(Math.max(0, mackReserve - i.reservesBooked), i.surplus), unit: "%", rule: { op: "<=", max: L.deficiency }, source: IRIS },
  ];
}

/** Stress: loss ratio +shock p.p., investment loss %, reserve shortfall to the 99.5 % quantile. */
export function insurerStress(i: InsurerInput, s: { lossShock: number; investLoss: number }, mackQ995: number | null, mackReserve: number | null) {
  const extraClaims = (n(i.npe) * s.lossShock) / 100;
  const investHit = (n(i.investedAssets) * s.investLoss) / 100;
  const reserveHit = mackQ995 !== null && mackReserve !== null ? Math.max(0, mackQ995 - Math.max(mackReserve, i.reservesBooked)) : 0;
  const surplusAfter = i.surplus - extraClaims - investHit - reserveHit;
  return { extraClaims, investHit, reserveHit, surplusAfter, npkAfter: pct(i.npw, surplusAfter) };
}
