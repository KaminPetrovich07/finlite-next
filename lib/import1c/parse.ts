// ════════════════════════════════════════════════════════════════════════
// lib/import1c/parse.ts — разбор отчётов 1С, сохранённых в Excel/CSV.
//
// Понимает три отчёта:
//   • «Журнал проводок» / «Отчёт по проводкам» — строка = Дт, Кт, сумма;
//   • «Карточка счёта» — та же пара счетов в каждой строке;
//   • «Оборотно-сальдовая ведомость» (в т.ч. по счёту с субконто) —
//     для начальных остатков, при детализации — по контрагентам.
// Шапки у 1С многострочные («Дебет» над «Счёт | Сумма»), над ними —
// заголовок отчёта с периодом. Таблица ищется по ключевым словам, а не
// по номерам колонок, поэтому разные версии 1С разбираются одинаково.
// Чистые функции: на входе — строки листа (массив массивов).
// ════════════════════════════════════════════════════════════════════════

export type Cell = string | number | boolean | Date | null | undefined;
export type Kind = "journal" | "osv";

export interface RawPair {
  /** номер строки в файле — для сообщений */
  row: number;
  date: string;
  doc: string;
  text: string;
  dr: string;
  cr: string;
  amount: number;
  drSub: string[];
  crSub: string[];
}

export interface OsvRow {
  row: number;
  account: string;
  name: string;
  /** субконто (контрагент и т. п.) — если ведомость детализирована */
  sub: string;
  openDr: number; openCr: number;
  turnDr: number; turnCr: number;
  closeDr: number; closeCr: number;
}

export interface ParseResult {
  kind: Kind;
  title: string;
  period: { from: string; to: string } | null;
  pairs: RawPair[];
  osv: OsvRow[];
  warnings: string[];
  columns: Record<string, string>;
}

const s = (v: Cell): string => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/ /g, " ").trim();
const low = (v: Cell) => s(v).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");

export function num(v: Cell): number {
  if (typeof v === "number") return Number.isFinite(v) ? v : 0;
  const t = s(v).replace(/\s/g, "").replace(/[^\d,.\-()]/g, "");
  if (!t) return 0;
  const neg = /^\(.*\)$/.test(t) || t.startsWith("-");
  const n = Number(t.replace(/[()\-]/g, "").replace(/,(?=\d{1,2}$)/, ".").replace(/,/g, ""));
  return Number.isFinite(n) ? (neg ? -n : n) : 0;
}

const pad = (n: number) => String(n).padStart(2, "0");

export function isoDate(v: Cell): string {
  if (v instanceof Date && !isNaN(v.getTime())) return `${v.getFullYear()}-${pad(v.getMonth() + 1)}-${pad(v.getDate())}`;
  if (typeof v === "number" && v > 20000 && v < 80000) {
    const d = new Date(Date.UTC(1899, 11, 30) + Math.floor(v) * 86_400_000);
    return d.toISOString().slice(0, 10);
  }
  const t = s(v);
  let m = t.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{2,4})/);
  if (m) {
    const y = m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    const d = `${y}-${pad(Number(m[2]))}-${pad(Number(m[1]))}`;
    return isNaN(Date.parse(d)) ? "" : d;
  }
  m = t.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : "";
}

const MONTHS = ["январ", "феврал", "март", "апрел", "ма", "июн", "июл", "август", "сентябр", "октябр", "ноябр", "декабр"];
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();

/** «за 3 квартал 2026 г.», «01.07.2026 - 30.09.2026», «Сентябрь 2026 г.», «2026 г.» */
export function periodFromTitle(text: string): { from: string; to: string } | null {
  const t = text.toLowerCase();
  const range = t.match(/(\d{1,2}\.\d{1,2}\.\d{2,4})\s*(?:-|–|—|по)\s*(\d{1,2}\.\d{1,2}\.\d{2,4})/);
  if (range) { const a = isoDate(range[1]), b = isoDate(range[2]); if (a && b) return { from: a, to: b }; }
  const q = t.match(/(\d)\s*(?:-?й)?\s*квартал\s*(\d{4})/);
  if (q) { const y = Number(q[2]), m0 = (Number(q[1]) - 1) * 3 + 1; return { from: `${y}-${pad(m0)}-01`, to: `${y}-${pad(m0 + 2)}-${lastDay(y, m0 + 2)}` }; }
  const h = t.match(/(\d)\s*(?:-?е)?\s*полугодие\s*(\d{4})/);
  if (h) { const y = Number(h[2]), m0 = h[1] === "1" ? 1 : 7; return { from: `${y}-${pad(m0)}-01`, to: `${y}-${pad(m0 + 5)}-${lastDay(y, m0 + 5)}` }; }
  for (let i = MONTHS.length - 1; i >= 0; i--) {
    const m = t.match(new RegExp(`(?:^|[^а-я])${MONTHS[i]}[а-я]*\\s+(\\d{4})`));
    if (m && !(i === 4 && !/(^|[^а-я])ма[йя]/.test(t))) { const y = Number(m[1]); return { from: `${y}-${pad(i + 1)}-01`, to: `${y}-${pad(i + 1)}-${lastDay(y, i + 1)}` }; }
  }
  const y = t.match(/за\s+(\d{4})\s*г/);
  if (y) return { from: `${y[1]}-01-01`, to: `${y[1]}-12-31` };
  return null;
}

