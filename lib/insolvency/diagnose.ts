// ════════════════════════════════════════════════════════════════════════
// lib/insolvency/diagnose.ts — финансовая диагностика: признаки
// неплатёжеспособности по данным журнала.
//
// Закон КР «О банкротстве (несостоятельности)» от 15.10.1997 № 74, ст. 3:
// неплатёжеспособность — неспособность в установленные сроки погасить
// денежные требования кредиторов (включая обязательные платежи) из-за
// превышения обязательств над ликвидными активами. Поэтому главное, что
// считает модуль, — сколько долгов уже не погашено в срок и хватает ли на них
// денег и того, что быстро превращается в деньги.
//
// Всё по плану счетов Пост. № 231: 1xxx — оборотные активы, 2xxx —
// долгосрочные, 3xxx — краткосрочные обязательства, 4xxx — долгосрочные,
// 5xxx — капитал, 6xxx–9xxx — доходы и расходы.
// Чистые функции: без базы, без сети.
// ════════════════════════════════════════════════════════════════════════

import { buildStatements } from "@/lib/ledger/engine";
import { nameKey } from "@/lib/consolidation/consolidate";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const ratio = (a: number, b: number) => (Math.abs(b) < 0.005 ? null : Math.round((a / b) * 100) / 100);
const DAY = 864e5;
const days = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY);

export const monthEnd = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
export function monthsBack(asOf: string, n: number): string[] {
  const [y, m] = asOf.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => { const d = new Date(Date.UTC(y, m - 1 - (n - 1 - i), 1)); return d.toISOString().slice(0, 7); });
}

// ── остатки на дату ─────────────────────────────────────────────────────────

/** Сальдо по счёту на дату включительно: дебет − кредит. */
export function balancesAt(entries: LedgerEntry[], asOf: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.date > asOf) continue;
    for (const l of e.lines) m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit);
  }
  return m;
}

export interface BalanceGroups {
  cash: number; restricted: number; investments: number; receivables: number; inventory: number; advances: number;
  currentAssets: number; nonCurrent: number; totalAssets: number;
  currentLiabilities: number; longLiabilities: number; liabilities: number; equity: number;
  /** деньги + краткосрочные вложения + дебиторка: то, чем можно расплатиться в ближайшее время */
  liquid: number;
}

const startsWith = (code: string, ...prefixes: string[]) => prefixes.some((p) => code.startsWith(p));

export function groups(bal: Map<string, number>): BalanceGroups {
  let cash = 0, restricted = 0, investments = 0, receivables = 0, inventory = 0, advances = 0, other = 0, nonCurrent = 0, cl = 0, ll = 0;
  for (const [code, v] of bal) {
    if (code.startsWith("1")) {
      if (code.startsWith("1240")) restricted += v;
      else if (startsWith(code, "11", "12")) cash += v;
      else if (code.startsWith("13")) investments += v;
      else if (startsWith(code, "14", "15")) receivables += v;
      else if (startsWith(code, "16", "17")) inventory += v;
      else if (code.startsWith("18")) advances += v;
      else other += v;
    } else if (code.startsWith("2")) nonCurrent += v;
    else if (code.startsWith("3")) cl -= v;
    else if (code.startsWith("4")) ll -= v;
  }
  const currentAssets = cash + restricted + investments + receivables + inventory + advances + other;
  const totalAssets = currentAssets + nonCurrent;
  const liabilities = cl + ll;
  return {
    cash: r2(cash), restricted: r2(restricted), investments: r2(investments), receivables: r2(receivables), inventory: r2(inventory), advances: r2(advances),
    currentAssets: r2(currentAssets), nonCurrent: r2(nonCurrent), totalAssets: r2(totalAssets),
    currentLiabilities: r2(cl), longLiabilities: r2(ll), liabilities: r2(liabilities),
    // капитал = активы − обязательства: включает и прибыль текущего года, ещё не закрытую на 5300
    equity: r2(totalAssets - liabilities),
    liquid: r2(cash + investments + receivables),
  };
}

