// ════════════════════════════════════════════════════════════════════════
// lib/monitor/chain.ts — журнал действий как цепочка хэшей.
//
// Каждая запись хранит SHA-256 от предыдущей записи и своих полей (кто,
// что, компания, подробности, время). Если кто-то изменит или удалит
// запись в середине журнала прямо в базе, проверка покажет разрыв на этом
// месте. Удаление самых старых записей по сроку хранения разрывом не
// считается: цепочка просто начинается позже.
// Отметки «был на сайте» (active_day) в цепочку не входят — это метрика,
// не аудит, и они чистятся раньше.
// Чистые функции + запись под блокировкой (одна цепочка на всю базу).
// ════════════════════════════════════════════════════════════════════════

import { createHash, randomUUID } from "node:crypto";

export const GENESIS = "0".repeat(64);
export const UNCHAINED = ["active_day"];

/** JSON с упорядоченными ключами: одинаковый текст до и после хранения в jsonb. */
export function canonical(v: unknown): string {
  if (v === null || v === undefined) return "null";
  if (Array.isArray(v)) return `[${v.map(canonical).join(",")}]`;
  if (typeof v === "object") return `{${Object.keys(v as object).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canonical((v as Record<string, unknown>)[k])}`).join(",")}}`;
  return JSON.stringify(v);
}

export interface ChainFields { id: string; actor: string | null; action: string; companyId: string | null; details: unknown; createdAt: Date | string }

export function rowHash(prevHash: string, r: ChainFields): string {
  const at = typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString();
  return createHash("sha256").update(canonical([prevHash, r.id, r.actor, r.action, r.companyId, r.details ?? null, at])).digest("hex");
}

export interface ChainRow extends ChainFields { prevHash: string | null; hash: string | null }
export interface ChainBreak { id: string; at: string; action: string; kind: "changed" | "gap" }
export interface ChainReport { checked: number; firstAt: string | null; lastAt: string | null; head: string | null; breaks: ChainBreak[]; startsAtGenesis: boolean }

/**
 * Проверка по порядку записи. changed — поля записи не дают её хэш (изменена);
 * gap — запись ссылается не на предыдущую (между ними что-то удалено или вставлено).
 * Первая проверенная запись может ссылаться на удалённую по сроку — это не разрыв.
 */
export function verifyRows(rows: ChainRow[], state: { prev: string | null; report: ChainReport }): void {
  const rep = state.report;
  for (const r of rows) {
    if (!r.hash) continue;
    const at = typeof r.createdAt === "string" ? r.createdAt : r.createdAt.toISOString();
    if (rep.checked === 0) { rep.firstAt = at; rep.startsAtGenesis = r.prevHash === GENESIS; }
    else if (r.prevHash !== state.prev && rep.breaks.length < 50) rep.breaks.push({ id: r.id, at, action: r.action, kind: "gap" });
    if (rowHash(r.prevHash ?? GENESIS, r) !== r.hash && rep.breaks.length < 50) rep.breaks.push({ id: r.id, at, action: r.action, kind: "changed" });
    state.prev = r.hash; rep.checked++; rep.lastAt = at; rep.head = r.hash;
  }
}

export const newReport = (): ChainReport => ({ checked: 0, firstAt: null, lastAt: null, head: null, breaks: [], startsAtGenesis: false });

/** Поля новой записи: id и время задаются здесь, чтобы войти в хэш. */
export function nextRow(prev: { hash: string; createdAt: Date } | null, data: { actor: string | null; action: string; companyId: string | null; details: unknown }, now = new Date()) {
  // время строго растёт: порядок цепочки = порядок по времени
  const createdAt = prev && now.getTime() <= prev.createdAt.getTime() ? new Date(prev.createdAt.getTime() + 1) : now;
  const details = data.details === undefined ? null : JSON.parse(JSON.stringify(data.details));
  const prevHash = prev?.hash ?? GENESIS;
  const row = { id: randomUUID(), actor: data.actor, action: data.action, companyId: data.companyId, details, createdAt };
  return { ...row, prevHash, hash: rowHash(prevHash, row) };
}
