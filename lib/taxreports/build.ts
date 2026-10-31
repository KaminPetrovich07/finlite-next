// ════════════════════════════════════════════════════════════════════════
// lib/taxreports/build.ts — суммы для налоговых отчётов ГНС из журнала.
//
// Отчёты сдаются в электронном виде через «Кабинет налогоплательщика»
// (cabinet.salyk.kg). FinLite не подаёт их, а готовит цифры для каждой
// строки, срок и сверку с начислениями в журнале:
//   STI-091 единый налог        — квартал (малый, средний бизнес), месяц (крупный); до 20-го
//   STI-161 подоходный + взносы — месяц; до 20-го
//   STI-129 налог с продаж      — квартал (малый), месяц (средний, крупный); до 20-го
//   STI-062 НДС                 — месяц; до 25-го
//   STI-101 ЕНД организации     — год; до 1 апреля
// Коды ячеек указаны там, где они сверены с действующим порядком заполнения
// (STI-062_7, STI-129_8). Для STI-091 строки названы по разделам формы.
// ════════════════════════════════════════════════════════════════════════
import { buildStatements } from "@/lib/ledger/engine";
import { REGIME_INFO, VAT_RATE, INCOME_TAX, type RegimeKey } from "@/lib/tax-engine";
import type { LedgerEntry, Period } from "@/lib/ledger/types";
import { taxSourceRef } from "@/lib/ledger/taxes";

export type Size = "small" | "medium" | "large";
export const SIZE_LABEL: Record<Size, string> = { small: "Малый бизнес", medium: "Средний бизнес", large: "Крупный бизнес" };

export interface RLine { code?: string; label: string; base?: number; rate?: number | null; amount?: number; total?: boolean; sub?: boolean }

export interface TaxReport {
  form: string;
  title: string;
  period: Period;
  periodLabel: string;
  frequency: "месяц" | "квартал" | "год";
  deadline: string;
  status: "overdue" | "due" | "later" | "done";
  daysLeft: number;
  lines: RLine[];
  /** помесячная расшифровка (приложение для среднего бизнеса по STI-091) */
  months?: Array<{ label: string; lines: RLine[] }>;
  /** начислено в журнале за этот период */
  posted: number | null;
  /** сумма по расчёту */
  computed: number;
  notes: string[];
  source: string;
}

export interface BudgetRow { account: string; name: string; opening: number; accrued: number; paid: number; closing: number }

export interface TaxReportsResult { regime: RegimeKey; regimeName: string; reports: TaxReport[]; budget: BudgetRow[]; notes: string[] }

const r2 = (n: number) => Math.round(n * 100) / 100;
const pad = (n: number) => String(n).padStart(2, "0");
const lastDay = (y: number, m: number) => new Date(Date.UTC(y, m, 0)).getUTCDate();
const MONTH = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];

export function monthOf(iso: string): Period { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); return { from: `${y}-${pad(m)}-01`, to: `${y}-${pad(m)}-${lastDay(y, m)}` }; }
export function quarterOf(iso: string): Period { const y = +iso.slice(0, 4), q = Math.floor((+iso.slice(5, 7) - 1) / 3); return { from: `${y}-${pad(q * 3 + 1)}-01`, to: `${y}-${pad(q * 3 + 3)}-${lastDay(y, q * 3 + 3)}` }; }
function nextMonthDay(iso: string, day: number): string { const y = +iso.slice(0, 4), m = +iso.slice(5, 7); const ny = m === 12 ? y + 1 : y, nm = m === 12 ? 1 : m + 1; return `${ny}-${pad(nm)}-${pad(Math.min(day, lastDay(ny, nm)))}`; }
const label = (p: Period, f: TaxReport["frequency"]) => {
  const y = p.from.slice(0, 4), m = +p.from.slice(5, 7);
  return f === "месяц" ? `${MONTH[m - 1]} ${y}` : f === "квартал" ? `${Math.floor((m - 1) / 3) + 1} квартал ${y}` : `${y} год`;
};

