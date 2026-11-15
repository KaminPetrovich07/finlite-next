"use client";

// Продажи и закупки: документы «Реализация» и «Поступление» с табличной частью.
// Каждый документ — одна проводка журнала; себестоимость, склад, отчёты, ЭСФ и акты сверки — из неё.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { OKEI_LIST_ID, OkeiDatalist } from "@/components/okei/UnitInput";
import { formatNumber } from "@/lib/format";
import { monthPeriod } from "@/lib/ledger/period";
import { itemKey } from "@/lib/ledger/stock";
import { KIND_LABEL, VAT_LABEL, type CatalogItem, type ItemKind, type VatRate } from "@/lib/trade/catalog";
import { DOC_LABEL, docTotals, isReturn, isSaleSide, ownNumbering, PAYMENT_LABEL, rowTotals, validateDoc, type DocRow, type DocType, type Payment, type TradeDoc } from "@/lib/trade/doc";
import { useT } from "@/components/i18n";
import { DOC_TEMPLATE, parseDocSheet, type ParsedDoc } from "@/lib/trade/import1c";
import type { Cell } from "@/lib/import1c/parse";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-full rounded border border-fl-line bg-fl-charcoal px-2 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const m2 = (n: number) => formatNumber(n, 2);
const dmy = (iso: string) => iso.split("-").reverse().join(".");
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const parseNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

/** Excel / CSV из 1С читается в браузере; на сервер уходят уже собранные документы. */
async function readSheets(file: File): Promise<Array<{ name: string; rows: Cell[][] }>> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  let wb;
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("\ufffd")) text = new TextDecoder("windows-1251").decode(buf); // 1С часто сохраняет CSV в 1251
    wb = XLSX.read(text, { type: "string", cellDates: true, raw: false });
  } else wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }) }));
}
const IMPORT_CHUNK = 100;

interface Summary { entryId: string; type: DocType; number: string; date: string; party: string; payment: Payment; gross: number; vat: number; rows: number; locked: boolean; editedInJournal: boolean; paid?: number; due?: number; dueStatus?: "paid" | "partial" | "open"; baseEntryId?: string; importDoc?: boolean }
interface Stock { item: string; unit: string; qty: number; account: string }
type RowDraft = Omit<DocRow, "qty" | "price"> & { qty: string; price: string };
interface Draft { entryId?: string; version?: string; type: DocType; number: string; date: string; party: string; partyInn: string; payment: Payment; vatIncluded: boolean; basis: string; comment: string; baseEntryId?: string; rows: RowDraft[] }
/** печатные формы по виду документа */
const PRINT_KINDS: Record<DocType, string[]> = { sale: ["waybill", "invoice"], purchase: ["m4"], saleReturn: ["return"], purchaseReturn: ["return"] };
/** «проведена / изменена» в роде документа */
const DONE: Record<DocType, [string, string]> = { sale: ["проведена", "изменена"], purchase: ["проведено", "изменено"], saleReturn: ["проведён", "изменён"], purchaseReturn: ["проведён", "изменён"] };
const NEW_TITLE: Record<DocType, string> = { sale: "Новая реализация", purchase: "Новое поступление", saleReturn: "Новый возврат от покупателя", purchaseReturn: "Новый возврат поставщику" };

const emptyRow = (vat: VatRate): RowDraft => ({ name: "", unit: "шт", kind: "goods", qty: "", price: "", vat });
const toDoc = (d: Draft): TradeDoc => ({
  type: d.type, number: d.number, date: d.date, party: d.party, partyInn: d.partyInn || undefined, payment: d.payment, vatIncluded: d.vatIncluded,
  basis: d.basis || undefined, comment: d.comment || undefined, ...(d.baseEntryId ? { baseEntryId: d.baseEntryId } : {}),
  rows: d.rows.filter((r) => r.name.trim() || r.qty || r.price).map((r) => ({ ...r, qty: parseNum(r.qty) || 0, price: parseNum(r.price) || 0 })),
});

