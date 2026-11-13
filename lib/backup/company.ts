// Резервная копия компании одним файлом: всё, что хранится по компании, без служебных
// полей (id, companyId, даты записи). Файл — JSON, сжатый gzip (.finlite.json.gz).
// Чистые функции: собрать копию из строк базы и разобрать её обратно в строки для вставки.

export const BACKUP_FORMAT = "finlite-company";
export const BACKUP_VERSION = 1;
export const MAX_ENTRIES = 200_000;

/** Записи компании, которые не переносим: подписки на напоминания и коды привязки бота — личные. */
export const SKIP_RECORD_KINDS = new Set(["calendar"]);

type Row = Record<string, unknown>;
export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  company: { name: string; inn: string | null; activity: string | null; defaultRegime: string | null; patentAmount: number };
  entries: Array<Row & { bankRef?: string | null; lines: Row[] }>;
  bankTransactions: Array<Row & { ref: string }>;
  records: Array<{ kind: string; key: string; data: unknown }>;
  esgReports: Row[];
  reports: Row[];
}

const SERVICE = new Set(["id", "companyId", "entryId", "createdAt", "updatedAt", "bankTransactionId", "journalEntry"]);
/** Decimal и Date → строки; служебные поля — прочь. */
function plain(r: Row): Row {
  const o: Row = {};
  for (const [k, v] of Object.entries(r)) {
    if (SERVICE.has(k) || v === undefined) continue;
    if (v instanceof Date) o[k] = v.toISOString();
    else if (v && typeof v === "object" && typeof (v as { toFixed?: unknown }).toFixed === "function" && !Array.isArray(v)) o[k] = String(v); // Prisma.Decimal
    else o[k] = v;
  }
  return o;
}

export interface DbRows {
  company: { name: string; inn: string | null; activity: string | null; defaultRegime: string | null; patentAmount: number };
  entries: Array<Row & { id: string; bankTransactionId: string | null; lines: Row[] }>;
  bankTransactions: Array<Row & { id: string }>;
  records: Array<{ kind: string; key: string; data: unknown }>;
  esgReports: Row[];
  reports: Row[];
}

export function buildBackup(db: DbRows, now = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT, version: BACKUP_VERSION, exportedAt: now.toISOString(),
    company: db.company,
    bankTransactions: db.bankTransactions.map((t) => ({ ...plain(t), ref: t.id })),
    entries: db.entries.map((e) => ({ ...plain(e), bankRef: e.bankTransactionId, lines: e.lines.map(plain) })),
    records: db.records.filter((r) => !SKIP_RECORD_KINDS.has(r.kind)).map((r) => ({ kind: r.kind, key: r.key, data: r.data })),
    esgReports: db.esgReports.map(plain),
    reports: db.reports.map(plain),
  };
}

export class BackupError extends Error {}

const DATE_FIELDS = new Set(["date", "txDate", "periodFrom", "periodTo"]);
const isObj = (v: unknown): v is Row => !!v && typeof v === "object" && !Array.isArray(v);
const arr = (v: unknown, name: string): Row[] => { if (v === undefined) return []; if (!Array.isArray(v) || !v.every(isObj)) throw new BackupError(`Повреждён раздел «${name}»`); return v as Row[]; };
function dates(r: Row): Row {
  const o: Row = { ...r };
  for (const k of DATE_FIELDS) if (typeof o[k] === "string") { const d = new Date(o[k] as string); if (isNaN(+d)) throw new BackupError(`Неверная дата: ${o[k]}`); o[k] = d; }
  return o;
}
const money = (v: unknown) => { const s = String(v ?? "0"); if (!/^-?\d+(\.\d+)?$/.test(s)) throw new BackupError(`Неверная сумма: ${s}`); return s; };

export interface ImportPlan {
  company: BackupFile["company"];
  bankTransactions: Row[];   // с готовыми id
  entries: Row[];            // с готовыми id и bankTransactionId
  lines: Row[];              // с entryId
  records: Array<{ kind: string; key: string; data: unknown }>;
  esgReports: Row[];
  reports: Row[];
  stats: { entries: number; lines: number; bank: number; records: number };
}

/** Проверить файл и подготовить строки для вставки в новую компанию. `newId` — генератор идентификаторов. */
export function planImport(raw: unknown, newId: () => string): ImportPlan {
  if (!isObj(raw) || raw.format !== BACKUP_FORMAT) throw new BackupError("Это не файл резервной копии FinLite");
  if (typeof raw.version !== "number" || raw.version > BACKUP_VERSION) throw new BackupError("Файл создан более новой версией программы — обновите страницу и попробуйте снова");
  const c = raw.company;
  if (!isObj(c) || typeof c.name !== "string" || !c.name.trim()) throw new BackupError("В файле нет названия компании");
  const entriesIn = arr(raw.entries, "проводки");
  if (entriesIn.length > MAX_ENTRIES) throw new BackupError(`Слишком много проводок: ${entriesIn.length}`);

  const bankIds = new Map<string, string>();
  const bankTransactions = arr(raw.bankTransactions, "банковские выписки").map((t) => {
    const { ref, ...rest } = t;
    const id = newId();
    if (typeof ref === "string") bankIds.set(ref, id);
    return { ...dates(rest), amount: Number(rest.amount ?? 0), id };
  });
  const entries: Row[] = [], lines: Row[] = [];
  for (const e of entriesIn) {
    const { lines: ls, bankRef, ...rest } = e;
    const id = newId();
    const bankTransactionId = typeof bankRef === "string" ? bankIds.get(bankRef) ?? null : null;
    entries.push({ ...dates(rest), id, bankTransactionId });
    let dr = 0, cr = 0;
    for (const l of arr(ls, "строки проводок")) {
      const line: Row = { ...l, id: newId(), entryId: id, debit: money(l.debit), credit: money(l.credit) };
      if (l.qty != null) line.qty = money(l.qty);
      if (l.amountCur != null) line.amountCur = money(l.amountCur);
      if (typeof line.accountCode !== "string") throw new BackupError("Строка проводки без счёта");
      dr += Math.round(Number(line.debit) * 100); cr += Math.round(Number(line.credit) * 100);
      lines.push(line);
    }
    if (dr !== cr) throw new BackupError(`Проводка «${String(rest.description ?? "").slice(0, 60)}» не сходится: дебет ≠ кредит`);
  }
  const records = arr(raw.records, "справочники").filter((r) => typeof r.kind === "string" && typeof r.key === "string" && !SKIP_RECORD_KINDS.has(r.kind as string)).map((r) => ({ kind: r.kind as string, key: r.key as string, data: r.data ?? {} }));
  return {
    company: { name: c.name.trim().slice(0, 200), inn: typeof c.inn === "string" ? c.inn : null, activity: typeof c.activity === "string" ? c.activity : null, defaultRegime: typeof c.defaultRegime === "string" ? c.defaultRegime : null, patentAmount: Number(c.patentAmount ?? 0) || 0 },
    bankTransactions, entries, lines, records,
    esgReports: arr(raw.esgReports, "ESG").map(dates),
    reports: arr(raw.reports, "отчёты калькулятора").map(dates),
    stats: { entries: entries.length, lines: lines.length, bank: bankTransactions.length, records: records.length },
  };
}

export const backupFileName = (name: string, now = new Date()) =>
  `${name.replace(/[«»"]/g, "").replace(/[^\p{L}\p{N}]+/gu, "_").replace(/^_|_$/g, "").slice(0, 60) || "company"}_${now.toISOString().slice(0, 10)}.finlite.json.gz`;
