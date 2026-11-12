// ════════════════════════════════════════════════════════════════════════
// lib/esf/outgoing.ts — продажи из журнала → XML для массовой загрузки в
// ЭСФ 2.0 (схемы urn:einvoicing:sales:v1 — товары и
// urn:einvoicing:sales-services:v1 — акты услуг, руководство ГНС, ноябрь 2026).
//
// Загрузка создаёт в ЭСФ 2.0 только черновики: номер ЭСФ присваивается и
// документ уходит покупателю после подписи ЭЦП продавца в кабинете.
//
// Что берётся из проводки: дата (дата поставки), покупатель (ИНН со строки
// 1410 или выручки), форма оплаты (касса — наличные), строки выручки 6110/6130
// с номенклатурой, количеством и единицей. Чего в журнале нет и что задаётся
// один раз на компанию: код склада в ЭСФ 2.0, вид и код поставки, категория
// НДС и ставка НсП, банковские реквизиты, а для каждой позиции — уникальный
// код товара (НТИН) или услуги из каталога ЭСФ.
//
// Суммы ЭСФ считает сервер; здесь они повторяются по тем же формулам
// (руководство, §10), чтобы до загрузки увидеть расхождение с проводкой.
// Сроки выписки считаются по рабочим дням без праздников — праздники срок
// только удлиняют, поэтому показанный срок не позже настоящего.
// ════════════════════════════════════════════════════════════════════════

import { okeiCode } from "@/lib/okei";
import type { LedgerEntry, LedgerLine } from "@/lib/ledger/types";

export type VatCategory = "Vat12" | "ZeroRated" | "Exempt" | "NonTaxable";
export const VAT_CATEGORY_LABEL: Record<VatCategory, string> = {
  Vat12: "Облагаемая 12 %", ZeroRated: "Облагаемая 0 %", Exempt: "Освобождённая", NonTaxable: "Необлагаемая",
};

export interface CatalogItem {
  /** уникальный код товара (НТИН) или код услуги из каталога организации в ЭСФ 2.0 */
  code: string;
  /** код единицы измерения по справочнику ЭСФ (ОКЕИ: 796 — штука) */
  unitCode: string;
  service: boolean;
}

export interface OutSettings {
  /** специальный налоговый режим: без кода поставки, НДС и НсП */
  special: boolean;
  warehouseCode: string;
  supplyKind: string;
  supplyCode: string;
  vatCategory: VatCategory;
  /** процент ставки — только если у кода поставки две ставки одной категории */
  vatRatePercent: number | null;
  /** ставка НсП, целое 0–5 */
  nspRate: number;
  bankName: string;
  bankAccount: string;
  /** позиции по нормализованному наименованию (см. itemKey) */
  catalog: Record<string, CatalogItem>;
}

export function defaultOutSettings(special: boolean): OutSettings {
  return { special, warehouseCode: "0001", supplyKind: "003", supplyCode: "100", vatCategory: "Vat12", vatRatePercent: null, nspRate: 0, bankName: "", bankAccount: "", catalog: {} };
}

export const itemKey = (name: string) => name.trim().toLowerCase().replace(/\s+/g, " ");

// ─── суммы по правилам ЭСФ 2.0 ──────────────────────────────────────────

/** Арифметическое округление до тыйынов (0,005 → вверх). */
export const roundT = (x: number) => Math.sign(x) * Math.round(Math.abs(x) * 100 + 1e-9) / 100;
const round6 = (x: number) => Math.round(x * 1e6) / 1e6;

export interface Amounts { net: number; vat: number; nsp: number; total: number }

/** Суммы строки так, как их посчитает сервер ЭСФ 2.0. */
export function lineAmounts(qty: number, price: number, vatPct: number, nspPct: number, priceWithoutTax: boolean): Amounts {
  const base = qty * price;
  if (priceWithoutTax) {
    const net = roundT(base), vat = roundT((base * vatPct) / 100), nsp = roundT((base * nspPct) / 100);
    return { net, vat, nsp, total: roundT(net + vat + nsp) };
  }
  const total = roundT(base);
  const vat = roundT((base * vatPct) / (100 + vatPct + nspPct));
  const nsp = roundT((base * nspPct) / (100 + vatPct + nspPct));
  return { net: roundT(total - vat - nsp), vat, nsp, total };
}