// ── долги и их возраст ──────────────────────────────────────────────────────

export type CreditorKind = "staff" | "budget" | "lenders" | "suppliers" | "customers" | "owners" | "other";
export const CREDITOR_KIND: Record<CreditorKind, string> = {
  staff: "Работники (зарплата)",
  budget: "Бюджет и Социальный фонд",
  lenders: "Банки и займодавцы",
  suppliers: "Поставщики и подрядчики",
  customers: "Покупатели (полученные авансы)",
  owners: "Участники (дивиденды)",
  other: "Прочие кредиторы",
};

export function kindOf(account: string): CreditorKind {
  if (account.startsWith("3520")) return "staff";
  if (startsWith(account, "34", "3530")) return "budget";
  if (startsWith(account, "33", "3550", "41")) return "lenders";
  if (startsWith(account, "31", "3510")) return "suppliers";
  if (startsWith(account, "32")) return "customers";
  if (account.startsWith("3540")) return "owners";
  return "other";
}

/**
 * Сколько дней по умолчанию даётся на оплату — после этого долг считается просроченным.
 * Это ориентир для раннего предупреждения, а не нормы закона: точные сроки — в договорах
 * и в Налоговом кодексе; их можно поменять на странице.
 */
export interface Terms { staff: number; budget: number; quarterlyTax: number; suppliers: number; interest: number; other: number }
/** budget — ежемесячные налоги и взносы (НДС, подоходный, Соцфонд); quarterlyTax — налог на прибыль / единый налог, которые платят по кварталам. */
export const DEFAULT_TERMS: Terms = { staff: 31, budget: 45, quarterlyTax: 110, suppliers: 30, interest: 30, other: 60 };
/**
 * Срок для просрочки. Тело кредитов и займов гасится по графику договора, которого в журнале нет, —
 * его просрочку программа не определяет (только начисленные проценты, 3550). Авансы покупателей
 * и дивиденды к выплате — не денежная просрочка.
 */
function termOf(k: CreditorKind, account: string, t: Terms): number {
  if (k === "staff") return t.staff;
  if (k === "budget") return account.startsWith("3410") ? t.quarterlyTax : t.budget;
  if (k === "suppliers") return t.suppliers;
  if (k === "lenders") return account.startsWith("3550") ? t.interest : Infinity;
  if (k === "customers" || k === "owners") return Infinity;
  return t.other;
}

export interface Debt {
  key: string;
  creditor: string;
  /** долг по начисленным процентам (3550), а не по телу кредита */
  interest?: boolean;
  kind: CreditorKind;
  accounts: string[];
  amount: number;
  /** самая старая непогашенная часть: дата возникновения */
  oldest: string;
  /** дней с возникновения самой старой непогашенной части */
  age: number;
  /** не погашено дольше срока оплаты */
  overdue: number;
  /** просрочено больше 90 дней */
  overdue90: number;
}

const BUDGET_NAMES: Record<string, string> = {
  "3410": "Налог на прибыль", "3420": "Подоходный налог", "3430": "НДС", "3440": "Акцизы", "3490": "Прочие налоги", "3530": "Социальный фонд (взносы)",
};

function creditorName(l: LedgerLine, kind: CreditorKind): string {
  // на 3490 — разные платежи: НДС при ввозе, таможня, налог с продаж; там важен получатель
  if (kind === "budget") return (l.account.startsWith("3490") && l.party?.trim()) || BUDGET_NAMES[l.account.slice(0, 4)] || "Налоги";
  if (kind === "staff") return l.party?.trim() || "Работники";
  return l.party?.trim() || "без указания контрагента";
}

/**
 * Непогашенные долги на дату по FIFO: каждое погашение закрывает самую старую часть долга
 * того же кредитора на том же виде долга. Только краткосрочные и долгосрочные обязательства (3xxx, 4xxx).
 */
