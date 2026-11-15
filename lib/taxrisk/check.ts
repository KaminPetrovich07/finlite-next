// ════════════════════════════════════════════════════════════════════════
// lib/taxrisk/check.ts — налоговые риски глазами проверяющего.
//
// То, что при камеральном анализе бросается в глаза налоговой: продажа
// товара, которого по учёту не было; продажа ниже закупочной цены; НДС к
// возмещению месяц за месяцем; реализация без НДС у плательщика НДС;
// НДС при ввозе из ЕАЭС, не уплаченный к 20-му числу; закупка в валюте,
// проведённая как обычная покупка (без НДС при ввозе и пошлины);
// крупные расчёты с контрагентами без ИНН (без ИНН не выписать ЭСФ).
// Это повод проверить документы, а не обязательно нарушение.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

import { itemKey } from "@/lib/ledger/stock";
import { eaeuDue } from "@/lib/import-goods/calc";
import type { LedgerEntry } from "@/lib/ledger/types";

export type RiskSeverity = "high" | "medium" | "info";
/** title и detail — шаблоны с подстановками {…} (vars): интерфейс переводит их через t(). */
export interface TaxRisk { id: string; kind: string; severity: RiskSeverity; title: string; detail: string; vars?: Record<string, string | number>; date: string; amount: number; entryIds: string[] }
export interface VatMonth { month: string; output: number; input: number; share: number | null }
export interface TaxRiskReport { risks: TaxRisk[]; vat: VatMonth[]; checked: number; vatPayer: boolean }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const fmt = (n: number) => Math.round(n).toLocaleString("ru-RU");
const ru = (d: string) => d.split("-").reverse().join(".");
const SKIP_NO_INN = /таможен|ндс при ввозе|соц.?фонд|гнс|налог|банк/i;

export interface RiskOptions { innThreshold?: number; belowCostTolerance?: number; today?: string }