/** Reporting periods of a given length that overlap the selection. */
function periods(sel: Period, f: "месяц" | "квартал"): Period[] {
  const out: Period[] = [];
  let cur = f === "месяц" ? monthOf(sel.from) : quarterOf(sel.from);
  while (cur.from <= sel.to) {
    out.push(cur);
    cur = f === "месяц" ? monthOf(nextMonthDay(cur.to, 1)) : quarterOf(nextMonthDay(cur.to, 1));
  }
  return out;
}

function status(deadline: string, today: string, done: boolean): Pick<TaxReport, "status" | "daysLeft"> {
  const daysLeft = Math.round((Date.parse(deadline) - Date.parse(today)) / 86_400_000);
  return { daysLeft, status: done ? "done" : daysLeft < 0 ? "overdue" : daysLeft <= 10 ? "due" : "later" };
}

const sumLines = (entries: LedgerEntry[], p: Period, pred: (acc: string, e: LedgerEntry, side: "dr" | "cr") => boolean, side: "dr" | "cr") =>
  r2(entries.filter((e) => e.source !== "opening" && e.date >= p.from && e.date <= p.to).flatMap((e) => e.lines.map((l) => ({ l, e })))
    .filter(({ l, e }) => pred(l.account, e, side) && (side === "dr" ? l.debit > 0 : l.credit > 0)).reduce((a, { l }) => a + (side === "dr" ? l.debit : l.credit), 0));

const UNIFIED_SECTION: Partial<Record<RegimeKey, string>> = {
  unified_trade_s: "Торговая деятельность (выручка за последние 12 месяцев — до 50 млн сом)",
  unified_trade_l: "Торговая деятельность (прочие субъекты)",
  unified_production: "Переработка, производство, туроператорская деятельность, разработка программного обеспечения",
  unified_services: "Прочие виды деятельности",
  unified_catering_b: "Общественное питание",
  unified_catering_o: "Общественное питание",
  unified_textile: "Швейное и/или текстильное производство",
  unified_foreign: "Деятельность за пределами Кыргызской Республики",
  unified_ip_zero: "Индивидуальный предприниматель с выручкой до 15 млн сом",
};

export interface Options { regime: RegimeKey; size: Size; today: string; patentMonthly?: number; vatPayer?: boolean; /** «форма|начало периода» → дата сдачи */ filed?: Record<string, string> }

export const filedKey = (form: string, from: string) => `${form}|${from}`;