export function openDebts(entries: LedgerEntry[], asOf: string, terms: Terms = DEFAULT_TERMS): Debt[] {
  const sorted = entries.filter((e) => e.date <= asOf).sort((a, b) => a.date.localeCompare(b.date) || (a.source === "opening" ? -1 : b.source === "opening" ? 1 : 0));
  const book = new Map<string, { creditor: string; interest: boolean; kind: CreditorKind; accounts: Set<string>; parts: Array<{ date: string; left: number }>; prepaid: number; term: number }>();
  for (const e of sorted) {
    for (const l of e.lines) {
      // резервы, отсроченные доходы и отсроченный налог — оценки, а не требования кредиторов
      if (!/^[34]/.test(l.account) || startsWith(l.account, "37", "42", "43")) continue;
      const kind = kindOf(l.account);
      const name = creditorName(l, kind);
      const interest = kind === "lenders" && l.account.startsWith("3550");
      const key = `${kind}|${interest ? "%" : ""}${kind === "budget" ? name : nameKey(name) || name}`;
      const b = book.get(key) ?? book.set(key, { creditor: name, interest, kind, accounts: new Set(), parts: [], prepaid: 0, term: termOf(kind, l.account, terms) }).get(key)!;
      b.accounts.add(l.account);
      let pay = l.debit - l.credit; // погашение долга — дебет счёта обязательства
      if (pay < 0) {
        let add = -pay;
        const use = Math.min(add, b.prepaid); b.prepaid = r2(b.prepaid - use); add = r2(add - use);
        if (add > 0.004) b.parts.push({ date: e.date, left: r2(add) });
        continue;
      }
      for (const p of b.parts) {
        if (pay <= 0.004) break;
        if (p.left <= 0.004) continue;
        const x = Math.min(p.left, pay); p.left = r2(p.left - x); pay = r2(pay - x);
      }
      if (pay > 0.004) b.prepaid = r2(b.prepaid + pay);
    }
  }
  const out: Debt[] = [];
  for (const [key, b] of book) {
    const open = b.parts.filter((p) => p.left > 0.004);
    const amount = r2(open.reduce((s, p) => s + p.left, 0));
    if (amount < 0.01) continue;
    const term = b.term;
    const overdue = r2(open.filter((p) => days(p.date, asOf) > term).reduce((s, p) => s + p.left, 0));
    const overdue90 = r2(open.filter((p) => days(p.date, asOf) > term + 90).reduce((s, p) => s + p.left, 0));
    out.push({ key, creditor: b.creditor, ...(b.interest ? { interest: true } : {}), kind: b.kind, accounts: [...b.accounts].sort(), amount, oldest: open[0].date, age: days(open[0].date, asOf), overdue, overdue90 });
  }
  return out.sort((a, b) => b.overdue - a.overdue || b.amount - a.amount);
}

// ── показатели и признаки ──────────────────────────────────────────────────

export type Level = "ok" | "watch" | "risk";
export interface Indicator { key: string; label: string; value: number | null; unit: "x" | "%" | "сом" | "мес"; norm: string; level: Level; hint: string }
/** title и detail — шаблоны с подстановками {…}: интерфейс переводит их (t(detail, vars)), PDF подставляет по-русски. */
export interface Signal { level: "risk" | "watch"; title: string; detail: string; vars?: Record<string, string | number> }

export interface MonthRow {
  month: string; date: string;
  current: number | null; quick: number | null; absolute: number | null; autonomy: number | null;
  liquid: number; currentLiabilities: number; overdue: number; equity: number;
  revenue: number; netProfit: number; cashEnd: number;
}

export interface Altman { z: number; zone: "safe" | "grey" | "distress"; x1: number; x2: number; x3: number; x4: number }

export interface Diagnosis {
  asOf: string;
  months: MonthRow[];
  balance: BalanceGroups;
  debts: Debt[];
  totals: { debts: number; overdue: number; overdue90: number; byKind: Array<{ kind: CreditorKind; label: string; amount: number; overdue: number; count: number }> };
  indicators: Indicator[];
  altman: Altman | null;
  signals: Signal[];
  verdict: { level: Level; title: string; detail: string };
  /** сколько месяцев компания проживёт на нынешних деньгах при среднем оттоке последних 3 месяцев */
  runway: number | null;
  terms: Terms;
}

