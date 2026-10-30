// ════════════════════════════════════════════════════════════════════════
// lib/counterparties/calc.ts — расчёты с контрагентами по данным журнала:
// сальдо по счетам, открытые счета (FIFO), сроки просрочки, оборачиваемость,
// резерв по сомнительным долгам по учётной политике и рекомендации.
// Pure functions — no database.
// ════════════════════════════════════════════════════════════════════════
import type { LedgerEntry } from "@/lib/ledger/types";
import { counterpartyOf } from "@/lib/primary/detect";
import { DEFAULT_TERMS, SETTLE, slug, type Counterparty, type CpRole, type CpStore } from "./types";

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
const days = (a: string, b: string) => Math.round((Date.parse(b) - Date.parse(a)) / 86_400_000);
const isCash = (acc: string) => /^1[12]\d\d/.test(acc);
const NO_PARTY = new Set(["payroll", "tax", "closing"]);

export const UNASSIGNED = "_none";

/** One movement on a settlement account, as it goes into the act of reconciliation. */
export interface Movement {
  date: string;
  entryId: string;
  text: string;
  account: string;
  /** our debit: we shipped / we paid */
  debit: number;
  /** our credit: they paid / they delivered */
  credit: number;
}

export interface OpenItem { date: string; amount: number; age: number; overdue: number; account: string }

export interface CpRow {
  id: string;
  name: string;
  inn: string;
  role: CpRole;
  /** found in the journal, not in the directory */
  auto: boolean;
  terms: number;
  creditLimit: number;
  /** balance per account at the end date, debit − credit */
  balances: Record<string, number>;
  /** opening (before `from`) balance in our favour (+) / theirs (−) */
  openingNet: number;
  receivable: number;
  payable: number;
  /** + they owe us, − we owe them */
  net: number;
  sales: number;
  purchases: number;
  received: number;
  paid: number;
  ops: number;
  lastDate: string;
  openRecv: OpenItem[];
  openPay: OpenItem[];
  overdueRecv: number;
  overduePay: number;
  maxOverdue: number;
  buckets: { current: number; d30: number; d60: number; d90: number; d180: number };
  /** weighted average days from invoice to payment, buyers */
  avgDays: number | null;
  allowance: number;
  confirmed: boolean;
  movements: Movement[];
}

export interface Advice { level: "error" | "warn" | "tip"; title: string; detail: string; cpId?: string }

export interface CpResult {
  asOf: string;
  from: string;
  rows: CpRow[];
  unassigned: { balances: Record<string, number>; entries: Array<{ entryId: string; date: string; text: string; amount: number; accounts: string[] }> };
  ledger: Record<string, number>;
  totals: { receivable: number; payable: number; overdueRecv: number; overduePay: number; sales: number; allowance: number; allowanceBooked: number };
  advice: Advice[];
}

export interface AllowanceRates { method: "aging" | "specific" | "none"; d90: number; d180: number; d365: number }