export default function TradePage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const toast = useToast();
  const t = useT();
  const [period, setPeriod] = useState(() => { const t = today(); return monthPeriod(Number(t.slice(0, 4)), Number(t.slice(5, 7))); });
  const [docs, setDocs] = useState<Summary[] | null>(null);
  const [ro, setRo] = useState(true);
  const [filter, setFilter] = useState<DocType | "" | "return">("");
  const [payFor, setPayFor] = useState<{ entryId: string; amount: string; date: string; via: "bank" | "cash" } | null>(null);
  const [warn, setWarn] = useState<string[]>([]);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [vatPayer, setVatPayer] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ entryId: string; type: DocType } | null>(null);
  const [imp, setImp] = useState<{ file: string; sheets: Array<{ name: string; rows: Cell[][] }>; docs: ParsedDoc[]; problems: string[] } | null>(null);
  const [impType, setImpType] = useState<DocType>("sale");
  const [impPayment, setImpPayment] = useState<Payment>("credit");
  const [impProgress, setImpProgress] = useState<string | null>(null);
  const [impReport, setImpReport] = useState<string[]>([]);

  const load = useCallback(async () => {
    if (!companyId) return;
    setDocs(null);
    const [d, c] = await Promise.all([
      fetch(`/api/trade/docs?companyId=${companyId}&from=${period.from}&to=${period.to}`).then(async (r) => ({ ok: r.ok, b: await r.json().catch(() => ({})) })),
      fetch(`/api/trade/catalog?companyId=${companyId}`).then(async (r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]);
    setDocs(d.ok ? d.b.docs : []); setRo(d.ok ? !!d.b.readOnly : true);
    if (!d.ok) toast.show(t(d.b.error ?? "Не удалось загрузить документы"), "error");
    setCatalog(c.items ?? []); setVatPayer(!!c.vatPayer);
  }, [companyId, period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);
  useEffect(() => { setDraft(null); setSaved(null); setImp(null); setImpReport([]); }, [companyId]);

  // остатки на дату документа — подсказка при продаже
  useEffect(() => {
    if (!draft || (draft.type !== "sale" && draft.type !== "purchaseReturn") || !companyId) return;
    const t = setTimeout(() => {
      fetch(`/api/stock?companyId=${companyId}&from=${draft.date.slice(0, 8)}01&to=${draft.date}`).then((r) => r.json()).then((b) => setStock(Array.isArray(b.stock) ? b.stock : [])).catch(() => setStock([]));
    }, 300);
    return () => clearTimeout(t);
  }, [draft?.date, draft?.type, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byName = useMemo(() => new Map(catalog.map((x) => [itemKey(x.name), x])), [catalog]);
  const stockOf = (name: string) => stock.filter((s) => itemKey(s.item) === itemKey(name)).reduce((a, s) => a + s.qty, 0);
  const parties = useMemo(() => [...new Set((docs ?? []).map((d) => d.party).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [docs]);

  const nextNumber = async (type: DocType, date: string) =>
    ownNumbering(type) ? (await fetch(`/api/trade/docs?companyId=${companyId}&next=${date}&type=${type}`).then((r) => r.json()).catch(() => ({}))).number ?? "" : "";
  async function start(type: DocType) {
    const date = today() >= period.from && today() <= period.to ? today() : period.to;
    const number = await nextNumber(type, date);
    setSaved(null); setWarn([]);
    setDraft({ type, number, date, party: "", partyInn: "", payment: "credit", vatIncluded: true, basis: "", comment: "", rows: [emptyRow(vatPayer ? "12" : "none"), emptyRow(vatPayer ? "12" : "none")] });
    setTimeout(() => document.getElementById("fl-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  /** Возврат по документу: те же товары, цены, контрагент; количество можно уменьшить, лишние строки удалить. */
  async function startReturn(s: Summary) {
    const r = await fetch(`/api/trade/docs/${s.entryId}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(t(b.error ?? "Не удалось открыть"), "error"); return; }
    const d: TradeDoc = b.doc;
    const type: DocType = d.type === "sale" ? "saleReturn" : "purchaseReturn";
    const date = today();
    setSaved(null); setWarn([]);
    setDraft({
      type, number: await nextNumber(type, date), date, party: d.party, partyInn: d.partyInn ?? "", payment: "credit", vatIncluded: d.vatIncluded,
      basis: t("возврат по документу «{d}» № {n} от {date}", { d: t(DOC_LABEL[d.type]), n: d.number, date: dmy(d.date) }), comment: "", baseEntryId: s.entryId,
      rows: d.rows.map((x) => ({ ...x, qty: String(x.qty).replace(".", ","), price: String(x.price).replace(".", ",") })),
    });
    setTimeout(() => document.getElementById("fl-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  async function pay() {
    if (!payFor) return;
    const amount = parseNum(payFor.amount);
    if (!(amount > 0)) { toast.show(t("Сумма оплаты должна быть больше нуля"), "error"); return; }
    setBusy(true);
    const r = await fetch(`/api/trade/docs/${payFor.entryId}/pay`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ amount, date: payFor.date, via: payFor.via }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(t(b.error ?? "Оплата не записана"), "error"); return; }
    toast.show(t("Оплата записана — проводка в журнале"));
    setPayFor(null); load();
  }
  async function esf(s: Summary) {
    const r = await fetch(`/api/trade/esf?entryId=${s.entryId}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(t(b.error ?? "Не удалось подготовить ЭСФ"), "error"); return; }
    if (!b.xml) {
      setWarn([`${t("ЭСФ по реализации № {n} не сформирован", { n: s.number })}: ${(b.doc?.problems ?? []).join("; ")}.`, t("Настройки выгрузки и коды товаров — раздел «ЭСФ» → «Продажи → XML для ЭСФ 2.0».")]);
      window.scrollTo({ top: 0, behavior: "smooth" });
      return;
    }
    const url = URL.createObjectURL(new Blob([b.xml], { type: "application/xml;charset=utf-8" }));
    const a = document.createElement("a"); a.href = url; a.download = `esf-realizaciya-${s.number}-${s.date}.xml`; a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    toast.show(t("Файл ЭСФ готов: загрузите его в кабинете ЭСФ 2.0 и подпишите ЭЦП"));
  }
  async function open(s: Summary) {
    const r = await fetch(`/api/trade/docs/${s.entryId}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(t(b.error ?? "Не удалось открыть"), "error"); return; }
    const d: TradeDoc = b.doc;
    setSaved(null);
    setDraft({ entryId: s.entryId, version: b.version, type: d.type, number: d.number, date: d.date, party: d.party, partyInn: d.partyInn ?? "", payment: d.payment, vatIncluded: d.vatIncluded, basis: d.basis ?? "", comment: d.comment ?? "",
      rows: d.rows.map((x) => ({ ...x, qty: String(x.qty).replace(".", ","), price: String(x.price).replace(".", ",") })) });
    if (b.editedInJournal) toast.show(t("Проводку документа меняли в журнале — документ собран из неё: проверьте цены и НДС"), "info");
    setTimeout(() => document.getElementById("fl-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function setRow(i: number, patch: Partial<RowDraft>) {
    setDraft((d) => {
      if (!d) return d;
      const rows = d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r));
      // выбор из справочника: единица, вид, НДС и цена
      if (patch.name !== undefined) {
        const it = byName.get(itemKey(patch.name));
        if (it) {
          const price = isSaleSide(d.type) ? it.salePrice : it.purchasePrice != null && it.vat === "12" && d.vatIncluded ? Math.round(it.purchasePrice * 112) / 100 : it.purchasePrice;
          rows[i] = { ...rows[i], itemId: it.id, unit: it.unit, kind: it.kind, vat: it.vat, ...(price != null && !rows[i].price ? { price: String(price).replace(".", ",") } : {}) };
        } else rows[i] = { ...rows[i], itemId: undefined };
      }
      if (i === rows.length - 1 && rows[i].name.trim()) rows.push(emptyRow(vatPayer ? "12" : "none"));
      return { ...d, rows };
    });
  }

  async function save() {
    if (!draft) return;
    const doc = toDoc(draft);
    const problems = validateDoc(doc);
    if (problems.length) { toast.show(t(problems[0]), "error"); return; }
    setBusy(true);
    const r = await fetch(draft.entryId ? `/api/trade/docs/${draft.entryId}` : "/api/trade/docs", {
      method: draft.entryId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.entryId ? { doc, version: draft.version } : { companyId, doc }),
    });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(t(b.error ?? "Документ не сохранён"), "error"); return; }
    toast.show(`${t(DOC_LABEL[doc.type])} № ${doc.number} ${draft.entryId ? t(DONE[doc.type][1]) : t(DONE[doc.type][0])}${b.cogs ? (isReturn(doc.type) ? t(" — товар возвращён на склад по себестоимости ({n})", { n: b.cogs }) : t(" — себестоимость списана ({n})", { n: b.cogs })) : ""}`);
    setWarn(Array.isArray(b.problems) ? b.problems : []);
    setSaved({ entryId: b.entryId, type: doc.type });
    setDraft(null);
    if (doc.date < period.from || doc.date > period.to) setPeriod(monthPeriod(Number(doc.date.slice(0, 4)), Number(doc.date.slice(5, 7))));
    else load();
  }
  async function remove(s: Summary) {
    if (!confirm(t("Удалить документ «{d}» № {n}? Проводка уйдёт из журнала (вернуть можно в журнале, раздел «Удалённые»).", { d: t(DOC_LABEL[s.type]), n: s.number }))) return;
    const r = await fetch(`/api/ledger/${s.entryId}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(t(b.error ?? "Не удалось удалить"), "error"); return; }
    toast.show(t("Документ удалён"), "info");
    if (draft?.entryId === s.entryId) setDraft(null);
    load();
  }
  async function print(entryId: string, type: DocType, format: "pdf" | "docx", kinds?: string[]) {
    try {
      await downloadPost(`/api/trade/print?format=${format}`, { companyId, entryId, kinds: kinds ?? PRINT_KINDS[type] }, `документ.${format}`);
    } catch (e) { toast.show(t(e instanceof Error ? e.message : "Не удалось сформировать"), "error"); }
  }

  // ── загрузка документов из 1С ──────────────────────────────────────────
  function parseSheets(sheets: Array<{ name: string; rows: Cell[][] }>, type: DocType) {
    let best: { docs: ParsedDoc[]; problems: string[] } | null = null;
    for (const sh of sheets) {
      const p = parseDocSheet(sh.rows, type, catalog);
      if (!best || p.docs.length > best.docs.length) best = p;
    }
    return best ?? { docs: [], problems: [] };
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const sheets = await readSheets(f);
      const p = parseSheets(sheets, impType);
      if (!p.docs.length) { toast.show(p.problems[0] ? t(p.problems[0]) : t("Не нашёл строк с номенклатурой и количеством"), "error"); return; }
      setDraft(null); setSaved(null); setImpReport([]);
      setImp({ file: f.name, sheets, ...p });
    } catch { toast.show(t("Не удалось прочитать файл — сохраните его в 1С как Excel (.xlsx)"), "error"); }
  }
  async function runImport() {
    if (!imp) return;
    const docs = imp.docs.map(({ fileTotal, fileRows, ...d }) => ({ ...d, payment: impPayment }));
    let created = 0, duplicates = 0, cogs = 0;
    const problems: string[] = [];
    try {
      for (let i = 0; i < docs.length; i += IMPORT_CHUNK) {
        setImpProgress(`${Math.min(i + IMPORT_CHUNK, docs.length)} / ${docs.length}`);
        const r = await fetch("/api/trade/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, docs: docs.slice(i, i + IMPORT_CHUNK) }) });
        const b = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(b.error ?? "Документы не загружены");
        created += b.created; duplicates += b.duplicates; cogs += b.cogs; problems.push(...(b.problems ?? []));
      }
      toast.show(`${t("Загружено документов: {n}", { n: created })}${duplicates ? t(", уже были: {n}", { n: duplicates }) : ""}${cogs ? t(", себестоимость списана: {n}", { n: cogs }) : ""}`);
      setImpReport(problems.slice(0, 30)); setImp(null);
      const dates = docs.map((d) => d.date).sort();
      const last = dates[dates.length - 1];
      if (last && (last < period.from || last > period.to)) setPeriod(monthPeriod(Number(last.slice(0, 4)), Number(last.slice(5, 7))));
      else load();
    } catch (e) {
      toast.show(t(e instanceof Error ? e.message : "Документы не загружены"), "error");
      if (created) { setImpReport(problems.slice(0, 30)); load(); }
    } finally { setImpProgress(null); }
  }
  async function template() {
    const XLSX = await import("xlsx");
    const ws = XLSX.utils.aoa_to_sheet(DOC_TEMPLATE);
    ws["!cols"] = [13, 11, 8, 22, 16, 32, 9, 11, 10, 11, 11].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Документы");
    XLSX.writeFile(wb, "Шаблон документов FinLite.xlsx");
  }

  const doc = draft ? toDoc(draft) : null;
  const totals = doc ? docTotals(doc) : null;
  const shown = (docs ?? []).filter((d) => !filter || d.type === filter || (filter === "return" && isReturn(d.type)));
  const sum = (t: DocType) => (docs ?? []).filter((d) => d.type === t).reduce((a, d) => a + d.gross, 0);
  const due = (t: DocType) => (docs ?? []).filter((d) => d.type === t).reduce((a, d) => a + (d.due ?? 0), 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Продажи и закупки")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Реализация и поступление с таблицей товаров и услуг. Проводки, НДС, остатки на складе и себестоимость формируются сами; накладная, счёт и приходный ордер — в один клик.")}</p>
        </div>
        <a href="/nomenclature" className="text-sm text-fl-gold underline-offset-4 hover:underline">{t("Номенклатура")} ({catalog.length})</a>
      </header>
      <OkeiDatalist />
      <datalist id="fl-items">{catalog.filter((x) => !x.archived).slice(0, 3000).map((x) => <option key={x.id} value={x.name} label={[x.article, x.unit, x.group].filter(Boolean).join(" · ")} />)}</datalist>
      <datalist id="fl-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>

      <section className={`${card} mb-4 flex flex-col gap-3 lg:flex-row lg:items-end`}>
        <label className="text-xs text-fl-cream/50">{t("Компания")}
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[220px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ {t("Добавить компанию…")}</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">{t("Период")}<PeriodPicker key={`${period.from}${period.to}`} from={period.from} to={period.to} onChange={(p) => setPeriod((c) => (c.from === p.from && c.to === p.to ? c : p))} /></div>
      </section>

      {company?.demo ? (
        <p className={`${card} mb-4 text-sm text-fl-cream/70`}>{t("В демо-компании документы не вводятся. Создайте свою компанию или копию демо в журнале проводок.")}</p>
      ) : !ro && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => start("sale")} className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{t("Новая реализация")}</button>
          <button onClick={() => start("purchase")} className="rounded-md border border-fl-gold/40 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10">{t("Новое поступление")}</button>
          <label className={`${btn} cursor-pointer`}>
            {t("Загрузить из 1С / Excel")}
            <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button onClick={template} className={btn}>{t("Шаблон Excel")}</button>
          <details className="w-full text-xs text-fl-cream/55">
            <summary className="cursor-pointer select-none hover:text-fl-cream">{t("Где взять документы в 1С")}</summary>
            <p className="mt-1.5 max-w-4xl leading-relaxed">{t("Многие документы сразу: «Отчёты» → «Универсальный отчёт» → тип «Документ», объект «Реализация (акты, накладные)» или «Поступление (акты, накладные)», таблица «Товары» → «Сформировать» → «Сохранить» → «Лист Excel 2007 (.xlsx)». Один документ: откройте его, вкладка «Товары» → «Ещё» → «Вывести список» → «Сохранить». Подойдёт любая таблица с колонками «Документ» (или «Дата» и «Номер»), «Контрагент», «Номенклатура», «Количество», «Цена», «Сумма», «Сумма НДС» — см. «Шаблон Excel».")}</p>
          </details>
        </div>
      )}

      {imp && (
        <section className={`${card} mb-5`}>
          <h2 className="font-display text-lg font-semibold text-fl-cream">{t("Загрузка документов из файла «{f}»", { f: imp.file })}</h2>
          <p className="mt-1 text-sm text-fl-cream/65">
            {t("Документов: {n} — реализаций {s}, поступлений {p}; строк: {r}; на сумму {sum} сом.", {
              n: imp.docs.length, s: imp.docs.filter((d) => d.type === "sale").length, p: imp.docs.filter((d) => d.type === "purchase").length,
              r: imp.docs.reduce((a, d) => a + d.rows.length, 0), sum: m2(imp.docs.reduce((a, d) => a + d.fileTotal, 0)),
            })}
          </p>
          {imp.problems.length > 0 && <p className="mt-1 text-xs text-fl-amber">{imp.problems.slice(0, 5).join(" · ")}</p>}
          <div className="mt-3 max-h-72 overflow-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5">{t("Дата")}</th><th>{t("Документ")}</th><th>{t("Контрагент")}</th><th className="text-right">{t("Строк")}</th><th className="text-right">{t("Сумма")}</th></tr></thead>
              <tbody>{imp.docs.slice(0, 100).map((d, i) => (
                <tr key={i} className="border-t border-fl-line">
                  <td className="whitespace-nowrap py-1.5 pr-3 text-fl-cream/70">{dmy(d.date)}</td>
                  <td className="py-1.5 pr-3">{t(DOC_LABEL[d.type])} № {d.number}</td>
                  <td className="py-1.5 pr-3 text-fl-cream/85">{d.party || "—"}</td>
                  <td className="num py-1.5 pr-3 text-right">{d.rows.length}</td>
                  <td className="num py-1.5 text-right">{m2(d.fileTotal)}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-fl-cream/55">{t("Если вид документа не указан в файле")}
              <select value={impType} onChange={(e) => { const ty = e.target.value as DocType; setImpType(ty); setImp((c) => (c ? { ...c, ...parseSheets(c.sheets, ty) } : c)); }} className={`${field} mt-1`}>
                <option value="sale">{t("Реализация")}</option>
                <option value="purchase">{t("Поступление")}</option>
              </select>
            </label>
            <label className="text-xs text-fl-cream/55">{t("Оплата")}
              <select value={impPayment} onChange={(e) => setImpPayment(e.target.value as Payment)} className={`${field} mt-1`}>
                {Object.entries(PAYMENT_LABEL.sale).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
              </select>
            </label>
          </div>
          <p className="mt-2 text-xs text-fl-cream/50">{t("Каждый документ проводится в журнале; новые товары добавятся в номенклатуру. Документы с уже занятым номером пропускаются.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button onClick={runImport} disabled={!!impProgress} className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{impProgress ? `${t("Загружаю…")} ${impProgress}` : t("Загрузить {n}", { n: imp.docs.length })}</button>
            <button onClick={() => setImp(null)} disabled={!!impProgress} className={btn}>{t("Отмена")}</button>
          </div>
        </section>
      )}

      {impReport.length > 0 && !imp && (
        <div className="mb-4 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-4 py-2.5 text-sm text-fl-cream/85">
          {impReport.map((x, i) => <p key={i}>{x}</p>)}
          <button onClick={() => setImpReport([])} className="mt-1 text-xs text-fl-cream/50 hover:underline">{t("скрыть")}</button>
        </div>
      )}

      {warn.length > 0 && (
        <div className="mb-4 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-4 py-2.5 text-sm text-fl-cream/85">
          {warn.map((x, i) => <p key={i}>{x}</p>)}
          <button onClick={() => setWarn([])} className="mt-1 text-xs text-fl-cream/50 hover:underline">{t("скрыть")}</button>
        </div>
      )}

      {saved && !draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-fl-green bg-fl-green/10 px-4 py-2.5 text-sm">
          <span>{t("Документ проведён. Печатные формы:")}</span>
          <button onClick={() => print(saved.entryId, saved.type, "pdf")} className="font-semibold text-fl-gold hover:underline">{saved.type === "sale" ? t("накладная и счёт") : saved.type === "purchase" ? t("приходный ордер М-4") : t("накладная на возврат")} — PDF</button>
          <button onClick={() => print(saved.entryId, saved.type, "docx")} className="text-fl-gold hover:underline">Word</button>
          <button onClick={() => setSaved(null)} className="ml-auto text-xs text-fl-cream/50 hover:underline">{t("скрыть")}</button>
        </div>
      )}

      {draft && doc && totals && (
        <section id="fl-doc" className={`${card} mb-5 scroll-mt-20`}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">{draft.entryId ? `${t(DOC_LABEL[draft.type])} № ${draft.number}` : t(NEW_TITLE[draft.type])}</h2>
          {isReturn(draft.type) && <p className="mt-1 text-xs text-fl-cream/55">{draft.type === "saleReturn" ? t("Покупатель возвращает товар: выручка и НДС уменьшаются (Дт 6120, Дт 3430), товар возвращается на склад по себестоимости.") : t("Возвращаем товар поставщику: долг поставщику и НДС к зачёту уменьшаются, товар уходит со склада.")}</p>}
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs text-fl-cream/55">{t("Дата")}<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{ownNumbering(draft.type) ? t("Номер") : t("Номер документа поставщика")}<input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55 sm:col-span-2">{isSaleSide(draft.type) ? t("Покупатель") : t("Поставщик")}<input list="fl-parties" value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} placeholder={isSaleSide(draft.type) ? "ОсОО «…», ИП …" : "ОсОО «…»"} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("ИНН")}<input inputMode="numeric" value={draft.partyInn} onChange={(e) => setDraft({ ...draft, partyInn: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Оплата")}<select value={draft.payment} onChange={(e) => setDraft({ ...draft, payment: e.target.value as Payment })} className={`${field} mt-1`}>{Object.entries(PAYMENT_LABEL[draft.type]).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2 text-fl-cream/80"><input type="checkbox" checked={draft.vatIncluded} onChange={(e) => setDraft({ ...draft, vatIncluded: e.target.checked })} className="accent-fl-gold" /> {t("Цены включают НДС")}</label>
            {draft.type !== "purchase" && <label className="flex min-w-[260px] flex-1 items-center gap-2 text-xs text-fl-cream/55">{t("Основание")}<input value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })} placeholder={t("договор № … от …")} className={cell} /></label>}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50">
                <th className="w-6 py-1.5">№</th><th className="py-1.5">{t("Номенклатура")}</th><th className="w-36">{t("Вид")}</th><th className="w-20">{t("Ед.")}</th><th className="w-24 text-right">{t("Кол-во")}</th><th className="w-28 text-right">{t("Цена")}</th><th className="w-28">{t("НДС")}</th><th className="w-28 text-right">{t("Сумма")}</th><th className="w-6" />
              </tr></thead>
              <tbody>{draft.rows.map((r, i) => {
                const rt = rowTotals({ ...r, qty: parseNum(r.qty) || 0, price: parseNum(r.price) || 0 }, draft.vatIncluded);
                const amount = rt.amount;
                const have = (draft.type === "sale" || draft.type === "purchaseReturn") && r.kind !== "service" && r.name.trim() ? stockOf(r.name) : null;
                const short = have !== null && (parseNum(r.qty) || 0) > have + 1e-9;
                return (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-1 text-xs text-fl-cream/45">{i + 1}</td>
                    <td className="py-1 pr-1">
                      <input list="fl-items" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder={t("начните вводить — подскажем из справочника")} className={cell} />
                      {have !== null && <p className={`mt-0.5 text-[11px] ${short ? "text-fl-amber" : "text-fl-cream/45"}`}>{t("на складе на {d}: {q}", { d: dmy(draft.date), q: `${String(Math.round(have * 1000) / 1000).replace(".", ",")} ${r.unit}` })}{short ? t(" — продаёте больше, чем есть") : ""}</p>}
                      {r.name.trim() && !r.itemId && !byName.has(itemKey(r.name)) && <p className="mt-0.5 text-[11px] text-fl-cream/45">{t("новая позиция — добавится в номенклатуру")}</p>}
                    </td>
                    <td className="py-1 pr-1"><select value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as ItemKind })} className={cell}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></td>
                    <td className="py-1 pr-1"><input list={OKEI_LIST_ID} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className={cell} /></td>
                    <td className="py-1 pr-1"><input inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={`${cell} text-right`} /></td>
                    <td className="py-1 pr-1"><input inputMode="decimal" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} className={`${cell} text-right`} /></td>
                    <td className="py-1 pr-1"><select value={r.vat} onChange={(e) => setRow(i, { vat: e.target.value as VatRate })} className={cell}>{Object.entries(VAT_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></td>
                    <td className="num py-2 pr-1 text-right">{amount ? m2(amount) : ""}{rt.vat > 0 ? <span className="block text-[11px] text-fl-cream/45">{t("НДС")} {m2(rt.vat)}</span> : null}</td>
                    <td className="py-1">{draft.rows.length > 1 && <button aria-label={t("Удалить строку {n}", { n: i + 1 })} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, j) => j !== i) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <button onClick={() => setDraft({ ...draft, rows: [...draft.rows, emptyRow(vatPayer ? "12" : "none")] })} className="mt-1 text-sm text-fl-gold hover:underline">+ {t("строка")}</button>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-fl-line pt-4">
            <div className="text-sm text-fl-cream/75">
              <p>{t("Без НДС")}: <span className="num">{m2(totals.net)}</span> · {t("НДС")}: <span className="num">{m2(totals.vat)}</span></p>
              <p className="mt-0.5 font-display text-xl font-bold text-fl-cream">{t("Всего")}: <span className="num">{m2(totals.gross)}</span> {t("сом")}</p>
              <p className="mt-1 text-xs text-fl-cream/50">
                {t("Проводка")}: {draft.type === "sale"
                  ? `Дт ${{ credit: "1410", cash: "1110", bank: "1210" }[draft.payment]} — Кт 6110${totals.vat ? `, Кт 3430 (${t("НДС")})` : ""}; ${t("себестоимость спишется по учётной политике, если включено автосписание на «Складе».")}`
                  : draft.type === "saleReturn"
                  ? `Дт 6120${totals.vat ? `, Дт 3430 (${t("НДС")})` : ""} — Кт ${{ credit: "1410", cash: "1110", bank: "1210" }[draft.payment]}; ${t("товар — на склад по себестоимости: Дт 1610 — Кт 7200.")}`
                  : draft.type === "purchaseReturn"
                  ? `Дт ${{ credit: "3110", cash: "1110", bank: "1210" }[draft.payment]} — Кт ${[...new Set(doc.rows.map((x) => ({ goods: "1610", material: "1620", product: "1640", service: "8040" })[x.kind]))].join(", ")}${totals.vat ? `, Кт 1540 (${t("НДС")})` : ""}.`
                  : `Дт ${[...new Set(doc.rows.map((x) => ({ goods: "1610", material: "1620", product: "1640", service: "8040" })[x.kind]))].join(", ")}${totals.vat ? `, Дт 1540 (${t("НДС")})` : ""} — Кт ${{ credit: "3110", cash: "1110", bank: "1210" }[draft.payment]}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={save} disabled={busy} className="rounded-md bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy ? t("Провожу…") : draft.entryId ? t("Сохранить изменения") : t("Провести")}</button>
              <button onClick={() => setDraft(null)} className={btn}>{t("Отмена")}</button>
            </div>
          </div>
        </section>
      )}

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-fl-surface-2 p-1 text-sm">
            {([["", t("Все")], ["sale", t("Реализация")], ["purchase", t("Поступление")], ["return", t("Возвраты")]] as Array<[DocType | "" | "return", string]>).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 ${filter === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{v}</button>
            ))}
          </div>
          {docs && docs.length > 0 && <p className="text-sm text-fl-cream/60">{t("Продано")}: <span className="num text-fl-cream">{m2(sum("sale"))}</span> · {t("закуплено")}: <span className="num text-fl-cream">{m2(sum("purchase"))}</span>{sum("saleReturn") + sum("purchaseReturn") > 0 && <> · {t("возвраты")}: <span className="num text-fl-cream">{m2(sum("saleReturn") + sum("purchaseReturn"))}</span></>}{due("sale") > 0 && <> · {t("покупатели должны")}: <span className="num text-fl-amber">{m2(due("sale"))}</span></>}{due("purchase") > 0 && <> · {t("должны поставщикам")}: <span className="num text-fl-amber">{m2(due("purchase"))}</span></>}</p>}
        </div>
        {docs === null ? <p className="text-sm text-fl-cream/50">{t("Загружаю…")}</p> : shown.length === 0 ? (
          <p className="text-sm text-fl-cream/60">{t("За период документов нет.")}{!ro && !company?.demo ? ` ${t("Нажмите «Новая реализация» или «Новое поступление».")}` : ""}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">{t("Дата")}</th><th>{t("Документ")}</th><th>{t("Контрагент")}</th><th>{t("Оплата")}</th><th className="text-right">{t("Сумма")}</th><th className="text-right">{t("НДС")}</th><th /></tr></thead>
              <tbody>{shown.map((s) => (
              <Fragment key={s.entryId}>
                <tr className="border-t border-fl-line align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-fl-cream/70">{dmy(s.date)}</td>
                  <td className="py-2 pr-3"><span className={`mr-1.5 inline-block rounded border px-1.5 py-px text-[11px] ${s.type === "sale" ? "border-fl-green/40 text-fl-green" : s.type === "purchase" ? "border-fl-info/40 text-fl-info" : "border-fl-amber/50 text-fl-amber"}`}>{s.importDoc ? t("Ввоз (импорт)") : t(DOC_LABEL[s.type])}</span>№ {s.number}<span className="ml-1 text-xs text-fl-cream/45">· {t("{n} стр.", { n: s.rows })}</span>{s.locked && <span className="ml-1 text-xs text-fl-cream/45">🔒</span>}</td>
                  <td className="py-2 pr-3 text-fl-cream/85">{s.party || "—"}</td>
                  <td className="py-2 pr-3 text-xs text-fl-cream/60">{t(PAYMENT_LABEL[s.type][s.payment])}
                    {s.dueStatus === "paid" && <span className="block text-fl-green">{t("оплачено")}</span>}
                    {s.dueStatus === "partial" && <span className="block text-fl-amber">{t("погашено {p} из {a}", { p: m2(s.paid ?? 0), a: m2(s.gross) })}</span>}
                    {s.dueStatus === "open" && <span className="block text-fl-amber">{t("не оплачено")}</span>}
                  </td>
                  <td className="num py-2 pr-3 text-right">{m2(s.gross)}</td>
                  <td className="num py-2 pr-3 text-right text-fl-cream/60">{s.vat ? m2(s.vat) : "—"}</td>
                  <td className="whitespace-nowrap py-2 text-right text-xs">
                    {s.importDoc ? <a href="/import-goods" className="text-fl-info hover:underline">{t("Открыть ввоз")}</a> : <>
                    <button onClick={() => open(s)} className="text-fl-info hover:underline">{ro || s.locked ? t("Открыть") : t("Изменить")}</button>
                    <button onClick={() => print(s.entryId, s.type, "pdf")} className="ml-2 text-fl-cream/60 hover:text-fl-gold hover:underline">{s.type === "sale" ? t("Накладная") : s.type === "purchase" ? "М-4" : t("Накладная")}</button>
                    {s.type === "sale" && <button onClick={() => esf(s)} className="ml-2 text-fl-cream/60 hover:text-fl-gold hover:underline">ЭСФ</button>}
                    {!ro && (s.due ?? 0) > 0 && <button onClick={() => setPayFor(payFor?.entryId === s.entryId ? null : { entryId: s.entryId, amount: String(s.due).replace(".", ","), date: today(), via: "bank" })} className="ml-2 text-fl-gold hover:underline">{t("Оплата")}</button>}
                    {!ro && !company?.demo && (s.type === "sale" || s.type === "purchase") && <button onClick={() => startReturn(s)} className="ml-2 text-fl-cream/60 hover:text-fl-gold hover:underline">{t("Возврат")}</button>}
                    {!ro && !s.locked && <button onClick={() => remove(s)} className="ml-2 text-fl-cream/40 hover:text-fl-red hover:underline">{t("Удалить")}</button>}
                    </>}
                  </td>
                </tr>
                {payFor?.entryId === s.entryId && (
                  <tr className="bg-fl-surface-2/40">
                    <td colSpan={7} className="px-2 pb-3 pt-1">
                      <div className="flex flex-wrap items-end gap-3">
                        <span className="pb-2 text-xs text-fl-cream/70">{t("Оплата по документу № {n}", { n: s.number })}:</span>
                        <label className="text-[11px] text-fl-cream/55">{t("Сумма")}<input inputMode="decimal" value={payFor.amount} onChange={(e) => setPayFor({ ...payFor, amount: e.target.value })} className={`${cell} mt-0.5 w-32 text-right`} /></label>
                        <label className="text-[11px] text-fl-cream/55">{t("Дата")}<input type="date" value={payFor.date} onChange={(e) => setPayFor({ ...payFor, date: e.target.value })} className={`${cell} mt-0.5`} /></label>
                        <label className="text-[11px] text-fl-cream/55">{t("Как")}<select value={payFor.via} onChange={(e) => setPayFor({ ...payFor, via: e.target.value as "bank" | "cash" })} className={`${cell} mt-0.5`}><option value="bank">{t("через банк")}</option><option value="cash">{t("наличными")}</option></select></label>
                        <button onClick={pay} disabled={busy} className="rounded-md bg-fl-accent px-3 py-2 text-xs font-semibold text-fl-on-accent disabled:opacity-50">{t("Записать оплату")}</button>
                        <button onClick={() => setPayFor(null)} className="pb-2 text-xs text-fl-cream/50 hover:underline">{t("Отмена")}</button>
                      </div>
                      <p className="mt-1 text-[11px] text-fl-cream/45">{t("Если оплата придёт банковской выпиской, здесь её не записывайте — выписка сама закроет долг.")}</p>
                    </td>
                  </tr>
                )}
              </Fragment>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <toast.ToastContainer />
    </main>
  );
}