const lvl = (bad: boolean, warn: boolean): Level => (bad ? "risk" : warn ? "watch" : "ok");
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");

/**
 * Altman Z'' (1995) — модель для непроизводственных компаний и развивающихся рынков:
 * Z = 6,56·X1 + 3,26·X2 + 6,72·X3 + 1,05·X4. Ориентир, а не закон: выше 2,6 — устойчиво,
 * 1,1–2,6 — серая зона, ниже 1,1 — высокий риск банкротства.
 */
export function altmanZ(b: BalanceGroups, retained: number, ebit12: number): Altman | null {
  if (b.totalAssets <= 0) return null;
  const x1 = (b.currentAssets - b.currentLiabilities) / b.totalAssets;
  const x2 = retained / b.totalAssets;
  const x3 = ebit12 / b.totalAssets;
  const x4 = b.liabilities > 0 ? b.equity / b.liabilities : 10;
  const z = 6.56 * x1 + 3.26 * x2 + 6.72 * x3 + 1.05 * Math.min(x4, 10);
  const rd = (n: number) => Math.round(n * 1000) / 1000;
  return { z: Math.round(z * 100) / 100, zone: z > 2.6 ? "safe" : z >= 1.1 ? "grey" : "distress", x1: rd(x1), x2: rd(x2), x3: rd(x3), x4: rd(Math.min(x4, 10)) };
}