const addA = (a: Amounts, b: Amounts): Amounts => ({ net: roundT(a.net + b.net), vat: roundT(a.vat + b.vat), nsp: roundT(a.nsp + b.nsp), total: roundT(a.total + b.total) });
const ZERO: Amounts = { net: 0, vat: 0, nsp: 0, total: 0 };

// ─── сроки выписки (рабочие дни: пн–пт) ─────────────────────────────────

const day = (iso: string) => new Date(`${iso}T00:00:00Z`);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const isWorking = (d: Date) => d.getUTCDay() !== 0 && d.getUTCDay() !== 6;
const shift = (d: Date, n: number) => new Date(d.getTime() + n * 864e5);

/** Товары: не позднее 5-го рабочего дня, день поставки — день № 1 (поставка в выходной — с ближайшего рабочего). */
export function goodsDeadline(supplyDate: string): string {
  let d = day(supplyDate);
  while (!isWorking(d)) d = shift(d, 1);
  for (let n = 1; n < 5; ) { d = shift(d, 1); if (isWorking(d)) n++; }
  return iso(d);
}

/** Услуги: не позднее 10-го рабочего дня месяца, следующего за месяцем акта. */
export function servicesDeadline(actDate: string): string {
  const a = day(actDate);
  let d = new Date(Date.UTC(a.getUTCFullYear(), a.getUTCMonth() + 1, 1));
  let n = isWorking(d) ? 1 : 0;
  while (n < 10) { d = shift(d, 1); if (isWorking(d)) n++; }
  return iso(d);
}

/** Население: дата поставки не раньше 10-го рабочего дня, считая назад от последнего дня предыдущего месяца. */
export function populationEarliest(today: string): string {
  const t = day(today);
  let d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 0));
  let n = isWorking(d) ? 1 : 0;
  while (n < 10) { d = shift(d, -1); if (isWorking(d)) n++; }
  return iso(d);
}

// ─── продажи из журнала → документы ЭСФ ─────────────────────────────────

const REVENUE = new Set(["6110", "6130"]);
const CASH = /^11[12]\d$/;

export interface OutLine {
  name: string;
  key: string;
  qty: number;
  unit: string;
  unitCode: string;
  price: number;
  code: string | null;
  service: boolean;
  amounts: Amounts;
}

export interface OutDoc {
  externalId: string;
  entryId: string;
  date: string;
  description: string;
  buyerKind: "Taxpayer" | "Population";
  buyerTin: string;
  buyerName: string;
  payment: "Cash" | "NonCash";
  priceWithoutTax: boolean;
  service: boolean;
  lines: OutLine[];
  esf: Amounts;
  /** выручка + НДС по проводке — для сверки с суммой ЭСФ */
  ledger: { net: number; vat: number; total: number };
  deadline: string;
  /** то, из-за чего документ не войдёт в файл */
  problems: string[];
  /** то, что стоит проверить, но загрузке не мешает */
  notes: string[];
}

const sum = (ls: LedgerLine[], side: "debit" | "credit") => ls.reduce((s, l) => s + l[side], 0);

export function vatPercent(s: OutSettings): number {
  if (s.special || s.vatCategory !== "Vat12") return 0;
  return s.vatRatePercent ?? 12;
}