export function taxRisks(entries: LedgerEntry[], from: string, to: string, o: RiskOptions = {}): TaxRiskReport {
  const innThreshold = o.innThreshold ?? 100_000;
  const tol = o.belowCostTolerance ?? 0.02;
  const today = o.today ?? to;
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date) || (a.source === "opening" ? -1 : b.source === "opening" ? 1 : 0));
  const inPeriod = (d: string) => d >= from && d <= to;
  const risks: TaxRisk[] = [];
  const vatPayer = entries.some((e) => e.lines.some((l) => l.account === "3430" && l.credit > 0));

  // ── 1, 2. склад: продажа без остатка и ниже средней себестоимости ─────────
  const stock = new Map<string, { name: string; qty: number; amount: number }>();
  const negative = new Map<string, TaxRisk>();
  const below = new Map<string, { name: string; n: number; loss: number; worst: number; cost: number; ids: string[]; date: string }>();
  for (const e of sorted) {
    // цена продажи — до списания себестоимости этой же продажи
    for (const l of e.lines) {
      if (!/^61[13]0$/.test(l.account) || !l.item || !l.qty || l.credit <= 0 || !inPeriod(e.date)) continue;
      const s = stock.get(itemKey(l.item));
      if (!s || s.qty < Number(l.qty) - 0.0005) {
        const k = itemKey(l.item);
        if (!negative.has(k)) negative.set(k, { id: `neg-${k}`, kind: "negative-stock", severity: "high", title: "Продано больше, чем было на складе: {item}",
          detail: s && s.qty > 0.0005 ? "{date} продано {qty} {unit}, а по учёту на складе было {left}. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз." : "{date} продано {qty} {unit}, а по учёту на складе ничего не было. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз.",
          vars: { item: l.item.trim(), date: ru(e.date), qty: String(l.qty).replace(".", ","), unit: l.unit ?? "", left: s ? String(Math.max(0, s.qty)).replace(".", ",") : "0" },
          date: e.date, amount: l.credit, entryIds: [e.id] });
      }
      if (!s || s.qty <= 0.0005) continue;
      const avg = s.amount / s.qty, price = l.credit / Number(l.qty);
      if (price < avg * (1 - tol)) {
        const k = itemKey(l.item);
        const b = below.get(k) ?? below.set(k, { name: l.item.trim(), n: 0, loss: 0, worst: 0, cost: avg, ids: [], date: e.date }).get(k)!;
        b.n++; b.loss = r2(b.loss + (avg - price) * Number(l.qty)); b.worst = Math.max(b.worst, (1 - price / avg) * 100); b.ids.push(e.id);
      }
    }
    for (const l of e.lines) {
      if (l.account !== "1610" || !l.item || !l.qty) continue;
      const k = itemKey(l.item);
      const s = stock.get(k) ?? stock.set(k, { name: l.item.trim(), qty: 0, amount: 0 }).get(k)!;
      const q = Number(l.qty) * (l.debit > 0 ? 1 : -1);
      s.qty = Math.round((s.qty + q) * 1000) / 1000; s.amount = r2(s.amount + l.debit - l.credit);
      if (s.qty < -0.0005 && inPeriod(e.date) && !negative.has(k)) {
        negative.set(k, { id: `neg-${k}`, kind: "negative-stock", severity: "high", title: "Продано больше, чем поступило: {item}",
          detail: "На {date} остаток по учёту стал {qty} — товар списан или продан раньше, чем оприходован. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз.",
          vars: { item: s.name, date: ru(e.date), qty: String(s.qty).replace(".", ",") },
          date: e.date, amount: 0, entryIds: [e.id] });
      }
    }
  }
  risks.push(...negative.values());
  for (const [k, b] of below) {
    risks.push({ id: `below-${k}`, kind: "below-cost", severity: b.worst >= 19.99 ? "high" : "medium", title: "Продажа ниже себестоимости: {item}",
      detail: "Продаж дешевле средней себестоимости {cost} сом за единицу: {n}, до {pct} % ниже; недополученная выручка {loss} сом. При заниженной цене ГНС может доначислить налоги исходя из рыночной — держите обоснование (уценка, акция, брак).",
      vars: { item: b.name, n: b.n, cost: fmt(b.cost), pct: Math.round(b.worst), loss: fmt(b.loss) },
      date: b.date, amount: b.loss, entryIds: b.ids.slice(0, 5) });
  }

  // ── 3. НДС по месяцам: доля вычетов и возмещение подряд ──────────────────
  const vm = new Map<string, { output: number; input: number }>();
  for (const e of sorted) {
    if (!inPeriod(e.date)) continue;
    for (const l of e.lines) {
      if (l.account !== "3430" && l.account !== "1540") continue;
      const m = vm.get(e.date.slice(0, 7)) ?? vm.set(e.date.slice(0, 7), { output: 0, input: 0 }).get(e.date.slice(0, 7))!;
      // начисленный НДС — кредит 3430; уменьшает его только возврат от покупателя (в той же проводке 6120).
      // Дебет 3430 при уплате в бюджет или зачёте с 1540 — не «минус выручка».
      const ret = e.lines.some((x) => x.account === "6120");
      if (l.account === "3430") m.output = r2(m.output + l.credit - (ret ? l.debit : 0));
      if (l.account === "1540") m.input = r2(m.input + l.debit - (e.lines.some((x) => x.account === "3110" && x.debit > 0) ? l.credit : 0));
    }
  }
  const vat: VatMonth[] = [...vm].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v, share: v.output > 0.01 ? Math.round((v.input / v.output) * 1000) / 10 : null }));
  let streak: VatMonth[] = [];
  for (const m of vat) {
    if (m.input > m.output + 0.01) streak.push(m); else streak = [];
    if (streak.length === 3) {
      risks.push({ id: `vat-refund-${m.month}`, kind: "vat-refund", severity: "high", title: "НДС к возмещению три месяца подряд",
        detail: "Вычеты больше начисленного НДС в месяцах {months}, превышение {sum} сом. Постоянное превышение вычетов — частый повод для камеральной проверки: покупки не превращаются в продажи или выручка показана не вся.",
        vars: { months: streak.map((x) => x.month).join(", "), sum: fmt(streak.reduce((a, x) => a + x.input - x.output, 0)) },
        date: `${m.month}-01`, amount: r2(streak.reduce((s, x) => s + x.input - x.output, 0)), entryIds: [] });
    }
  }
  for (const m of vat) {
    if (m.share != null && m.share >= 90 && m.share <= 100) {
      risks.push({ id: `vat-share-${m.month}`, kind: "vat-share", severity: "medium", title: "Высокая доля вычетов НДС: {month}",
        detail: "Вычеты {input} сом — {share} % от начисленного НДС {output} сом. К уплате почти ничего: ГНС сравнивает долю вычетов со средней по отрасли.",
        vars: { month: m.month, input: fmt(m.input), share: (m.share ?? 0).toLocaleString("ru-RU"), output: fmt(m.output) }, date: `${m.month}-01`, amount: m.input, entryIds: [] });
    }
  }

  // ── 4. реализация без НДС у плательщика НДС ──────────────────────────────
  if (vatPayer) {
    const noVat = sorted.filter((e) => inPeriod(e.date) && e.source !== "opening" && e.source !== "closing"
      && e.lines.some((l) => l.account === "6110" && l.credit > 0) && !e.lines.some((l) => l.account === "3430"));
    if (noVat.length) {
      const sum = r2(noVat.reduce((s, e) => s + e.lines.filter((l) => l.account === "6110").reduce((a, l) => a + l.credit, 0), 0));
      risks.push({ id: "sale-no-vat", kind: "sale-no-vat", severity: "medium", title: "Реализация без НДС, операций: {n}",
        detail: "Выручка {sum} сом проведена без строки НДС (3430), хотя компания начисляет НДС. Если это не освобождённая реализация (экспорт, льгота), НДС с неё будет доначислен.",
        vars: { n: noVat.length, sum: fmt(sum) },
        date: noVat[0].date, amount: sum, entryIds: noVat.slice(0, 5).map((e) => e.id) });
    }
  }

  // ── 5. НДС при ввозе из ЕАЭС не уплачен к 20-му ──────────────────────────
  const parts: Array<{ date: string; left: number; id: string }> = [];
  for (const e of sorted) {
    for (const l of e.lines) {
      if (l.account !== "3490" || (l.party ?? "") !== "НДС при ввозе из ЕАЭС") continue;
      if (l.credit > 0) parts.push({ date: e.date, left: l.credit, id: e.id });
      let pay = l.debit;
      for (const p of parts) { if (pay <= 0) break; const x = Math.min(p.left, pay); p.left = r2(p.left - x); pay = r2(pay - x); }
    }
  }
  for (const p of parts.filter((x) => x.left > 0.01 && eaeuDue(x.date) < today)) {
    risks.push({ id: `eaeu-${p.id}`, kind: "eaeu-vat", severity: "high", title: "НДС при ввозе из ЕАЭС не уплачен в срок",
      detail: "Ввоз от {date}: {sum} сом надо было уплатить до {due}. За просрочку начисляются проценты; отчёт STI-123 за этот месяц должен быть подан.",
      vars: { date: ru(p.date), sum: fmt(p.left), due: ru(eaeuDue(p.date)) },
      date: p.date, amount: p.left, entryIds: [p.id] });
  }

  // ── 6. закупка в валюте без оформления ввоза ────────────────────────────
  const fxBuys = sorted.filter((e) => inPeriod(e.date) && !(e.sourceRef ?? "").startsWith("import:")
    && e.lines.some((l) => l.account === "3110" && l.credit > 0 && l.currency && l.currency !== "KGS")
    && e.lines.some((l) => /^1[67]\d\d$/.test(l.account) && l.debit > 0)
    && !e.lines.some((l) => l.account === "1540" || l.account === "3490"));
  if (fxBuys.length) {
    const sum = r2(fxBuys.reduce((s, e) => s + e.lines.filter((l) => l.account === "3110").reduce((a, l) => a + l.credit, 0), 0));
    risks.push({ id: "fx-purchase", kind: "fx-purchase", severity: "medium", title: "Товар от иностранного поставщика без НДС при ввозе: {n}",
      detail: "Поступления на {sum} сом в валюте проведены как обычная покупка — без НДС при ввозе и пошлины. Если товар ввезён из-за границы, оформите его через «Ввоз товара»: иначе НДС при ввозе не начислен и не заявлен.",
      vars: { n: fxBuys.length, sum: fmt(sum) },
      date: fxBuys[0].date, amount: sum, entryIds: fxBuys.slice(0, 5).map((e) => e.id) });
  }

  // ── 7. крупные расчёты без ИНН ─────────────────────────────────────────
  const noInn = new Map<string, { name: string; sum: number; ids: string[]; date: string; inn: boolean; foreign: boolean }>();
  for (const e of sorted) {
    if (!inPeriod(e.date)) continue;
    for (const l of e.lines) {
      if (!l.party || /^(33|34|35|41)/.test(l.account)) continue;
      const k = l.party.trim().toLowerCase();
      const b = noInn.get(k) ?? noInn.set(k, { name: l.party.trim(), sum: 0, ids: [], date: e.date, inn: false, foreign: false }).get(k)!;
      if (l.partyInn) b.inn = true;
      // расчёты в валюте — иностранный контрагент: у него не ИНН КР, а свой номер
      if (l.currency && l.currency !== "KGS") b.foreign = true;
      b.sum = r2(b.sum + Math.max(l.debit, l.credit)); if (b.ids.length < 5 && !b.ids.includes(e.id)) b.ids.push(e.id);
    }
  }
  const missing = [...noInn.values()].filter((b) => !b.inn && !b.foreign && b.sum >= innThreshold && !SKIP_NO_INN.test(b.name) && !/[a-z]{3}/i.test(b.name.replace(/[а-яё]/gi, "")));
  for (const b of missing.sort((a, c) => c.sum - a.sum).slice(0, 10)) {
    risks.push({ id: `inn-${b.name}`, kind: "no-inn", severity: "info", title: "Нет ИНН контрагента: {name}",
      detail: "Обороты {sum} сом, а ИНН нигде не указан. Без ИНН нельзя выписать или принять ЭСФ, и вычет НДС по таким покупкам ГНС не примет.", vars: { name: b.name, sum: fmt(b.sum) }, date: b.date, amount: b.sum, entryIds: b.ids });
  }

  const order: Record<RiskSeverity, number> = { high: 0, medium: 1, info: 2 };
  risks.sort((a, b) => order[a.severity] - order[b.severity] || b.amount - a.amount);
  return { risks, vat, checked: sorted.filter((e) => inPeriod(e.date)).length, vatPayer };
}

