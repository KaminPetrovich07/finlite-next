// ════════════════════════════════════════════════════════════════════════
// lib/trade/catalog.ts — справочник номенклатуры: товары, материалы, продукция
// и услуги с артикулом, единицей по ОКЕИ, ценами и ставкой НДС.
// Загрузка из Excel, сохранённого в 1С («Номенклатура → Ещё → Вывести список»),
// в том числе иерархического списка с группами; сборка из журнала проводок.
// Чистые функции — без базы, общие для сервера и браузера.
// ════════════════════════════════════════════════════════════════════════

import { itemKey } from "@/lib/ledger/stock";
import { findUnit, unitSymbol } from "@/lib/okei";
import type { LedgerEntry } from "@/lib/ledger/types";

export type ItemKind = "goods" | "material" | "product" | "service";
export type VatRate = "12" | "0" | "none";

export interface CatalogItem {
  id: string;
  name: string;
  article?: string;
  unit: string;
  group?: string;
  kind: ItemKind;
  salePrice?: number | null;
  purchasePrice?: number | null;
  vat: VatRate;
  archived?: boolean;
}

export const KIND_LABEL: Record<ItemKind, string> = { goods: "Товар", material: "Материал", product: "Готовая продукция", service: "Услуга" };
/** Счёт запасов по виду номенклатуры (услуги на склад не приходуются). */
export const KIND_ACCOUNT: Record<ItemKind, string | null> = { goods: "1610", material: "1620", product: "1640", service: null };
export const VAT_LABEL: Record<VatRate, string> = { "12": "НДС 12 %", "0": "НДС 0 %", none: "Без НДС" };

const r2 = (n: number) => Math.round(n * 100) / 100;
const str = (v: unknown, max: number) => (typeof v === "string" ? v.replace(/\s+/g, " ").trim().slice(0, max) : "");
const price = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 && v < 1e12 ? r2(v) : null);

/** Unit as written in documents: ОКЕИ symbol when recognised («шт», «кг»), otherwise as typed. */
export function normUnit(u: string | undefined | null): string {
  const t = (u ?? "").trim();
  if (!t) return "шт";
  const f = findUnit(t);
  return f ? unitSymbol(f) : t.slice(0, 20);
}

export const newId = () => `i${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

/** Keeps only valid items; drops junk, trims strings, fixes kinds and rates. */
export function normalizeItem(raw: unknown): CatalogItem | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const name = str(o.name, 300);
  if (!name) return null;
  const kind: ItemKind = (["goods", "material", "product", "service"] as const).includes(o.kind as ItemKind) ? (o.kind as ItemKind) : "goods";
  const vat: VatRate = (["12", "0", "none"] as const).includes(o.vat as VatRate) ? (o.vat as VatRate) : "12";
  const id = str(o.id, 40).replace(/[^\w-]/g, "") || newId();
  return {
    id, name, kind, vat, unit: normUnit(str(o.unit, 20)),
    ...(str(o.article, 60) ? { article: str(o.article, 60) } : {}),
    ...(str(o.group, 200) ? { group: str(o.group, 200) } : {}),
    salePrice: price(o.salePrice), purchasePrice: price(o.purchasePrice),
    ...(o.archived === true ? { archived: true } : {}),
  };
}

/** Matching key: article if both have one, otherwise the name. */
const matchKeys = (i: { name: string; article?: string }) => [itemKey(i.name), ...(i.article ? [`#${i.article.toLowerCase()}`] : [])];

export interface MergeResult { items: CatalogItem[]; added: number; updated: number; unchanged: number }

/**
 * Adds incoming items to the catalog. An item with the same article (or, without one, the same name) is
 * updated: empty incoming fields never erase existing ones; the id stays.
 */