export function taxReports(entries: LedgerEntry[], sel: Period, o: Options): TaxReportsResult {
  const info = REGIME_INFO[o.regime];
  const reports: TaxReport[] = [];
  const st = (p: Period) => buildStatements(entries, p, { regime: o.regime, patentMonthly: o.patentMonthly });
  const notes: string[] = [];

  // ── единый налог
  if (info.kind === "unified") {
    const f: "месяц" | "квартал" = o.size === "large" ? "месяц" : "квартал";
    for (const p of periods(sel, f)) {
      const s = st(p);
      const acc = s.taxes.computed!;
      const section = UNIFIED_SECTION[o.regime] ?? "Единый налог";
      const lines: RLine[] = [{ label: section, sub: true }];
      for (const l of acc.lines) lines.push({ label: l.label.replace(/ — ст\..*$/, "").replace(/^Единый налог,?\s*/, "").replace(/\s[\d,]+%$/, "").replace(/^\S/, (c) => c.toUpperCase()) || "Выручка", base: l.base, rate: l.rate, amount: l.amount });
      lines.push({ label: "Итого единый налог за период", amount: acc.total, total: true });
      const months = o.size === "medium" && f === "квартал" ? periods(p, "месяц").map((m) => {
        const c = st(m).taxes.computed!;
        return { label: label(m, "месяц"), lines: [...c.lines.map((l) => ({ label: l.label.replace(/ — ст\..*$/, "").replace(/^Единый налог,?\s*/, "").replace(/\s[\d,]+%$/, "").replace(/^\S/, (ch) => ch.toUpperCase()) || "Выручка", base: l.base, rate: l.rate, amount: l.amount })), { label: "Итого за месяц", amount: c.total, total: true }] };
      }) : undefined;
      const deadline = nextMonthDay(p.to, 20);
      reports.push({
        form: "STI-091", title: "Отчёт по единому налогу", period: p, periodLabel: label(p, f), frequency: f, deadline,
        ...status(deadline, o.today, false), lines, months, posted: s.taxes.posted, computed: acc.total, source: info.article,
        notes: [
          "Выручка разделена на наличную и безналичную по счёту поступления: касса — наличные, банк — безналичные.",
          ...(o.size === "medium" ? ["Средний бизнес заполняет приложение STI-091-001 по месяцам квартала — см. помесячную расшифровку."] : []),
          ...(o.regime === "unified_textile" && p.to >= "2026-08-01" && p.from <= "2026-12-31" ? ["Швейное и текстильное производство с 1 августа по 31 декабря 2026 г. — ставка 0%; Жогорку Кенеш 28.10.2026 одобрил освобождение и от представления отчёта. Проверьте, вступила ли норма в силу."] : []),
        ],
      });
    }
  }

  // ── налог с продаж и НДС (общий режим)
  if (info.kind === "general") {
    const f: "месяц" | "квартал" = o.size === "small" ? "квартал" : "месяц";
    const rate = info.salesTax ?? 0;
    for (const p of periods(sel, f)) {
      const s = st(p);
      const base = r2(s.incomeStatement.revenueTotal);
      const line = s.taxes.computed?.lines.find((l) => /Налог с продаж/.test(l.label));
      const b = line?.base ?? base, tax = line?.amount ?? r2(b * rate);
      const deadline = nextMonthDay(p.to, 20);
      reports.push({
        form: "STI-129", title: "Отчёт по налогу с продаж", period: p, periodLabel: label(p, f), frequency: f, deadline, ...status(deadline, o.today, false),
        lines: [
          { label: "Раздел 9.1 — выручка от поставок", sub: true },
          { label: "Выручка", base: b, rate, amount: tax },
          { code: "124", label: "Налоговая база по разделу 9.1", amount: b },
          { code: "125", label: "Сумма налога по разделу 9.1", amount: tax },
          { code: "130", label: "Итого налоговая база (124 + 126 − 128)", amount: b, total: true },
          { code: "131", label: "Итого сумма налога (125 + 127 − 129)", amount: tax, total: true },
        ],
        posted: r2(sumLines(entries, p, (a, e) => a === "3490" && e.source === "tax", "cr")), computed: tax, source: "ст. 368 НК КР; порядок заполнения FORM STI-129_8",
        notes: ["Разделы 9.2 и 9.3 (авансы за новое жильё и нежилые помещения) заполняются только застройщиками — у остальных с 2026 г. авансы налогом не облагаются."],
      });
    }
    if (o.vatPayer !== false) {
      for (const p of periods(sel, "месяц")) {
        const s = st(p);
        const out = r2(s.taxes.vatOutput), inp = r2(s.taxes.vatInput);
        const liability = r2(out - inp);
        const deadline = nextMonthDay(p.to, 25);
        reports.push({
          form: "STI-062", title: "Отчёт по налогу на добавленную стоимость", period: p, periodLabel: label(p, "месяц"), frequency: "месяц", deadline, ...status(deadline, o.today, false),
          lines: [
            { code: "050", label: "Облагаемые поставки в КР", amount: r2(out / VAT_RATE) },
            { code: "054", label: "Всего поставок (050 + 051 + 053)", amount: r2(out / VAT_RATE) },
            { code: "055", label: "Приобретённые материальные ресурсы", amount: r2(inp / VAT_RATE) },
            { code: "058", label: "Всего приобретений и импорта (055 + 056)", amount: r2(inp / VAT_RATE) },
            { code: "059", label: "НДС по облагаемым поставкам (050 × 12%)", rate: VAT_RATE, amount: out },
            { code: "060", label: "НДС по приобретениям, относимый в зачёт", amount: inp },
            { code: "064", label: "Всего НДС, относимый в зачёт (060 + 061)", amount: inp },
            { code: "066", label: liability < 0 ? "Налоговое обязательство по НДС (059 − 064), со знаком минус" : "Налоговое обязательство по НДС (059 − 064)", amount: liability, total: true },
            { code: "068", label: "Всего налоговое обязательство по НДС", amount: liability, total: true },
          ],
          posted: null, computed: liability, source: "ст. 254 НК КР; порядок заполнения FORM STI-062_7",
          notes: [
            "Строки 051–053 (нулевые, ЕАЭС, освобождённые поставки) и 056–057, 061–062 (импорт) заполняются, если такие операции были — в журнале они отдельно не выделены.",
            "Приложения 01 и 02 (реестры поставок и приобретений) строятся по ЭСФ в Кабинете; для сверки используйте журнал продаж и покупок в разделе «Первичные документы».",
          ],
        });
      }
    }
    // ЕНД организации — год
    const y = +sel.to.slice(0, 4);
    const yp = { from: `${y}-01-01`, to: sel.to < `${y}-12-31` ? sel.to : `${y}-12-31` };
    const s = st(yp);
    const ebt = r2(s.incomeStatement.ebt);
    const profitTax = s.taxes.computed?.lines.find((l) => /прибыль/.test(l.label));
    const deadline = `${y + 1}-04-01`;
    reports.push({
      form: "STI-101", title: "Единая налоговая декларация организации (налог на прибыль)", period: { from: `${y}-01-01`, to: `${y}-12-31` }, periodLabel: `${y} год`, frequency: "год", deadline, ...status(deadline, o.today, false),
      lines: [
        { label: `Совокупный годовой доход${yp.to < `${y}-12-31` ? ` (с начала года по ${yp.to.split("-").reverse().join(".")})` : ""}`, amount: r2(s.incomeStatement.revenueTotal) },
        { label: "Прибыль до налогообложения по журналу", amount: ebt },
        { label: "Налоговая база (с учётом налога с продаж в вычетах)", amount: profitTax?.base ?? Math.max(0, ebt) },
        { label: "Налог на прибыль", rate: INCOME_TAX, amount: profitTax?.amount ?? r2(Math.max(0, ebt) * INCOME_TAX), total: true },
      ],
      posted: null, computed: profitTax?.amount ?? 0, source: "ст. 240 НК КР",
      notes: ["Годовая декларация: цифры нарастающим итогом. Налоговая база может отличаться от бухгалтерской прибыли на невычитаемые расходы (штрафы, представительские сверх нормы) — их FinLite не выделяет.", "Предварительные платежи по налогу на прибыль (STI-107) — до 20 мая, 20 августа и 20 ноября."],
    });
  }

  // ── подоходный налог и страховые взносы
  const wagesAcc = /^(7120|7520|8010)$/;
  const socEmployer = /^(7130|7530|8020)$/;
  for (const p of periods(sel, "месяц")) {
    const fot = sumLines(entries, p, (a, e) => a === "3520" && e.lines.some((x) => wagesAcc.test(x.account) && x.debit > 0), "cr");
    if (fot <= 0 && !entries.some((e) => e.lines.some((l) => l.account === "3520"))) continue;
    const pit = sumLines(entries, p, (a) => a === "3420", "cr");
    const empSoc = sumLines(entries, p, (a, e) => a === "3530" && e.lines.some((x) => x.account === "3520" && x.debit > 0), "cr");
    const erSoc = sumLines(entries, p, (a, e) => a === "3530" && e.lines.some((x) => socEmployer.test(x.account) && x.debit > 0), "cr");
    const deadline = nextMonthDay(p.to, 20);
    reports.push({
      form: "STI-161", title: "Отчёт по подоходному налогу и страховым взносам", period: p, periodLabel: label(p, "месяц"), frequency: "месяц", deadline, ...status(deadline, o.today, false),
      lines: [
        { label: "Начисленная заработная плата (фонд оплаты труда)", amount: fot },
        { label: "Страховые взносы работника", rate: fot ? Math.round((empSoc / fot) * 10000) / 10000 : null, amount: empSoc },
        { label: "Страховые взносы работодателя", rate: fot ? Math.round((erSoc / fot) * 10000) / 10000 : null, amount: erSoc },
        { label: "Всего страховых взносов", amount: r2(empSoc + erSoc), total: true },
        { label: "Подоходный налог, удержанный у работников", rate: fot - empSoc > 0 ? Math.round((pit / (fot - empSoc)) * 10000) / 10000 : null, amount: pit, total: true },
      ],
      posted: null, computed: r2(pit + empSoc + erSoc), source: "ст. 194–197 НК КР; тариф страховых взносов (ячейка 119)",
      notes: ["В Кабинете отчёт заполняется по каждому сотруднику (Ф.И.О., ПИН, начисления, тариф). FinLite даёт итоги по журналу для сверки с суммой по сотрудникам.", "Срок уплаты подоходного налога и взносов — до 20-го числа следующего месяца."],
    });
  }
  if (info.kind === "patent") notes.push("Патент: отчёт по единому налогу не сдаётся; патент оплачивается авансом за период его действия.");
  notes.push("Ставки — по Налоговому кодексу КР в редакции, заложенной в FinLite (с учётом изменений 2026 г.: сауны и бани 5%, лотереи и бильярд 8%, застройщики 4%, резиденты ПКИ 0%). Перед сдачей сверьте ставку для своего вида деятельности в Кабинете.");

  for (const r of reports) if (o.filed?.[filedKey(r.form, r.period.from)]) r.status = "done";
  reports.sort((a, b) => a.deadline.localeCompare(b.deadline) || a.form.localeCompare(b.form));
  return { regime: o.regime, regimeName: info.name, reports, budget: budget(entries, sel), notes };
}

