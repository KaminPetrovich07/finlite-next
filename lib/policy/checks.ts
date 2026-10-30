// ════════════════════════════════════════════════════════════════════════
// lib/policy/checks.ts — учётная политика против журнала проводок.
// Подсказки: что в политике противоречит режиму или данным учёта и что
// стоит сделать. Только чистые функции — проверяются тестами.
// ════════════════════════════════════════════════════════════════════════

import { accountName } from "@/lib/ledger/accounts";
import type { LedgerEntry } from "@/lib/ledger/types";
import type { RegimeKey } from "@/lib/tax-engine";
import { hasProduction, type PolicyInput } from "./types";

export interface PolicyCheck {
  level: "error" | "warn" | "tip";
  title: string;
  detail: string;
}

const FA = /^21[1-8]\d$/;       // 2110–2180: первоначальная стоимость ОС
const ACC_DEP = /^219\d$/;       // накопленная амортизация
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");

export function checkPolicy(p: PolicyInput, regime: RegimeKey | null, entries: LedgerEntry[]): PolicyCheck[] {
  const out: PolicyCheck[] = [];
  const used = new Set<string>();
  for (const e of entries) for (const l of e.lines) used.add(l.account);

  // ── политика против налогового режима ───────────────────────────────────
  if (p.framework === "sme609" && (regime === "general" || p.vatPayer)) {
    out.push({
      level: "warn",
      title: "ПП № 609 может не подходить",
      detail: "Правила для малого предпринимательства применяют компании с выручкой не выше порога регистрации по НДС или на едином налоге (ПП № 609, пп. 2–3). Для плательщика НДС на общем режиме обычно нужны МСФО для МСП.",
    });
  }
  if (regime === "general" && !p.vatPayer) {
    out.push({ level: "tip", title: "Проверьте статус плательщика НДС", detail: "Компания на общем режиме. Если выручка превысила порог регистрации по НДС, отметьте «плательщик НДС»: это изменит учёт запасов и выручки." });
  }

  // ── реквизиты ───────────────────────────────────────────────────────────
  if (!p.director.trim()) out.push({ level: "warn", title: "Не указан руководитель", detail: "Приказ подписывает руководитель — впишите его Ф.И.О." });
  const unnamed = p.signatories.filter((s) => !s.name.trim()).map((s) => s.role);
  if (unnamed.length) out.push({ level: "tip", title: "Лица с правом подписи без Ф.И.О.", detail: `Заполните: ${unnamed.join(", ")}. Документы без подписи уполномоченного лица недействительны (ПП № 231, п. 25).` });

  // ── виды деятельности против счетов ────────────────────────────────────
  if (used.has("1610") && !p.activities.includes("trade")) out.push({ level: "tip", title: "В журнале есть товары (1610)", detail: "Добавьте вид деятельности «торговля», чтобы в политике и рабочем плане счетов был учёт товаров." });
  if ((used.has("1630") || used.has("1640")) && !hasProduction(p)) out.push({ level: "warn", title: "В журнале есть производство (1630/1640)", detail: "Добавьте вид деятельности «производство»: без раздела о калькуляции политика не описывает, как считается себестоимость продукции." });

  // ── основные средства ───────────────────────────────────────────────────
  const small: Array<{ date: string; code: string; amount: number }> = [];
  let faBalance = 0, depCredits = 0, lastDep = "";
  for (const e of entries) {
    for (const l of e.lines) {
      if (FA.test(l.account)) {
        faBalance += l.debit - l.credit;
        if (e.source !== "opening" && l.debit > 0 && l.debit < p.ppeThreshold) small.push({ date: e.date, code: l.account, amount: l.debit });
      }
      if (ACC_DEP.test(l.account) && l.credit > 0 && e.source !== "opening") {
        depCredits += l.credit;
        if (e.date > lastDep) lastDep = e.date;
      }
    }
  }
  if (small.length) {
    const ex = small.slice(0, 3).map((s) => `${s.date}: ${accountName(s.code)}, ${money(s.amount)} сом`).join("; ");
    out.push({
      level: "warn",
      title: `${small.length} поступл. ОС дешевле порога ${money(p.ppeThreshold)} сом`,
      detail: `По политике такие предметы учитываются как запасы (МБП), а не как основные средства. Например: ${ex}.`,
    });
  }
  const lastDate = entries.reduce((m, e) => (e.date > m ? e.date : m), "");
  if (faBalance > 0.5 && p.depMethod !== "units") {
    const months = lastDep ? monthsBetween(lastDep, lastDate) : null;
    if (depCredits < 0.5) out.push({ level: "error", title: "Амортизация не начисляется", detail: `На счетах основных средств ${money(faBalance)} сом, но в журнале нет начислений амортизации (счета 2193–2199). Без неё завышены активы и прибыль.` });
    else if (months !== null && months > 1) out.push({ level: "warn", title: "Амортизация начислена не за все месяцы", detail: `Последнее начисление — ${lastDep}, последняя проводка — ${lastDate}. Амортизация начисляется ежемесячно.` });
  }

  // ── касса ───────────────────────────────────────────────────────────────
  const neg = negativeCashDays(entries);
  if (neg.length) out.push({ level: "error", title: "Отрицательный остаток в кассе", detail: `Остаток на счёте 1110 уходил в минус: ${neg.slice(0, 3).join(", ")}. Так быть не может — вероятно, не оформлен приходный кассовый ордер (ПП № 281, п. 20).` });

  // ── дебиторская задолженность ──────────────────────────────────────────
  const ar = balance(entries, "1410");
  if (ar > 0.5 && p.allowanceMethod === "none") out.push({ level: "tip", title: "Долги покупателей без резерва", detail: `Покупатели должны ${money(ar)} сом. Резерв по просроченным долгам показывает реальную стоимость дебиторской задолженности и нужен банку и аудитору.` });

  // ── производство ────────────────────────────────────────────────────────
  if (hasProduction(p) && p.costingMethod === "actual" && p.overheadBase === "output" && p.activities.length > 1) {
    out.push({ level: "tip", title: "База распределения ОПР", detail: "Объём выпуска в штуках подходит, когда продукция однородна. При разных изделиях точнее распределять по оплате труда или машино-часам." });
  }

  if (!out.some((c) => c.level !== "tip")) out.unshift({ level: "tip", title: "Политика согласуется с данными учёта", detail: "Противоречий между выбранными способами учёта, налоговым режимом и журналом проводок не найдено." });
  return out;
}

function balance(entries: LedgerEntry[], code: string): number {
  let s = 0;
  for (const e of entries) for (const l of e.lines) if (l.account === code) s += l.debit - l.credit;
  return s;
}

function negativeCashDays(entries: LedgerEntry[]): string[] {
  const byDay = new Map<string, number>();
  for (const e of entries) for (const l of e.lines) if (l.account === "1110") byDay.set(e.date, (byDay.get(e.date) ?? 0) + l.debit - l.credit);
  let run = 0;
  const out: string[] = [];
  for (const d of Array.from(byDay.keys()).sort()) {
    run += byDay.get(d)!;
    if (run < -0.5) out.push(d);
  }
  return out;
}

function monthsBetween(a: string, b: string): number {
  return (Number(b.slice(0, 4)) - Number(a.slice(0, 4))) * 12 + Number(b.slice(5, 7)) - Number(a.slice(5, 7));
}
