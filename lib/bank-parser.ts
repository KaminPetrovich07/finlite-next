// ════════════════════════════════════════════════════════════════════════
// lib/bank-parser.ts
// Parses bank statement exports (XLSX/CSV/TXT) into a normalized
// transaction list, without hardcoding exact column positions per bank —
// real МБанк/Бакай Банк/Элдик export layouts weren't available to test
// against, so this auto-detects columns by header name instead of
// assuming a fixed schema. More robust to format drift, but should be
// validated against a real export and the HEADER_ALIASES below extended
// if a real file's headers aren't recognized.
// ════════════════════════════════════════════════════════════════════════

import * as XLSX from "xlsx";
import Papa from "papaparse";

export interface ParsedTransaction {
  date: Date;
  amount: number; // positive = income (приход), negative = expense (расход)
  description: string;
  raw: Record<string, unknown>;
}

export interface ParseResult {
  transactions: ParsedTransaction[];
  warnings: string[];
  detectedColumns: { date?: string; amount?: string; income?: string; expense?: string; description?: string };
}

const DATE_HEADER_ALIASES = ["дата", "дата операции", "дата платежа", "күнү", "date"];
const DESC_HEADER_ALIASES = [
  "назначение платежа", "назначение", "описание", "комментарий", "детали",
  "operation", "details", "description", "түшүндүрмө",
];
const AMOUNT_HEADER_ALIASES = ["сумма", "сумма операции", "amount", "сумма транзакции"];
const INCOME_HEADER_ALIASES = ["приход", "зачисление", "поступление", "income", "credit", "кирешеси"];
const EXPENSE_HEADER_ALIASES = ["расход", "списание", "выдача", "expense", "debit", "чыгашасы"];

function normalizeHeader(h: string): string {
  return h.trim().toLowerCase().replace(/\s+/g, " ");
}

function findColumn(headers: string[], aliases: string[]): string | undefined {
  const normalized = headers.map(normalizeHeader);
  for (const alias of aliases) {
    const idx = normalized.findIndex((h) => h === alias || h.includes(alias));
    if (idx !== -1) return headers[idx];
  }
  return undefined;
}

function parseDate(value: unknown): Date | null {
  if (value instanceof Date) return value;
  if (typeof value === "number") {
    // Excel serial date
    const epoch = new Date(Date.UTC(1899, 11, 30));
    return new Date(epoch.getTime() + value * 86400000);
  }
  if (typeof value === "string") {
    const s = value.trim();
    // dd.mm.yyyy or dd/mm/yyyy
    const dmy = s.match(/^(\d{1,2})[.\/](\d{1,2})[.\/](\d{2,4})/);
    if (dmy) {
      const [, d, m, y] = dmy;
      const year = y.length === 2 ? 2000 + Number(y) : Number(y);
      return new Date(Date.UTC(year, Number(m) - 1, Number(d)));
    }
    // yyyy-mm-dd
    const ymd = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
    if (ymd) {
      const [, y, m, d] = ymd;
      return new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
    }
    const parsed = new Date(s);
    if (!Number.isNaN(parsed.getTime())) return parsed;
  }
  return null;
}

function parseAmount(value: unknown): number {
  if (typeof value === "number") return value;
  if (typeof value === "string") {
    const cleaned = value.replace(/[\s\u202F\u00A0]/g, "").replace(",", ".").replace(/[^\d.-]/g, "");
    const n = parseFloat(cleaned);
    return Number.isFinite(n) ? n : 0;
  }
  return 0;
}

function rowsToTransactions(headers: string[], rows: Record<string, unknown>[]): ParseResult {
  const warnings: string[] = [];
  const dateCol = findColumn(headers, DATE_HEADER_ALIASES);
  const descCol = findColumn(headers, DESC_HEADER_ALIASES);
  const amountCol = findColumn(headers, AMOUNT_HEADER_ALIASES);
  const incomeCol = findColumn(headers, INCOME_HEADER_ALIASES);
  const expenseCol = findColumn(headers, EXPENSE_HEADER_ALIASES);

  if (!dateCol) warnings.push("Не найдена колонка с датой — проверь заголовки файла");
  if (!amountCol && !(incomeCol && expenseCol)) {
    warnings.push("Не найдена колонка с суммой (ни единая 'Сумма', ни пара 'Приход'/'Расход')");
  }
  if (!descCol) warnings.push("Не найдена колонка с описанием/назначением платежа — категоризация будет менее точной");

  const transactions: ParsedTransaction[] = [];

  for (const row of rows) {
    const dateRaw = dateCol ? row[dateCol] : undefined;
    const date = parseDate(dateRaw);
    if (!date) continue; // skip header repeats / summary rows / empty lines

    let amount = 0;
    if (amountCol) {
      amount = parseAmount(row[amountCol]);
    } else if (incomeCol && expenseCol) {
      const inc = parseAmount(row[incomeCol]);
      const exp = parseAmount(row[expenseCol]);
      amount = inc - Math.abs(exp);
    }
    if (amount === 0 && !amountCol && !incomeCol) continue;

    const description = descCol ? String(row[descCol] ?? "").trim() : "";

    transactions.push({ date, amount, description, raw: row });
  }

  return {
    transactions,
    warnings,
    detectedColumns: { date: dateCol, amount: amountCol, income: incomeCol, expense: expenseCol, description: descCol },
  };
}

