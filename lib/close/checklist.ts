// ════════════════════════════════════════════════════════════════════════
// lib/close/checklist.ts — закрытие месяца: одна проверка по всем модулям.
//
// Шаги идут в том порядке, в котором бухгалтер закрывает период: сначала
// данные (выписки, невыясненные суммы, остатки), затем начисления (зарплата,
// амортизация), расчёты с контрагентами и резерв, производство, документы,
// налоги, сверка форм отчётности и, наконец, закрытие счетов доходов и
// расходов. Где исправление однозначно, шаг несёт готовое действие —
// проводку, начисление налогов или проведение выписки.
// Чистая функция: данные собирает сервер.
// ════════════════════════════════════════════════════════════════════════
import { buildStatements, type Check } from "@/lib/ledger/engine";
import { stockByItem, qtyText } from "@/lib/ledger/stock";
import type { LedgerEntry, LedgerLine, Period } from "@/lib/ledger/types";
import type { RegimeKey } from "@/lib/tax-engine";
import type { People } from "@/lib/primary/build";
import type { CpResult } from "@/lib/counterparties/calc";
import type { CostingResult } from "@/lib/costing/calc";

export type StepStatus = "ok" | "warn" | "error";
export type Group = "Данные" | "Начисления" | "Расчёты с контрагентами" | "Производство" | "Документы" | "Налоги" | "Сверка отчётности" | "Закрытие";
export const GROUPS: Group[] = ["Данные", "Начисления", "Расчёты с контрагентами", "Производство", "Документы", "Налоги", "Сверка отчётности", "Закрытие"];

export type Action =
  | { kind: "bank"; label: string }
  | { kind: "taxes"; label: string }
  | { kind: "close"; label: string }
  | { kind: "link"; label: string; href: string }
  | { kind: "entry"; label: string; entry: { date: string; description: string; lines: LedgerLine[] } };

export interface Step { id: string; group: Group; title: string; status: StepStatus; detail: string; action?: Action }

export interface CloseInput {
  entries: LedgerEntry[];
  period: Period;
  regime: RegimeKey | null;
  patentMonthly?: number;
  unpostedBankTx: number;
  policySaved: boolean;
  people: People;
  cp: CpResult;
  costing: { production: boolean; result: CostingResult | null; hasNorms: boolean; outputsSet: boolean };
}

export interface CloseResult { steps: Step[]; errors: number; warnings: number; ok: number; closed: { by: "finlite" | "1c"; date: string } | null; canClose: boolean }

const r2 = (n: number) => Math.round(n * 100) / 100;
const money = (n: number) => Math.round(n).toLocaleString("ru-RU").replace(/ /g, " ");
const DEPRECIABLE = /^21[3-8]0$|^29[1-8]0$/;
const ACCUM = /^219[3-9]$|^299[1-8]$/;
const STOCK = /^1[67]\d\d$/;

