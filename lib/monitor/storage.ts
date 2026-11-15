// ════════════════════════════════════════════════════════════════════════
// lib/monitor/storage.ts — место в базе данных.
//
// На бесплатном тарифе Neon у проекта 1 ГБ: когда база его превышает,
// любая запись, которая увеличивает объём, падает. Поэтому:
//   • администратор видит размер базы и самые большие таблицы;
//   • после 80 % лимита ночные задачи, которые только наполняют базу
//     (новости, правовая база, наука), пропускаются;
//   • после 92 % не принимаются новые сканы к проводкам — место остаётся
//     под сами проводки и документы.
// Лимит — FL_DB_LIMIT_MB (по умолчанию 1024).
// ════════════════════════════════════════════════════════════════════════

import { prisma } from "@/lib/db";
import { HttpError } from "@/lib/auth/server";

export const MB = 1024 * 1024;
export const WARN_SHARE = 0.8;
export const FULL_SHARE = 0.92;

export type StorageLevel = "ok" | "warn" | "full";
export interface StorageState { bytes: number; limit: number; share: number; level: StorageLevel }
export interface TableSize { table: string; bytes: number; rows: number }

export function limitBytes(env: string | undefined = process.env.FL_DB_LIMIT_MB): number {
  const mb = Number(env);
  return (Number.isFinite(mb) && mb > 0 ? mb : 1024) * MB;
}

export function levelOf(bytes: number, limit: number): StorageState {
  const share = limit > 0 ? bytes / limit : 0;
  return { bytes, limit, share, level: share >= FULL_SHARE ? "full" : share >= WARN_SHARE ? "warn" : "ok" };
}

export function fmtBytes(b: number): string {
  if (b >= 1024 * MB) return `${(b / 1024 / MB).toFixed(2)} ГБ`;
  if (b >= MB) return `${(b / MB).toFixed(b >= 100 * MB ? 0 : 1)} МБ`;
  return `${Math.max(1, Math.round(b / 1024))} КБ`;
}

let cache: { at: number; state: StorageState } | null = null;

/** Размер базы (кэш на 5 минут, чтобы не спрашивать Postgres на каждый запрос). */
export async function storageState(fresh = false): Promise<StorageState> {
  if (!fresh && cache && Date.now() - cache.at < 5 * 60_000) return cache.state;
  const [r] = await prisma.$queryRaw<Array<{ size: bigint }>>`SELECT pg_database_size(current_database()) AS size`;
  const state = levelOf(Number(r.size), limitBytes());
  cache = { at: Date.now(), state };
  return state;
}

/** Можно ли сегодня наполнять базу необязательным (новости, редакции законов, наука). */
export async function roomForExtras(): Promise<boolean> {
  try { return (await storageState()).level === "ok"; } catch { return true; }
}

/** Перед записью файлов: при почти полной базе — понятная ошибка вместо падения записи. */
export async function assertRoom(what = "файл") {
  let s: StorageState;
  try { s = await storageState(); } catch { return; }
  if (s.level === "full") throw new HttpError(507, `База данных почти заполнена (${fmtBytes(s.bytes)} из ${fmtBytes(s.limit)}) — ${what} сейчас не сохранить. Администратору: «Админ» → «База данных» → «Очистить старое».`);
}

/** Самые большие таблицы: данные, индексы и TOAST вместе. */
export async function tableSizes(limit = 20): Promise<TableSize[]> {
  const rows = await prisma.$queryRaw<Array<{ table: string; bytes: bigint; rows: bigint }>>`
    SELECT c.relname::text AS "table", pg_total_relation_size(c.oid) AS bytes, GREATEST(c.reltuples, 0)::bigint AS rows
    FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE c.relkind = 'r' AND n.nspname = current_schema()
    ORDER BY pg_total_relation_size(c.oid) DESC LIMIT ${limit}`;
  return rows.map((r) => ({ table: r.table, bytes: Number(r.bytes), rows: Number(r.rows) }));
}

export function resetStorageCache() { cache = null; }