/** Account code as 1С prints it: «1210», «1210.01», «62.01», «90.01.1», «01». */
export function accountCode(v: Cell): string {
  const t = s(v).replace(/\s/g, "");
  const m = t.match(/^(\d{2,4}(?:\.\d{1,3}){0,3})(?=$|[^\d.])/);
  return m ? m[1] : "";
}

interface Header { at: number; rows: number; names: string[] }

/** Finds the table header: the row (or two) with the most report keywords. */
function findHeader(rows: Cell[][]): Header | null {
  const KEY = /^(дата|период|документ|содержание|операция|дт|кт|дебет|кредит|сумма|сч[её]т|субконто|аналитика|сальдо|обороты|количество|кол-во|наименование)/;
  let best: { at: number; score: number } | null = null;
  for (let i = 0; i < Math.min(rows.length, 60); i++) {
    const score = rows[i].filter((c) => KEY.test(low(c))).length;
    if (score >= 2 && (!best || score > best.score)) best = { at: i, score };
  }
  if (!best) return null;
  // second header row: «Счёт | Сумма» or «Дебет | Кредит» under a merged cell
  const SUB = /^(сч[её]т|сумма|дебет|кредит|дт|кт|субконто|аналитика|количество|кол-во|валюта)$/;
  const prev = rows[best.at - 1] ?? [];
  if (best.at > 0 && rows[best.at].filter((c) => SUB.test(low(c))).length >= 2 && prev.filter((c) => KEY.test(low(c))).length >= 2) best = { at: best.at - 1, score: best.score };
  const top = rows[best.at];
  const next = rows[best.at + 1] ?? [];
  const width = Math.max(top.length, next.length);
  const nextIsSub = next.filter((c) => SUB.test(low(c))).length >= 2 && !next.some((c) => isoDate(c));
  const names: string[] = [];
  let carry = "";
  for (let j = 0; j < width; j++) {
    const a = low(top[j]);
    if (a) carry = a;
    const b = nextIsSub ? low(next[j]) : "";
    names.push(nextIsSub ? `${a || (b ? carry : "")} ${b}`.trim() : a);
  }
  return { at: best.at, rows: nextIsSub ? 2 : 1, names };
}

function col(names: string[], re: RegExp, not?: RegExp): number {
  return names.findIndex((n) => re.test(n) && !(not && not.test(n)));
}

