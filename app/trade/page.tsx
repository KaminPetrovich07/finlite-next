"use client";

// Продажи и закупки: документы «Реализация» и «Поступление» с табличной частью.
// Каждый документ — одна проводка журнала; себестоимость, склад, отчёты, ЭСФ и акты сверки — из неё.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { OKEI_LIST_ID, OkeiDatalist } from "@/components/okei/UnitInput";
import { formatNumber } from "@/lib/format";
import { monthPeriod } from "@/lib/ledger/period";
import { itemKey } from "@/lib/ledger/stock";
import { KIND_LABEL, VAT_LABEL, type CatalogItem, type ItemKind, type VatRate } from "@/lib/trade/catalog";
import { DOC_LABEL, docTotals, PAYMENT_LABEL, rowTotals, validateDoc, type DocRow, type DocType, type Payment, type TradeDoc } from "@/lib/trade/doc";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-full rounded border border-fl-line bg-fl-charcoal px-2 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const m2 = (n: number) => formatNumber(n, 2);
const dmy = (iso: string) => iso.split("-").reverse().join(".");
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const parseNum = (s: string) => Number(s.replace(/\s/g, "").replace(",", "."));

interface Summary { entryId: string; type: DocType; number: string; date: string; party: string; payment: Payment; gross: number; vat: number; rows: number; locked: boolean; editedInJournal: boolean }
interface Stock { item: string; unit: string; qty: number; account: string }
type RowDraft = Omit<DocRow, "qty" | "price"> & { qty: string; price: string };
interface Draft { entryId?: string; version?: string; type: DocType; number: string; date: string; party: string; partyInn: string; payment: Payment; vatIncluded: boolean; basis: string; comment: string; rows: RowDraft[] }

const emptyRow = (vat: VatRate): RowDraft => ({ name: "", unit: "шт", kind: "goods", qty: "", price: "", vat });
const toDoc = (d: Draft): TradeDoc => ({
  type: d.type, number: d.number, date: d.date, party: d.party, partyInn: d.partyInn || undefined, payment: d.payment, vatIncluded: d.vatIncluded,
  basis: d.basis || undefined, comment: d.comment || undefined,
  rows: d.rows.filter((r) => r.name.trim() || r.qty || r.price).map((r) => ({ ...r, qty: parseNum(r.qty) || 0, price: parseNum(r.price) || 0 })),
});