/** Все тексты модуля для перевода (проверка полноты кыргызского словаря). */
export const RISK_TEXTS: string[] = [
  "Продано больше, чем было на складе: {item}",
  "{date} продано {qty} {unit}, а по учёту на складе было {left}. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз.",
  "{date} продано {qty} {unit}, а по учёту на складе ничего не было. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз.",
  "Продано больше, чем поступило: {item}",
  "На {date} остаток по учёту стал {qty} — товар списан или продан раньше, чем оприходован. Для ГНС это признак продажи товара без документов о поступлении: проверьте, не пропущено ли поступление или ввоз.",
  "Продажа ниже себестоимости: {item}",
  "Продаж дешевле средней себестоимости {cost} сом за единицу: {n}, до {pct} % ниже; недополученная выручка {loss} сом. При заниженной цене ГНС может доначислить налоги исходя из рыночной — держите обоснование (уценка, акция, брак).",
  "НДС к возмещению три месяца подряд",
  "Вычеты больше начисленного НДС в месяцах {months}, превышение {sum} сом. Постоянное превышение вычетов — частый повод для камеральной проверки: покупки не превращаются в продажи или выручка показана не вся.",
  "Высокая доля вычетов НДС: {month}",
  "Вычеты {input} сом — {share} % от начисленного НДС {output} сом. К уплате почти ничего: ГНС сравнивает долю вычетов со средней по отрасли.",
  "Реализация без НДС, операций: {n}",
  "Выручка {sum} сом проведена без строки НДС (3430), хотя компания начисляет НДС. Если это не освобождённая реализация (экспорт, льгота), НДС с неё будет доначислен.",
  "НДС при ввозе из ЕАЭС не уплачен в срок",
  "Ввоз от {date}: {sum} сом надо было уплатить до {due}. За просрочку начисляются проценты; отчёт STI-123 за этот месяц должен быть подан.",
  "Товар от иностранного поставщика без НДС при ввозе: {n}",
  "Поступления на {sum} сом в валюте проведены как обычная покупка — без НДС при ввозе и пошлины. Если товар ввезён из-за границы, оформите его через «Ввоз товара»: иначе НДС при ввозе не начислен и не заявлен.",
  "Нет ИНН контрагента: {name}",
  "Обороты {sum} сом, а ИНН нигде не указан. Без ИНН нельзя выписать или принять ЭСФ, и вычет НДС по таким покупкам ГНС не примет.",
];
