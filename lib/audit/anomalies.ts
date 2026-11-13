// Проверка журнала на подозрительные операции — без нейросетей, по правилам, которые применяют аудиторы:
// возможные дубли, суммы намного больше обычных, банковские операции в выходные и праздники, редкие корреспонденции,
// сторно выручки и закон Бенфорда для первых цифр сумм. Результат — повод посмотреть, а не ошибка.
import type { LedgerEntry } from "@/lib/ledger/types";

export type Severity = "high" | "medium" | "info";
export interface Finding { id: string; kind: string; severity: Severity; title: string; detail: string; entryIds: string[]; date: string; amount: number }
export interface BenfordResult { n: number; mad: number; verdict: "close" | "acceptable" | "marginal" | "nonconforming" | "few"; expected: number[]; actual: number[] }
export interface AnomalyReport { findings: Finding[]; benford: BenfordResult; checked: number }

const SKIP = new Set(["opening", "closing", "tax", "fx", "depreciation", "cogs", "payroll"]);
const r2 = (n: number) => Math.round(n * 100) / 100;
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
const total = (e: LedgerEntry) => r2(e.lines.reduce((s, l) => s + (l.debit || 0), 0));
const party = (e: LedgerEntry) => e.lines.find((l) => l.party)?.party?.trim().toLowerCase() ?? "";
const dr = (e: LedgerEntry) => [...new Set(e.lines.filter((l) => l.debit > 0).map((l) => l.account))].sort().join("+");
const cr = (e: LedgerEntry) => [...new Set(e.lines.filter((l) => l.credit > 0).map((l) => l.account))].sort().join("+");
const days = (a: string, b: string) => Math.abs(Date.parse(a) - Date.parse(b)) / 864e5;
const dmy = (d: string) => d.split("-").reverse().join(".");

function median(xs: number[]) { const s = [...xs].sort((a, b) => a - b); const m = s.length >> 1; return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }

/** Ожидаемая доля первой цифры по закону Бенфорда. */
export const BENFORD = Array.from({ length: 9 }, (_, i) => Math.log10(1 + 1 / (i + 1)));

/** Mean absolute deviation первых цифр; пороги Нигрини: 0,006 / 0,012 / 0,015. Нужно не меньше 100 сумм от 10 сом. */
export function benford(amounts: number[]): BenfordResult {
  const xs = amounts.filter((a) => a >= 10);
  const counts = Array(9).fill(0);
  for (const a of xs) counts[Number(String(Math.floor(a))[0]) - 1]++;
  const actual = counts.map((c) => (xs.length ? c / xs.length : 0));
  const mad = xs.length ? actual.reduce((s, p, i) => s + Math.abs(p - BENFORD[i]), 0) / 9 : 0;
  const verdict = xs.length < 100 ? "few" : mad <= 0.006 ? "close" : mad <= 0.012 ? "acceptable" : mad <= 0.015 ? "marginal" : "nonconforming";
  return { n: xs.length, mad: Math.round(mad * 10000) / 10000, verdict, expected: BENFORD.map((p) => Math.round(p * 1000) / 10), actual: actual.map((p) => Math.round(p * 1000) / 10) };
}