export default function TradePage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const toast = useToast();
  const [period, setPeriod] = useState(() => { const t = today(); return monthPeriod(Number(t.slice(0, 4)), Number(t.slice(5, 7))); });
  const [docs, setDocs] = useState<Summary[] | null>(null);
  const [ro, setRo] = useState(true);
  const [filter, setFilter] = useState<DocType | "">("");
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [vatPayer, setVatPayer] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [stock, setStock] = useState<Stock[]>([]);
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<{ entryId: string; type: DocType } | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setDocs(null);
    const [d, c] = await Promise.all([
      fetch(`/api/trade/docs?companyId=${companyId}&from=${period.from}&to=${period.to}`).then(async (r) => ({ ok: r.ok, b: await r.json().catch(() => ({})) })),
      fetch(`/api/trade/catalog?companyId=${companyId}`).then(async (r) => (r.ok ? r.json() : { items: [] })).catch(() => ({ items: [] })),
    ]);
    setDocs(d.ok ? d.b.docs : []); setRo(d.ok ? !!d.b.readOnly : true);
    if (!d.ok) toast.show(d.b.error ?? "Не удалось загрузить документы", "error");
    setCatalog(c.items ?? []); setVatPayer(!!c.vatPayer);
  }, [companyId, period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);
  useEffect(() => { setDraft(null); setSaved(null); }, [companyId]);

  // остатки на дату документа — подсказка при продаже
  useEffect(() => {
    if (!draft || draft.type !== "sale" || !companyId) return;
    const t = setTimeout(() => {
      fetch(`/api/stock?companyId=${companyId}&from=${draft.date.slice(0, 8)}01&to=${draft.date}`).then((r) => r.json()).then((b) => setStock(Array.isArray(b.stock) ? b.stock : [])).catch(() => setStock([]));
    }, 300);
    return () => clearTimeout(t);
  }, [draft?.date, draft?.type, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const byName = useMemo(() => new Map(catalog.map((x) => [itemKey(x.name), x])), [catalog]);
  const stockOf = (name: string) => stock.filter((s) => itemKey(s.item) === itemKey(name)).reduce((a, s) => a + s.qty, 0);
  const parties = useMemo(() => [...new Set((docs ?? []).map((d) => d.party).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")), [docs]);

  async function start(type: DocType) {
    const date = today() >= period.from && today() <= period.to ? today() : period.to;
    let number = "";
    if (type === "sale") number = (await fetch(`/api/trade/docs?companyId=${companyId}&next=${date}`).then((r) => r.json()).catch(() => ({}))).number ?? "";
    setSaved(null);
    setDraft({ type, number, date, party: "", partyInn: "", payment: "credit", vatIncluded: true, basis: "", comment: "", rows: [emptyRow(vatPayer ? "12" : "none"), emptyRow(vatPayer ? "12" : "none")] });
    setTimeout(() => document.getElementById("fl-doc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  async function open(s: Summary) {
    const r = await fetch(`/api/trade/docs/${s.entryId}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось открыть", "error"); return; }
    const d: TradeDoc = b.doc;
    setSaved(null);
    setDraft({ entryId: s.entryId, version: b.version, type: d.type, number: d.number, date: d.date, party: d.party, partyInn: d.partyInn ?? "", payment: d.payment, vatIncluded: d.vatIncluded, basis: d.basis ?? "", comment: d.comment ?? "",
      rows: d.rows.map((x) => ({ ...x, qty: String(x.qty).replace(".", ","), price: String(x.price).replace(".", ",") })) });
    if (b.editedInJournal) toast.show("Проводку документа меняли в журнале — документ собран из неё: проверьте цены и НДС", "info");
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
          const price = d.type === "sale" ? it.salePrice : it.purchasePrice != null && it.vat === "12" && d.vatIncluded ? Math.round(it.purchasePrice * 112) / 100 : it.purchasePrice;
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
    if (problems.length) { toast.show(problems[0], "error"); return; }
    setBusy(true);
    const r = await fetch(draft.entryId ? `/api/trade/docs/${draft.entryId}` : "/api/trade/docs", {
      method: draft.entryId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.entryId ? { doc, version: draft.version } : { companyId, doc }),
    });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(b.error ?? "Документ не сохранён", "error"); return; }
    toast.show(`${DOC_LABEL[doc.type]} № ${doc.number} ${draft.entryId ? "изменена" : "проведена"}${b.cogs ? ` — себестоимость списана (${b.cogs})` : ""}`);
    setSaved({ entryId: b.entryId, type: doc.type });
    setDraft(null);
    if (doc.date < period.from || doc.date > period.to) setPeriod(monthPeriod(Number(doc.date.slice(0, 4)), Number(doc.date.slice(5, 7))));
    else load();
  }
  async function remove(s: Summary) {
    if (!confirm(`Удалить ${DOC_LABEL[s.type].toLowerCase()} № ${s.number}? Проводка уйдёт из журнала (вернуть можно в журнале, раздел «Удалённые»).`)) return;
    const r = await fetch(`/api/ledger/${s.entryId}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось удалить", "error"); return; }
    toast.show("Документ удалён", "info");
    if (draft?.entryId === s.entryId) setDraft(null);
    load();
  }
  async function print(entryId: string, type: DocType, format: "pdf" | "docx", kinds?: string[]) {
    try {
      await downloadPost(`/api/trade/print?format=${format}`, { companyId, entryId, kinds: kinds ?? (type === "sale" ? ["waybill", "invoice"] : ["m4"]) }, `документ.${format}`);
    } catch (e) { toast.show(e instanceof Error ? e.message : "Не удалось сформировать", "error"); }
  }

  const doc = draft ? toDoc(draft) : null;
  const totals = doc ? docTotals(doc) : null;
  const shown = (docs ?? []).filter((d) => !filter || d.type === filter);
  const sum = (t: DocType) => (docs ?? []).filter((d) => d.type === t).reduce((a, d) => a + d.gross, 0);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Продажи и закупки</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Реализация и поступление с таблицей товаров и услуг. Проводки, НДС, остатки на складе и себестоимость формируются сами; накладная, счёт и приходный ордер — в один клик.</p>
        </div>
        <a href="/nomenclature" className="text-sm text-fl-gold underline-offset-4 hover:underline">Номенклатура ({catalog.length})</a>
      </header>
      <OkeiDatalist />
      <datalist id="fl-items">{catalog.filter((x) => !x.archived).slice(0, 3000).map((x) => <option key={x.id} value={x.name} label={[x.article, x.unit, x.group].filter(Boolean).join(" · ")} />)}</datalist>
      <datalist id="fl-parties">{parties.map((p) => <option key={p} value={p} />)}</datalist>

      <section className={`${card} mb-4 flex flex-col gap-3 lg:flex-row lg:items-end`}>
        <label className="text-xs text-fl-cream/50">Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[220px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">Период<PeriodPicker key={`${period.from}${period.to}`} from={period.from} to={period.to} onChange={(p) => setPeriod((c) => (c.from === p.from && c.to === p.to ? c : p))} /></div>
      </section>

      {company?.demo ? (
        <p className={`${card} mb-4 text-sm text-fl-cream/70`}>В демо-компании документы не вводятся. Создайте свою компанию или копию демо в журнале проводок.</p>
      ) : !ro && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => start("sale")} className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Новая реализация</button>
          <button onClick={() => start("purchase")} className="rounded-md border border-fl-gold/40 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10">Новое поступление</button>
        </div>
      )}

      {saved && !draft && (
        <div className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border-l-4 border-fl-green bg-fl-green/10 px-4 py-2.5 text-sm">
          <span>Документ проведён. Печатные формы:</span>
          <button onClick={() => print(saved.entryId, saved.type, "pdf")} className="font-semibold text-fl-gold hover:underline">{saved.type === "sale" ? "накладная и счёт" : "приходный ордер М-4"} — PDF</button>
          <button onClick={() => print(saved.entryId, saved.type, "docx")} className="text-fl-gold hover:underline">Word</button>
          <button onClick={() => setSaved(null)} className="ml-auto text-xs text-fl-cream/50 hover:underline">скрыть</button>
        </div>
      )}

      {draft && doc && totals && (
        <section id="fl-doc" className={`${card} mb-5 scroll-mt-20`}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">{draft.entryId ? `${DOC_LABEL[draft.type]} № ${draft.number}` : `Новая ${draft.type === "sale" ? "реализация" : "поступление"}`.replace("Новая поступление", "Новое поступление")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
            <label className="text-xs text-fl-cream/55">Дата<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{draft.type === "sale" ? "Номер" : "Номер документа поставщика"}<input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55 sm:col-span-2">{draft.type === "sale" ? "Покупатель" : "Поставщик"}<input list="fl-parties" value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} placeholder={draft.type === "sale" ? "ОсОО «…», ИП …" : "ОсОО «…»"} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">ИНН<input inputMode="numeric" value={draft.partyInn} onChange={(e) => setDraft({ ...draft, partyInn: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">Оплата<select value={draft.payment} onChange={(e) => setDraft({ ...draft, payment: e.target.value as Payment })} className={`${field} mt-1`}>{Object.entries(PAYMENT_LABEL[draft.type]).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
            <label className="flex items-center gap-2 text-fl-cream/80"><input type="checkbox" checked={draft.vatIncluded} onChange={(e) => setDraft({ ...draft, vatIncluded: e.target.checked })} className="accent-fl-gold" /> Цены включают НДС</label>
            {draft.type === "sale" && <label className="flex min-w-[260px] flex-1 items-center gap-2 text-xs text-fl-cream/55">Основание<input value={draft.basis} onChange={(e) => setDraft({ ...draft, basis: e.target.value })} placeholder="договор № … от …" className={cell} /></label>}
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50">
                <th className="w-6 py-1.5">№</th><th className="py-1.5">Номенклатура</th><th className="w-36">Вид</th><th className="w-20">Ед.</th><th className="w-24 text-right">Кол-во</th><th className="w-28 text-right">Цена</th><th className="w-28">НДС</th><th className="w-28 text-right">Сумма</th><th className="w-6" />
              </tr></thead>
              <tbody>{draft.rows.map((r, i) => {
                const t = rowTotals({ ...r, qty: parseNum(r.qty) || 0, price: parseNum(r.price) || 0 }, draft.vatIncluded);
                const amount = t.amount;
                const have = draft.type === "sale" && r.kind !== "service" && r.name.trim() ? stockOf(r.name) : null;
                const short = have !== null && (parseNum(r.qty) || 0) > have + 1e-9;
                return (
                  <tr key={i} className="align-top">
                    <td className="py-1 pr-1 text-xs text-fl-cream/45">{i + 1}</td>
                    <td className="py-1 pr-1">
                      <input list="fl-items" value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} placeholder="начните вводить — подскажем из справочника" className={cell} />
                      {have !== null && <p className={`mt-0.5 text-[11px] ${short ? "text-fl-amber" : "text-fl-cream/45"}`}>на складе на {dmy(draft.date)}: {String(Math.round(have * 1000) / 1000).replace(".", ",")} {r.unit}{short ? " — продаёте больше, чем есть" : ""}</p>}
                      {r.name.trim() && !r.itemId && !byName.has(itemKey(r.name)) && <p className="mt-0.5 text-[11px] text-fl-cream/45">новая позиция — добавится в номенклатуру</p>}
                    </td>
                    <td className="py-1 pr-1"><select value={r.kind} onChange={(e) => setRow(i, { kind: e.target.value as ItemKind })} className={cell}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="py-1 pr-1"><input list={OKEI_LIST_ID} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className={cell} /></td>
                    <td className="py-1 pr-1"><input inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={`${cell} text-right`} /></td>
                    <td className="py-1 pr-1"><input inputMode="decimal" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} className={`${cell} text-right`} /></td>
                    <td className="py-1 pr-1"><select value={r.vat} onChange={(e) => setRow(i, { vat: e.target.value as VatRate })} className={cell}>{Object.entries(VAT_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></td>
                    <td className="num py-2 pr-1 text-right">{amount ? m2(amount) : ""}{t && t.vat > 0 ? <span className="block text-[11px] text-fl-cream/45">НДС {m2(t.vat)}</span> : null}</td>
                    <td className="py-1">{draft.rows.length > 1 && <button aria-label={`Удалить строку ${i + 1}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, j) => j !== i) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
          <button onClick={() => setDraft({ ...draft, rows: [...draft.rows, emptyRow(vatPayer ? "12" : "none")] })} className="mt-1 text-sm text-fl-gold hover:underline">+ строка</button>

          <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-fl-line pt-4">
            <div className="text-sm text-fl-cream/75">
              <p>Без НДС: <span className="num">{m2(totals.net)}</span> · НДС: <span className="num">{m2(totals.vat)}</span></p>
              <p className="mt-0.5 font-display text-xl font-bold text-fl-cream">Всего: <span className="num">{m2(totals.gross)}</span> сом</p>
              <p className="mt-1 text-xs text-fl-cream/50">
                Проводка: {draft.type === "sale"
                  ? `Дт ${{ credit: "1410", cash: "1110", bank: "1210" }[draft.payment]} — Кт 6110${totals.vat ? ", Кт 3430 (НДС)" : ""}; себестоимость спишется по ${"учётной политике"}, если включено автосписание на «Складе».`
                  : `Дт ${[...new Set(doc.rows.map((x) => ({ goods: "1610", material: "1620", product: "1640", service: "8040" })[x.kind]))].join(", ")}${totals.vat ? ", Дт 1540 (НДС)" : ""} — Кт ${{ credit: "3110", cash: "1110", bank: "1210" }[draft.payment]}.`}
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <button onClick={save} disabled={busy} className="rounded-md bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy ? "Провожу…" : draft.entryId ? "Сохранить изменения" : "Провести"}</button>
              <button onClick={() => setDraft(null)} className={btn}>Отмена</button>
            </div>
          </div>
        </section>
      )}

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-1 rounded-xl bg-fl-surface-2 p-1 text-sm">
            {([["", "Все"], ["sale", "Реализация"], ["purchase", "Поступление"]] as Array<[DocType | "", string]>).map(([k, v]) => (
              <button key={k} onClick={() => setFilter(k)} className={`rounded-lg px-3 py-1.5 ${filter === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{v}</button>
            ))}
          </div>
          {docs && docs.length > 0 && <p className="text-sm text-fl-cream/60">Продано: <span className="num text-fl-cream">{m2(sum("sale"))}</span> · закуплено: <span className="num text-fl-cream">{m2(sum("purchase"))}</span></p>}
        </div>
        {docs === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : shown.length === 0 ? (
          <p className="text-sm text-fl-cream/60">За период документов нет.{!ro && !company?.demo ? " Нажмите «Новая реализация» или «Новое поступление»." : ""}</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">Дата</th><th>Документ</th><th>Контрагент</th><th>Оплата</th><th className="text-right">Сумма</th><th className="text-right">НДС</th><th /></tr></thead>
              <tbody>{shown.map((s) => (
                <tr key={s.entryId} className="border-t border-fl-line align-top">
                  <td className="whitespace-nowrap py-2 pr-3 text-fl-cream/70">{dmy(s.date)}</td>
                  <td className="py-2 pr-3"><span className={`mr-1.5 inline-block rounded border px-1.5 py-px text-[11px] ${s.type === "sale" ? "border-fl-green/40 text-fl-green" : "border-fl-info/40 text-fl-info"}`}>{DOC_LABEL[s.type]}</span>№ {s.number}<span className="ml-1 text-xs text-fl-cream/45">· {s.rows} стр.</span>{s.locked && <span className="ml-1 text-xs text-fl-cream/45">🔒</span>}</td>
                  <td className="py-2 pr-3 text-fl-cream/85">{s.party || "—"}</td>
                  <td className="py-2 pr-3 text-xs text-fl-cream/60">{PAYMENT_LABEL[s.type][s.payment]}</td>
                  <td className="num py-2 pr-3 text-right">{m2(s.gross)}</td>
                  <td className="num py-2 pr-3 text-right text-fl-cream/60">{s.vat ? m2(s.vat) : "—"}</td>
                  <td className="whitespace-nowrap py-2 text-right text-xs">
                    <button onClick={() => open(s)} className="text-fl-info hover:underline">{ro || s.locked ? "Открыть" : "Изменить"}</button>
                    <button onClick={() => print(s.entryId, s.type, "pdf")} className="ml-2 text-fl-cream/60 hover:text-fl-gold hover:underline">{s.type === "sale" ? "Накладная" : "М-4"}</button>
                    {!ro && !s.locked && <button onClick={() => remove(s)} className="ml-2 text-fl-cream/40 hover:text-fl-red hover:underline">Удалить</button>}
                  </td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
      <toast.ToastContainer />
    </main>
  );
}
