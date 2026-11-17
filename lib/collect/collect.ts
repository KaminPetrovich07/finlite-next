// ════════════════════════════════════════════════════════════════════════
// lib/collect/collect.ts — сбор отчётности с предприятий.
//
// Ведомство объявляет сбор по группе предприятий (период и срок), каждое
// предприятие заполняет отчёт онлайн или загружает Excel по шаблону FinLite
// и сдаёт с указанием подписанта. Сданный отчёт закрыт для правки; ведомство
// принимает его или возвращает на доработку с причиной. Принятые и сданные
// цифры сразу попадают в портфель и диагностику.
// Чистые функции: статусы, сводка, проверки перед сдачей, напоминания.
// ════════════════════════════════════════════════════════════════════════

import { LINES, checkPeriod, type LineKey, type Msg, type Values } from "@/lib/reported/reported";

export type SubStatus = "draft" | "submitted" | "returned" | "accepted";
export type RowStatus = "none" | SubStatus;

export const STATUS_LABEL: Record<RowStatus, string> = {
  none: "не начат", draft: "заполняется", submitted: "сдан", returned: "на доработке", accepted: "принят",
};

/** Цвет метки статуса (классы Tailwind). */
export const STATUS_TONE: Record<RowStatus, string> = { none: "bg-fl-surface-2 text-fl-cream/60", draft: "bg-fl-info/15 text-fl-info", submitted: "bg-fl-gold/15 text-fl-gold", returned: "bg-fl-amber/15 text-fl-amber", accepted: "bg-fl-green/15 text-fl-green" };

/** Сдан ли отчёт (для сводки и портфеля). */
export const isIn = (s: RowStatus) => s === "submitted" || s === "accepted";

const dayNum = (d: string) => Date.parse(`${d}T00:00:00Z`) / 864e5;
export const daysLeft = (deadline: string, today: string) => Math.round(dayNum(deadline) - dayNum(today));

/** Просрочен: срок прошёл, а отчёт не сдан. */
export const isOverdue = (s: RowStatus, deadline: string, today: string) => !isIn(s) && daysLeft(deadline, today) < 0;

export interface CampaignStats { total: number; in: number; accepted: number; submitted: number; draft: number; returned: number; none: number; overdue: number; pct: number }

export function campaignStats(rows: Array<{ status: RowStatus }>, deadline: string, today: string): CampaignStats {
  const n = (s: RowStatus) => rows.filter((r) => r.status === s).length;
  const inn = rows.filter((r) => isIn(r.status)).length;
  return {
    total: rows.length, in: inn, accepted: n("accepted"), submitted: n("submitted"), draft: n("draft"), returned: n("returned"), none: n("none"),
    overdue: rows.filter((r) => isOverdue(r.status, deadline, today)).length, pct: rows.length ? Math.round((inn / rows.length) * 100) : 0,
  };
}

/** Итоговые строки формы считаются сами — предприятие их не вводит. */
export function withControls(v: Values): Values {
  const g = (k: LineKey) => v[k] ?? 0;
  const currentTotal = g("cash") + g("investments") + g("receivables") + g("inventory") + g("otherCurrent");
  const assetsTotal = currentTotal + g("nonCurrent");
  return {
    ...v, currentTotal, assetsTotal, equity: assetsTotal - g("currentLiabilities") - g("longLiabilities"),
    operatingProfit: g("revenue") - g("cogs") - g("opex"),
  };
}

/** Строки, без которых отчёт не сдаётся (ноль — допустимое значение). */
export const REQUIRED: LineKey[] = ["cash", "receivables", "nonCurrent", "currentLiabilities", "revenue", "netProfit"];

/**
 * Что мешает сдать: обязательные строки не заполнены, части больше целого,
 * отрицательные суммы там, где их не бывает. Итоги считает форма, поэтому
 * расхождений итогов здесь не бывает.
 */
export function blockingIssues(values: Values, periodEnd: string): Msg[] {
  const out: Msg[] = [];
  for (const k of REQUIRED) if (values[k] == null) {
    const l = LINES.find((x) => x.key === k)!;
    out.push({ text: "Не заполнена строка {code} «{label}»", vars: { code: l.code, label: l.label } });
  }
  const checks = checkPeriod({ date: periodEnd, values: withControls(values) });
  // в онлайн-форме итоги считаются сами — всё, что нашла проверка, относится к введённым строкам
  return [...out, ...checks];
}

/** Напоминание по сроку: за 3 дня, в день срока и на следующий день после. */
export function reminderKind(deadline: string, today: string): "soon" | "today" | "overdue" | null {
  const d = daysLeft(deadline, today);
  return d === 3 ? "soon" : d === 0 ? "today" : d === -1 ? "overdue" : null;
}

/** Название сбора по дате окончания периода: «Отчётность за 3 квартал 2026». */
export function campaignTitle(periodEnd: string): string {
  const [y, m] = periodEnd.split("-").map(Number);
  return m % 3 === 0 ? `Отчётность за ${m / 3} квартал ${y}` : `Отчётность на ${periodEnd.split("-").reverse().join(".")}`;
}

/** Только допустимые ключи и конечные числа — значения из формы или из Excel. */
export function cleanValues(input: unknown): Values {
  const out: Values = {};
  if (!input || typeof input !== "object") return out;
  const keys = new Set(LINES.filter((l) => !l.control).map((l) => l.key));
  for (const [k, v] of Object.entries(input as Record<string, unknown>)) {
    if (!keys.has(k as LineKey)) continue;
    if (typeof v === "number" && Number.isFinite(v) && Math.abs(v) < 1e13) out[k as LineKey] = v;
  }
  return out;
}

export const COLLECT_TEXTS = [
  ...Object.values(STATUS_LABEL), "Не заполнена строка {code} «{label}»",
];
