// ════════════════════════════════════════════════════════════════════════
// lib/reconcile/osv.ts — сверка с 1С: оборотно-сальдовая ведомость из 1С
// против журнала FinLite за тот же период.
//
// Счета 1С сопоставляются со счетами FinLite (как при загрузке на странице
// «Обмен с 1С»), суммы по одному счёту FinLite складываются. По каждому счёту
// сравниваются сальдо на начало, обороты и сальдо на конец; у доходов и
// расходов — только основной оборот (выручка — по кредиту, расходы — по
// дебету): 1С закрывает их каждый месяц, FinLite — при закрытии года, поэтому
// второй оборот и сальдо у них различаются законно. Если ведомость 1С
// развёрнута по субконто, по расчётным счетам сверяются контрагенты, по
// счетам запасов — номенклатура. Для каждого расхождения — подсказка, где искать.
// Чистые функции: без базы, общие для сервера и браузера.
// ════════════════════════════════════════════════════════════════════════

import { getAccount, accountName } from "@/lib/ledger/accounts";
import { ITEM_ACCOUNT, itemKey } from "@/lib/ledger/stock";
import type { LedgerEntry, Period } from "@/lib/ledger/types";
import { SETTLE } from "@/lib/counterparties/types";
import { nameKey } from "@/lib/consolidation/consolidate";
import { suggestAccount } from "@/lib/import1c/map";
import type { OsvRow } from "@/lib/import1c/parse";

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
/** Расхождение меньше тыйына — округление. */
export const TOLERANCE = 0.01;
const same = (a: number, b: number) => Math.abs(a - b) < TOLERANCE + 1e-9;

export interface Side { open: number; turnDr: number; turnCr: number; close: number }
const ZERO: Side = { open: 0, turnDr: 0, turnCr: 0, close: 0 };

export type RecStatus = "ok" | "diff" | "only1c" | "onlyOurs" | "info";

export interface SubRow { name: string; one: number | null; ours: number | null; diff: number }

export interface RecRow {
  account: string;
  name: string;
  /** доходы и расходы — сравнивается только основной оборот */
  pnl: boolean;
  /** счета 1С, которые сюда сопоставлены */
  from1c: string[];
  one: Side | null;
  ours: Side | null;
  /** FinLite − 1С по каждому показателю (null — не сравнивается) */
  diff: { open: number | null; turnDr: number | null; turnCr: number | null; close: number | null };
  status: RecStatus;
  hint: string;
  /** по контрагентам или номенклатуре — только строки с расхождением */
  subs: SubRow[];
  subsBy: "party" | "item" | null;
}

export interface RecResult {
  period: Period;
  rows: RecRow[];
  /** счета 1С, которые не удалось сопоставить, — их суммы не сверялись */
  unmapped: Array<{ code: string; name: string; amount: number }>;
  summary: { ok: number; diff: number; only1c: number; onlyOurs: number; info: number };
  /** прибыль за период (доходы − расходы по основным оборотам) */
  profit: { one: number; ours: number };
}

const isPnl = (acc: string) => { const t = getAccount(acc)?.type; return t === "income" || t === "expense"; };
/** Основной оборот счёта доходов / расходов: выручка — кредит, расходы — дебет; у контрсчетов — наоборот. */
const mainSide = (acc: string): "turnDr" | "turnCr" => {
  const a = getAccount(acc);
  const credit = a?.type === "income";
  return (a?.contra ? !credit : credit) ? "turnCr" : "turnDr";
};
const wantsParty = (acc: string) => !!SETTLE[acc] || acc === "1520" || acc === "1590";
/** Счета, где 1С и FinLite законно расходятся в середине года: прибыль текущего года и нераспределённая прибыль. */
const PROFIT_ACCOUNTS = new Set(["5999", "5300"]);

/** Счёт FinLite для счёта 1С: сохранённое сопоставление, иначе — подсказка (тот же код, родитель, план РФ). */
export function targetOf(code: string, mapping: Record<string, string>): string {
  return mapping[code] || suggestAccount(code).target;
}