export function closeChecklist(x: CloseInput): CloseResult {
  const { entries, period } = x;
  const { from, to } = period;
  const ref = `${from}..${to}`;
  const inP = (e: LedgerEntry) => e.source !== "opening" && e.date >= from && e.date <= to;
  const before = (e: LedgerEntry) => (e.source === "opening" ? e.date <= from : e.date < from);
  const s = buildStatements(entries, period, { regime: x.regime, patentMonthly: x.patentMonthly, unpostedBankTx: x.unpostedBankTx });
  const chk = (id: string) => s.checks.find((c) => c.id === id);
  const steps: Step[] = [];
  const add = (st: Step) => steps.push(st);
  const fromCheck = (c: Check | undefined, group: Group, fallback: Omit<Step, "group" | "status" | "detail">, action?: Action) => {
    if (!c) return;
    add({ ...fallback, group, status: c.status, detail: c.detail, ...(c.status !== "ok" && action ? { action } : {}) });
  };

  // ── данные
  add(x.unpostedBankTx > 0
    ? { id: "bank", group: "Данные", title: "Операции из выписок проведены", status: "warn", detail: `Не проведено в журнал: ${x.unpostedBankTx}. Без них выручка, расходы и налоги за период неполные.`, action: { kind: "bank", label: "Провести выписки" } }
    : { id: "bank", group: "Данные", title: "Операции из выписок проведены", status: "ok", detail: "Все загруженные операции банка — в журнале." });
  const susp = chk("suspense");
  add(susp
    ? { id: "suspense", group: "Данные", title: "Нет невыясненных сумм", status: "warn", detail: susp.detail, action: { kind: "link", label: "Разобрать выписку", href: "/transactions" } }
    : { id: "suspense", group: "Данные", title: "Нет невыясненных сумм", status: "ok", detail: "Субсчета 1590.01 и 3600.01 пусты." });
  const neg = chk("cash-negative");
  add(neg
    ? { id: "cash", group: "Данные", title: "Остатки денег не отрицательные", status: "error", detail: neg.detail, action: { kind: "link", label: "Открыть журнал", href: "/ledger" } }
    : { id: "cash", group: "Данные", title: "Остатки денег не отрицательные", status: "ok", detail: "Касса и счета в банке — с неотрицательным остатком." });
  const stock = stockByItem(entries, to, (a) => STOCK.test(a));
  const negAmt = stock.filter((b) => b.amount < -0.004);
  const negQty = stock.filter((b) => b.item && b.qty < -0.0004);
  add(negAmt.length
    ? { id: "stock", group: "Данные", title: "Запасы не уходят в минус", status: "error", detail: `Отрицательный остаток: ${negAmt.slice(0, 4).map((b) => `${b.account}${b.item ? ` ${b.item}` : ""} ${money(b.amount)} сом`).join("; ")}. Списано больше, чем оприходовано — проверьте поступления и даты.`, action: { kind: "link", label: "Открыть журнал", href: "/ledger" } }
    : negQty.length
      ? { id: "stock", group: "Данные", title: "Запасы не уходят в минус", status: "warn", detail: `Отрицательное количество: ${negQty.slice(0, 4).map((b) => `${b.item} ${qtyText(b.qty)} ${b.unit}`).join("; ")}. Суммы в порядке, но в натуре списано больше прихода.`, action: { kind: "link", label: "Опись ИНВ-3", href: "/documents" } }
      : { id: "stock", group: "Данные", title: "Запасы не уходят в минус", status: "ok", detail: stock.length ? `Позиций на складе: ${stock.length}.` : "Запасов нет." });

  // ── начисления
  const wagesBefore = entries.some((e) => before(e) && e.source !== "opening" && e.lines.some((l) => l.account === "3520" && l.credit > 0));
  const wagesNow = r2(entries.filter(inP).flatMap((e) => e.lines).filter((l) => l.account === "3520" && l.credit > 0).reduce((a, l) => a + l.credit, 0));
  add(wagesNow > 0
    ? { id: "payroll", group: "Начисления", title: "Зарплата начислена", status: "ok", detail: `Начислено ${money(wagesNow)} сом (Кт 3520).` }
    : wagesBefore
      ? { id: "payroll", group: "Начисления", title: "Зарплата начислена", status: "warn", detail: "В прошлых периодах зарплата начислялась, а в этом — нет. Без неё занижены расходы, взносы в Соцфонд и подоходный налог.", action: { kind: "link", label: "Начислить зарплату", href: "/ledger" } }
      : { id: "payroll", group: "Начисления", title: "Зарплата начислена", status: "ok", detail: "Зарплата в журнале не ведётся." });
  const net = (test: RegExp, pred: (e: LedgerEntry) => boolean) => r2(entries.filter(pred).flatMap((e) => e.lines).filter((l) => test.test(l.account)).reduce((a, l) => a + l.debit - l.credit, 0));
  const fa = net(DEPRECIABLE, before);
  const dep = r2(entries.filter(inP).flatMap((e) => e.lines).filter((l) => ACCUM.test(l.account) && l.credit > 0).reduce((a, l) => a + l.credit, 0));
  add(fa <= 0.5
    ? { id: "dep", group: "Начисления", title: "Амортизация начислена", status: "ok", detail: "Амортизируемых основных средств и НМА на начало периода нет." }
    : dep > 0
      ? { id: "dep", group: "Начисления", title: "Амортизация начислена", status: "ok", detail: `Начислено ${money(dep)} сом при первоначальной стоимости ОС и НМА ${money(fa)} сом.` }
      : { id: "dep", group: "Начисления", title: "Амортизация начислена", status: "warn", detail: `Основные средства и НМА — ${money(fa)} сом, а амортизации за период нет. Начислите по методу и срокам из учётной политики: Дт 7150 / 8470 / 8480 Кт 2193–2199, 2991–2998.`, action: { kind: "link", label: "Открыть журнал", href: "/ledger" } });

  // ── расчёты с контрагентами
  const unassigned = x.cp.unassigned.entries.filter((u) => u.date >= from && u.date <= to);
  add(unassigned.length
    ? { id: "cp-unassigned", group: "Расчёты с контрагентами", title: "Расчёты разнесены по контрагентам", status: "warn", detail: `Без контрагента: ${unassigned.length} операций на счетах расчётов. Акт сверки и ИНВ-17 по ним будут неполными.`, action: { kind: "link", label: "Указать контрагентов", href: "/counterparties" } }
    : { id: "cp-unassigned", group: "Расчёты с контрагентами", title: "Расчёты разнесены по контрагентам", status: "ok", detail: "У всех операций периода на счетах расчётов есть контрагент." });
  const gap = r2(x.cp.totals.allowance - x.cp.totals.allowanceBooked);
  if (Math.abs(gap) > 0.5) {
    const up = gap > 0;
    add({
      id: "allowance", group: "Расчёты с контрагентами", title: "Резерв по сомнительным долгам по политике", status: "warn",
      detail: up ? `По срокам просрочки нужен резерв ${money(x.cp.totals.allowance)} сом, в учёте ${money(x.cp.totals.allowanceBooked)}. Доначислить ${money(gap)} сом.` : `Резерв больше нужного на ${money(-gap)} сом — восстановить излишек.`,
      action: { kind: "entry", label: up ? `Начислить ${money(gap)}` : `Восстановить ${money(-gap)}`, entry: {
        date: to, description: up ? "Начисление резерва по сомнительной дебиторской задолженности (учётная политика)" : "Восстановление излишне начисленного резерва по сомнительным долгам",
        lines: up ? [{ account: "7550", debit: gap, credit: 0 }, { account: "1491", debit: 0, credit: gap }] : [{ account: "1491", debit: -gap, credit: 0 }, { account: "6250", debit: 0, credit: -gap }],
      } },
    });
  } else add({ id: "allowance", group: "Расчёты с контрагентами", title: "Резерв по сомнительным долгам по политике", status: "ok", detail: x.cp.totals.allowance ? `Начислен ${money(x.cp.totals.allowanceBooked)} сом — соответствует срокам просрочки.` : "Долгов, просроченных более 90 дней, нет." });
  for (const r of x.cp.rows) {
    const adv = -(r.balances["3210"] ?? 0), ar = r.balances["1410"] ?? 0;
    if (adv > 0.5 && ar > 0.5) {
      const amt = r2(Math.min(adv, ar));
      add({ id: `offset-${r.id}`, group: "Расчёты с контрагентами", title: `${r.name}: зачесть аванс`, status: "warn",
        detail: `Покупатель должен ${money(ar)} сом и одновременно внёс аванс ${money(adv)} сом. Зачёт уменьшит и дебиторку, и обязательство на ${money(amt)} сом.`,
        action: { kind: "entry", label: `Зачесть ${money(amt)}`, entry: { date: to, description: `Зачёт аванса покупателя ${r.name}`, lines: [{ account: "3210", debit: amt, credit: 0, party: r.name }, { account: "1410", debit: 0, credit: amt, party: r.name }] } } });
    }
  }
  const overdue = x.cp.rows.filter((r) => r.maxOverdue > 90);
  if (overdue.length) add({ id: "overdue", group: "Расчёты с контрагентами", title: "Долги просрочены более 90 дней", status: "warn", detail: `${overdue.slice(0, 3).map((r) => `${r.name} — ${money(r.overdueRecv)} сом`).join("; ")}${overdue.length > 3 ? " и др." : ""}. Направьте акты сверки и претензии.`, action: { kind: "link", label: "Акты сверки", href: "/counterparties" } });

  // ── производство
  if (x.costing.production) {
    const c = x.costing.result;
    const pools = c ? c.pools.materials + c.pools.labor + c.pools.social + c.pools.overhead : 0;
    if (!c || pools <= 0) add({ id: "costing", group: "Производство", title: "Себестоимость выпуска рассчитана", status: "ok", detail: "Производственных затрат за период нет." });
    else if (!x.costing.hasNorms) add({ id: "costing", group: "Производство", title: "Себестоимость выпуска рассчитана", status: "warn", detail: `Затраты на производство — ${money(pools)} сом, но изделия и нормы не заданы: себестоимость единицы не посчитать.`, action: { kind: "link", label: "Калькуляция", href: "/costing" } });
    else if (!x.costing.outputsSet) add({ id: "costing", group: "Производство", title: "Себестоимость выпуска рассчитана", status: "warn", detail: "Не указан выпуск за период — затраты не распределены по изделиям.", action: { kind: "link", label: "Указать выпуск", href: "/costing" } });
    else {
      const mismatch = c.advice.find((a) => /Выпуск в журнале не совпадает/.test(a.title));
      const over = c.usage.filter((u) => (u.qtyPct ?? 0) > 5);
      add(mismatch
        ? { id: "costing", group: "Производство", title: "Себестоимость выпуска рассчитана", status: "warn", detail: mismatch.detail, action: { kind: "link", label: "Калькуляция", href: "/costing" } }
        : { id: "costing", group: "Производство", title: "Себестоимость выпуска рассчитана", status: "ok", detail: `Фактическая себестоимость выпуска — ${money(c.totals.total)} сом, совпадает с оприходованной.` });
      if (over.length) add({ id: "usage", group: "Производство", title: "Расход материалов в пределах норм", status: "warn", detail: over.map((u) => `${u.name}: +${u.qtyPct!.toFixed(1).replace(".", ",")}% (${money(u.qtyEffect)} сом)`).join("; "), action: { kind: "link", label: "Расход в натуре", href: "/costing" } });
    }
  }

  // ── документы
  add(x.policySaved
    ? { id: "policy", group: "Документы", title: "Учётная политика утверждена", status: "ok", detail: "Политика сохранена — документы и расчёты опираются на неё." }
    : { id: "policy", group: "Документы", title: "Учётная политика утверждена", status: "warn", detail: "Политика не сохранена: резерв, калькуляция и сроки амортизации считаются по настройкам по умолчанию.", action: { kind: "link", label: "Заполнить политику", href: "/policy" } });
  const missing = [!x.people.director && "руководитель", !x.people.chief && "бухгалтер", !x.people.cashier && "кассир"].filter(Boolean);
  add(missing.length
    ? { id: "signers", group: "Документы", title: "Подписанты первичных документов указаны", status: "warn", detail: `Не указаны: ${missing.join(", ")}. В кассовых ордерах и актах останутся пустые строки.`, action: { kind: "link", label: "Подписанты", href: "/policy" } }
    : { id: "signers", group: "Документы", title: "Подписанты первичных документов указаны", status: "ok", detail: `${x.people.director}, ${x.people.chief}, ${x.people.cashier}.` });

  // ── налоги
  fromCheck(chk("tax"), "Налоги", { id: "tax", title: "Налоги начислены по режиму" }, { kind: "taxes", label: "Начислить налоги" });

  // ── сверка отчётности
  for (const id of ["entries", "accounts", "tb", "bs", "cf-bs", "eq-bs", "eq-is"]) {
    const c = chk(id);
    if (c) add({ id: `chk-${id}`, group: "Сверка отчётности", title: c.title, status: c.status, detail: c.detail, ...(c.status !== "ok" ? { action: { kind: "link", label: "Отчётность", href: "/reports" } as Action } : {}) });
  }

  // ── закрытие
  const own = entries.find((e) => e.source === "closing" && e.sourceRef === ref);
  const in1c = entries.find((e) => e.source === "closing" && e.sourceRef?.startsWith("1c") && e.date >= from && e.date <= to);
  const closed = own ? { by: "finlite" as const, date: own.date } : in1c ? { by: "1c" as const, date: in1c.date } : null;
  const errors = steps.filter((st) => st.status === "error").length;
  add(closed
    ? { id: "close", group: "Закрытие", title: "Счета доходов и расходов закрыты", status: "ok", detail: closed.by === "1c" ? "Период закрыт проводками из 1С." : `Закрыто ${closed.date.split("-").reverse().join(".")} через 5999 на 5300. Если после этого добавлялись проводки — закройте заново.`, action: closed.by === "finlite" ? { kind: "close", label: "Закрыть заново" } : undefined }
    : { id: "close", group: "Закрытие", title: "Счета доходов и расходов закрыты", status: "warn", detail: errors ? `Сначала исправьте ошибки (${errors}) — иначе закроется неверный результат.` : "Прибыль периода перенесётся на 5300 «Нераспределённая прибыль».", action: { kind: "close", label: "Закрыть период" } });

  const warnings = steps.filter((st) => st.status === "warn").length;
  return { steps, errors, warnings, ok: steps.filter((st) => st.status === "ok").length, closed, canClose: errors === 0 };
}