export function parseRows(rows: Cell[][]): ParseResult {
  const warnings: string[] = [];
  const head = findHeader(rows);
  const titleText = rows.slice(0, head ? head.at : 10).map((r) => r.map(s).filter(Boolean).join(" ")).filter(Boolean).join(" · ");
  const period = periodFromTitle(titleText);
  const empty: ParseResult = { kind: "journal", title: titleText.slice(0, 200), period, pairs: [], osv: [], warnings, columns: {} };
  if (!head) { warnings.push("Не найдена шапка таблицы. Сохраните из 1С отчёт «Журнал проводок», «Карточка счёта» или «Оборотно-сальдовая ведомость» как лист Excel."); return empty; }
  const n = head.names;
  const body = rows.slice(head.at + head.rows);

  // ── оборотно-сальдовая ведомость
  if (n.some((x) => /сальдо/.test(x)) && n.some((x) => /оборот/.test(x))) {
    const idx = (re: RegExp, side: "дебет" | "кредит") => n.findIndex((x) => re.test(x) && (x.includes(side) || (side === "дебет" ? /\bдт\b/ : /\bкт\b/).test(x)));
    let c = {
      acc: col(n, /^сч[её]т|^код/), name: col(n, /наименование|^сч[её]т .*наимен/),
      oDr: idx(/сальдо на начало|начальное сальдо|сальдо начальное/, "дебет"), oCr: idx(/сальдо на начало|начальное сальдо|сальдо начальное/, "кредит"),
      tDr: idx(/оборот/, "дебет"), tCr: idx(/оборот/, "кредит"),
      cDr: idx(/сальдо на конец|конечное сальдо|сальдо конечное/, "дебет"), cCr: idx(/сальдо на конец|конечное сальдо|сальдо конечное/, "кредит"),
    };
    // «Сальдо на начало» над «Дебет | Кредит»: второй столбец группы подписан только «кредит»
    if (c.oCr < 0 && c.oDr >= 0 && /кредит/.test(n[c.oDr + 1] ?? "")) c = { ...c, oCr: c.oDr + 1 };
    if (c.acc < 0) c.acc = 0;
    const osv: OsvRow[] = [];
    let lastAcc = "";
    body.forEach((r, i) => {
      const first = s(r[c.acc]);
      if (/^итого/i.test(first) || /^итого/i.test(s(r[0]))) return;
      const code = accountCode(first);
      const amounts = [c.oDr, c.oCr, c.tDr, c.tCr, c.cDr, c.cCr].map((k) => (k >= 0 ? num(r[k]) : 0));
      if (!amounts.some((x) => Math.abs(x) > 0.004)) { if (code) lastAcc = code; return; }
      const rec = { row: head.at + head.rows + i + 1, openDr: amounts[0], openCr: amounts[1], turnDr: amounts[2], turnCr: amounts[3], closeDr: amounts[4], closeCr: amounts[5] };
      if (code) {
        lastAcc = code;
        const name = c.name >= 0 && c.name !== c.acc ? s(r[c.name]) : first.replace(code, "").trim();
        osv.push({ ...rec, account: code, name, sub: "" });
      } else if (lastAcc && first) {
        osv.push({ ...rec, account: lastAcc, name: "", sub: first });
      }
    });
    if (!osv.length) warnings.push("В ведомости не найдено ни одной строки со счётом и суммами.");
    return { ...empty, kind: "osv", osv, columns: Object.fromEntries(Object.entries(c).filter(([, v]) => v >= 0).map(([k, v]) => [k, n[v]])) };
  }

  // ── журнал проводок / карточка счёта
  const c = {
    date: col(n, /^(дата|период)/),
    doc: col(n, /документ/),
    text: col(n, /содержание|операция|комментарий|назначение/),
    dr: col(n, /(^|\s)(дт|дебет)( сч[её]т)?$|сч[её]т (дт|дебет)|^(дт|дебет) сч[её]т/, /сумма|субконто|аналитика|количество|кол-во|валют/),
    cr: col(n, /(^|\s)(кт|кредит)( сч[её]т)?$|сч[её]т (кт|кредит)|^(кт|кредит) сч[её]т/, /сумма|субконто|аналитика|количество|кол-во|валют/),
    amount: col(n, /^сумма( рег)?|^сумма$/, /дебет|кредит|дт|кт|вал/),
    drAmount: col(n, /(дебет|дт).*сумма|сумма.*(дебет|дт)/, /вал/),
    crAmount: col(n, /(кредит|кт).*сумма|сумма.*(кредит|кт)/, /вал/),
    drSub: col(n, /(субконто|аналитика).*(дт|дебет)|(дт|дебет).*(субконто|аналитика)/),
    crSub: col(n, /(субконто|аналитика).*(кт|кредит)|(кт|кредит).*(субконто|аналитика)/),
  };
  if (c.date < 0 || c.dr < 0 || c.cr < 0 || (c.amount < 0 && c.drAmount < 0 && c.crAmount < 0)) {
    warnings.push(`Не распознаны колонки: ${[c.date < 0 && "дата", c.dr < 0 && "счёт дебета", c.cr < 0 && "счёт кредита", c.amount < 0 && c.drAmount < 0 && "сумма"].filter(Boolean).join(", ")}. Подходят «Журнал проводок», «Отчёт по проводкам», «Карточка счёта», «Оборотно-сальдовая ведомость».`);
    return { ...empty, columns: Object.fromEntries(Object.entries(c).filter(([, v]) => v >= 0).map(([k, v]) => [k, n[v]])) };
  }
  const pairs: RawPair[] = [];
  let lastDate = "", lastDoc = "", skipped = 0;
  const subs = (v: Cell) => s(v).split(/\r?\n|;\s*/).map((x) => x.trim()).filter(Boolean);
  body.forEach((r, i) => {
    const row = head.at + head.rows + i + 1;
    if (/^(итого|обороты|сальдо)/i.test(s(r[0])) || /^(итого|обороты|сальдо)/i.test(s(r[c.date]))) return;
    const dr = accountCode(r[c.dr]), cr = accountCode(r[c.cr]);
    const amount = c.amount >= 0 ? num(r[c.amount]) : num(r[c.drAmount]) || num(r[c.crAmount]);
    const date = isoDate(r[c.date]) || (s(r[c.date]) ? "" : lastDate);
    if (!dr && !cr && !amount) return;
    if (!dr || !cr || !date || Math.abs(amount) < 0.005) { skipped++; return; }
    const doc = c.doc >= 0 ? s(r[c.doc]) || (s(r[c.date]) ? "" : lastDoc) : "";
    lastDate = date; lastDoc = doc;
    pairs.push({
      row, date, doc: doc.replace(/\s+/g, " ").slice(0, 200),
      text: c.text >= 0 ? s(r[c.text]).replace(/\s+/g, " ").slice(0, 400) : "",
      dr, cr, amount: Math.round(Math.abs(amount) * 100) / 100,
      drSub: c.drSub >= 0 ? subs(r[c.drSub]) : [],
      crSub: c.crSub >= 0 ? subs(r[c.crSub]) : [],
    });
  });
  if (skipped) warnings.push(`Пропущено строк без счёта, даты или суммы: ${skipped}.`);
  if (!pairs.length) warnings.push("Не найдено ни одной проводки.");
  return { ...empty, kind: "journal", pairs, columns: Object.fromEntries(Object.entries(c).filter(([, v]) => v >= 0).map(([k, v]) => [k, n[v]])) };
}