/** Sales entries of the period → documents for ESF 2.0. `today` — for deadlines. */
export function outgoingDocs(entries: LedgerEntry[], from: string, to: string, s: OutSettings, today: string, servicesByDefault = false): OutDoc[] {
  const vatPct = vatPercent(s), nspPct = s.special ? 0 : s.nspRate;
  const popEarliest = populationEarliest(today);
  const out: OutDoc[] = [];
  for (const e of entries) {
    if (e.date < from || e.date > to) continue;
    if (e.source === "esf" || e.source === "opening" || e.source === "closing") continue;
    const rev = e.lines.filter((l) => REVENUE.has(l.account) && l.credit > 0);
    if (!rev.length) continue;
    const debits = e.lines.filter((l) => l.debit > 0);
    const cash = debits.some((l) => CASH.test(l.account));
    const buyerLine = e.lines.find((l) => l.account === "1410" && l.partyInn) ?? rev.find((l) => l.partyInn) ?? e.lines.find((l) => l.account === "1410" && l.party) ?? rev.find((l) => l.party);
    const tin = (buyerLine?.partyInn ?? "").replace(/\D/g, "");
    const buyerName = buyerLine?.party ?? "";
    const problems: string[] = [], notes: string[] = [];
    let buyerKind: OutDoc["buyerKind"] = "Taxpayer";
    if (!tin && cash) buyerKind = "Population";
    else if (!tin) problems.push("нет ИНН покупателя — укажите его в проводке");
    else if (tin.length !== 14) problems.push(`ИНН покупателя ${tin} — нужно 14 цифр`);
    const priceWithoutTax = buyerKind === "Taxpayer";

    const net = sum(rev, "credit");
    const vatLedger = sum(e.lines.filter((l) => l.account === "3430" && l.credit > 0), "credit");
    // для населения цена — с налогами: делим полученную сумму по строкам пропорционально выручке
    const gross = cash ? sum(debits.filter((l) => CASH.test(l.account)), "debit") : net + vatLedger;
    const lines: OutLine[] = rev.map((l) => {
      const name = (l.item ?? "").trim();
      const key = itemKey(name);
      const cat = s.catalog[key];
      const qty = l.qty && l.qty > 0 ? round6(l.qty) : 1;
      const base = priceWithoutTax ? l.credit : (gross * l.credit) / (net || 1);
      const price = round6(base / qty);
      const service = cat ? cat.service : servicesByDefault;
      const unitCode = cat?.unitCode || okeiCode(l.unit) || "";
      return { name, key, qty, unit: l.unit ?? "", unitCode, price, code: cat?.code || null, service, amounts: lineAmounts(qty, price, vatPct, nspPct, priceWithoutTax) };
    });
    const service = lines.every((l) => l.service);
    if (!service && lines.some((l) => l.service)) problems.push("в одной проводке товары и услуги — ЭСФ 2.0 оформляет их разными документами");
    if (lines.some((l) => !l.name)) problems.push("в строке выручки не указана номенклатура — заполните её в проводке");
    const noCode = lines.filter((l) => l.name && !l.code).map((l) => l.name);
    if (noCode.length) problems.push(`нет кода в каталоге ЭСФ: ${noCode.slice(0, 3).join(", ")}${noCode.length > 3 ? "…" : ""}`);
    if (!service && lines.some((l) => l.name && !l.unitCode)) problems.push("не распознана единица измерения — задайте код в каталоге");
    if (!service && rev.some((l) => !(l.qty && l.qty > 0))) notes.push("в проводке нет количества — взято 1");
    const keys = new Set<string>();
    for (const l of lines) { const k = `${l.code}|${l.unitCode}`; if (l.code && keys.has(k)) problems.push(`позиция ${l.name} повторяется — объедините строки`); keys.add(k); }
    if (!cash && !s.bankAccount.trim()) problems.push("безналичная оплата — укажите банк и счёт продавца в настройках");
    if (!s.special && !s.supplyCode.trim()) problems.push("не задан код поставки");
    if (!service && !s.warehouseCode.trim()) problems.push("не задан код склада");

    let deadline: string;
    if (buyerKind === "Population") {
      deadline = "";
      if (e.date < popEarliest) problems.push(`для населения сейчас принимаются даты не раньше ${popEarliest.split("-").reverse().join(".")}`);
    } else {
      deadline = service ? servicesDeadline(e.date) : goodsDeadline(e.date);
      if (deadline < today) problems.push(`срок выписки истёк ${deadline.split("-").reverse().join(".")}`);
    }
    if (e.date > today) problems.push("дата в будущем");

    const esf = lines.reduce((a, l) => addA(a, l.amounts), ZERO);
    const ledgerTotal = cash ? gross : net + vatLedger;
    if (priceWithoutTax && Math.abs(esf.net - net) > 0.05) notes.push(`сумма без налогов в ЭСФ ${esf.net} ≠ выручке ${net}`);
    if (priceWithoutTax && !s.special && Math.abs(esf.vat - vatLedger) > 0.05) notes.push(`НДС в ЭСФ ${esf.vat}, в проводке ${roundT(vatLedger)}`);
    if (!priceWithoutTax && Math.abs(esf.total - ledgerTotal) > 0.05) notes.push(`итог ЭСФ ${esf.total} ≠ получено ${roundT(ledgerTotal)}`);

    out.push({
      externalId: `FL-${e.id}`.slice(0, 64), entryId: e.id, date: e.date, description: e.description,
      buyerKind, buyerTin: tin, buyerName, payment: cash ? "Cash" : "NonCash", priceWithoutTax, service, lines, esf,
      ledger: { net: roundT(net), vat: roundT(vatLedger), total: roundT(ledgerTotal) }, deadline, problems, notes,
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

/** Items of the period's sales without a code in the ESF catalogue (one row per name). */
export function missingCatalog(docs: OutDoc[]): Array<{ key: string; name: string; unit: string; unitCode: string; service: boolean; count: number }> {
  const m = new Map<string, { key: string; name: string; unit: string; unitCode: string; service: boolean; count: number }>();
  for (const d of docs) for (const l of d.lines) {
    if (l.code || !l.name) continue;
    const r = m.get(l.key);
    if (r) r.count++;
    else m.set(l.key, { key: l.key, name: l.name, unit: l.unit, unitCode: l.unitCode, service: l.service, count: 1 });
  }
  return [...m.values()].sort((a, b) => b.count - a.count);
}

// ─── XML ────────────────────────────────────────────────────────────────

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const dec = (x: number, max: number) => {
  const s = x.toFixed(max);
  return s.includes(".") ? s.replace(/0+$/, "").replace(/\.$/, "") : s;
};
const money = (x: number) => x.toFixed(2);

function vatXml(s: OutSettings): string {
  if (s.special) return "<Vat/>";
  const rp = s.vatRatePercent !== null && s.vatCategory === "Vat12" ? ` ratePercent="${dec(s.vatRatePercent, 2)}"` : "";
  return `<Vat category="${s.vatCategory}"${rp} nspCategory="${s.nspRate}"/>`;
}
const supplyXml = (s: OutSettings) => (s.special ? `<Supply kindCode="${esc(s.supplyKind)}"/>` : `<Supply kindCode="${esc(s.supplyKind)}" supplyCode="${esc(s.supplyCode)}"/>`);
const buyerXml = (d: OutDoc) => (d.buyerKind === "Population" ? `<Buyer kind="Population"/>` : `<Buyer kind="Taxpayer">\n        <Tin>${d.buyerTin}</Tin>\n      </Buyer>`);
const supplierXml = (d: OutDoc, s: OutSettings) => (d.payment === "NonCash" ? `      <Supplier>\n        <BankName>${esc(s.bankName)}</BankName>\n        <BankAccount>${esc(s.bankAccount)}</BankAccount>\n      </Supplier>\n` : "");

function bishkekNow(now: Date): string {
  const t = new Date(now.getTime() + 6 * 3600e3).toISOString().slice(0, 19);
  return `${t}+06:00`;
}

/** Limits of one file (руководство, §4). */
export const MAX_DOCS = 1000;
export const MAX_ITEMS = 20000;

function chunks(docs: OutDoc[]): OutDoc[][] {
  const out: OutDoc[][] = [];
  let cur: OutDoc[] = [], items = 0;
  for (const d of docs) {
    if (cur.length && (cur.length >= MAX_DOCS || items + d.lines.length > MAX_ITEMS)) { out.push(cur); cur = []; items = 0; }
    cur.push(d); items += d.lines.length;
  }
  if (cur.length) out.push(cur);
  return out;
}

/** Goods: one or more SalesBatch files (urn:einvoicing:sales:v1). Only documents without problems. */
export function salesXml(docs: OutDoc[], s: OutSettings, now = new Date()): string[] {
  const ready = docs.filter((d) => !d.service && !d.problems.length);
  const version = !s.special && s.vatRatePercent !== null ? "1.2" : "1.0";
  return chunks(ready).map((part) => {
    const inv = part.map((d) => [
      `    <Invoice externalId="${esc(d.externalId)}">`,
      `      <IssueDate>${d.date}</IssueDate>`,
      `      <OperationType>SupplyOfGoods</OperationType>`,
      `      <SupplierWarehouseCode>${esc(s.warehouseCode)}</SupplierWarehouseCode>`,
      supplierXml(d, s) + `      ${buyerXml(d)}`,
      `      ${supplyXml(s)}`,
      `      ${vatXml(s)}`,
      `      <Payment form="${d.payment}"/>`,
      `      <Currency code="417"/>`,
      `      <IsPriceWithoutTax>${d.priceWithoutTax}</IsPriceWithoutTax>`,
      `      <Comment>${esc(d.description.slice(0, 1000))}</Comment>`,
      `      <Items>`,
      ...d.lines.map((l) => [
        `        <Item>`,
        `          <GoodsUniqueCode>${esc(l.code ?? "")}</GoodsUniqueCode>`,
        `          <Quantity>${dec(l.qty, 6)}</Quantity>`,
        `          <Unit code="${esc(l.unitCode)}"/>`,
        `          <UnitPrice>${dec(l.price, 6)}</UnitPrice>`,
        `          <TotalAmount>${money(roundT(l.qty * l.price))}</TotalAmount>`,
        `        </Item>`,
      ].join("\n")),
      `      </Items>`,
      `    </Invoice>`,
    ].join("\n")).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<SalesBatch xmlns="urn:einvoicing:sales:v1" schemaVersion="${version}">\n  <Header>\n    <SourceSystem>FinLite KG</SourceSystem>\n    <GeneratedAt>${bishkekNow(now)}</GeneratedAt>\n  </Header>\n  <Invoices>\n${inv}\n  </Invoices>\n</SalesBatch>\n`;
  });
}

/** Services: one or more ServicesBatch files (urn:einvoicing:sales-services:v1). */
export function servicesXml(docs: OutDoc[], s: OutSettings, now = new Date()): string[] {
  const ready = docs.filter((d) => d.service && !d.problems.length);
  const version = !s.special && s.vatRatePercent !== null ? "1.1" : "1.0";
  return chunks(ready).map((part) => {
    const inv = part.map((d) => [
      `    <Invoice externalId="${esc(d.externalId)}">`,
      `      <IssueDate>${d.date}</IssueDate>`,
      supplierXml(d, s) + `      ${buyerXml(d)}`,
      `      ${supplyXml(s)}`,
      `      ${vatXml(s)}`,
      `      <Payment form="${d.payment}"/>`,
      `      <Currency code="417"/>`,
      `      <IsPriceWithoutTax>${d.priceWithoutTax}</IsPriceWithoutTax>`,
      `      <Services>`,
      ...d.lines.map((l) => [
        `        <Service>`,
        `          <ServiceUniqueCode>${esc(l.code ?? "")}</ServiceUniqueCode>`,
        `          <Quantity>${dec(l.qty, 6)}</Quantity>`,
        ...(l.unitCode ? [`          <Unit code="${esc(l.unitCode)}"/>`] : []),
        `          <Price>${dec(l.price, 6)}</Price>`,
        `        </Service>`,
      ].join("\n")),
      `      </Services>`,
      `    </Invoice>`,
    ].join("\n")).join("\n");
    return `<?xml version="1.0" encoding="UTF-8"?>\n<ServicesBatch xmlns="urn:einvoicing:sales-services:v1" schemaVersion="${version}">\n  <Header>\n    <SourceSystem>FinLite KG</SourceSystem>\n    <GeneratedAt>${bishkekNow(now)}</GeneratedAt>\n  </Header>\n  <Invoices>\n${inv}\n  </Invoices>\n</ServicesBatch>\n`;
  });
}

/** General regime unless the company is on a single tax / patent. */
export const isSpecialRegime = (regime: string | null | undefined) => !!regime && !regime.startsWith("general");
