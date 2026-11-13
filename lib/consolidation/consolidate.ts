// ════════════════════════════════════════════════════════════════════════
// lib/consolidation/consolidate.ts — консолидированная отчётность группы (МСФО (IFRS) 10, упрощённо).
//
// Сводная отчётность строится тем же движком (lib/ledger/engine.ts), что и отчётность одной
// компании: журналы участников объединяются, к ним добавляются проводки исключения. Поэтому
// все сверки движка — актив = пассив, ОДДС = остаток денег, капитал — работают и для группы.
//
// Что исключается:
//   1. Взаиморасчёты: дебиторская и кредиторская задолженность, займы, авансы между участниками
//      (контрагент строки — ИНН или наименование другого участника). На начало и на конец периода.
//   2. Денежные расчёты внутри группы: платёж одного участника другому — перемещение денег внутри
//      группы, а не поступление и не выплата. В сводном журнале он идёт через «Денежные средства
//      в пути» (1250): деньги, отправленные, но ещё не полученные, остаются в пути.
//   3. Внутригрупповые доходы и расходы периода (продажи, услуги, аренда, проценты); дивиденды
//      участнику — против нераспределённой прибыли плательщика.
//   4. Инвестиции материнской компании в дочерние (2830) — против доли в их капитале на дату
//      приобретения; разница — гудвил (2920) или доход от выгодной покупки.
//   5. Неконтролирующая доля (доля других собственников дочерней компании) — показывается отдельно
//      в капитале и в прибыли.
// Чистые функции, без базы.
// ════════════════════════════════════════════════════════════════════════

import { buildStatements, type Statements } from "@/lib/ledger/engine";
import { getAccount, isCash } from "@/lib/ledger/accounts";
import { round2, type LedgerEntry, type LedgerLine, type Period } from "@/lib/ledger/types";

export type MemberRole = "parent" | "common" | "subsidiary";

export interface GroupMember {
  companyId: string;
  name: string;
  inn: string | null;
  /** parent — материнская; subsidiary — дочерняя с долей владения; common — под общим контролем (сложение без исключения инвестиций) */
  role: MemberRole;
  /** доля материнской компании, 0 < share ≤ 1 (для дочерней) */
  share?: number;
  /** дата приобретения ГГГГ-ММ-ДД; пусто — создана материнской компанией */
  acquiredAt?: string | null;
  /** стоимость инвестиции, если в журнале материнской компании она не отмечена контрагентом */
  investmentCost?: number | null;
}

export interface MemberJournal { member: GroupMember; entries: LedgerEntry[] }

export interface Adjustment { id: string; date: string; description: string; lines: LedgerLine[] }

export type EliminationKind = "settlements" | "cash" | "intragroup" | "dividends" | "investment" | "manual";

export interface Elimination {
  kind: EliminationKind;
  title: string;
  /** сумма исключения на конец периода (для доходов/расходов — за период) */
  amount: number;
  detail: string;
  /** строки исключения на конец периода (Дт/Кт по счетам) */
  lines: LedgerLine[];
}

export interface NciInfo { companyId: string; name: string; share: number; equityOpen: number; equityClose: number; nciOpen: number; nciClose: number; profit: number; nciProfit: number }

export interface ConsolidationPeriod {
  period: Period;
  entries: LedgerEntry[];
  statements: Statements;
  members: Array<{ companyId: string; name: string; statements: Statements }>;
  eliminations: Elimination[];
  nci: NciInfo[];
}

export interface ConsolidationResult {
  current: ConsolidationPeriod;
  previous: ConsolidationPeriod;
  warnings: string[];
}

// ── helpers ─────────────────────────────────────────────────────────────

const EPS = 0.005;
const digits = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");
const dayBefore = (iso: string) => new Date(Date.parse(`${iso}T00:00:00Z`) - 864e5).toISOString().slice(0, 10);
const money = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ | /g, " ");

/** «ОсОО "Ак-Таш"», «ак таш осоо» → «ак таш» — для сопоставления наименований. */
const LEGAL = new Set(["осоо", "оао", "зао", "ао", "ооо", "ип", "чп", "оо", "ф-л", "филиал", "llc", "ltd", "ojsc", "cjsc"]);
export function nameKey(s: string | null | undefined): string {
  return (s ?? "").toLowerCase().replace(/ё/g, "е")
    .split(/[^a-zа-я0-9ңөү]+/i).filter((t) => t && !LEGAL.has(t)).join(" ");
}