const norm = (s: string) => s.toLowerCase().replace(/[«»"'`“”„]/g, "").replace(/ё/g, "е").replace(/\s+/g, " ").trim();

/** Who is the counterparty of an entry: link → directory → pattern. */
export function makeResolver(store: CpStore) {
  const keys: Array<[string, string]> = [];
  for (const c of store.list) {
    for (const k of [c.name, ...c.aliases]) { const n = norm(k); if (n.length >= 3) keys.push([n, c.id]); }
  }
  keys.sort((a, b) => b[0].length - a[0].length);
  const inns = store.list.filter((c) => c.inn.length >= 10).map((c) => [c.inn, c.id] as const);
  const known = new Set(store.list.map((c) => c.id));
  return (e: LedgerEntry): { id: string; name?: string } | null => {
    const link = store.links[e.id];
    if (link && (known.has(link) || link === UNASSIGNED)) return link === UNASSIGNED ? null : { id: link };
    if (NO_PARTY.has(e.source)) return null;
    const raw = [e.description, ...e.lines.map((l) => l.memo ?? "")].join(" ");
    const text = norm(raw);
    for (const [inn, id] of inns) if (raw.includes(inn)) return { id };
    for (const [k, id] of keys) if (text.includes(k)) return { id };
    const found = counterpartyOf(e);
    return found ? { id: `auto-${slug(found)}`, name: found } : null;
  };
}

function fifo(items: Array<{ date: string; amount: number }>, pays: Array<{ date: string; amount: number }>) {
  const open = items.map((i) => ({ ...i }));
  let w = 0, wd = 0;
  for (const p of pays) {
    let left = p.amount;
    for (const it of open) {
      if (left <= 0.004) break;
      if (it.amount <= 0.004) continue;
      const take = Math.min(left, it.amount);
      it.amount = r2(it.amount - take);
      left = r2(left - take);
      w += take; wd += take * Math.max(0, days(it.date, p.date));
    }
  }
  return { open: open.filter((i) => i.amount > 0.004), avg: w > 0 ? wd / w : null };
}

export function analyze(entries: LedgerEntry[], store: CpStore, from: string, asOf: string, rates: AllowanceRates): CpResult {
  const resolve = makeResolver(store);
  const dir = new Map(store.list.map((c) => [c.id, c]));
  const rows = new Map<string, CpRow>();
  const ledger: Record<string, number> = {};
  const unBal: Record<string, number> = {};
  const unEntries: CpResult["unassigned"]["entries"] = [];

  const row = (id: string, name?: string): CpRow => {
    let r = rows.get(id);
    if (!r) {
      const c = dir.get(id);
      r = {
        id, name: c?.name ?? name ?? id, inn: c?.inn ?? "", role: c?.role ?? "other", auto: !c,
        terms: c ? c.paymentDays : DEFAULT_TERMS, creditLimit: c?.creditLimit ?? 0,
        balances: {}, openingNet: 0, receivable: 0, payable: 0, net: 0, sales: 0, purchases: 0, received: 0, paid: 0, ops: 0, lastDate: "",
        openRecv: [], openPay: [], overdueRecv: 0, overduePay: 0, maxOverdue: 0,
        buckets: { current: 0, d30: 0, d60: 0, d90: 0, d180: 0 }, avgDays: null, allowance: 0, confirmed: false, movements: [],
      };
      rows.set(id, r);
    }
    return r;
  };

  const sorted = entries.filter((e) => e.date <= asOf).slice().sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
  const openingEntry = sorted.find((e) => e.source === "opening");
  const openingDate = openingEntry?.date ?? sorted[0]?.date ?? from;

  // ── opening balances: split by the directory, the rest stays unassigned
  const allocated: Record<string, number> = {};
  for (const c of store.list) row(c.id);
  for (const c of store.list) {
    for (const [acc, amt] of Object.entries(c.opening)) {
      if (!amt) continue;
      const signed = SETTLE[acc].group === "recv" ? amt : -amt;
      const r = row(c.id);
      r.balances[acc] = r2((r.balances[acc] ?? 0) + signed);
      r.movements.push({ date: c.openingDate || openingDate, entryId: "opening", text: "Сальдо на начало (ввод остатков)", account: acc, debit: signed > 0 ? signed : 0, credit: signed < 0 ? -signed : 0 });
      allocated[acc] = r2((allocated[acc] ?? 0) + signed);
    }
  }

  for (const e of sorted) {
    const settle = e.lines.filter((l) => SETTLE[l.account]);
    for (const l of settle) ledger[l.account] = r2((ledger[l.account] ?? 0) + l.debit - l.credit);
    if (e.source === "opening") {
      for (const l of settle) unBal[l.account] = r2((unBal[l.account] ?? 0) + l.debit - l.credit);
      continue;
    }
    const who = resolve(e);
    if (!who) {
      if (settle.length) {
        for (const l of settle) unBal[l.account] = r2((unBal[l.account] ?? 0) + l.debit - l.credit);
        unEntries.push({ entryId: e.id, date: e.date, text: e.description, amount: r2(settle.reduce((s, l) => s + l.debit + l.credit, 0) / (settle.length > 1 ? 2 : 1)), accounts: [...new Set(settle.map((l) => l.account))] });
      }
      continue;
    }
    const r = row(who.id, who.name);
    const cashIn = e.lines.filter((l) => isCash(l.account)).reduce((s, l) => s + l.debit, 0);
    const cashOut = e.lines.filter((l) => isCash(l.account)).reduce((s, l) => s + l.credit, 0);
    const revenue = e.lines.filter((l) => /^61/.test(l.account)).reduce((s, l) => s + l.credit - l.debit, 0);
    if (!settle.length && !cashIn && !cashOut && !revenue) continue;
    r.ops += 1;
    r.lastDate = e.date;
    if (e.date >= from) {
      r.sales = r2(r.sales + revenue);
      r.received = r2(r.received + cashIn);
      r.paid = r2(r.paid + cashOut);
      r.purchases = r2(r.purchases + settle.filter((l) => l.account === "3110" || l.account === "3190").reduce((s, l) => s + l.credit, 0));
    }
    if (settle.length) {
      for (const l of settle) {
        r.balances[l.account] = r2((r.balances[l.account] ?? 0) + l.debit - l.credit);
        r.movements.push({ date: e.date, entryId: e.id, text: e.description, account: l.account, debit: l.debit, credit: l.credit });
      }
    } else {
      // settled on the spot: a delivery and its payment in one operation
      const amt = r2(cashIn || cashOut);
      if (e.date >= from && !cashIn) r.purchases = r2(r.purchases + amt);
      r.movements.push({ date: e.date, entryId: e.id, text: `${e.description} — ${cashIn ? "отгрузка" : "оплата"}`, account: "", debit: amt, credit: 0 });
      r.movements.push({ date: e.date, entryId: e.id, text: `${e.description} — ${cashIn ? "оплата получена" : "поставка"}`, account: "", debit: 0, credit: amt });
    }
  }
  for (const [acc, amt] of Object.entries(allocated)) unBal[acc] = r2((unBal[acc] ?? 0) - amt);

  // ── per-counterparty figures
  let allowanceTotal = 0;
  for (const r of rows.values()) {
    const c = dir.get(r.id);
    r.movements.sort((a, b) => a.date.localeCompare(b.date));
    r.openingNet = r2(r.movements.filter((m) => m.date < from || m.entryId === "opening").reduce((s, m) => s + m.debit - m.credit, 0));
    for (const [acc, bal] of Object.entries(r.balances)) {
      if (SETTLE[acc].group === "recv") { if (bal > 0) r.receivable = r2(r.receivable + bal); else r.payable = r2(r.payable - bal); }
      else { if (bal < 0) r.payable = r2(r.payable - bal); else r.receivable = r2(r.receivable + bal); }
    }
    r.net = r2(r.receivable - r.payable);

    const stream = (acc: string, sign: 1 | -1) => {
      const ms = r.movements.filter((m) => m.account === acc);
      const items = ms.map((m) => ({ date: m.date, amount: sign === 1 ? m.debit : m.credit })).filter((i) => i.amount > 0);
      const pays = ms.map((m) => ({ date: m.date, amount: sign === 1 ? m.credit : m.debit })).filter((i) => i.amount > 0);
      return fifo(items, pays);
    };
    const recv = stream("1410", 1);
    const pay = stream("3110", -1);
    r.avgDays = recv.avg === null ? null : Math.round(recv.avg);
    const item = (acc: string) => (i: { date: string; amount: number }): OpenItem => {
      const age = Math.max(0, days(i.date, asOf));
      return { date: i.date, amount: i.amount, age, overdue: Math.max(0, age - r.terms), account: acc };
    };
    r.openRecv = recv.open.map(item("1410"));
    r.openPay = pay.open.map(item("3110"));
    for (const i of r.openRecv) {
      if (i.overdue > 0) r.overdueRecv = r2(r.overdueRecv + i.amount);
      r.maxOverdue = Math.max(r.maxOverdue, i.overdue);
      const b = i.overdue <= 0 ? "current" : i.overdue <= 30 ? "d30" : i.overdue <= 60 ? "d60" : i.overdue <= 90 ? "d90" : "d180";
      r.buckets[b] = r2(r.buckets[b] + i.amount);
      if (rates.method === "aging") {
        const pct = i.overdue > 365 ? rates.d365 : i.overdue > 180 ? rates.d180 : i.overdue > 90 ? rates.d90 : 0;
        r.allowance = r2(r.allowance + (i.amount * pct) / 100);
      }
    }
    for (const i of r.openPay) if (i.overdue > 0) r.overduePay = r2(r.overduePay + i.amount);
    allowanceTotal = r2(allowanceTotal + r.allowance);
    r.confirmed = !!c?.recon && c.recon.date === asOf && Math.abs(c.recon.balance - r2(r.receivable - r.payable)) < 0.01;
  }

  const list = [...rows.values()].filter((r) => r.ops > 0 || Object.values(r.balances).some((b) => Math.abs(b) > 0.004) || !r.auto)
    .sort((a, b) => Math.abs(b.net) + b.sales - (Math.abs(a.net) + a.sales));
  const allowanceBooked = 0 + r2(-entries.filter((e) => e.date <= asOf).flatMap((e) => e.lines).filter((l) => l.account === "1491").reduce((s, l) => s + l.debit - l.credit, 0));
  const totals = {
    receivable: r2(list.reduce((s, r) => s + r.receivable, 0)),
    payable: r2(list.reduce((s, r) => s + r.payable, 0)),
    overdueRecv: r2(list.reduce((s, r) => s + r.overdueRecv, 0)),
    overduePay: r2(list.reduce((s, r) => s + r.overduePay, 0)),
    sales: r2(list.reduce((s, r) => s + r.sales, 0)),
    allowance: allowanceTotal,
    allowanceBooked,
  };
  const unassigned = { balances: Object.fromEntries(Object.entries(unBal).filter(([, v]) => Math.abs(v) > 0.004)), entries: unEntries.filter((u) => u.date >= from).reverse() };
  const result: CpResult = { asOf, from, rows: list, unassigned, ledger, totals, advice: [] };
  result.advice = advise(result, rates);
  return result;
}

function advise(res: CpResult, rates: AllowanceRates): Advice[] {
  const a: Advice[] = [];
  const { rows, totals } = res;
  const unTotal = Object.values(res.unassigned.balances).reduce((s, v) => s + Math.abs(v), 0);
  if (unTotal > 0.5) {
    const parts = Object.entries(res.unassigned.balances).map(([acc, v]) => `${acc} — ${money(Math.abs(v))}`).join(", ");
    a.push({ level: "warn", title: "Часть расчётов без контрагента", detail: `Сальдо без привязки: ${parts} сом. Укажите контрагентов у операций ниже и распределите начальные остатки в карточках — иначе акт сверки и инвентаризация расчётов будут неполными.` });
  }
  for (const [acc, v] of Object.entries(res.unassigned.balances)) {
    const grp = SETTLE[acc]?.group;
    if ((grp === "recv" && v < -0.5) || (grp === "pay" && v > 0.5)) a.push({ level: "error", title: `Счёт ${acc}: распределено больше, чем в журнале`, detail: `Сумма начальных остатков по контрагентам превышает остаток журнала на ${money(Math.abs(v))} сом. Проверьте ввод остатков.` });
  }
  for (const r of rows) {
    if (r.maxOverdue > 90 && r.overdueRecv > 0) {
      a.push({ level: "error", cpId: r.id, title: `${r.name}: долг просрочен более 90 дней`, detail: `Просрочено ${money(r.overdueRecv)} сом, максимум ${r.maxOverdue} дн. сверх отсрочки ${r.terms} дн. Направьте акт сверки и претензию; по учётной политике по этому долгу нужен резерв ${money(r.allowance)} сом.` });
    } else if (r.overdueRecv > 0.5) {
      a.push({ level: "warn", cpId: r.id, title: `${r.name}: просроченная оплата`, detail: `Просрочено ${money(r.overdueRecv)} сом (до ${r.maxOverdue} дн.). Напомните о платеже и приостановите отгрузки в долг до погашения.` });
    }
    if (r.creditLimit > 0 && r.receivable > r.creditLimit) a.push({ level: "warn", cpId: r.id, title: `${r.name}: превышен кредитный лимит`, detail: `Долг ${money(r.receivable)} сом при лимите ${money(r.creditLimit)} сом.` });
    const adv = -(r.balances["3210"] ?? 0), ar = r.balances["1410"] ?? 0;
    if (adv > 0.5 && ar > 0.5) a.push({ level: "tip", cpId: r.id, title: `${r.name}: зачтите аванс`, detail: `Покупатель одновременно должен ${money(ar)} сом и внёс аванс ${money(adv)} сом. Зачёт: Дт 3210 Кт 1410 на ${money(Math.min(adv, ar))} сом — баланс станет честнее, ЭСФ на аванс закроется.` });
    else if (adv > 0.5) {
      const last = r.movements.filter((m) => m.account === "3210" && m.credit > 0).pop();
      const age = last ? Math.round((Date.parse(res.asOf) - Date.parse(last.date)) / 86_400_000) : 0;
      if (age > 30) a.push({ level: "tip", cpId: r.id, title: `${r.name}: аванс без отгрузки ${age} дн.`, detail: `Получено ${money(adv)} сом, отгрузки в счёт аванса нет. Проверьте сроки по договору — долгий аванс без исполнения означает риск претензии.` });
    }
    const advGiven = ["1810", "1820", "1830", "1890"].reduce((s, k) => s + Math.max(0, r.balances[k] ?? 0), 0);
    if (advGiven > 0.5) {
      const last = r.movements.filter((m) => /^18/.test(m.account) && m.debit > 0).pop();
      const age = last ? Math.round((Date.parse(res.asOf) - Date.parse(last.date)) / 86_400_000) : 0;
      if (age > 45) a.push({ level: "warn", cpId: r.id, title: `${r.name}: аванс поставщику не закрыт ${age} дн.`, detail: `Выдано ${money(advGiven)} сом, поставки нет. Запросите поставку или возврат аванса.` });
    }
    if (r.overduePay > 0.5) {
      const direct = r.movements.some((m) => !m.account && m.date >= res.from);
      a.push({ level: "warn", cpId: r.id, title: `${r.name}: просрочен долг поставщику`, detail: `Не оплачено в срок ${money(r.overduePay)} сом (отсрочка ${r.terms} дн.).${direct ? " При этом текущие поставки оплачиваются сразу — старый долг не гасится. Согласуйте график погашения, чтобы не попасть на пени по договору." : " Согласуйте график погашения, чтобы не попасть на пени по договору."}` });
    }
    for (const [acc, bal] of Object.entries(r.balances)) {
      const grp = SETTLE[acc].group, un = res.unassigned.balances[acc] ?? 0;
      const wrong = (grp === "recv" && bal < -0.5 && un > 0.5) || (grp === "pay" && bal > 0.5 && un < -0.5);
      if (wrong) a.push({ level: "tip", cpId: r.id, title: `${r.name}: сальдо ${acc} на «чужой» стороне`, detail: `По счёту ${acc} ${grp === "pay" ? "оплачено больше, чем начислено" : "получено больше, чем отгружено"} на ${money(Math.abs(bal))} сом, а начальный остаток по счёту не распределён. Скорее всего, долг был на начало — укажите его в карточке контрагента.` });
    }
    if (!r.auto && !r.inn && (r.sales > 0 || r.purchases > 0 || Math.abs(r.net) > 0.5)) a.push({ level: "tip", cpId: r.id, title: `${r.name}: нет ИНН`, detail: "ИНН нужен для ЭСФ, акта сверки и инвентаризации расчётов. Добавьте его в карточку." });
  }
  const autos = rows.filter((r) => r.auto);
  if (autos.length) a.push({ level: "tip", title: `${autos.length} контрагент(ов) найдено в журнале`, detail: `${autos.slice(0, 4).map((r) => r.name).join(", ")}${autos.length > 4 ? " и др." : ""} — их нет в справочнике. Сохраните карточки: добавьте ИНН, договор и отсрочку, чтобы считать просрочку по условиям договора, а не по умолчанию (${DEFAULT_TERMS} дн.).` });

  if (totals.sales > 0) {
    const top = rows.filter((r) => r.sales > 0).sort((x, y) => y.sales - x.sales)[0];
    const share = (top.sales / totals.sales) * 100;
    if (share > 40 && rows.filter((r) => r.sales > 0).length > 1) a.push({ level: "tip", cpId: top.id, title: `Зависимость от одного покупателя — ${Math.round(share)}%`, detail: `${top.name} даёт ${Math.round(share)}% выручки за период. Уход такого клиента ударит по денежному потоку — держите лимит долга и ищите новых покупателей.` });
  }
  if (rates.method === "aging") {
    const gap = r2(totals.allowance - totals.allowanceBooked);
    if (gap > 0.5) a.push({ level: "warn", title: "Резерв по сомнительным долгам недостаточен", detail: `По срокам просрочки и ставкам учётной политики резерв должен быть ${money(totals.allowance)} сом, в учёте — ${money(totals.allowanceBooked)} сом. Начислите: Дт 7550 Кт 1491 на ${money(gap)} сом.` });
    else if (gap < -0.5) a.push({ level: "tip", title: "Резерв больше, чем нужно", detail: `Требуется ${money(totals.allowance)} сом, начислено ${money(totals.allowanceBooked)} сом. Излишек ${money(-gap)} сом восстановите: Дт 1491 Кт 6250 (или уменьшите расход).` });
  }
  const unconfirmed = rows.filter((r) => !r.confirmed && Math.abs(r.net) > 0.5).length;
  if (unconfirmed) a.push({ level: "tip", title: `Не подтверждены расчёты с ${unconfirmed} контрагентами`, detail: `Перед годовой отчётностью проводится инвентаризация расчётов (ИНВ-17). Отправьте акты сверки на ${res.asOf.split("-").reverse().join(".")} и отметьте в карточке, когда контрагент подпишет — сумма перейдёт в графу «подтверждённая».` });
  const rank = { error: 0, warn: 1, tip: 2 } as const;
  return a.map((x, i) => [x, i] as const).sort((p, q) => rank[p[0].level] - rank[q[0].level] || p[1] - q[1]).map(([x]) => x);
}