export function findAnomalies(entries: LedgerEntry[], from: string, to: string, holidays: string[] = []): AnomalyReport {
  const all = entries.filter((e) => !SKIP.has(e.source));
  const inP = all.filter((e) => e.date >= from && e.date <= to);
  const findings: Finding[] = [];

  // 1. Возможные дубли: та же сумма, те же счета и контрагент в пределах 3 дней
  const seen = new Set<string>();
  for (let i = 0; i < inP.length; i++) for (let j = i + 1; j < inP.length; j++) {
    const a = inP[i], b = inP[j];
    if (total(a) !== total(b) || total(a) < 100 || dr(a) !== dr(b) || cr(a) !== cr(b) || party(a) !== party(b) || days(a.date, b.date) > 3) continue;
    if (a.bankTransactionId && b.bankTransactionId && a.bankTransactionId !== b.bankTransactionId && a.date !== b.date) continue; // две разные строки выписки в разные дни — обычные регулярные платежи
    const key = [a.id, b.id].sort().join("|");
    if (seen.has(key)) continue; seen.add(key);
    findings.push({ id: `dup-${key}`, kind: "duplicate", severity: "high", title: "Возможный дубль", date: a.date, amount: total(a),
      detail: `${fmt(total(a))} сом, Дт ${dr(a)} Кт ${cr(a)}${party(a) ? `, ${a.lines.find((l) => l.party)?.party}` : ""}: ${dmy(a.date)} и ${dmy(b.date)}. Проверьте, не введена ли операция дважды.`, entryIds: [a.id, b.id] });
  }

  // 2. Сумма намного больше обычной для той же корреспонденции (по всей истории, нужно ≥ 5 похожих)
  const byPair = new Map<string, number[]>();
  for (const e of all) { const k = `${dr(e)}>${cr(e)}`; (byPair.get(k) ?? byPair.set(k, []).get(k)!).push(total(e)); }
  for (const e of inP) {
    const xs = byPair.get(`${dr(e)}>${cr(e)}`) ?? [];
    if (xs.length < 6) continue;
    const others = xs.filter((x, i) => i !== xs.indexOf(total(e)));
    const med = median(others);
    if (med > 0 && total(e) >= 10 * med && total(e) >= 50_000) findings.push({ id: `big-${e.id}`, kind: "outlier", severity: "medium", title: "Сумма намного больше обычной", date: e.date, amount: total(e),
      detail: `${fmt(total(e))} сом по Дт ${dr(e)} Кт ${cr(e)} — в ${Math.round(total(e) / med)} раз больше обычной суммы такой операции (${fmt(med)} сом). Проверьте сумму и документ.`, entryIds: [e.id] });
  }

  // 3. Движение по банковскому счёту в выходной или праздник: банк в этот день платежи не проводит
  const hs = new Set(holidays);
  for (const e of inP) {
    if (e.source !== "manual" || !e.lines.some((l) => /^12\d\d/.test(l.account))) continue;
    const wd = new Date(`${e.date}T00:00:00Z`).getUTCDay();
    if (wd !== 0 && wd !== 6 && !hs.has(e.date)) continue;
    findings.push({ id: `wkd-${e.id}`, kind: "weekend", severity: "info", title: hs.has(e.date) ? "Банковская операция в праздник" : "Банковская операция в выходной", date: e.date, amount: total(e),
      detail: `«${e.description}» — движение по счёту в банке ${dmy(e.date)} (${hs.has(e.date) ? "праздничный день" : wd === 6 ? "суббота" : "воскресенье"}). Банки в такие дни обычно не проводят платежи — сверьте дату с выпиской.`, entryIds: [e.id] });
  }

  // 4. Сторно выручки и возвраты: дебет счёта выручки вне закрытия периода
  for (const e of inP) {
    const back = e.lines.filter((l) => /^61\d\d$/.test(l.account) && l.debit > 0);
    if (back.length) findings.push({ id: `rev-${e.id}`, kind: "revenue-reversal", severity: "medium", title: "Уменьшение выручки", date: e.date, amount: r2(back.reduce((s, l) => s + l.debit, 0)),
      detail: `«${e.description}»: дебет счёта выручки ${back.map((l) => l.account).join(", ")} на ${fmt(back.reduce((s, l) => s + l.debit, 0))} сом. Возврат или исправление должны подтверждаться документом.`, entryIds: [e.id] });
  }

  // 5. Редкая корреспонденция: за всю историю встретилась один раз при журнале от 30 операций
  if (all.length >= 30) for (const e of inP) {
    if ((byPair.get(`${dr(e)}>${cr(e)}`)?.length ?? 0) !== 1 || total(e) < 10_000 || findings.some((f) => f.entryIds.includes(e.id))) continue;
    findings.push({ id: `rare-${e.id}`, kind: "rare", severity: "info", title: "Нетипичная проводка", date: e.date, amount: total(e),
      detail: `Дт ${dr(e)} Кт ${cr(e)} на ${fmt(total(e))} сом — такая корреспонденция встречается в журнале впервые. Убедитесь, что счета выбраны верно.`, entryIds: [e.id] });
  }

  const order: Record<Severity, number> = { high: 0, medium: 1, info: 2 };
  findings.sort((a, b) => order[a.severity] - order[b.severity] || b.amount - a.amount);
  return { findings, benford: benford(inP.map(total)), checked: inP.length };
}