/** Accounts of settlements that can be intra-group: receivables, advances, loans (asset) and payables, loans, accruals (liability). */
export const IC_RECEIVABLE = new Set(["1410", "1510", "1550", "1560", "1590", "1810", "1820", "1830", "1890", "1330", "2720", "2790", "2820"]);
export const IC_PAYABLE = new Set(["3110", "3190", "3210", "3310", "3320", "3510", "3540", "3550", "3590", "4130", "4140", "4190"]);
const isSettlement = (acc: string) => IC_RECEIVABLE.has(acc) || IC_PAYABLE.has(acc);
const INVESTMENT = "2830";
const GOODWILL = "2920";
const RETAINED = "5300";
const IN_TRANSIT = "1250";
const DIVIDEND_INCOME = "6152";
const typeOf = (acc: string) => getAccount(acc)?.type;

/** Which group member a line's counterparty is (by INN, else by name); null — not a member. */
export function makeMatcher(members: GroupMember[]) {
  const byInn = new Map<string, string>();
  const byName = new Map<string, string>();
  for (const m of members) {
    const inn = digits(m.inn);
    if (inn) byInn.set(inn, m.companyId);
    const k = nameKey(m.name);
    if (k) byName.set(k, m.companyId);
  }
  return (l: Pick<LedgerLine, "party" | "partyInn">, own: string): string | null => {
    const inn = digits(l.partyInn);
    const hit = (inn && byInn.get(inn)) || (l.party ? byName.get(nameKey(l.party)) : undefined) || null;
    return hit && hit !== own ? hit : null;
  };
}

function netBy(entries: LedgerEntry[], pick: (l: LedgerLine, e: LedgerEntry) => boolean, upTo: string, from?: string): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of entries) {
    if (e.date > upTo || (from && e.date < from && e.source !== "opening")) continue;
    for (const l of e.lines) if (pick(l, e)) m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit);
  }
  return m;
}

/** Equity of a company at a date: equity accounts (credit +) plus P&L not yet closed. */
export function equityAt(entries: LedgerEntry[], at: string): number {
  let eq = 0;
  for (const e of entries) {
    if (e.date > at) continue;
    for (const l of e.lines) {
      const t = typeOf(l.account);
      if (t === "equity" || t === "income" || t === "expense") eq += l.credit - l.debit;
    }
  }
  return round2(eq);
}

const lines = (dr: Map<string, number>, cr: Map<string, number>, extra: Partial<LedgerLine> = {}): LedgerLine[] => {
  const out: LedgerLine[] = [];
  for (const [account, v] of dr) { const r = round2(v); if (r > 0) out.push({ account, debit: r, credit: 0, ...extra }); else if (r < 0) out.push({ account, debit: 0, credit: -r, ...extra }); }
  for (const [account, v] of cr) { const r = round2(v); if (r > 0) out.push({ account, debit: 0, credit: r, ...extra }); else if (r < 0) out.push({ account, debit: -r, credit: 0, ...extra }); }
  return balanceRounding(out);
};

/** Rounding to tiyin can leave a kopeck of difference on proportional lines — put it on the largest line. */
function balanceRounding(ls: LedgerLine[]): LedgerLine[] {
  const diff = round2(ls.reduce((s, l) => s + l.debit - l.credit, 0));
  if (Math.abs(diff) < EPS || Math.abs(diff) > 0.05 || !ls.length) return ls;
  const big = ls.reduce((a, b) => (Math.max(a.debit, a.credit) >= Math.max(b.debit, b.credit) ? a : b));
  if (big.credit > 0) big.credit = round2(big.credit + diff); else big.debit = round2(big.debit - diff);
  return ls;
}

/** Lines at the period end minus lines at its start (by account and side) — the change to post within the period. */
function delta(close: LedgerLine[], open: LedgerLine[]): LedgerLine[] {
  const m = new Map<string, number>();
  for (const l of close) m.set(l.account, (m.get(l.account) ?? 0) + l.debit - l.credit);
  for (const l of open) m.set(l.account, (m.get(l.account) ?? 0) - l.debit + l.credit);
  const out: LedgerLine[] = [];
  for (const [account, v] of m) { const r = round2(v); if (r > 0) out.push({ account, debit: r, credit: 0 }); else if (r < 0) out.push({ account, debit: 0, credit: -r }); }
  return out;
}

