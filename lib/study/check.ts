// Автопроверка учебных заданий: обороты по счетам за период у студента сравниваются с эталоном.
// Порядок и группировка проводок не важны — важно, что в итоге оказалось на счетах.
import type { LedgerEntry } from "@/lib/ledger/types";

export type Turnovers = Record<string, { d: number; c: number }>;

/** Служебные проводки, которые студент делает кнопками, а не по заданию: закрытие, налоги, переоценка… */
export const SKIP_SOURCES = new Set(["opening", "closing", "tax", "fx", "depreciation", "cogs"]);
export const TOLERANCE = 0.01;

const r2 = (n: number) => Math.round(n * 100) / 100;

export function turnovers(entries: LedgerEntry[], from: string, to: string): Turnovers {
  const out: Turnovers = {};
  for (const e of entries) {
    if (e.date < from || e.date > to || SKIP_SOURCES.has(e.source)) continue;
    for (const l of e.lines) {
      const t = (out[l.account] ??= { d: 0, c: 0 });
      t.d = r2(t.d + (l.debit || 0)); t.c = r2(t.c + (l.credit || 0));
    }
  }
  for (const [k, v] of Object.entries(out)) if (!v.d && !v.c) delete out[k];
  return out;
}

export interface CheckRow { account: string; expected: { d: number; c: number } | null; actual: { d: number; c: number }; ok: boolean; hint: string }
export interface CheckResult { score: number; total: number; matched: number; rows: CheckRow[]; verdict: string }

function hint(exp: { d: number; c: number } | null, act: { d: number; c: number }): string {
  if (!exp) return "в задании этого счёта нет";
  if (!act.d && !act.c) return "операций по счёту нет";
  const parts: string[] = [];
  const side = (e: number, a: number, name: string) => { if (Math.abs(e - a) > TOLERANCE) parts.push(`${name} ${a > e ? "больше" : "меньше"} нужного`); };
  side(exp.d, act.d, "дебет"); side(exp.c, act.c, "кредит");
  return parts.join(", ");
}

/** Сравнить обороты студента с эталоном. Балл — доля счетов, совпавших по дебету и кредиту (лишние счета тоже считаются ошибкой). */
export function compare(key: Turnovers, actual: Turnovers): CheckResult {
  const accounts = [...new Set([...Object.keys(key), ...Object.keys(actual)])].sort();
  const rows: CheckRow[] = accounts.map((account) => {
    const expected = key[account] ?? null;
    const act = actual[account] ?? { d: 0, c: 0 };
    const ok = !!expected && Math.abs(expected.d - act.d) <= TOLERANCE && Math.abs(expected.c - act.c) <= TOLERANCE;
    return { account, expected, actual: act, ok, hint: ok ? "" : hint(expected, act) };
  });
  const matched = rows.filter((r) => r.ok).length, total = rows.length;
  const score = total ? Math.round((matched / total) * 1000) / 10 : 0;
  const verdict = !Object.keys(actual).length ? "Операций за период ещё нет"
    : score === 100 ? "Всё верно: обороты по всем счетам совпадают с эталоном"
    : `Совпало ${matched} из ${total} счетов`;
  return { score, total, matched, rows, verdict };
}

/** То, что видит студент, если преподаватель не открыл ответы: без эталонных сумм. */
export function forStudent(r: CheckResult, showAnswers: boolean): CheckResult {
  if (showAnswers) return r;
  return { ...r, rows: r.rows.map((x) => ({ ...x, expected: x.expected ? { d: NaN, c: NaN } : null })) };
}

/** Код группы: 6 знаков без похожих друг на друга букв и цифр. */
export function joinCode(rand: (n: number) => number = (n) => Math.floor(Math.random() * n)): string {
  const A = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  return Array.from({ length: 6 }, () => A[rand(A.length)]).join("");
}

export function gradesCsv(rows: Array<{ name: string; email: string; score: number | null; checks: number; checkedAt: Date | null; started: boolean }>): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const lines = ["Студент;Почта;Балл, %;Проверок;Последняя проверка;Статус"];
  for (const r of rows) lines.push([q(r.name), q(r.email), r.score == null ? "" : String(r.score).replace(".", ","), r.checks, r.checkedAt ? r.checkedAt.toISOString().slice(0, 16).replace("T", " ") : "", r.started ? (r.score === 100 ? "выполнено" : "в работе") : "не начато"].join(";"));
  return "﻿" + lines.join("\r\n");
}