const BUDGET: Array<[string, string, 1 | -1]> = [
  ["3410", "Налог на прибыль / единый налог", -1], ["3420", "Подоходный налог", -1], ["3430", "НДС", -1], ["3440", "Акцизы", -1],
  ["3490", "Прочие налоги (налог с продаж и др.)", -1], ["3530", "Страховые взносы (Соцфонд)", -1], ["1530", "Налоги, оплаченные авансом", 1], ["1540", "НДС к возмещению", 1],
];

/** Расчёты с бюджетом: остаток, начислено, уплачено, долг на конец. Знак «+» — долг перед бюджетом. */
export function budget(entries: LedgerEntry[], p: Period): BudgetRow[] {
  return BUDGET.map(([account, name, sign]) => {
    let opening = 0, accrued = 0, paid = 0;
    for (const e of entries) {
      const before = e.source === "opening" ? e.date <= p.from : e.date < p.from;
      const inP = e.source !== "opening" && e.date >= p.from && e.date <= p.to;
      if (!before && !inP) continue;
      for (const l of e.lines) {
        if (l.account !== account) continue;
        const v = sign === -1 ? l.credit - l.debit : l.debit - l.credit;
        if (before) opening += v;
        else if ((sign === -1 ? l.credit : l.debit) > 0) accrued += sign === -1 ? l.credit : l.debit;
        else paid += sign === -1 ? l.debit : l.credit;
      }
    }
    return { account, name, opening: r2(opening), accrued: r2(accrued), paid: r2(paid), closing: r2(opening + accrued - paid) };
  }).filter((b) => b.opening || b.accrued || b.paid);
}

export { taxSourceRef };