const scale = (m: Map<string, number>, k: number) => new Map([...m].map(([a, v]) => [a, v * k]));
const sum = (m: Map<string, number>) => [...m.values()].reduce((s, v) => s + v, 0);

// ── 0. member journals: acquisition cut-off and ids ─────────────────────

/**
 * Entries of a subsidiary acquired on `at`: everything before the acquisition becomes one opening
 * entry with the balances on that day (P&L into retained earnings) — the group consolidates its
 * results only from the acquisition.
 */
export function cutAtAcquisition(entries: LedgerEntry[], at: string, companyId: string): LedgerEntry[] {
  const before = entries.filter((e) => e.date < at);
  if (!before.length) return entries;
  const net = new Map<string, number>();
  for (const e of before) for (const l of e.lines) {
    const t = typeOf(l.account);
    const acc = t === "income" || t === "expense" || l.account === "5999" ? RETAINED : l.account;
    net.set(acc, (net.get(acc) ?? 0) + l.debit - l.credit);
  }
  const ls: LedgerLine[] = [];
  for (const [account, v] of net) { const r = round2(v); if (r > 0) ls.push({ account, debit: r, credit: 0 }); else if (r < 0) ls.push({ account, debit: 0, credit: -r }); }
  const opening: LedgerEntry = { id: `acq:${companyId}`, date: dayBefore(at), description: "Остатки на дату приобретения", source: "opening", lines: balanceRounding(ls) };
  return [...(ls.length ? [opening] : []), ...entries.filter((e) => e.date >= at)];
}

// ── 1–2. intra-group cash: through «cash in transit» ────────────────────

/**
 * A payment between members is a move of money inside the group. The member's counterpart line
 * (payable, receivable, or an expense/income paid directly) goes to 1250 in the consolidated journal;
 * an expense or income paid directly is first recorded against a settlement (3190 / 1590) with the
 * same counterparty, so the intra-group P&L and settlements are still eliminated below.
 */
export function routeIntraGroupCash(e: LedgerEntry, own: string, match: ReturnType<typeof makeMatcher>): { entries: LedgerEntry[]; moved: number } {
  if (!e.lines.some((l) => isCash(l.account))) return { entries: [e], moved: 0 };
  const ic = e.lines.map((l) => (!isCash(l.account) ? match(l, own) : null));
  if (!ic.some(Boolean)) return { entries: [e], moved: 0 };
  const out: LedgerEntry[] = [];
  let moved = 0;
  const rewritten = e.lines.map((l, i) => {
    if (!ic[i]) return l;
    moved += l.debit + l.credit;
    if (!isSettlement(l.account)) {
      // Дт расход / Кт деньги → Дт расход / Кт 3190 (контрагент) + Дт 1250 / Кт деньги
      const clearing = l.debit > 0
        ? { account: "3190", debit: 0, credit: l.debit, party: l.party, partyInn: l.partyInn }
        : { account: "1590", debit: l.credit, credit: 0, party: l.party, partyInn: l.partyInn };
      out.push({ ...e, id: `${e.id}~pl${i}`, lines: [l, clearing] });
    }
    return { ...l, account: IN_TRANSIT, memo: "внутригрупповой платёж" };
  });
  out.unshift({ ...e, lines: rewritten });
  return { entries: out, moved: round2(moved) };
}

// ── main ────────────────────────────────────────────────────────────────

export function consolidate(journals: MemberJournal[], period: Period, prev: Period, adjustments: Adjustment[] = []): ConsolidationResult {
  const warnings: string[] = [];
  const members = journals.map((j) => j.member);
  const parent = members.find((m) => m.role === "parent");
  if (!parent) warnings.push("Не выбрана материнская компания — отчётность сложена как группа под общим контролем.");
  for (const m of members) if (!digits(m.inn)) warnings.push(`У «${m.name}» не указан ИНН: операции с ней распознаются только по наименованию контрагента.`);
  const match = makeMatcher(members);

  const current = buildPeriod(journals, period, adjustments, match, warnings, true);
  const previous = buildPeriod(journals, prev, adjustments, match, [], false);
  return { current, previous, warnings };
}