function ourSides(entries: LedgerEntry[], p: Period) {
  const acc = new Map<string, Side>();
  const sub = new Map<string, Map<string, { name: string; net: number }>>(); // account → key → closing net
  const bump = (a: string, f: (s: Side) => void) => { const s = acc.get(a) ?? { ...ZERO }; f(s); acc.set(a, s); };
  for (const e of entries) {
    if (e.date > p.to) continue;
    const opening = e.date < p.from || e.source === "opening";
    for (const l of e.lines) {
      const net = l.debit - l.credit;
      if (opening) bump(l.account, (s) => { s.open += net; });
      else bump(l.account, (s) => { s.turnDr += l.debit; s.turnCr += l.credit; });
      const name = wantsParty(l.account) ? l.party?.trim() || "" : ITEM_ACCOUNT.test(l.account) ? l.item?.trim() || "" : null;
      if (name !== null) {
        const key = wantsParty(l.account) ? nameKey(name) : itemKey(name);
        const m = sub.get(l.account) ?? new Map();
        const cur = m.get(key) ?? { name: name || "(без аналитики)", net: 0 };
        cur.net += net; m.set(key, cur); sub.set(l.account, m);
      }
    }
  }
  for (const s of acc.values()) { s.open = r2(s.open); s.turnDr = r2(s.turnDr); s.turnCr = r2(s.turnCr); s.close = r2(s.open + s.turnDr - s.turnCr); }
  return { acc, sub };
}

function hintFor(acc: string, row: Omit<RecRow, "hint" | "status">, pnl: boolean): string {
  const { diff } = row;
  if (PROFIT_ACCOUNTS.has(acc)) return "1С закрывает доходы и расходы на прибыль каждый месяц, FinLite — при закрытии года. Сравнивайте прибыль за период (вверху) и счета доходов и расходов.";
  if (!row.ours) return "В FinLite нет операций по этому счёту за период — документы или остатки по нему не загружены.";
  if (!row.one) return "В ведомости 1С счёта нет. Возможно, в 1С он называется иначе — проверьте сопоставление счетов или операции в журнале FinLite.";
  if (diff.open !== null && !same(diff.open, 0)) return "Не совпадают остатки на начало периода. Загрузите ОСВ 1С на начало периода как начальные остатки («Обмен с 1С») или найдите расхождение в предыдущем периоде.";
  if (acc === "6110" || acc === "6130") return "Сравните реализации за период: суммы без НДС и состав документов. Частая причина — документ, не загруженный в одну из программ, или разный режим цен (НДС в сумме / сверху).";
  if (acc === "3430" || acc === "1540") return "НДС: проверьте ставки в строках (12 % / 0 % / без НДС) и режим цен документов. Расхождение в несколько тыйынов — округление по строкам или по документу.";
  if (/^7[0-2]\d\d$/.test(acc)) return "Себестоимость: способ оценки запасов в учётной политике (средняя / ФИФО) должен совпадать с 1С; проверьте, что все продажи списаны («Склад»).";
  if (ITEM_ACCOUNT.test(acc)) return "Запасы: сверьте поступления, списание себестоимости и номенклатуру ниже — разные наименования одного товара дают два остатка.";
  if (wantsParty(acc)) return "Расчёты: сверьте по контрагентам ниже — частая причина — оплата, разнесённая на другого контрагента или на аванс.";
  if (/^1[12]\d\d$/.test(acc)) return "Деньги: сверьте выписки банка и кассу за период — не загруженная выписка или дубль операции.";
  if (pnl) return "Сравните операции по счёту за период в журнале FinLite с карточкой счёта в 1С.";
  return "Сравните карточку счёта в 1С с операциями по счёту в журнале FinLite за период.";
}

/**
 * Сверка. `rows` — строки ведомости 1С после osvRows() (родительские счета и итоги убраны),
 * `mapping` — сохранённое сопоставление счетов 1С → FinLite.
 */