export function diagnose(entries: LedgerEntry[], asOf: string, opts: { months?: number; terms?: Partial<Terms> } = {}): Diagnosis {
  const terms = { ...DEFAULT_TERMS, ...(opts.terms ?? {}) };
  // месяцы до первой операции компании не показываем — пустая динамика только мешает
  const first = entries.reduce((m, e) => (e.date < m ? e.date : m), asOf).slice(0, 7);
  const all = monthsBack(asOf, opts.months ?? 12);
  const yms = all.filter((ym) => ym >= first).length ? all.filter((ym) => ym >= first) : all.slice(-1);
  const from = `${yms[0]}-01`;
  const st = buildStatements(entries, { from, to: asOf }, { regime: null });
  const monthly = new Map(st.monthly.map((m) => [m.month, m]));
  const months: MonthRow[] = yms.map((ym) => {
    const date = ym === asOf.slice(0, 7) ? asOf : monthEnd(ym);
    const g = groups(balancesAt(entries, date));
    const od = openDebts(entries, date, terms).reduce((s, d) => s + d.overdue, 0);
    const m = monthly.get(ym);
    return {
      month: ym, date,
      current: ratio(g.currentAssets, g.currentLiabilities), quick: ratio(g.liquid, g.currentLiabilities), absolute: ratio(g.cash + g.investments, g.currentLiabilities),
      autonomy: ratio(g.equity, g.totalAssets), liquid: g.liquid, currentLiabilities: g.currentLiabilities, overdue: r2(od), equity: g.equity,
      revenue: r2(m?.revenue ?? 0), netProfit: r2(m?.netProfit ?? 0), cashEnd: g.cash,
    };
  });
  const balance = groups(balancesAt(entries, asOf));
  const debts = openDebts(entries, asOf, terms);
  const byKind = (Object.keys(CREDITOR_KIND) as CreditorKind[]).map((kind) => {
    const ds = debts.filter((d) => d.kind === kind);
    return { kind, label: CREDITOR_KIND[kind], amount: r2(ds.reduce((s, d) => s + d.amount, 0)), overdue: r2(ds.reduce((s, d) => s + d.overdue, 0)), count: ds.length };
  }).filter((k) => k.count);
  const overdue = r2(debts.reduce((s, d) => s + d.overdue, 0));
  const overdue90 = r2(debts.reduce((s, d) => s + d.overdue90, 0));

  // отток денег: средний за последние 3 месяца с движением
  const last3 = st.monthly.slice(-3).filter((m) => m.cashOut > 0);
  const burn = last3.length ? last3.reduce((s, m) => s + m.cashOut - Math.min(m.cashIn, m.cashOut), 0) / last3.length : 0;
  const runway = burn > 0.5 ? Math.round((balance.cash / burn) * 10) / 10 : null;

  const cur = ratio(balance.currentAssets, balance.currentLiabilities);
  const quick = ratio(balance.liquid, balance.currentLiabilities);
  const abs = ratio(balance.cash + balance.investments, balance.currentLiabilities);
  const autonomy = ratio(balance.equity, balance.totalAssets);
  const coverage = ratio(balance.liquid, overdue);
  const lastNet = months.slice(-3).map((m) => m.netProfit);
  const lossStreak = lastNet.length === 3 && lastNet.every((n) => n < 0);

  const retained = -[...balancesAt(entries, asOf)].filter(([c]) => c.startsWith("53") || /^[6-9]/.test(c)).reduce((s, [, v]) => s + v, 0);
  const ebit12 = st.incomeStatement.operatingProfit * (12 / yms.length);
  const altman = altmanZ(balance, retained, ebit12);

  const indicators: Indicator[] = [
    { key: "current", label: "Текущая ликвидность", value: cur, unit: "x", norm: "от 1,5; ниже 1 — риск", level: cur == null ? "ok" : lvl(cur < 1, cur < 1.5), hint: "Оборотные активы / краткосрочные обязательства: хватит ли всего оборотного имущества на текущие долги." },
    { key: "quick", label: "Быстрая ликвидность", value: quick, unit: "x", norm: "от 0,8; ниже 0,5 — риск", level: quick == null ? "ok" : lvl(quick < 0.5, quick < 0.8), hint: "Деньги, вложения и дебиторка / краткосрочные обязательства — без запасов, которые ещё надо продать." },
    { key: "absolute", label: "Абсолютная ликвидность", value: abs, unit: "x", norm: "от 0,2", level: abs == null ? "ok" : lvl(abs < 0.05, abs < 0.2), hint: "Только деньги / краткосрочные обязательства: какую часть долгов можно погасить прямо сейчас." },
    { key: "autonomy", label: "Доля собственного капитала", value: autonomy == null ? null : Math.round(autonomy * 100), unit: "%", norm: "от 50 %; меньше 0 — активов меньше, чем долгов", level: autonomy == null ? "ok" : lvl(autonomy < 0, autonomy < 0.3), hint: "Капитал / активы. Отрицательный капитал — недостаточность активов: всего имущества не хватит на все долги." },
    { key: "coverage", label: "Покрытие просроченных долгов", value: coverage, unit: "x", norm: "от 1; ниже 1 — признак ст. 3", level: overdue < 0.01 ? "ok" : lvl((coverage ?? 0) < 1, (coverage ?? 0) < 2), hint: "Ликвидные активы / долги, не погашенные в срок. Ниже 1 — не хватает средств погасить просроченное." },
    { key: "runway", label: "Денег хватит", value: runway, unit: "мес", norm: "от 2 месяцев", level: runway == null ? "ok" : lvl(runway < 0.5, runway < 2), hint: "Деньги / средний чистый отток за последние 3 месяца." },
  ];

  const signals: Signal[] = [];
  const staff = byKind.find((k) => k.kind === "staff"), budget = byKind.find((k) => k.kind === "budget"), sup = byKind.find((k) => k.kind === "suppliers"), lend = byKind.find((k) => k.kind === "lenders");
  if (balance.equity < 0) signals.push({ level: "risk", title: "Недостаточность активов", detail: "Обязательства ({liab} сом) больше всех активов ({assets} сом) на {gap} сом.", vars: { liab: fmt(balance.liabilities), assets: fmt(balance.totalAssets), gap: fmt(-balance.equity) } });
  if (overdue > 0.01 && balance.liquid < overdue) signals.push({ level: "risk", title: "Ликвидных активов меньше, чем просроченных долгов", detail: "Просрочено {overdue} сом, денег и дебиторки — {liquid} сом. Это и есть неплатёжеспособность в смысле ст. 3 Закона.", vars: { overdue: fmt(overdue), liquid: fmt(balance.liquid) } });
  if (staff && staff.overdue > 0.01) signals.push({ level: "risk", title: "Задержка зарплаты", detail: "Не выплачено дольше {days} дней: {sum} сом.", vars: { days: terms.staff, sum: fmt(staff.overdue) } });
  if (budget && budget.overdue > 0.01) signals.push({ level: budget.overdue > balance.cash ? "risk" : "watch", title: "Не погашены налоги и взносы", detail: "Дольше {days} дней после начисления: {sum} сом. Налоговые долги учитываются при неплатёжеспособности наравне с другими.", vars: { days: terms.budget, sum: fmt(budget.overdue) } });
  if (sup && sup.overdue > 0.01) signals.push({ level: overdue90 > 0.01 ? "risk" : "watch", title: "Просрочка поставщикам", detail: overdue90 > 0.01 ? "{sum} сом не оплачено дольше {days} дней, из них {sum90} сом — ещё на 90 дней дольше." : "{sum} сом не оплачено дольше {days} дней.", vars: { sum: fmt(sup.overdue), days: terms.suppliers, sum90: fmt(overdue90) } });
  if (lend && lend.overdue > 0.01) signals.push({ level: "risk", title: "Не уплачены проценты по кредитам", detail: "{sum} сом начисленных процентов не уплачено дольше {days} дней.", vars: { sum: fmt(lend.overdue), days: terms.interest } });
  if (lossStreak) signals.push({ level: "watch", title: "Убыток три месяца подряд", detail: "{list}", vars: { list: lastNet.map((n, i) => `${months[months.length - 3 + i].month}: ${fmt(n)}`).join("; ") } });
  if (runway != null && runway < 1) signals.push({ level: "watch", title: "Денег меньше чем на месяц", detail: "При нынешнем оттоке деньги закончатся примерно через {n} мес.", vars: { n: String(runway).replace(".", ",") } });
  if (altman?.zone === "distress") signals.push({ level: "watch", title: "Модель Альтмана: зона высокого риска", detail: "Z'' = {z} (ниже 1,1).", vars: { z: String(altman.z).replace(".", ",") } });
  const trend = months.filter((m) => m.current != null).slice(-4);
  if (trend.length >= 4 && trend.every((m, i) => i === 0 || (m.current ?? 0) < (trend[i - 1].current ?? 0)) && (trend[3].current ?? 0) < 1.5) {
    signals.push({ level: "watch", title: "Ликвидность падает четвёртый месяц", detail: "{list}", vars: { list: trend.map((m) => `${m.month}: ${String(m.current).replace(".", ",")}`).join(" → ") } });
  }

  // главный признак (ст. 3 Закона): просроченного больше, чем ликвидных активов, или активов меньше, чем долгов.
  // Отдельные просрочки (зарплата, налоги) — тревожные сигналы, но сами по себе ещё не неплатёжеспособность.
  const risk = balance.equity < 0 || (overdue > 0.01 && balance.liquid < overdue);
  const watch = signals.length > 0 || indicators.some((i) => i.level !== "ok");
  const verdict = risk
    ? { level: "risk" as const, title: "Есть признаки неплатёжеспособности", detail: "Компания уже не гасит часть долгов в срок, и средств на них не хватает. Нужен план: реструктуризация долгов, взыскание дебиторки, продажа лишних запасов — пока это ещё оздоровление, а не ликвидация." }
    : watch
      ? { level: "watch" as const, title: "Есть риски — стоит следить", detail: "Признаков неплатёжеспособности нет, но часть показателей ниже нормы. Посмотрите, что тянет их вниз." }
      : { level: "ok" as const, title: "Финансово устойчива", detail: "Долги гасятся в срок, ликвидных средств на них хватает." };

  return { asOf, months, balance, debts, totals: { debts: r2(debts.reduce((s, d) => s + d.amount, 0)), overdue, overdue90, byKind }, indicators, altman, signals, verdict, runway, terms };
}

