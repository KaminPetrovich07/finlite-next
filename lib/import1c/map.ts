// ════════════════════════════════════════════════════════════════════════
// lib/import1c/map.ts — счета 1С → план счетов КР (ПП № 231), сборка
// проводок журнала, отпечатки для защиты от повторной загрузки и обратная
// выгрузка в формате журнала проводок 1С.
// ════════════════════════════════════════════════════════════════════════
import { ACCOUNTS, getAccount } from "@/lib/ledger/accounts";
import type { EntrySource, LedgerEntry, LedgerLine } from "@/lib/ledger/types";
import { SETTLE } from "@/lib/counterparties/types";
import { ITEM_ACCOUNT } from "@/lib/ledger/stock";
import type { OsvRow, ParseResult, RawPair } from "./parse";

const r2 = (n: number) => Math.round(n * 100) / 100;
export const postable = (code: string) => { const a = getAccount(code); return !!a && !a.header; };

/**
 * Счета российского плана (если компания ведёт 1С на нём) — предложение,
 * которое пользователь проверяет. Ключ — счёт или субсчёт 1С.
 */
const RF: Record<string, string> = {
  "01": "2140", "02": "2194", "04": "2960", "05": "2996", "08": "2120", "10": "1620", "19": "1540", "20": "1630", "23": "1630",
  "25": "7170", "26": "8490", "41": "1610", "43": "1640", "44": "7570", "50": "1110", "51": "1210", "52": "1220", "55": "1240",
  "57": "1250", "58": "1390", "60": "3110", "60.02": "1810", "62": "1410", "62.02": "3210", "63": "1491", "66": "3310", "67": "4120",
  "68": "3490", "68.01": "3420", "68.02": "3430", "68.04": "3410", "69": "3530", "70": "3520", "71": "1520", "73": "1520", "75": "1900",
  "76": "1590", "80": "5130", "82": "5400", "83": "5210", "84": "5300", "90": "6110", "90.01": "6110", "90.02": "7000", "90.03": "6110",
  "90.07": "7570", "90.08": "8490", "90.09": "5999", "91.01": "9190", "91.02": "9590", "91.09": "5999", "94": "9590", "96": "3730",
  "97": "1820", "98": "4200", "99": "5999",
};

export interface Suggestion { target: string; how: "exact" | "parent" | "rf" | "none" }

/** Предложение счёта по коду из 1С. */
export function suggestAccount(code: string): Suggestion {
  if (postable(code)) return { target: code, how: "exact" };
  if (/^\d{4}/.test(code)) {
    const four = code.slice(0, 4);
    if (postable(four)) return { target: four, how: "parent" };
    const three = `${code.slice(0, 3)}0`;
    if (postable(three)) return { target: three, how: "parent" };
    return { target: "", how: "none" };
  }
  const parts = code.split(".");
  for (let i = parts.length; i > 0; i--) {
    const k = parts.slice(0, i).join(".");
    if (RF[k]) return { target: RF[k], how: "rf" };
  }
  return { target: "", how: "none" };
}

export interface AccountUse { code: string; name: string; rows: number; amount: number; suggest: Suggestion }

/** Счета файла с подсказками — таблица сопоставления на странице. */
export function accountsOf(p: ParseResult): AccountUse[] {
  const m = new Map<string, AccountUse>();
  const add = (code: string, amount: number, name = "") => {
    const u = m.get(code) ?? { code, name, rows: 0, amount: 0, suggest: suggestAccount(code) };
    u.rows += 1; u.amount = r2(u.amount + Math.abs(amount)); if (!u.name && name) u.name = name;
    m.set(code, u);
  };
  for (const x of p.pairs) { add(x.dr, x.amount); add(x.cr, x.amount); }
  for (const o of osvRows(p.osv)) add(o.account, o.openDr + o.openCr + o.closeDr + o.closeCr, o.name);
  return [...m.values()].sort((a, b) => a.code.localeCompare(b.code, "ru", { numeric: true }));
}

// ── отпечатки: та же операция, загруженная повторно, пропускается
function fnv(str: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < str.length; i++) {
    const c = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return h1.toString(36) + h2.toString(36);
}