export function mergeCatalog(existing: CatalogItem[], incoming: CatalogItem[]): MergeResult {
  const out = existing.map((x) => ({ ...x }));
  const byKey = new Map<string, CatalogItem>();
  for (const x of out) for (const k of matchKeys(x)) if (!byKey.has(k)) byKey.set(k, x);
  let added = 0, updated = 0, unchanged = 0;
  for (const inc of incoming) {
    const hit = (inc.article && byKey.get(`#${inc.article.toLowerCase()}`)) || byKey.get(itemKey(inc.name));
    if (!hit) {
      const fresh = { ...inc };
      out.push(fresh);
      for (const k of matchKeys(fresh)) if (!byKey.has(k)) byKey.set(k, fresh);
      added++;
      continue;
    }
    const before = JSON.stringify(hit);
    if (inc.article && !hit.article) hit.article = inc.article;
    if (inc.group) hit.group = inc.group;
    if (inc.unit && inc.unit !== "шт") hit.unit = inc.unit;
    if (inc.salePrice != null) hit.salePrice = inc.salePrice;
    if (inc.purchasePrice != null) hit.purchasePrice = inc.purchasePrice;
    if (inc.kind !== "goods") hit.kind = inc.kind;
    if (inc.vat !== "12") hit.vat = inc.vat;
    if (JSON.stringify(hit) === before) unchanged++; else updated++;
  }
  return { items: out, added, updated, unchanged };
}

// ── Excel from 1С ────────────────────────────────────────────────────────

type Cell = string | number | boolean | Date | null | undefined;
const s = (v: Cell) => (v === null || v === undefined ? "" : v instanceof Date ? v.toISOString().slice(0, 10) : String(v)).replace(/ /g, " ").trim();
const low = (v: Cell) => s(v).toLowerCase().replace(/ё/g, "е").replace(/\s+/g, " ");
function num(v: Cell): number | null {
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = s(v).replace(/\s/g, "").replace(/[^\d,.-]/g, "");
  if (!t) return null;
  const n = Number(t.replace(/,(?=\d{1,3}$)/, ".").replace(/,/g, ""));
  return Number.isFinite(n) ? n : null;
}

type Col = "name" | "article" | "code" | "unit" | "sale" | "purchase" | "kind" | "group" | "vat";
const HEAD: Array<[Col, RegExp]> = [
  ["article", /^артикул/],
  ["code", /^код$|^код номенклатуры|^штрихкод/],
  ["unit", /единиц|^ед\.?\s*изм|^ед\.?$|^базовая единица/],
  ["purchase", /закуп|входящ|себестоим|цена поступления|учетная цена/],
  ["sale", /^цена|розничн|оптов|отпускн|цена продажи/],
  ["kind", /^вид номенклатуры|^вид$|^тип номенклатуры|^тип$/],
  ["group", /^группа|^родитель|^папка/],
  ["vat", /ндс/],
  ["name", /^наименование|^номенклатура|^товар|^название|^полное наименование/],
];

export interface SheetParse { items: CatalogItem[]; groups: number; skipped: number; columns: Partial<Record<Col, string>>; warnings: string[] }

function kindOf(t: string): ItemKind {
  if (/услуг|работ/.test(t)) return "service";
  if (/материал|сырь|запчаст|топлив|тара/.test(t)) return "material";
  if (/продукц|изделие|полуфабрикат/.test(t)) return "product";
  return "goods";
}
function vatOf(t: string): VatRate | null {
  if (!t) return null;
  if (/без|не облаг|освобожд/.test(t)) return "none";
  if (/^0\s*%?$|0\s*%/.test(t) && !/12/.test(t)) return "0";
  if (/12/.test(t)) return "12";
  return null;
}

/**
 * Reads a nomenclature list saved from 1С to Excel. The header row is found by «Наименование»
 * (or «Номенклатура»); rows without a unit, article and price under a list that has those columns are
 * group headings («Продукты питания») and become the group of the items below.
 */