/** «Что если»: как изменится покрытие, если взыскать часть дебиторки, продать часть запасов и отсрочить часть долгов. */
export function whatIf(b: BalanceGroups, overdue: number, o: { collect: number; sell: number; defer: number }) {
  const liquid = b.liquid + (b.inventory * o.sell) / 100;
  const cash = b.cash + (b.receivables * o.collect) / 100 + (b.inventory * o.sell) / 100;
  const od = overdue * (1 - o.defer / 100);
  const cl = b.currentLiabilities - overdue * (o.defer / 100);
  return { cash: r2(cash), liquid: r2(liquid), overdue: r2(od), coverage: ratio(liquid, od), current: ratio(b.currentAssets, cl), absolute: ratio(cash + b.investments, cl) };
}

/** Все тексты модуля, которые интерфейс переводит через t() (для проверки полноты кыргызского словаря). */
export const DIAG_TEXTS: string[] = [
  ...Object.values(CREDITOR_KIND), ...Object.values(BUDGET_NAMES), "Налоги", "Работники", "без указания контрагента", "{name} — проценты",
  "Недостаточность активов", "Обязательства ({liab} сом) больше всех активов ({assets} сом) на {gap} сом.",
  "Ликвидных активов меньше, чем просроченных долгов", "Просрочено {overdue} сом, денег и дебиторки — {liquid} сом. Это и есть неплатёжеспособность в смысле ст. 3 Закона.",
  "Задержка зарплаты", "Не выплачено дольше {days} дней: {sum} сом.",
  "Не погашены налоги и взносы", "Дольше {days} дней после начисления: {sum} сом. Налоговые долги учитываются при неплатёжеспособности наравне с другими.",
  "Просрочка поставщикам", "{sum} сом не оплачено дольше {days} дней, из них {sum90} сом — ещё на 90 дней дольше.", "{sum} сом не оплачено дольше {days} дней.",
  "Не уплачены проценты по кредитам", "{sum} сом начисленных процентов не уплачено дольше {days} дней.",
  "Убыток три месяца подряд", "Денег меньше чем на месяц", "При нынешнем оттоке деньги закончатся примерно через {n} мес.",
  "Модель Альтмана: зона высокого риска", "Z'' = {z} (ниже 1,1).", "Ликвидность падает четвёртый месяц",
  "Есть признаки неплатёжеспособности", "Компания уже не гасит часть долгов в срок, и средств на них не хватает. Нужен план: реструктуризация долгов, взыскание дебиторки, продажа лишних запасов — пока это ещё оздоровление, а не ликвидация.",
  "Есть риски — стоит следить", "Признаков неплатёжеспособности нет, но часть показателей ниже нормы. Посмотрите, что тянет их вниз.",
  "Финансово устойчива", "Долги гасятся в срок, ликвидных средств на них хватает.",
  "Текущая ликвидность", "от 1,5; ниже 1 — риск", "Оборотные активы / краткосрочные обязательства: хватит ли всего оборотного имущества на текущие долги.",
  "Быстрая ликвидность", "от 0,8; ниже 0,5 — риск", "Деньги, вложения и дебиторка / краткосрочные обязательства — без запасов, которые ещё надо продать.",
  "Абсолютная ликвидность", "от 0,2", "Только деньги / краткосрочные обязательства: какую часть долгов можно погасить прямо сейчас.",
  "Доля собственного капитала", "от 50 %; меньше 0 — активов меньше, чем долгов", "Капитал / активы. Отрицательный капитал — недостаточность активов: всего имущества не хватит на все долги.",
  "Покрытие просроченных долгов", "от 1; ниже 1 — признак ст. 3", "Ликвидные активы / долги, не погашенные в срок. Ниже 1 — не хватает средств погасить просроченное.",
  "Денег хватит", "от 2 месяцев", "Деньги / средний чистый отток за последние 3 месяца.",
];