const CONTRACT = /^(договор|основной договор|без договора|сч[её]т на оплату|сч[её]т №|№|заказ|спецификация)/i;
/** Контрагент из субконто: первое значение, похожее на организацию или лицо, а не на договор. */
export function partyOf(subs: string[]): string {
  for (const v of subs) {
    if (!v || CONTRACT.test(v) || /^\d+([.,]\d+)?$/.test(v)) continue;
    return v.slice(0, 200);
  }
  return "";
}
/** Контрагент — только на счетах расчётов; на 16xx, 61xx в субконто 1С стоит номенклатура. */
const wantsParty = (acc: string) => !!SETTLE[acc] || acc === "1520" || acc === "1590";

export interface ImportEntry {
  date: string;
  description: string;
  source: EntrySource;
  sourceRef: string;
  lines: LedgerLine[];
}

export interface BuildOptions {
  mapping: Record<string, string>;
  /** для ведомости: остатки на начало (дата начала) или на конец (следующий день) */
  osvSide?: "open" | "close";
  osvDate?: string;
}

export interface BuildResult { entries: ImportEntry[]; unmapped: string[]; closing: number; warnings: string[] }

const isPnl = (acc: string) => { const t = getAccount(acc)?.type; return t === "income" || t === "expense"; };

/** Проводки закрытия месяца 1С (на 5999 / 5300) — с пометкой «closing», чтобы не обнулить ОПиУ. */
function isClosing(lines: LedgerLine[]): boolean {
  const accs = lines.map((l) => l.account);
  return accs.some((a) => a === "5999") ? accs.every((a) => a === "5999" || a === "5300" || isPnl(a))
    : accs.includes("5300") && accs.some(isPnl) && accs.every((a) => a === "5300" || isPnl(a));
}

export function buildEntries(p: ParseResult, o: BuildOptions): BuildResult {
  const map = (c: string) => o.mapping[c] ?? "";
  const unmapped = new Set<string>();
  const warnings: string[] = [];
  const check = (c: string) => { const t = map(c); if (!t || !postable(t)) unmapped.add(c); return t; };

  if (p.kind === "osv") return buildOpening(p, o, check, warnings, unmapped);

  // group pairs of one 1С document into one entry
  const groups = new Map<string, RawPair[]>();
  p.pairs.forEach((x, i) => {
    const key = x.doc ? `${x.date}|${x.doc}` : `${x.date}|#${i}`;
    const g = groups.get(key) ?? [];
    g.push(x);
    groups.set(key, g);
  });
  const seen = new Map<string, number>();
  const entries: ImportEntry[] = [];
  let closing = 0;
  for (const g of groups.values()) {
    const lines: LedgerLine[] = [];
    for (const x of g) {
      const dr = check(x.dr), cr = check(x.cr);
      const dp = wantsParty(dr) ? partyOf(x.drSub) : "", cp = wantsParty(cr) ? partyOf(x.crSub) : "";
      const item = (acc: string, sub: string[], qty: number) => {
        if (!ITEM_ACCOUNT.test(acc)) return {};
        const name = partyOf(sub);
        return { ...(name ? { item: name } : {}), ...(qty > 0 ? { qty: Math.round(qty * 1000) / 1000 } : {}) };
      };
      lines.push({ account: dr, debit: x.amount, credit: 0, ...(dp ? { party: dp } : {}), ...item(dr, x.drSub, x.drQty) });
      lines.push({ account: cr, debit: 0, credit: x.amount, ...(cp ? { party: cp } : {}), ...item(cr, x.crSub, x.crQty) });
    }
    const key = `${g[0].date}|${g[0].doc}|${g.map((x) => `${x.dr}>${x.cr}:${x.amount.toFixed(2)}`).sort().join(",")}`;
    const nth = (seen.get(key) ?? 0) + 1;
    seen.set(key, nth);
    const close = isClosing(lines);
    if (close) closing++;
    const text = g.find((x) => x.text)?.text || g[0].doc || "Операция из 1С";
    entries.push({
      date: g[0].date,
      description: (g[0].doc && g[0].text && !g[0].text.includes(g[0].doc) ? `${text} (${g[0].doc})` : text).slice(0, 500),
      source: close ? "closing" : "import1c",
      sourceRef: `1c:${fnv(`${key}#${nth}`)}`,
      lines,
    });
  }
  return { entries, unmapped: [...unmapped], closing, warnings };
}