export function reconcile(entries: LedgerEntry[], rows: OsvRow[], p: Period, mapping: Record<string, string> = {}): RecResult {
  const one = new Map<string, Side>();
  const from1c = new Map<string, Set<string>>();
  const oneSub = new Map<string, Map<string, { name: string; net: number }>>();
  const unmapped = new Map<string, { code: string; name: string; amount: number }>();
  for (const r of rows) {
    const t = targetOf(r.account, mapping);
    if (!t || !getAccount(t)) {
      const u = unmapped.get(r.account) ?? { code: r.account, name: r.name, amount: 0 };
      u.amount = r2(u.amount + Math.abs(r.closeDr - r.closeCr) + r.turnDr + r.turnCr);
      unmapped.set(r.account, u);
      continue;
    }
    const s = one.get(t) ?? { ...ZERO };
    s.open += r.openDr - r.openCr; s.turnDr += r.turnDr; s.turnCr += r.turnCr; s.close += r.closeDr - r.closeCr;
    one.set(t, s);
    (from1c.get(t) ?? from1c.set(t, new Set()).get(t)!).add(r.account);
    if (r.sub && (wantsParty(t) || ITEM_ACCOUNT.test(t))) {
      const key = wantsParty(t) ? nameKey(r.sub) : itemKey(r.sub);
      const m = oneSub.get(t) ?? new Map();
      const cur = m.get(key) ?? { name: r.sub, net: 0 };
      cur.net += r.closeDr - r.closeCr; m.set(key, cur); oneSub.set(t, m);
    }
  }
  for (const s of one.values()) { s.open = r2(s.open); s.turnDr = r2(s.turnDr); s.turnCr = r2(s.turnCr); s.close = r2(s.close); }

  const ours = ourSides(entries, p);
  const codes = new Set([...one.keys(), ...[...ours.acc.entries()].filter(([, s]) => s.open || s.turnDr || s.turnCr || s.close).map(([c]) => c)]);
  const out: RecRow[] = [];
  let profitOne = 0, profitOurs = 0;
  for (const acc of [...codes].sort()) {
    const a = one.get(acc) ?? null, b = ours.acc.get(acc) ?? null;
    const bHas = !!b && !!(b.open || b.turnDr || b.turnCr || b.close);
    const pnl = isPnl(acc);
    const side = mainSide(acc);
    if (pnl) {
      const k = getAccount(acc)?.type === "income" ? 1 : -1;
      const sign = getAccount(acc)?.contra ? -1 : 1;
      profitOne += k * sign * (a?.[side] ?? 0);
      profitOurs += k * sign * (b?.[side] ?? 0);
    }
    const d = (k: keyof Side) => (a && bHas ? r2(b![k] - a[k]) : null);
    const diff = pnl
      ? { open: null, turnDr: side === "turnDr" ? d("turnDr") : null, turnCr: side === "turnCr" ? d("turnCr") : null, close: null }
      : { open: d("open"), turnDr: d("turnDr"), turnCr: d("turnCr"), close: d("close") };
    // аналитика: только если 1С развернула счёт по субконто
    let subs: SubRow[] = [];
    let subsBy: RecRow["subsBy"] = null;
    const sa = oneSub.get(acc);
    if (sa && !pnl) {
      subsBy = wantsParty(acc) ? "party" : "item";
      const sb = ours.sub.get(acc) ?? new Map();
      const keys = new Set([...sa.keys(), ...sb.keys()]);
      for (const k of keys) {
        const x = sa.get(k), y = sb.get(k);
        const ox = x ? r2(x.net) : null, oy = y ? r2(y.net) : null;
        const df = r2((oy ?? 0) - (ox ?? 0));
        if (Math.abs(df) >= TOLERANCE) subs.push({ name: x?.name ?? y!.name, one: ox, ours: oy, diff: df });
      }
      subs = subs.sort((p1, p2) => Math.abs(p2.diff) - Math.abs(p1.diff)).slice(0, 100);
    }
    const base = { account: acc, name: accountName(acc), pnl, from1c: [...(from1c.get(acc) ?? [])].sort(), one: a, ours: bHas ? b : null, diff, subs, subsBy };
    const mismatch = Object.values(diff).some((v) => v !== null && Math.abs(v) >= TOLERANCE);
    const raw: RecStatus = !a ? "onlyOurs" : !bHas ? (a.open || a.turnDr || a.turnCr || a.close ? "only1c" : "ok") : mismatch ? "diff" : "ok";
    const status: RecStatus = raw !== "ok" && PROFIT_ACCOUNTS.has(acc) ? "info" : raw;
    out.push({ ...base, status, hint: status === "ok" ? "" : hintFor(acc, base, pnl) });
  }
  const summary = { ok: 0, diff: 0, only1c: 0, onlyOurs: 0, info: 0 };
  for (const r of out) summary[r.status]++;
  return { period: p, rows: out, unmapped: [...unmapped.values()], summary, profit: { one: r2(profitOne), ours: r2(profitOurs) } };
}

export interface RecEntry { id: string; date: string; description: string; debit: number; credit: number; party: string }

/** Операции периода по счёту — чтобы сверить их с карточкой счёта в 1С (не больше `limit`, крупные первыми). */
export function entriesFor(entries: LedgerEntry[], account: string, p: Period, limit = 60): { list: RecEntry[]; total: number } {
  const list: RecEntry[] = [];
  for (const e of entries) {
    if (e.source === "opening" || e.date < p.from || e.date > p.to) continue;
    const ls = e.lines.filter((l) => l.account === account);
    if (!ls.length) continue;
    list.push({
      id: e.id, date: e.date, description: e.description.slice(0, 160),
      debit: r2(ls.reduce((a, l) => a + l.debit, 0)), credit: r2(ls.reduce((a, l) => a + l.credit, 0)),
      party: [...new Set(ls.map((l) => l.party?.trim()).filter(Boolean))].join(", ").slice(0, 120),
    });
  }
  const top = [...list].sort((a, b) => b.debit + b.credit - (a.debit + a.credit)).slice(0, limit).sort((a, b) => a.date.localeCompare(b.date));
  return { list: top, total: list.length };
}