export function parseCatalogSheet(rows: Cell[][], defaults: { vat?: VatRate } = {}): SheetParse {
  const warnings: string[] = [];
  let hr = -1;
  const cols: Partial<Record<Col, number>> = {};
  for (let i = 0; i < Math.min(rows.length, 30) && hr < 0; i++) {
    const found: Partial<Record<Col, number>> = {};
    (rows[i] ?? []).forEach((c, j) => {
      const t = low(c);
      if (!t) return;
      for (const [k, re] of HEAD) if (re.test(t) && found[k] === undefined) { found[k] = j; break; }
    });
    if (found.name !== undefined && Object.keys(found).length >= 2) { hr = i; Object.assign(cols, found); }
  }
  if (hr < 0) {
    // без шапки: первая текстовая колонка — наименование
    hr = -1; cols.name = 0;
    warnings.push("Не нашли строку заголовков («Наименование», «Ед. изм.», «Цена») — взяли первый столбец как наименование.");
  }
  const columns: Partial<Record<Col, string>> = {};
  for (const [k, j] of Object.entries(cols)) columns[k as Col] = s(rows[hr]?.[j as number]) || `столбец ${(j as number) + 1}`;
  const detail = cols.unit !== undefined || cols.sale !== undefined || cols.article !== undefined || cols.purchase !== undefined;

  const items: CatalogItem[] = [];
  let group = "", groups = 0, skipped = 0;
  const seen = new Set<string>();
  for (let i = hr + 1; i < rows.length; i++) {
    const row = rows[i] ?? [];
    const at = (k: Col) => (cols[k] === undefined ? "" : s(row[cols[k]!]));
    const name = at("name");
    if (!name || /^итого|^всего/i.test(name)) { if (row.some((c) => s(c))) skipped++; continue; }
    const unit = at("unit"), article = at("article") || at("code");
    const sale = cols.sale !== undefined ? num(row[cols.sale]) : null;
    const purchase = cols.purchase !== undefined ? num(row[cols.purchase]) : null;
    if (detail && !unit && !at("article") && sale == null && purchase == null && !at("kind")) { group = name; groups++; continue; }
    const k = `${itemKey(name)}|${article.toLowerCase()}`;
    if (seen.has(k)) { skipped++; continue; }
    seen.add(k);
    const item = normalizeItem({
      id: newId(), name, article, unit, group: at("group") || group,
      kind: kindOf(low(at("kind")) || low(group)), vat: vatOf(low(at("vat"))) ?? defaults.vat ?? "12",
      salePrice: sale, purchasePrice: purchase,
    });
    if (item) items.push(item); else skipped++;
  }
  if (!items.length) warnings.push("В файле не нашлось ни одной позиции номенклатуры.");
  return { items, groups, skipped, columns, warnings };
}

/**
 * Items already used in the journal (lines with a name on stock and revenue accounts), with the unit,
 * kind by account and the latest purchase and sale prices — to start the catalog without typing.
 */
export function catalogFromJournal(entries: LedgerEntry[], vat: VatRate = "12"): CatalogItem[] {
  const m = new Map<string, CatalogItem & { _p?: string; _s?: string }>();
  const sorted = [...entries].sort((a, b) => a.date.localeCompare(b.date));
  for (const e of sorted) for (const l of e.lines) {
    const name = l.item?.trim();
    if (!name) continue;
    const stock = /^1[67]\d\d$/.test(l.account), sale = /^61\d\d$/.test(l.account) && l.credit > 0;
    if (!stock && !sale) continue;
    const k = itemKey(name);
    const it = m.get(k) ?? { id: newId(), name, unit: normUnit(l.unit), kind: "goods" as ItemKind, vat, salePrice: null, purchasePrice: null };
    if (stock) it.kind = l.account.startsWith("162") || l.account.startsWith("17") ? "material" : l.account.startsWith("164") ? "product" : "goods";
    if (l.unit && it.unit === "шт") it.unit = normUnit(l.unit);
    const q = Number(l.qty) || 0;
    if (q > 0 && stock && l.debit > 0) it.purchasePrice = r2(l.debit / q);
    if (q > 0 && sale) it.salePrice = r2(l.credit / q);
    m.set(k, it);
  }
  return [...m.values()].sort((a, b) => a.name.localeCompare(b.name, "ru"));
}