function buildPeriod(journals: MemberJournal[], period: Period, adjustments: Adjustment[], match: ReturnType<typeof makeMatcher>, warnings: string[], report: boolean): ConsolidationPeriod {
  const opening = dayBefore(period.from);
  const parent = journals.find((j) => j.member.role === "parent");

  // 0. member journals (after acquisition cut-off), ids made unique
  const own = journals
    .filter((j) => {
      const at = j.member.role === "subsidiary" ? j.member.acquiredAt : null;
      if (at && at > period.to) { if (report) warnings.push(`«${j.member.name}» приобретена ${at.split("-").reverse().join(".")} — после конца периода, в отчётность не включена.`); return false; }
      return true;
    })
    .map((j) => {
      const at = j.member.role === "subsidiary" ? j.member.acquiredAt : null;
      const es = (at ? cutAtAcquisition(j.entries, at, j.member.companyId) : j.entries).filter((e) => e.date <= period.to);
      return { member: j.member, entries: es.map((e) => ({ ...e, id: `${j.member.companyId}:${e.id}` })) };
    });

  const memberStatements = own.map((j) => ({ companyId: j.member.companyId, name: j.member.name, statements: buildStatements(j.entries, period, { regime: null }) }));

  // 1–2. combined journal with intra-group payments through 1250
  const combined: Array<LedgerEntry & { owner: string }> = [];
  let movedCash = 0;
  for (const j of own) for (const e of j.entries) {
    const r = routeIntraGroupCash(e, j.member.companyId, match);
    if (e.date >= period.from) movedCash += r.moved / 2;
    for (const x of r.entries) combined.push({ ...x, owner: j.member.companyId });
  }

  const elims: Elimination[] = [];
  const elimEntries: LedgerEntry[] = [];
  const post = (id: string, description: string, openLines: LedgerLine[], closeLines: LedgerLine[]) => {
    if (openLines.length) elimEntries.push({ id: `elim:${id}:open`, date: opening, description: `Исключение (на начало): ${description}`, source: "opening", lines: openLines });
    const d = delta(closeLines, openLines);
    if (d.length) elimEntries.push({ id: `elim:${id}`, date: period.to, description: `Исключение: ${description}`, source: "manual", lines: balanceRounding(d) });
  };

  // ── settlements between members ──
  const icSettle = (at: string) => {
    const recv = new Map<string, number>(), pay = new Map<string, number>();
    const pairs = new Map<string, { recv: number; pay: number }>(); // «кредитор→должник» for the reconciliation
    for (const e of combined) {
      if (e.date > at) continue;
      for (const l of e.lines) {
        if (!isSettlement(l.account)) continue;
        const other = match(l, e.owner);
        if (!other) continue;
        const net = l.debit - l.credit;
        if (IC_RECEIVABLE.has(l.account)) {
          recv.set(l.account, (recv.get(l.account) ?? 0) + net);
          const k = `${e.owner}>${other}`; const p = pairs.get(k) ?? { recv: 0, pay: 0 }; p.recv += net; pairs.set(k, p);
        } else {
          pay.set(l.account, (pay.get(l.account) ?? 0) - net);
          const k = `${other}>${e.owner}`; const p = pairs.get(k) ?? { recv: 0, pay: 0 }; p.pay -= net; pairs.set(k, p);
        }
      }
    }
    const R = sum(recv), P = sum(pay);
    const M = R > EPS && P > EPS ? Math.min(R, P) : 0;
    const ls = M ? lines(scale(pay, M / P), scale(recv, M / R)) : [];
    return { ls, M, R, P, pairs };
  };
  const sClose = icSettle(period.to), sOpen = icSettle(opening);
  if (sClose.M || sOpen.M) {
    post("settlements", "взаиморасчёты между участниками группы", sOpen.ls, sClose.ls);
    elims.push({ kind: "settlements", title: "Взаиморасчёты внутри группы", amount: round2(sClose.M), lines: sClose.ls,
      detail: `Дебиторская задолженность участников друг перед другом ${money(sClose.R)}, кредиторская ${money(sClose.P)}; исключено ${money(sClose.M)}.` });
  }
  if (report) {
    const name = (id: string) => journals.find((j) => j.member.companyId === id)?.member.name ?? id;
    for (const [k, p] of sClose.pairs) {
      if (Math.abs(p.recv - p.pay) > 1) {
        const [cred, debt] = k.split(">");
        warnings.push(`Взаиморасчёты не сходятся: «${name(cred)}» показывает долг «${name(debt)}» ${money(p.recv)}, а «${name(debt)}» — свой долг ${money(p.pay)}. Разница ${money(Math.abs(p.recv - p.pay))} осталась в отчётности — сверьте акты.`);
      }
    }
  }
  if (movedCash > EPS) {
    const transit = netBy(combined, (l) => l.account === IN_TRANSIT && l.memo === "внутригрупповой платёж", period.to);
    const t = round2(sum(transit));
    elims.push({ kind: "cash", title: "Денежные расчёты внутри группы", amount: round2(movedCash), lines: [],
      detail: `Платежи между участниками за период ${money(movedCash)} не показаны как поступления и выплаты.${Math.abs(t) > 1 ? ` В пути на конец периода: ${money(t)} — отправлено, но ещё не отражено получателем.` : ""}` });
  }

  // ── intra-group income and expense of the period ──
  const inc = new Map<string, number>(), exp = new Map<string, number>(), div = new Map<string, number>();
  for (const e of combined) {
    if (e.date < period.from || e.date > period.to || e.source === "opening" || e.source === "closing") continue;
    // в проводке «Дт 7110 / Кт 3110 (участник)» контрагент обычно указан только в строке расчётов:
    // доходы и расходы без своего контрагента в такой проводке — тоже внутригрупповые
    const entryIc = e.lines.some((l) => match(l, e.owner));
    for (const l of e.lines) {
      if (!(match(l, e.owner) || (entryIc && !l.party && !l.partyInn))) continue;
      const t = typeOf(l.account);
      if (t === "income") (l.account === DIVIDEND_INCOME ? div : inc).set(l.account, ((l.account === DIVIDEND_INCOME ? div : inc).get(l.account) ?? 0) + l.credit - l.debit);
      else if (t === "expense") exp.set(l.account, (exp.get(l.account) ?? 0) + l.debit - l.credit);
    }
  }
  const I = round2(sum(inc)), E = round2(sum(exp));
  if (I > EPS || E > EPS) {
    const dr = new Map(inc), cr = new Map(exp);
    let note = "";
    if (I - E > EPS) { cr.set("7200", (cr.get("7200") ?? 0) + (I - E)); note = ` Расходы покупателей с контрагентом-участником — ${money(E)}; остальное (${money(I - E)}) — товары и работы, купленные внутри группы и уже проданные: исключено из себестоимости (7200).`; }
    else if (E - I > EPS) { dr.set("6110", (dr.get("6110") ?? 0) + (E - I)); note = ` У продавцов найдено доходов только на ${money(I)} — разница ${money(E - I)} исключена из выручки (6110). Укажите участника контрагентом в проводках продаж.`; }
    const ls = lines(dr, cr);
    elimEntries.push({ id: "elim:intragroup", date: period.to, description: "Исключение: внутригрупповые доходы и расходы", source: "manual", lines: ls });
    elims.push({ kind: "intragroup", title: "Внутригрупповые продажи, услуги, проценты", amount: Math.max(I, E), lines: ls,
      detail: `Доходы участников от операций друг с другом ${money(I)}, расходы ${money(E)}.${note}${I - E > EPS ? " Если часть купленного внутри группы ещё на складе, добавьте корректировку нереализованной прибыли (Дт 7200 Кт 1610)." : ""}` });
  }
  const D = round2(sum(div));
  if (D > EPS) {
    const ls = lines(div, new Map([[RETAINED, D]]));
    elimEntries.push({ id: "elim:dividends", date: period.to, description: "Исключение: дивиденды внутри группы", source: "manual", lines: ls });
    elims.push({ kind: "dividends", title: "Дивиденды внутри группы", amount: D, lines: ls, detail: `Дивиденды, полученные от участников группы, ${money(D)} — исключены из доходов, нераспределённая прибыль плательщика восстановлена.` });
  }

  // ── investments in subsidiaries, goodwill, non-controlling interest ──
  const nci: NciInfo[] = [];
  const CAPITAL = /^5[12]\d\d$/;
  for (const j of own) {
    const m = j.member;
    if (m.role !== "subsidiary") continue;
    const s = Math.min(1, Math.max(0, m.share ?? 1));
    const sub = j.entries;
    // equity at acquisition, by account: acquired — the snapshot; founded — paid-in capital
    const eqAcq = (at: string): Map<string, number> => {
      const pick = m.acquiredAt
        ? (l: LedgerLine, e: LedgerEntry) => e.id === `${m.companyId}:acq:${m.companyId}` && typeOf(l.account) === "equity"
        : (l: LedgerLine) => CAPITAL.test(l.account) && typeOf(l.account) === "equity";
      const n = netBy(sub, pick, at);
      return new Map([...n].map(([a, v]) => [a, -v])); // credit-positive
    };
    const cost = (at: string): number => {
      if (m.investmentCost && m.investmentCost > 0) return m.investmentCost;
      if (!parent) return 0;
      const pe = combined.filter((e) => e.owner === parent.member.companyId);
      let c = 0;
      for (const e of pe) if (e.date <= at) for (const l of e.lines) if (l.account === INVESTMENT && match(l, parent.member.companyId) === m.companyId) c += l.debit - l.credit;
      return round2(c);
    };
    const invLines = (at: string): LedgerLine[] => {
      const eq = eqAcq(at), C = cost(at);
      if (C <= EPS) return [];
      const share = scale(eq, s);
      const gw = round2(C - sum(share));
      const dr = new Map(share);
      const cr = new Map<string, number>([[INVESTMENT, C]]);
      if (gw > EPS) dr.set(GOODWILL, gw); else if (gw < -EPS) cr.set(RETAINED, (cr.get(RETAINED) ?? 0) - gw);
      return lines(dr, cr);
    };
    const cl = invLines(period.to), op = invLines(opening);
    if (cl.length || op.length) {
      post(`inv:${m.companyId}`, `инвестиция в «${m.name}»`, op, cl);
      const C = cost(period.to), eq = round2(sum(eqAcq(period.to)) * s), gw = round2(C - eq);
      elims.push({ kind: "investment", title: `Инвестиция в «${m.name}» (доля ${Math.round(s * 1000) / 10} %)`, amount: C, lines: cl,
        detail: `Стоимость вложения ${money(C)} исключена против доли в капитале на дату ${m.acquiredAt ? `приобретения (${m.acquiredAt.split("-").reverse().join(".")})` : "создания"} ${money(eq)}. ${gw > EPS ? `Гудвил ${money(gw)} (2920).` : gw < -EPS ? `Доход от выгодной покупки ${money(-gw)} — в нераспределённой прибыли.` : "Гудвила нет."}` });
    } else if (report && parent) {
      warnings.push(`Вложение в «${m.name}» на счёте 2830 материнской компании не найдено (контрагент — эта компания). Укажите контрагента в проводке или стоимость инвестиции в настройках группы.`);
    }
    if (s < 1) {
      const st = memberStatements.find((x) => x.companyId === m.companyId)!.statements;
      const eqO = equityAt(sub, opening), eqC = equityAt(sub, period.to);
      nci.push({ companyId: m.companyId, name: m.name, share: s, equityOpen: eqO, equityClose: eqC,
        nciOpen: round2(eqO * (1 - s)), nciClose: round2(eqC * (1 - s)),
        profit: st.incomeStatement.netProfit, nciProfit: round2(st.incomeStatement.netProfit * (1 - s)) });
    }
  }

  // ── manual adjustments ──
  for (const a of adjustments) {
    if (a.date < period.from || a.date > period.to) continue;
    elimEntries.push({ id: `adj:${a.id}`, date: a.date, description: `Корректировка: ${a.description}`, source: "manual", lines: a.lines });
    elims.push({ kind: "manual", title: a.description, amount: round2(a.lines.reduce((s2, l) => s2 + l.debit, 0)), lines: a.lines, detail: "Корректировка консолидации, введённая вручную." });
  }
  // earlier adjustments stay in the opening balances
  for (const a of adjustments) if (a.date < period.from) elimEntries.push({ id: `adj:${a.id}:open`, date: opening, description: `Корректировка (прошлые периоды): ${a.description}`, source: "opening", lines: a.lines });

  const entries: LedgerEntry[] = [...combined.map(({ owner: _o, ...e }) => e), ...elimEntries];
  const statements = buildStatements(entries, period, { regime: null });
  return { period, entries, statements, members: memberStatements, eliminations: elims, nci };
}