/** Строки ведомости без дублей: итог родительского счёта не берётся, если есть субсчета. */
export function osvRows(rows: OsvRow[]): OsvRow[] {
  const codes = new Set(rows.filter((r) => !r.sub).map((r) => r.account));
  const hasSub = new Set(rows.filter((r) => r.sub).map((r) => r.account));
  const childOf = (c: string) => [...codes].some((x) => x !== c && (x.startsWith(`${c}.`) || (/^\d{4}$/.test(c) && /^\d{4}/.test(x) && getAccount(c)?.header && x.slice(0, 2) === c.slice(0, 2) && !getAccount(x)?.header)));
  return rows.filter((r) => (r.sub ? true : !hasSub.has(r.account) && !childOf(r.account)));
}

function nextDay(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

function buildOpening(p: ParseResult, o: BuildOptions, check: (c: string) => string, warnings: string[], unmapped: Set<string>): BuildResult {
  const side = o.osvSide ?? "open";
  const date = o.osvDate || (p.period ? (side === "open" ? p.period.from : nextDay(p.period.to)) : "");
  if (!date) warnings.push("Не удалось определить дату остатков из заголовка ведомости — укажите её.");
  const lines: LedgerLine[] = [];
  let pnl = 0;
  for (const r of osvRows(p.osv)) {
    const t = check(r.account);
    const net = r2(side === "open" ? r.openDr - r.openCr : r.closeDr - r.closeCr);
    if (Math.abs(net) < 0.005 || !t) continue;
    if (isPnl(t)) { pnl = r2(pnl + net); continue; }
    const party = r.sub && wantsParty(t) ? r.sub.slice(0, 200) : "";
    lines.push({ account: t, debit: net > 0 ? net : 0, credit: net < 0 ? -net : 0, ...(party ? { party } : {}) });
  }
  // доходы и расходы с начала года — это прибыль текущего года: в нераспределённую прибыль
  if (Math.abs(pnl) >= 0.005) {
    lines.push({ account: "5300", debit: pnl > 0 ? pnl : 0, credit: pnl < 0 ? -pnl : 0, memo: "Доходы и расходы с начала года по ведомости 1С" });
    warnings.push(`Остатки доходов и расходов (${pnl > 0 ? "убыток" : "прибыль"} ${Math.abs(pnl).toLocaleString("ru-RU")}) свёрнуты на 5300 «Нераспределённая прибыль».`);
  }
  const dr = r2(lines.reduce((s, l) => s + l.debit, 0)), cr = r2(lines.reduce((s, l) => s + l.credit, 0));
  if (Math.abs(dr - cr) >= 0.01 && !unmapped.size) warnings.push(`Дебет остатков (${dr.toLocaleString("ru-RU")}) не равен кредиту (${cr.toLocaleString("ru-RU")}). Проверьте, что ведомость полная — без отборов по счетам.`);
  const entries: ImportEntry[] = lines.length && date ? [{
    date, description: `Начальные остатки на ${date.split("-").reverse().join(".")} (ведомость 1С)`, source: "opening",
    sourceRef: `1c-osv:${date}`, lines,
  }] : [];
  return { entries, unmapped: [...unmapped], closing: 0, warnings };
}

// ── выгрузка: проводка с несколькими строками раскладывается на пары Дт–Кт
export interface Pair { date: string; doc: string; text: string; dr: string; drParty: string; cr: string; crParty: string; amount: number; source: EntrySource }

export function toPairs(entries: LedgerEntry[]): Pair[] {
  const out: Pair[] = [];
  for (const e of entries) {
    const drs = e.lines.filter((l) => l.debit > 0).map((l) => ({ l, left: l.debit }));
    const crs = e.lines.filter((l) => l.credit > 0).map((l) => ({ l, left: l.credit }));
    let i = 0, j = 0;
    while (i < drs.length && j < crs.length) {
      const amt = r2(Math.min(drs[i].left, crs[j].left));
      if (amt > 0) out.push({ date: e.date, doc: "", text: e.description, dr: drs[i].l.account, drParty: drs[i].l.party ?? "", cr: crs[j].l.account, crParty: crs[j].l.party ?? "", amount: amt, source: e.source });
      drs[i].left = r2(drs[i].left - amt); crs[j].left = r2(crs[j].left - amt);
      if (drs[i].left <= 0.004) i++;
      if (crs[j].left <= 0.004) j++;
    }
  }
  return out;
}

export const ACCOUNT_NAME = (code: string) => ACCOUNTS.find((a) => a.code === code)?.name ?? "";
