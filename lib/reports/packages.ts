// ════════════════════════════════════════════════════════════════════════
// lib/reports/packages.ts — содержание пакетов отчётов.
// Всё берётся из CompanyPeriodData (журнал → Statements), без ручных цифр.
// ════════════════════════════════════════════════════════════════════════

import { BALANCE_ROWS } from "@/lib/balance-sheet";
import { CF_TABLE } from "@/lib/cash-flow";
import { EQUITY_COLUMNS, EQUITY_ROWS, equityKey } from "@/lib/equity";
import { accountName, getAccount } from "@/lib/ledger/accounts";
import { breakEven, costStructure, ratios, ratioStatus, type Ratio } from "@/lib/ledger/analytics";
import type { Statements } from "@/lib/ledger/engine";
import type { CompanyPeriodData } from "@/lib/ledger/load";
import { formatDate, periodLabel } from "@/lib/ledger/period";
import { computeTaxAccrual, monthsInPeriod } from "@/lib/ledger/taxes";
import { comparableRegimes, REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import { computeEsg, EMPTY_ESG, PILLAR_LABEL, type Pillar } from "@/lib/esg";
import { money, num, pct, PACKAGE_INFO, type Block, type PackageKey, type ReportDoc, type Section, type TableBlock } from "./model";

const MONTHS_NOM = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const monthName = (ym: string) => `${MONTHS_NOM[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;

function base(d: CompanyPeriodData, pkg: PackageKey, sections: Section[], disclaimer?: string): ReportDoc {
  const now = new Date();
  return {
    package: pkg,
    title: PACKAGE_INFO[pkg].title,
    company: d.company.name,
    regime: d.company.regimeName,
    period: periodLabel(d.period.from, d.period.to),
    generatedAt: `${String(now.getDate()).padStart(2, "0")}.${String(now.getMonth() + 1).padStart(2, "0")}.${now.getFullYear()}`,
    disclaimer,
    sections,
  };
}

const hasPrev = (d: CompanyPeriodData) => d.previous.entryCount > 0;
const change = (cur: number, prev: number) => (Math.abs(prev) > 0.005 ? ((cur - prev) / Math.abs(prev)) * 100 : null);

// ── Формы ──────────────────────────────────────────────────────────────────

function balanceTable(s: Statements): TableBlock {
  const rows: TableBlock["rows"] = [];
  for (const r of BALANCE_ROWS) {
    if (r.code === null) { rows.push({ cells: ["", r.label, null, null], style: "section" }); continue; }
    const o = s.balanceSheet.opening[r.code] ?? 0, c = s.balanceSheet.closing[r.code] ?? 0;
    if (!r.isTotal && Math.abs(o) < 0.005 && Math.abs(c) < 0.005) continue;
    rows.push({
      cells: [String(r.code), r.label.replace(/^\s*—\s*/, "").trim(), o, c],
      style: r.isTotal ? (r.code === 299 || r.code === 599 ? "total" : "subtotal") : r.isSub ? "sub" : "normal",
    });
  }
  return {
    type: "table",
    columns: [{ label: "Код", kind: "code", width: 8 }, { label: "Статья", width: 52 }, { label: "На начало", kind: "money", width: 20 }, { label: "На конец", kind: "money", width: 20 }],
    rows,
  };
}

function incomeTable(d: CompanyPeriodData): TableBlock {
  const cur = d.statements.incomeStatement, prev = d.previous.incomeStatement;
  const withPrev = hasPrev(d);
  const prevBy = new Map(prev.lines.map((l) => [l.key, l.amount]));
  const rows = cur.lines
    .filter((l) => !(l.kind === "sub" && Math.abs(l.amount) < 0.005 && Math.abs(prevBy.get(l.key) ?? 0) < 0.005))
    .map((l) => ({
      cells: withPrev ? [l.label, l.amount, prevBy.get(l.key) ?? 0] : [l.label, l.amount],
      style: (l.kind === "line" ? "normal" : l.kind) as TableBlock["rows"][number]["style"],
    }));
  return {
    type: "table",
    columns: withPrev
      ? [{ label: "Статья", width: 56 }, { label: periodLabel(d.period.from, d.period.to), kind: "money", width: 22 }, { label: periodLabel(d.previous.period.from, d.previous.period.to), kind: "money", width: 22 }]
      : [{ label: "Статья", width: 70 }, { label: "За период", kind: "money", width: 30 }],
    rows,
    note: "Расходы показаны со знаком минус (в скобках).",
  };
}

function cashFlowTable(s: Statements): TableBlock {
  const rows: TableBlock["rows"] = [];
  for (const r of CF_TABLE) {
    if (r.code === null) { rows.push({ cells: ["", r.label, null], style: "section" }); continue; }
    const v = s.cashFlow.values[r.code] ?? 0;
    if (!r.isTotal && Math.abs(v) < 0.005 && r.code !== 720) continue;
    rows.push({ cells: [String(r.code).padStart(3, "0"), r.label, v], style: r.code === 700 || r.code === 710 ? "total" : r.isTotal ? "subtotal" : "normal" });
  }
  return {
    type: "table",
    columns: [{ label: "Код", kind: "code", width: 8 }, { label: "Статья", width: 66 }, { label: "Сумма", kind: "money", width: 26 }],
    rows,
  };
}

function equityTable(s: Statements): TableBlock {
  return {
    type: "table",
    columns: [
      { label: "Стр.", kind: "code", width: 6 }, { label: "Показатель", width: 34 },
      ...EQUITY_COLUMNS.map((c) => ({ label: c, kind: "money" as const, width: 15 })),
    ],
    rows: EQUITY_ROWS.map((r) => ({
      cells: [String(r.code).padStart(3, "0"), r.label, ...EQUITY_COLUMNS.map((_, i) => s.equity.values[equityKey(r.code, i)] ?? 0)],
      style: r.code === 120 ? "total" : r.isTotal ? "subtotal" : "normal",
    })),
  };
}

function checksBlock(s: Statements): Block {
  return { type: "checks", items: s.checks.map((c) => ({ title: c.title, status: c.status, detail: c.left && c.right ? `${c.left.label} ${money(c.left.value)} · ${c.right.label} ${money(c.right.value)}` : c.detail })) };
}

function taxTable(s: Statements): TableBlock | null {
  const c = s.taxes.computed;
  if (!c) return null;
  return {
    type: "table", title: "Налоги за период",
    columns: [{ label: "Налог", width: 52 }, { label: "База", kind: "money", width: 18 }, { label: "Ставка", width: 10 }, { label: "Сумма", kind: "money", width: 20 }],
    rows: [
      ...c.lines.map((l) => ({ cells: [l.label, l.rate === null ? `${l.base} мес.` : l.base, l.rate === null ? "фикс." : pct(l.rate * 100, 2), l.amount] as TableBlock["rows"][number]["cells"] })),
      { cells: ["Итого по расчёту", null, null, c.total], style: "subtotal" as const },
      { cells: ["Начислено в журнале", null, null, s.taxes.posted], style: "normal" as const },
    ],
  };
}

// ── 1. Полный комплект ─────────────────────────────────────────────────────

export function buildFull(d: CompanyPeriodData): ReportDoc {
  const s = d.statements;
  const tax = taxTable(s);
  return base(d, "full", [
    { title: "Отчёт о финансовом положении (Ф.1)", sheet: "Ф1 Баланс", blocks: [balanceTable(s)] },
    { title: "Отчёт о прибылях и убытках (Ф.2)", sheet: "Ф2 ОПиУ", blocks: [incomeTable(d)] },
    { title: "Отчёт о движении денежных средств (Ф.3), прямой метод", sheet: "Ф3 ОДДС", blocks: [cashFlowTable(s)] },
    { title: "Отчёт об изменениях в капитале (Ф.4)", sheet: "Ф4 Капитал", blocks: [equityTable(s)] },
    {
      title: "Примечания", sheet: "Примечания", blocks: [
        { type: "h2", text: "1. Основа подготовки" },
        { type: "p", text: `Отчётность ${d.company.name} за ${periodLabel(d.period.from, d.period.to).toLowerCase()} сформирована в FinLite KG из журнала хозяйственных операций. Учёт ведётся по Плану счетов бухгалтерского учёта, утверждённому постановлением Правительства КР от 7 октября 2010 года № 231. Формы построены по структуре ФОСАМК для субъектов малого и среднего предпринимательства. Валюта отчётности — кыргызский сом.` },
        { type: "p", text: "Прибыль текущего периода, не закрытая проводками через счёт 5999, показана в строке 530 «Нераспределённая прибыль». Отчёт о движении денежных средств составлен прямым методом: каждая денежная проводка отнесена к строке по корреспондирующему счёту." },
        { type: "h2", text: "2. Налоги" },
        { type: "p", text: `Налоговый режим: ${d.company.regimeName}. Налог на прибыль, единый налог и патент учитываются на счёте 9910, налог с продаж — на счёте 8190. Ставки соответствуют Налоговому кодексу КР в редакции Закона от 6 августа 2026 года № 145.` },
        ...(tax ? [tax] : []),
        { type: "h2", text: "3. Сверки между формами" },
        checksBlock(s),
      ],
    },
  ]);
}

// ── 2. Для руководителя ────────────────────────────────────────────────────

function ratioRows(items: Ratio[]): TableBlock["rows"] {
  const word = { good: "в норме", watch: "обратить внимание", neutral: "для справки" } as const;
  return items.map((r) => ({
    cells: [r.label, r.value === null ? "—" : r.unit === "%" ? pct(r.value) : r.unit === "x" ? num(r.value) : `${num(r.value, 1)} ${r.unit}`, word[ratioStatus(r)], r.hint],
  }));
}

function regimeComparison(d: CompanyPeriodData): TableBlock {
  const s = d.statements, is = s.incomeStatement;
  const months = monthsInPeriod(d.period.from, d.period.to);
  const baseTax = { revenueTotal: is.revenueTotal, cashRevenue: s.taxes.cashRevenue, ebtBeforeTaxEntry: is.ebt + (s.taxes.computed && REGIME_INFO[s.taxes.computed.regime].kind === "general" ? s.taxes.computed.lines[0]?.amount ?? 0 : 0), months };
  const keys = comparableRegimes(d.company.regime).filter((k) => k !== "patent" || d.company.patentAmount > 0);
  const rows = keys
    .map((k) => ({ k, total: computeTaxAccrual(k, baseTax, d.company.patentAmount).total }))
    .sort((a, b) => a.total - b.total);
  const current = d.company.regime;
  return {
    type: "table", title: "Налоги за этот период при разных режимах",
    columns: [{ label: "Режим", width: 58 }, { label: "Налог", kind: "money", width: 18 }, { label: "Условия", width: 24 }],
    rows: rows.map(({ k, total }) => ({
      cells: [REGIME_INFO[k].name + (k === current ? " — текущий" : ""), total, REGIME_INFO[k].note ?? REGIME_INFO[k].article],
      style: k === current ? "subtotal" : "normal",
    })),
    note: "Только режимы для того же вида деятельности. Расчёт на фактических оборотах периода; НДС 12% общего режима не включён — его платит покупатель сверх цены, но он повышает цену для покупателей без права зачёта. Перед сменой режима проверьте условия ст. 419, 423 НК КР.",
  };
}

function highlights(d: CompanyPeriodData): string[] {
  const s = d.statements, is = s.incomeStatement, p = d.previous.incomeStatement;
  const out: string[] = [];
  const cash = (s.balanceSheet.closing[110] ?? 0) + (s.balanceSheet.closing[120] ?? 0);
  const cashOpen = s.cashFlow.values[720] ?? 0;
  if (hasPrev(d)) {
    const r = change(is.netRevenue, p.netRevenue);
    const np = change(is.netProfit, p.netProfit);
    if (r !== null) out.push(`Выручка ${r >= 0 ? "выросла" : "снизилась"} на ${pct(Math.abs(r))} к предыдущему периоду и составила ${money(is.netRevenue)} сом.`);
    if (np !== null) out.push(`Чистая прибыль ${np >= 0 ? "выросла" : "снизилась"} на ${pct(Math.abs(np))} — до ${money(is.netProfit)} сом.`);
  } else {
    out.push(`Чистая выручка за период — ${money(is.netRevenue)} сом, чистая прибыль — ${money(is.netProfit)} сом (${pct(is.margin)} от выручки).`);
  }
  out.push(`Денег на счетах и в кассе на конец периода: ${money(cash)} сом (${cash >= cashOpen ? "прирост" : "снижение"} на ${money(Math.abs(cash - cashOpen))} сом).`);
  const top = costStructure(s)[0];
  if (top) out.push(`Крупнейшая статья расходов — «${top.label.toLowerCase()}»: ${pct(top.share)} всех расходов.`);
  const bad = s.checks.filter((c) => c.status !== "ok");
  out.push(bad.length ? `Требуют внимания сверки: ${bad.map((c) => c.title.toLowerCase()).join("; ")}.` : "Все сверки между формами отчётности сходятся.");
  return out;
}

function risks(d: CompanyPeriodData): TableBlock["rows"] {
  const s = d.statements, is = s.incomeStatement;
  const r = Object.fromEntries(ratios(s).map((x) => [x.key, x.value]));
  const rows: TableBlock["rows"] = [];
  const add = (level: string, title: string, action: string) => rows.push({ cells: [level, title, action] });
  if (is.netProfit < 0) add("Высокий", `Убыток за период: ${money(is.netProfit)} сом`, "Пересмотреть цены и постоянные расходы; проверить допущение о непрерывности деятельности (МСФО (IAS) 1.25).");
  else if (is.margin < 5) add("Средний", `Низкая рентабельность продаж: ${pct(is.margin)}`, "Проверить наценку и структуру себестоимости по элементам затрат.");
  if (r.current !== null && r.current !== undefined && r.current < 1) add("Высокий", `Текущая ликвидность ${num(r.current)} — оборотных активов меньше краткосрочных долгов`, "Согласовать график платежей, ускорить сбор дебиторской задолженности.");
  else if (r.current !== null && r.current !== undefined && r.current < 1.5) add("Средний", `Текущая ликвидность ${num(r.current)} ниже ориентира 1,5`, "Держать резерв денег на 1–2 месяца постоянных расходов.");
  if (r.dso !== null && r.dso !== undefined && r.dso > 60) add("Средний", `Дебиторская задолженность оборачивается за ${num(r.dso, 0)} дн.`, "Ввести предоплату или скидку за раннюю оплату для крупных покупателей.");
  if (r.de !== null && r.de !== undefined && r.de > 1) add("Средний", `Долг превышает собственный капитал (${num(r.de)})`, "Не наращивать заём без роста прибыли; рассмотреть реструктуризацию.");
  if (s.checks.some((c) => c.id === "suspense")) add("Средний", "На субсчетах невыясненных сумм есть остаток", "Уточнить категорию операций в банковской выписке.");
  if (s.checks.some((c) => c.id === "tax" && c.status !== "ok")) add("Высокий", "Налоги за период не начислены или расходятся с расчётом", "Начислить налоги на вкладке «Налоги» до сдачи отчётности.");
  const comp = regimeComparison(d).rows;
  const best = comp[0];
  const currentRow = comp.find((x) => x.style === "subtotal");
  if (best && currentRow && best !== currentRow && typeof best.cells[1] === "number" && typeof currentRow.cells[1] === "number" && currentRow.cells[1] - best.cells[1] > 1) {
    add("Возможность", `Режим «${String(best.cells[0])}» дешевле на ${money(currentRow.cells[1] - best.cells[1])} сом за период`, "Оценить с бухгалтером: при общем режиме добавляется НДС 12% и учёт сложнее. Переход на единый налог — с начала квартала, с единого на общий — с 1 января (ст. 420 НК КР).");
  }
  if (!rows.length) add("Низкий", "Существенных рисков по данным учёта не выявлено", "Поддерживать текущую модель, ежемесячно проверять сверки.");
  return rows;
}

export function buildExecutive(d: CompanyPeriodData): ReportDoc {
  const s = d.statements, is = s.incomeStatement, p = d.previous.incomeStatement;
  const cash = (s.balanceSheet.closing[110] ?? 0) + (s.balanceSheet.closing[120] ?? 0);
  const delta = (cur: number, prev: number) => (hasPrev(d) && change(cur, prev) !== null ? `${change(cur, prev)! >= 0 ? "+" : "−"}${pct(Math.abs(change(cur, prev)!))} к прошлому периоду` : undefined);
  const costs = costStructure(s);
  return base(d, "executive", [
    {
      title: "Главное за период", sheet: "Главное", blocks: [
        { type: "kpis", items: [
          { label: "Чистая выручка", value: `${money(is.netRevenue)} сом`, note: delta(is.netRevenue, p.netRevenue) },
          { label: "Чистая прибыль", value: `${money(is.netProfit)} сом`, note: delta(is.netProfit, p.netProfit) ?? `${pct(is.margin)} от выручки` },
          { label: "Деньги на конец периода", value: `${money(cash)} сом`, note: "касса и банк" },
          { label: "Налоги начислены", value: `${money(s.taxes.posted)} сом`, note: d.company.regime ? REGIME_INFO[d.company.regime].short : undefined },
        ] },
        { type: "h2", text: "Выводы" },
        ...highlights(d).map((t) => ({ type: "p" as const, text: `• ${t}` })),
        { type: "h2", text: "Риски и рекомендации" },
        { type: "table", columns: [{ label: "Приоритет", width: 14 }, { label: "Что видим", width: 40 }, { label: "Что сделать", width: 46 }], rows: risks(d) },
      ],
    },
    {
      title: "Динамика и структура", sheet: "Динамика", blocks: [
        { type: "table", title: "По месяцам", columns: [{ label: "Месяц", width: 22 }, { label: "Доходы", kind: "money", width: 20 }, { label: "Расходы", kind: "money", width: 20 }, { label: "Прибыль", kind: "money", width: 18 }, { label: "Деньги на конец", kind: "money", width: 20 }],
          rows: s.monthly.map((m) => ({ cells: [monthName(m.month), m.revenue, m.expenses, m.netProfit, m.cashEnd] })) },
        { type: "bars", title: "Структура расходов", items: costs.slice(0, 8).map((c) => ({ label: c.label, value: c.amount, display: `${money(c.amount)} · ${pct(c.share)}` })) },
        { type: "h2", text: "Коэффициенты" },
        { type: "table", columns: [{ label: "Показатель", width: 30 }, { label: "Значение", width: 14 }, { label: "Оценка", width: 16 }, { label: "Как считается", width: 40 }], rows: ratioRows(ratios(s)) },
      ],
    },
    { title: "Налоговые режимы", sheet: "Режимы", blocks: [regimeComparison(d)] },
  ]);
}

// ── 3. Пакет для аудитора ──────────────────────────────────────────────────

const WEEKDAYS = ["вс", "пн", "вт", "ср", "чт", "пт", "сб"];

function materiality(s: Statements) {
  const is = s.incomeStatement;
  const assets = s.balanceSheet.closing[299] ?? 0;
  const items = [
    { label: "1% выручки", base: is.netRevenue, rate: 0.01 },
    { label: "5% прибыли до налогообложения", base: Math.max(0, is.ebt), rate: 0.05 },
    { label: "2% активов", base: assets, rate: 0.02 },
  ].map((x) => ({ ...x, value: Math.round(x.base * x.rate) }));
  const chosen = is.ebt > 0 && is.ebt / Math.max(1, is.netRevenue) > 0.03 ? items[1] : items[0];
  return { items, chosen, performance: Math.round(chosen.value * 0.75), trivial: Math.round(chosen.value * 0.05) };
}

export function buildAudit(d: CompanyPeriodData): ReportDoc {
  const s = d.statements;
  const m = materiality(s);
  const inPeriod = d.entries.filter((e) => e.source !== "opening" && e.date >= d.period.from && e.date <= d.period.to);
  const amount = (e: (typeof inPeriod)[number]) => e.lines.reduce((x, l) => x + l.debit, 0);

  // journal entry tests (ISA 240.32)
  type Flag = { e: (typeof inPeriod)[number]; why: string };
  const flags: Flag[] = [];
  for (const e of inPeriod) {
    const sum = amount(e);
    const why: string[] = [];
    const wd = new Date(`${e.date}T00:00:00Z`).getUTCDay();
    if (e.source === "manual" && sum >= m.performance) why.push("ручная проводка выше рабочей существенности");
    if (wd === 0 || wd === 6) why.push(`дата — выходной (${WEEKDAYS[wd]})`);
    if (sum >= 100_000 && sum % 100_000 === 0 && e.source === "manual") why.push("круглая сумма");
    if (e.lines.some((l) => l.account.endsWith(".01"))) why.push("невыясненная сумма");
    if (e.lines.some((l) => getAccount(l.account)?.pl === "revenue" && l.debit > 0) && e.source !== "closing") why.push("дебет счёта выручки");
    if (e.date === d.period.to && e.source === "manual") why.push("последний день периода (cut-off)");
    if (why.length) flags.push({ e, why: why.join("; ") });
  }

  const cur = s.incomeStatement, prev = d.previous.incomeStatement;
  const prevBy = new Map(prev.lines.map((l) => [l.key, l.amount]));
  const analytical: TableBlock["rows"] = cur.lines.filter((l) => l.kind !== "sub").map((l) => {
    const p = prevBy.get(l.key) ?? 0;
    const diff = l.amount - p;
    const ch = change(l.amount, p);
    const flag = Math.abs(diff) >= m.performance && (ch === null || Math.abs(ch) >= 20) ? "объяснить" : "";
    return { cells: [l.label, l.amount, p, diff, ch, flag], style: l.kind === "total" ? "total" : l.kind === "subtotal" ? "subtotal" : "normal" };
  });

  const manual = inPeriod.filter((e) => e.source === "manual").length;
  const journalRows: TableBlock["rows"] = [];
  for (const e of inPeriod) {
    e.lines.forEach((l, i) => {
      journalRows.push({ cells: [i === 0 ? formatDate(e.date) : "", i === 0 ? e.description : "", l.account, accountName(l.account), l.debit || null, l.credit || null] });
    });
  }

  return base(d, "audit", [
    {
      title: "Существенность и сверки", sheet: "Существенность", blocks: [
        { type: "h2", text: "Существенность (МСА 320)" },
        { type: "table", columns: [{ label: "Ориентир", width: 46 }, { label: "База", kind: "money", width: 27 }, { label: "Существенность", kind: "money", width: 27 }],
          rows: [
            ...m.items.map((x) => ({ cells: [x.label, x.base, x.value] as TableBlock["rows"][number]["cells"], style: x === m.chosen ? "subtotal" as const : "normal" as const })),
            { cells: ["Рабочая существенность (75%)", null, m.performance] },
            { cells: ["Порог явно незначительных искажений (5%)", null, m.trivial] },
          ],
          note: `Выбран ориентир «${m.chosen.label}». Аудитор может выбрать иной ориентир по профессиональному суждению.` },
        { type: "h2", text: "Сверки между формами" },
        checksBlock(s),
        { type: "h2", text: "Структура журнала" },
        { type: "table", columns: [{ label: "Показатель", width: 70 }, { label: "Значение", kind: "num", width: 30 }], rows: [
          { cells: ["Проводок за период", inPeriod.length] },
          { cells: ["из них ручных", manual] },
          { cells: ["из банковских выписок", inPeriod.filter((e) => e.source === "bank").length] },
          { cells: ["начисления налогов, зарплаты, закрытия", inPeriod.filter((e) => ["tax", "payroll", "closing"].includes(e.source)).length] },
        ] },
      ],
    },
    {
      title: "Оборотно-сальдовая ведомость", sheet: "ОСВ", blocks: [{
        type: "table",
        columns: [{ label: "Счёт", kind: "code", width: 8 }, { label: "Наименование", width: 32 }, { label: "Сальдо нач. Дт", kind: "money", width: 10 }, { label: "Сальдо нач. Кт", kind: "money", width: 10 }, { label: "Оборот Дт", kind: "money", width: 10 }, { label: "Оборот Кт", kind: "money", width: 10 }, { label: "Сальдо кон. Дт", kind: "money", width: 10 }, { label: "Сальдо кон. Кт", kind: "money", width: 10 }],
        rows: [
          ...s.trialBalance.rows.map((r) => ({ cells: [r.account, r.name, r.openingDr, r.openingCr, r.turnoverDr, r.turnoverCr, r.closingDr, r.closingCr] as TableBlock["rows"][number]["cells"] })),
          { cells: ["", "Итого", ...Object.values(s.trialBalance.totals)], style: "total" as const },
        ],
      }],
    },
    {
      title: "Аналитические процедуры", sheet: "Аналитика", blocks: [
        { type: "p", text: hasPrev(d) ? `Сравнение с периодом ${periodLabel(d.previous.period.from, d.previous.period.to).toLowerCase()}. Отклонения больше рабочей существенности (${money(m.performance)} сом) и больше 20% отмечены для объяснения (МСА 520).` : "За предыдущий период проводок нет — сравнение покажет только текущие суммы." },
        { type: "table", columns: [{ label: "Статья", width: 34 }, { label: "Текущий", kind: "money", width: 14 }, { label: "Предыдущий", kind: "money", width: 14 }, { label: "Отклонение", kind: "money", width: 14 }, { label: "%", kind: "pct", width: 10 }, { label: "", width: 14 }], rows: analytical },
        { type: "h2", text: "Тесты журнала проводок (МСА 240)" },
        flags.length
          ? { type: "table", columns: [{ label: "Дата", width: 11 }, { label: "Содержание", width: 37 }, { label: "Сумма", kind: "money", width: 14 }, { label: "Почему отобрана", width: 38 }],
              rows: flags.slice(0, 60).map((f) => ({ cells: [formatDate(f.e.date), f.e.description, amount(f.e), f.why] })),
              note: flags.length > 60 ? `Показаны 60 из ${flags.length} отобранных проводок.` : undefined }
          : { type: "p", text: "По критериям отбора (ручные проводки выше рабочей существенности, выходные дни, круглые суммы, невыясненные суммы, дебет выручки, проводки последнего дня) ни одна проводка не отобрана." },
      ],
    },
    {
      title: "Журнал проводок", sheet: "Журнал", blocks: [{
        type: "table",
        columns: [{ label: "Дата", width: 10 }, { label: "Содержание", width: 34 }, { label: "Счёт", kind: "code", width: 8 }, { label: "Наименование счёта", width: 24 }, { label: "Дебет", kind: "money", width: 12 }, { label: "Кредит", kind: "money", width: 12 }],
        rows: journalRows,
      }],
    },
  ], "Рабочие документы подготовлены автоматически по данным учёта. Это не аудиторское заключение: мнение о достоверности отчётности выражает аудитор по результатам своих процедур (МСА 700).");
}

// ── 4. Управленческий ──────────────────────────────────────────────────────

export function buildManagement(d: CompanyPeriodData): ReportDoc {
  const s = d.statements, is = s.incomeStatement;
  const costs = costStructure(s);
  const be = breakEven(s);
  const prevNature = d.previous.incomeStatement.byNature;
  const cf = s.cashFlow.values;
  const r = ratios(s);
  const taxesAll = is.incomeTax + (is.byNature.taxes ?? 0) + (is.byNature.social ?? 0);
  return base(d, "management", [
    {
      title: "Расходы по элементам затрат", sheet: "Затраты", blocks: [
        { type: "table", columns: hasPrev(d)
            ? [{ label: "Элемент затрат", width: 40 }, { label: "Сумма", kind: "money", width: 18 }, { label: "Доля", kind: "pct", width: 12 }, { label: "Прошлый период", kind: "money", width: 18 }, { label: "Изм., %", kind: "pct", width: 12 }]
            : [{ label: "Элемент затрат", width: 50 }, { label: "Сумма", kind: "money", width: 30 }, { label: "Доля", kind: "pct", width: 20 }],
          rows: [
            ...costs.map((c) => ({ cells: hasPrev(d) ? [c.label, c.amount, c.share, prevNature[c.nature] ?? 0, change(c.amount, prevNature[c.nature] ?? 0)] : [c.label, c.amount, c.share] as TableBlock["rows"][number]["cells"] })),
            { cells: hasPrev(d) ? ["Итого расходов", costs.reduce((x, c) => x + c.amount, 0), 100, null, null] : ["Итого расходов", costs.reduce((x, c) => x + c.amount, 0), 100], style: "total" as const },
          ] },
        { type: "bars", title: "Доля в расходах", items: costs.slice(0, 8).map((c) => ({ label: c.label, value: c.amount, display: pct(c.share) })) },
      ],
    },
    {
      title: "Маржинальный доход и безубыточность", sheet: "Безубыточность", blocks: [
        { type: "table", columns: [{ label: "Показатель", width: 64 }, { label: "Значение", width: 36 }], rows: [
          { cells: ["Выручка и прочие операционные доходы", money(is.revenueTotal)] },
          { cells: ["Переменные расходы (себестоимость + расходы на реализацию)", money(be.variableCosts)] },
          { cells: ["Маржинальный доход", money(be.contributionMargin)], style: "subtotal" },
          { cells: ["Доля маржинального дохода", be.cmRatio === null ? "—" : pct(be.cmRatio)] },
          { cells: ["Постоянные расходы (административные + проценты)", money(be.fixedCosts)] },
          { cells: ["Точка безубыточности, выручка", be.breakEvenRevenue === null ? "не достигается" : money(be.breakEvenRevenue)], style: "subtotal" },
          { cells: ["Запас финансовой прочности", be.safetyMarginPct === null ? "—" : pct(be.safetyMarginPct)] },
        ], note: "Деление на переменные и постоянные расходы упрощённое — по разделам ОПиУ. Для точного анализа разметьте затраты вручную." },
      ],
    },
    {
      title: "Динамика по месяцам", sheet: "Месяцы", blocks: [
        { type: "table", columns: [{ label: "Месяц", width: 16 }, { label: "Доходы", kind: "money", width: 14 }, { label: "Расходы", kind: "money", width: 14 }, { label: "Прибыль", kind: "money", width: 14 }, { label: "Поступило денег", kind: "money", width: 14 }, { label: "Выплачено", kind: "money", width: 14 }, { label: "Деньги на конец", kind: "money", width: 14 }],
          rows: s.monthly.map((m) => ({ cells: [monthName(m.month), m.revenue, m.expenses, m.netProfit, m.cashIn, m.cashOut, m.cashEnd] })) },
      ],
    },
    {
      title: "Оборотный капитал и денежный поток", sheet: "Оборотный капитал", blocks: [
        { type: "table", title: "Оборотный капитал", columns: [{ label: "Статья", width: 52 }, { label: "На начало", kind: "money", width: 24 }, { label: "На конец", kind: "money", width: 24 }], rows: [
          { cells: ["Счета к получению (140)", s.balanceSheet.opening[140] ?? 0, s.balanceSheet.closing[140] ?? 0] },
          { cells: ["Запасы (160)", s.balanceSheet.opening[160] ?? 0, s.balanceSheet.closing[160] ?? 0] },
          { cells: ["Счета к оплате (310)", -(s.balanceSheet.opening[310] ?? 0), -(s.balanceSheet.closing[310] ?? 0)] },
          { cells: ["Чистый оборотный капитал (191 − 371)", (s.balanceSheet.opening[191] ?? 0) - (s.balanceSheet.opening[371] ?? 0), (s.balanceSheet.closing[191] ?? 0) - (s.balanceSheet.closing[371] ?? 0)], style: "subtotal" },
        ] },
        { type: "table", title: "Оборачиваемость", columns: [{ label: "Показатель", width: 60 }, { label: "Дней", kind: "num", width: 40 }],
          rows: r.filter((x) => x.group === "turnover").map((x) => ({ cells: [x.label, x.value] })) },
        { type: "table", title: "Денежный поток", columns: [{ label: "Вид деятельности", width: 60 }, { label: "Чистый поток", kind: "money", width: 40 }], rows: [
          { cells: ["Операционная (190)", cf[190] ?? 0] },
          { cells: ["Инвестиционная (390)", cf[390] ?? 0] },
          { cells: ["Финансовая (590)", cf[590] ?? 0] },
          { cells: ["Изменение денег за период (700)", cf[700] ?? 0], style: "total" },
        ] },
        { type: "table", title: "Налоговая нагрузка", columns: [{ label: "Показатель", width: 60 }, { label: "Значение", width: 40 }], rows: [
          { cells: ["Налоги и взносы работодателя в расходах", money(taxesAll)] },
          { cells: ["Доля от выручки", pct(is.revenueTotal > 0 ? (taxesAll / is.revenueTotal) * 100 : 0)] },
          { cells: ["НДС начислен / к зачёту", `${money(s.taxes.vatOutput)} / ${money(s.taxes.vatInput)}`] },
        ] },
      ],
    },
  ]);
}

// ── 5. ESG ─────────────────────────────────────────────────────────────────

export function buildEsg(d: CompanyPeriodData): ReportDoc {
  const rep = computeEsg(d.statements, d.esg ?? EMPTY_ESG);
  const SRC = { ledger: "из учёта", input: "введено", calc: "расчёт" } as const;
  const pillar = (p: Pillar): Section => ({
    title: PILLAR_LABEL[p], sheet: PILLAR_LABEL[p],
    blocks: [{
      type: "table",
      columns: [{ label: "Показатель", width: 44 }, { label: "Значение", width: 18 }, { label: "Ед.", width: 12 }, { label: "GRI", width: 13 }, { label: "Источник", width: 13 }],
      rows: rep.metrics.filter((m) => m.pillar === p).map((m) => ({
        cells: [m.note ? `${m.label} (${m.note})` : m.label, m.value === null ? "—" : typeof m.value === "number" ? num(m.value) : m.value, m.unit, m.gri, SRC[m.source]],
      })),
    }],
  });
  const e = rep.economic;
  return base(d, "esg", [
    {
      title: "Обзор", sheet: "Обзор", blocks: [
        ...(d.esg ? [] : [{ type: "note" as const, text: "Нефинансовые данные (энергия, персонал, органы управления) за этот период не введены. В отчёте только показатели, посчитанные из журнала. Заполните их на странице ESG." }]),
        { type: "kpis", items: [
          { label: "Выбросы CO₂, всего", value: `${num(rep.emissions.total, 1)} т`, note: `Scope 1 — ${num(rep.emissions.scope1, 1)} т, Scope 2 — ${num(rep.emissions.scope2, 1)} т` },
          { label: "Углеродоёмкость", value: rep.emissions.intensity === null ? "—" : `${num(rep.emissions.intensity, 3)} т / млн сом` },
          { label: "Работникам выплачено", value: `${money(e.employees)} сом`, note: "зарплата и взносы" },
          { label: "Государству", value: `${money(e.government)} сом`, note: "налоги и штрафы" },
        ] },
        { type: "table", title: "Созданная и распределённая экономическая стоимость (GRI 201-1)", columns: [{ label: "Статья", width: 70 }, { label: "Сом", kind: "money", width: 30 }], rows: [
          { cells: ["Создано: выручка и прочие доходы", e.generated], style: "subtotal" },
          { cells: ["Операционные затраты (поставщики)", e.operatingCosts] },
          { cells: ["Работникам: зарплата и взносы", e.employees] },
          { cells: ["Кредиторам и собственникам: проценты и дивиденды", e.capitalProviders] },
          { cells: ["Государству: налоги и штрафы", e.government] },
          { cells: ["Осталось в компании", e.retained], style: "total" },
        ] },
        { type: "p", text: "Коэффициент выбросов электросети КР — 0,153 кг CO₂/кВт·ч (Ember / Our World in Data, 2025). Коэффициенты по топливу — ориентировочные на основе IPCC 2006; их можно уточнить на странице ESG." },
      ],
    },
    pillar("E"), pillar("S"), pillar("G"),
  ]);
}

export const BUILDERS: Record<PackageKey, (d: CompanyPeriodData) => ReportDoc> = {
  full: buildFull,
  executive: buildExecutive,
  audit: buildAudit,
  management: buildManagement,
  esg: buildEsg,
};

