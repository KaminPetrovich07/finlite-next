// ════════════════════════════════════════════════════════════════════════
// lib/fx/fx.ts — курсы НБКР и курсовые разницы (МСФО (IAS) 21).
//
// Курсы: https://www.nbkr.kg/XML/daily.xml (USD, EUR, RUB, KZT, CNY,
// ежедневно) и weekly.xml (прочие валюты, еженедельно). Формат:
//   <CurrencyRates Date="11.11.2026"><Currency ISOCode="USD">
//     <Nominal>1</Nominal><Value>87,4498</Value></Currency>…
//
// Переоценка на отчётную дату (IAS 21.23): денежные статьи в валюте —
// деньги, дебиторская и кредиторская задолженность, займы — пересчитываются
// по курсу на дату; неденежные (авансы выданные 18xx и полученные 32xx,
// запасы, основные средства) — нет. Разница:
//   положительная по расчётам с покупателями и поставщиками → 6240,
//   по деньгам и займам → 9140; отрицательная → 9520.
// ════════════════════════════════════════════════════════════════════════

import { round2, type LedgerEntry, type LedgerLine } from "@/lib/ledger/types";

export interface Rate { date: string; code: string; rate: number }

export const MAIN_CURRENCIES = ["USD", "EUR", "RUB", "KZT", "CNY"] as const;
export const CURRENCY_NAME: Record<string, string> = {
  USD: "доллар США", EUR: "евро", RUB: "российский рубль", KZT: "казахстанский тенге", CNY: "китайский юань",
  GBP: "фунт стерлингов", CHF: "швейцарский франк", JPY: "японская иена", TRY: "турецкая лира", UZS: "узбекский сум",
  TJS: "таджикский сомони", AED: "дирхам ОАЭ", KRW: "южнокорейская вона", INR: "индийская рупия",
};

/** Parse daily.xml / weekly.xml. Returns som per ONE unit of currency. */
export function parseNbkrXml(xml: string): { date: string; rates: Array<{ code: string; rate: number }> } {
  const dm = xml.match(/<CurrencyRates[^>]*Date="(\d{2})\.(\d{2})\.(\d{4})"/);
  if (!dm) throw new Error("Не найдена дата курсов в ответе НБКР");
  const date = `${dm[3]}-${dm[2]}-${dm[1]}`;
  const rates: Array<{ code: string; rate: number }> = [];
  const re = /<Currency\s+ISOCode="([A-Z]{3})"\s*>([\s\S]*?)<\/Currency>/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(xml))) {
    const nominal = Number((m[2].match(/<Nominal>\s*([\d.,]+)\s*<\/Nominal>/)?.[1] ?? "1").replace(",", "."));
    const value = Number((m[2].match(/<Value>\s*([\d.,]+)\s*<\/Value>/)?.[1] ?? "").replace(",", "."));
    if (Number.isFinite(value) && value > 0 && nominal > 0) rates.push({ code: m[1], rate: Math.round((value / nominal) * 1e6) / 1e6 });
  }
  if (!rates.length) throw new Error("В ответе НБКР нет курсов");
  return { date, rates };
}

/** The official rate in force on `date`: the latest one set on or before it. */
export function rateOn(rates: Rate[], code: string, date: string): Rate | null {
  let best: Rate | null = null;
  for (const r of rates) if (r.code === code && r.date <= date && (!best || r.date > best.date)) best = r;
  return best;
}

/** Monetary items that are revalued (IAS 21.16). Advances (18xx, 32xx) are non-monetary. */
export function isMonetary(account: string): boolean {
  if (/^1(81|82|83|89)/.test(account) || /^32/.test(account)) return false;
  return /^(11|12|13|14|15|25|27|28|31|33|35|36|41)/.test(account);
}

const OPERATING = /^(14|15|27|31|35|36)/;

export interface RevalRow {
  account: string;
  currency: string;
  balanceCur: number;
  balanceSom: number;
  rate: number;
  target: number;
  diff: number;
}

/**
 * Revaluation of foreign-currency monetary balances at `date`. Existing
 * revaluation entries for the same date are ignored, so the result can be
 * posted again after corrections.
 */
export function revaluation(entries: LedgerEntry[], date: string, rates: Rate[]): { rows: RevalRow[]; missing: string[]; lines: LedgerLine[] } {
  const bal = new Map<string, { cur: number; som: number }>();
  for (const e of entries) {
    if (e.date > date) continue;
    if (e.source === "fx" && e.sourceRef === date) continue;
    for (const l of e.lines) {
      if (!l.currency || !isMonetary(l.account)) continue;
      const k = `${l.account}|${l.currency}`;
      const b = bal.get(k) ?? { cur: 0, som: 0 };
      const sign = l.debit > 0 ? 1 : -1;
      b.cur = round2(b.cur + sign * Number(l.amountCur ?? 0));
      b.som = round2(b.som + l.debit - l.credit);
      bal.set(k, b);
    }
  }
  const rows: RevalRow[] = [];
  const missing = new Set<string>();
  for (const [k, b] of bal) {
    const [account, currency] = k.split("|");
    const r = rateOn(rates, currency, date);
    if (!r) { missing.add(currency); continue; }
    const target = round2(b.cur * r.rate);
    const diff = round2(target - b.som);
    if (Math.abs(diff) < 0.01 && Math.abs(b.cur) < 0.005) continue;
    rows.push({ account, currency, balanceCur: b.cur, balanceSom: b.som, rate: r.rate, target, diff });
  }
  rows.sort((a, b) => a.account.localeCompare(b.account) || a.currency.localeCompare(b.currency));

  const lines: LedgerLine[] = [];
  let gainOp = 0, gainFin = 0, loss = 0;
  for (const r of rows) {
    if (Math.abs(r.diff) < 0.01) continue;
    const memo = `${r.currency} ${r.balanceCur.toLocaleString("ru-RU")} × ${r.rate.toLocaleString("ru-RU")}`;
    // the line carries the currency with zero currency amount, so later revaluations see the new som balance
    if (r.diff > 0) {
      lines.push({ account: r.account, debit: r.diff, credit: 0, currency: r.currency, amountCur: 0, memo });
      if (OPERATING.test(r.account)) gainOp += r.diff; else gainFin += r.diff;
    } else {
      lines.push({ account: r.account, debit: 0, credit: -r.diff, currency: r.currency, amountCur: 0, memo });
      loss += -r.diff;
    }
  }
  if (gainOp > 0) lines.push({ account: "6240", debit: 0, credit: round2(gainOp), memo: "Положительная курсовая разница по расчётам" });
  if (gainFin > 0) lines.push({ account: "9140", debit: 0, credit: round2(gainFin), memo: "Положительная курсовая разница по деньгам и займам" });
  if (loss > 0) lines.push({ account: "9520", debit: round2(loss), credit: 0, memo: "Отрицательная курсовая разница" });
  return { rows, missing: [...missing], lines };
}