export function parseXlsx(buffer: ArrayBuffer): ParseResult {
  const wb = XLSX.read(buffer, { type: "array", cellDates: true });
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });
  const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
  return rowsToTransactions(headers, rows);
}

export function parseCsv(text: string): ParseResult {
  const result = Papa.parse<Record<string, unknown>>(text, {
    header: true,
    skipEmptyLines: true,
    delimiter: "", // auto-detect , or ;
  });
  const headers = result.meta.fields ?? [];
  return rowsToTransactions(headers, result.data);
}

/**
 * Best-effort plain-text parser for statement exports that aren't proper
 * CSV/XLSX (some mobile banking "share as text" exports). Looks for a
 * date at the start of a line, an amount somewhere in the line, and
 * treats the remainder as description. This is the least reliable path —
 * flagged clearly in the UI — and should be replaced with a real-format
 * parser once an actual export is available to inspect.
 */
export function parseTxt(text: string): ParseResult {
  const warnings: string[] = ["TXT-формат распознан эвристически — проверь результат вручную"];
  const transactions: ParsedTransaction[] = [];
  const lines = text.split(/\r?\n/).filter((l) => l.trim());

  const lineRe = /^(\d{1,2}[.\/]\d{1,2}[.\/]\d{2,4})\s+(.*?)\s+(-?[\d\s\u202F]+[.,]?\d*)\s*(?:сом|som|kgs)?\s*$/i;

  for (const line of lines) {
    const m = line.match(lineRe);
    if (!m) continue;
    const date = parseDate(m[1]);
    if (!date) continue;
    transactions.push({
      date,
      amount: parseAmount(m[3]),
      description: m[2].trim(),
      raw: { line },
    });
  }

  if (transactions.length === 0) {
    warnings.push("Не удалось распознать ни одной строки — пришли пример файла, чтобы уточнить формат");
  }

  return { transactions, warnings, detectedColumns: {} };
}

export function parseStatementFile(filename: string, buffer: ArrayBuffer): ParseResult {
  const ext = filename.toLowerCase().split(".").pop();
  if (ext === "xlsx" || ext === "xls") return parseXlsx(buffer);
  if (ext === "csv") return parseCsv(new TextDecoder("utf-8").decode(buffer));
  if (ext === "txt") return parseTxt(new TextDecoder("utf-8").decode(buffer));
  throw new Error(`Неподдерживаемый формат файла: .${ext}`);
}

// ── Контрагент из строки выписки ──────────────────────────────────────────
// Выписки банков КР обычно содержат наименование и ИНН плательщика или
// получателя. Колонка ищется по заголовку; если есть обе — для прихода берём
// плательщика, для расхода получателя. Колонки банка, счёта и БИК пропускаются.
const PARTY_ALIASES = ["контрагент", "плательщик", "получатель", "корреспондент", "отправитель", "наименование", "counterparty", "beneficiary", "payer", "кому", "от кого"];
const SKIP_PARTY = /банк|сч[её]т|бик|инн|код|bank|account|дата|сумма|назнач/;

export function partyFromRaw(raw: unknown, amount: number): { party: string; partyInn: string } | null {
  if (!raw || typeof raw !== "object") return null;
  const cols = Object.keys(raw as Record<string, unknown>);
  const val = (k: string) => String((raw as Record<string, unknown>)[k] ?? "").trim();
  const norm = (h: string) => normalizeHeader(h);
  const names = cols.filter((h) => PARTY_ALIASES.some((a) => norm(h).includes(a)) && !SKIP_PARTY.test(norm(h)) && val(h));
  const inns = cols.filter((h) => /инн|inn|tin/.test(norm(h)) && /^\d{10,14}$/.test(val(h).replace(/\s/g, "")));
  const side = amount >= 0 ? /плательщ|отправит|от кого|payer/ : /получат|кому|beneficiar/;
  const pick = (list: string[]) => list.find((h) => side.test(norm(h))) ?? (list.length === 1 || !list.some((h) => /плательщ|получат/.test(norm(h))) ? list[0] : undefined);
  const nameCol = pick(names);
  const innCol = pick(inns);
  const party = nameCol ? val(nameCol).slice(0, 200) : "";
  const partyInn = innCol ? val(innCol).replace(/\s/g, "") : "";
  return party || partyInn ? { party, partyInn } : null;
}
