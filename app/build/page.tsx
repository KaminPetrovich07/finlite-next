"use client";

// Стройка: объекты строительства, смета (работы и нормы ресурсов), документы по объекту
// (списание материалов, затраты, акты КС-2), анализ «смета — факт» и печатные формы.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { OKEI_LIST_ID, OkeiDatalist } from "@/components/okei/UnitInput";
import { formatNumber } from "@/lib/format";
import { itemKey } from "@/lib/ledger/stock";
import {
  BDOC_LABEL, COST_LABEL, COST_PAY_LABEL, COST_TYPES, estimateTotals, newId, parsePasted, RECLASS_ACCOUNTS, resSum, rowAmount, workSum,
  type BDocType, type BRow, type BuildDoc, type BuildObject, type CostPay, type CostType, type ObjectAnalysis,
} from "@/lib/build/model";
import { accountName } from "@/lib/ledger/accounts";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-full rounded border border-fl-line bg-fl-charcoal px-2 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
const m0 = (n: number) => formatNumber(n, 0);
const m2 = (n: number) => formatNumber(n, 2);
const qn = (n: number) => String(Math.round(n * 1000) / 1000).replace(".", ",");
const dmy = (iso?: string) => (iso ? iso.split("-").reverse().join(".") : "—");
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const parseNum = (s: string) => { const n = Number(String(s).replace(/\s| /g, "").replace(",", ".")); return Number.isFinite(n) ? n : 0; };
const pctText = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);

interface Summary { id: string; name: string; customer: string; status: "active" | "done"; start?: string; end?: string; planWorks: number; planCost: number; accepted: number; factCost: number; wip: number; progress: number | null; docs: number; warnings: number }
interface DocItem { entryId: string; doc: BuildDoc; locked: boolean; editedInJournal: boolean; version: string }
interface Detail { object: BuildObject; docs: DocItem[]; analysis: ObjectAnalysis; readOnly: boolean }
interface StockRow { name: string; unit: string; qty: number; avg: number }
type Tab = "analysis" | "docs" | "estimate" | "card";
type RowDraft = Omit<BRow, "qty" | "price" | "vat"> & { qty: string; price: string; vat: string };
interface DocDraft { entryId?: string; version?: string; type: BDocType; number: string; date: string; from: string; to: string; pay: CostPay; party: string; partyInn: string; reclass: string; final: boolean; comment: string; rows: RowDraft[] }

const emptyRow = (type: BDocType, stageId?: string): RowDraft => ({ name: "", unit: type === "cost" ? "усл" : "шт", qty: type === "cost" ? "1" : "", price: "", vat: "", stageId, ...(type === "cost" ? { costType: "labor" as CostType } : {}) });
const toDoc = (d: DocDraft, objectId: string): BuildDoc => ({
  type: d.type, objectId, number: d.number.trim(), date: d.date,
  ...(d.type === "ks2" ? { from: d.from || undefined, to: d.to || undefined, final: d.final || undefined } : {}),
  ...(d.type === "cost" ? { pay: d.pay, party: d.party || undefined, partyInn: d.partyInn || undefined, reclass: d.pay === "reclass" ? d.reclass : undefined } : {}),
  comment: d.comment || undefined,
  rows: d.rows.filter((r) => r.name.trim() || parseNum(r.qty) || parseNum(r.price)).map((r) => ({
    ...r, qty: parseNum(r.qty), price: d.type === "writeoff" ? 0 : parseNum(r.price), vat: d.type === "cost" && r.vat ? parseNum(r.vat) : undefined,
  })),
});
const blankObject = (): BuildObject => {
  const s = newId();
  return { id: newId(), name: "", customer: "", vat: false, retentionPct: 0, advancePct: 0, warrantyMonths: 12, status: "active", start: today(), stages: [{ id: s, name: "Этап 1" }], works: [], resources: [] };
};

export default function BuildPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const toast = useToast();
  const [list, setList] = useState<Summary[] | null>(null);
  const [ro, setRo] = useState(true);
  const [sel, setSel] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<Tab>("analysis");
  const [obj, setObj] = useState<BuildObject | null>(null); // редактируемая копия объекта (смета, карточка)
  const [dirty, setDirty] = useState(false);
  const [draft, setDraft] = useState<DocDraft | null>(null);
  const [stock, setStock] = useState<StockRow[]>([]);
  const [catalog, setCatalog] = useState<Array<{ name: string; unit: string }>>([]);
  const [busy, setBusy] = useState(false);

  const loadList = useCallback(async () => {
    if (!companyId) return;
    setList(null);
    const r = await fetch(`/api/build/objects?companyId=${companyId}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось загрузить объекты", "error"); setList([]); return; }
    setList(b.objects); setRo(!!b.readOnly);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadDetail = useCallback(async (id: string) => {
    const r = await fetch(`/api/build/objects?companyId=${companyId}&id=${id}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось открыть объект", "error"); setSel(null); return; }
    setDetail(b); setObj(b.object); setDirty(false);
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { if (loaded) { setSel(null); setDetail(null); setDraft(null); loadList(); } }, [loaded, loadList]);
  useEffect(() => { if (sel && sel !== obj?.id) loadDetail(sel); }, [sel]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!companyId || company?.demo) return;
    fetch(`/api/trade/catalog?companyId=${companyId}`).then((r) => r.json()).then((b) => setCatalog((b.items ?? []).filter((x: { kind: string; archived?: boolean }) => x.kind !== "service" && !x.archived))).catch(() => setCatalog([]));
  }, [companyId, company?.demo]);
  // остатки материалов на дату списания
  useEffect(() => {
    if (!draft || draft.type !== "writeoff" || !companyId) return;
    const h = setTimeout(() => fetch(`/api/build/docs?companyId=${companyId}&stock=${draft.date}`).then((r) => r.json()).then((b) => setStock(b.stock ?? [])).catch(() => setStock([])), 250);
    return () => clearTimeout(h);
  }, [draft?.type, draft?.date, companyId]); // eslint-disable-line react-hooks/exhaustive-deps

  const o = obj;
  const a = detail?.analysis;
  const readOnly = !!detail?.readOnly || ro;
  const stageName = useMemo(() => new Map((o?.stages ?? []).map((s) => [s.id, s.name])), [o]);
  const stockBy = useMemo(() => new Map(stock.map((s) => [itemKey(s.name), s])), [stock]);

  function patchObj(p: Partial<BuildObject>) { if (!o) return; setObj({ ...o, ...p }); setDirty(true); }

  async function createObject(sample: boolean) {
    if (sample) {
      setBusy(true);
      const r = await fetch("/api/build/objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, sample: true }) });
      const b = await r.json().catch(() => ({}));
      setBusy(false);
      if (!r.ok) { toast.show(b.error ?? "Не удалось создать", "error"); return; }
      toast.show("Создан объект-пример со сметой — оформите по нему списание и акт КС-2");
      await loadList(); setSel(b.object.id); setTab("estimate");
      return;
    }
    const n = blankObject();
    setDetail({ object: n, docs: [], analysis: null as unknown as ObjectAnalysis, readOnly: false });
    setObj(n); setDirty(true); setSel(n.id); setTab("card");
  }
  async function saveObject() {
    if (!o) return;
    setBusy(true);
    const r = await fetch("/api/build/objects", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, object: o }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(b.error ?? "Объект не сохранён", "error"); return; }
    toast.show("Объект и смета сохранены");
    await loadDetail(o.id); loadList();
  }
  async function deleteObject() {
    if (!o) return;
    const n = detail?.docs.length ?? 0;
    if (!confirm(n ? `Удалить объект «${o.name}» и ${n} документов по нему? Проводки уйдут в «Удалённые» журнала.` : `Удалить объект «${o.name}»?`)) return;
    const r = await fetch(`/api/build/objects?companyId=${companyId}&id=${o.id}&withDocs=${n ? 1 : 0}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось удалить", "error"); return; }
    toast.show("Объект удалён", "info");
    setSel(null); setDetail(null); setObj(null); loadList();
  }

  // ── документы ──
  async function startDoc(type: BDocType) {
    if (!o) return;
    if (dirty) { toast.show("Сначала сохраните изменения сметы", "error"); return; }
    const number = (await fetch(`/api/build/docs?companyId=${companyId}&objectId=${o.id}&next=${type}`).then((r) => r.json()).catch(() => ({}))).number ?? "1";
    const d = today();
    setDraft({ type, number, date: d, from: `${d.slice(0, 8)}01`, to: d, pay: "reclass", party: "", partyInn: "", reclass: "7120", final: false, comment: "", rows: [emptyRow(type, o.stages[0]?.id)] });
    setTab("docs");
    setTimeout(() => document.getElementById("fl-bdoc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function openDoc(x: DocItem) {
    const d = x.doc;
    setDraft({
      entryId: x.entryId, version: x.version, type: d.type, number: d.number, date: d.date, from: d.from ?? "", to: d.to ?? "", pay: d.pay ?? "credit", party: d.party ?? "", partyInn: d.partyInn ?? "",
      reclass: d.reclass ?? "7120", final: !!d.final, comment: d.comment ?? "",
      rows: d.rows.map((r) => ({ ...r, qty: qn(r.qty), price: d.type === "writeoff" ? "" : String(r.price).replace(".", ","), vat: r.vat ? String(r.vat).replace(".", ",") : "" })),
    });
    if (x.editedInJournal) toast.show("Проводку документа меняли в журнале — документ собран из неё, проверьте строки", "info");
    setTimeout(() => document.getElementById("fl-bdoc")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }
  function setRow(i: number, p: Partial<RowDraft>) {
    setDraft((d) => {
      if (!d || !o) return d;
      const rows = d.rows.map((r, j) => (j === i ? { ...r, ...p } : r));
      if (p.workId !== undefined) {
        const w = o.works.find((x) => x.id === p.workId);
        if (w) rows[i] = { ...rows[i], name: w.name, code: w.code, unit: w.unit, stageId: w.stageId, price: String(w.price).replace(".", ","), qty: rows[i].qty || qn(Math.max(0, w.qty - acceptedQty(w.id))) };
      }
      if (p.name !== undefined && d.type === "writeoff") { const s = stockBy.get(itemKey(p.name)); if (s) rows[i] = { ...rows[i], unit: s.unit || rows[i].unit }; }
      if (i === rows.length - 1 && rows[i].name.trim()) rows.push(emptyRow(d.type, rows[i].stageId));
      return { ...d, rows };
    });
  }
  const acceptedQty = (workId: string) => (detail?.docs ?? []).filter((x) => x.doc.type === "ks2" && x.entryId !== draft?.entryId).reduce((s, x) => s + x.doc.rows.filter((r) => r.workId === workId).reduce((a2, r) => a2 + r.qty, 0), 0);
  function fillFromEstimate(stageId: string) {
    if (!o || !draft) return;
    if (draft.type === "ks2") {
      const rows = o.works.filter((w) => !stageId || w.stageId === stageId).map((w) => ({ workId: w.id, stageId: w.stageId, code: w.code, name: w.name, unit: w.unit, qty: qn(Math.max(0, w.qty - acceptedQty(w.id))), price: String(w.price).replace(".", ","), vat: "" })).filter((r) => parseNum(r.qty) > 0);
      if (!rows.length) { toast.show("По смете всё уже сдано", "info"); return; }
      setDraft({ ...draft, rows });
    } else if (draft.type === "writeoff") {
      const rows = (a?.materials ?? []).flatMap((m) => m.byStage.filter((b) => (!stageId || b.stageId === stageId) && b.planQty > b.factQty).map((b) => ({ name: m.name, unit: m.unit, stageId: b.stageId, qty: qn(Math.min(b.planQty - b.factQty, Math.max(0, stockBy.get(m.key)?.qty ?? b.planQty - b.factQty))), price: "", vat: "" })));
      if (!rows.length) { toast.show("По нормам сметы материалы этапа уже списаны", "info"); return; }
      setDraft({ ...draft, rows });
    }
  }
  async function saveDoc() {
    if (!draft || !o) return;
    const doc = toDoc(draft, o.id);
    if (!doc.rows.length) { toast.show("Добавьте строки документа", "error"); return; }
    setBusy(true);
    const r = await fetch(draft.entryId ? `/api/build/docs/${draft.entryId}` : "/api/build/docs", {
      method: draft.entryId ? "PUT" : "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft.entryId ? { doc, version: draft.version } : { companyId, doc }),
    });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(b.error ?? "Документ не проведён", "error"); return; }
    const cost = b.doc?.cost ? ` — себестоимость ${m2(b.doc.cost)} сом списана` : "";
    toast.show(`${BDOC_LABEL[doc.type]} № ${doc.number} ${draft.entryId ? "изменён" : "проведён"}${cost}`);
    setDraft(null);
    await loadDetail(o.id); loadList();
  }
  async function removeDoc(x: DocItem) {
    if (!confirm(`Удалить «${BDOC_LABEL[x.doc.type]}» № ${x.doc.number}? Проводка уйдёт в «Удалённые» журнала.`)) return;
    const r = await fetch(`/api/ledger/${x.entryId}`, { method: "DELETE" });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось удалить", "error"); return; }
    toast.show("Документ удалён", "info");
    if (draft?.entryId === x.entryId) setDraft(null);
    if (o) await loadDetail(o.id);
    loadList();
  }
  async function print(forms: string[], format: "pdf" | "docx", entryId?: string) {
    if (!o) return;
    try { await downloadPost(`/api/build/print?format=${format}`, { companyId, objectId: o.id, forms, ...(entryId ? { entryId } : {}) }, `документ.${format}`); }
    catch (e) { toast.show(e instanceof Error ? e.message : "Не удалось сформировать", "error"); }
  }

  // ── вид ──
  const est = o ? estimateTotals(o) : null;
  const ddoc = draft && o ? toDoc(draft, o.id) : null;
  const dnet = ddoc ? ddoc.rows.reduce((s, r) => s + rowAmount(r), 0) : 0;
  const dvat = ddoc?.type === "ks2" ? (o?.vat ? Math.round(dnet * 12) / 100 : 0) : ddoc?.type === "cost" && ddoc.pay !== "reclass" ? ddoc.rows.reduce((s, r) => s + (r.vat ?? 0), 0) : 0;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Стройка</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Объекты, смета с нормами материалов, списание материалов и затраты по этапам, акты КС-2 и КС-3. Себестоимость, выручка и ЭСФ — из документов; анализ показывает, сколько материалов и денег ушло на каждый этап против сметы.</p>
      </header>
      <OkeiDatalist />
      <datalist id="fl-mat">{(draft?.type === "writeoff" ? stock.map((s) => ({ name: s.name, unit: s.unit })) : catalog).slice(0, 3000).map((x) => <option key={x.name} value={x.name} label={x.unit} />)}</datalist>

      <section className={`${card} mb-4 flex flex-wrap items-end gap-3`}>
        <label className="text-xs text-fl-cream/50">Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        {sel && <button onClick={() => { if (dirty && !confirm("Смета не сохранена. Выйти без сохранения?")) return; setSel(null); setDetail(null); setObj(null); setDraft(null); }} className={btn}>← Все объекты</button>}
      </section>

      {!sel && (
        <>
          {company?.demo && <p className={`${card} mb-4 text-sm text-fl-cream/70`}>В демо-компании показан объект-пример с документами — откройте его, чтобы посмотреть анализ и печатные формы. Чтобы вести свои объекты, создайте компанию.</p>}
          {!ro && !company?.demo && (
            <div className="mb-4 flex flex-wrap gap-2">
              <button onClick={() => createObject(false)} className={primary}>Новый объект</button>
              <button onClick={() => createObject(true)} disabled={busy} className="rounded-md border border-fl-gold/40 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10">Объект-пример со сметой</button>
            </div>
          )}
          {list === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : list.length === 0 ? (
            <p className={`${card} text-sm text-fl-cream/60`}>Объектов пока нет. Создайте объект: договор с заказчиком, этапы, смета работ и нормы материалов — потом по нему списываются материалы и оформляются акты КС-2.</p>
          ) : (
            <div className="grid gap-3 md:grid-cols-2">
              {list.map((s) => (
                <button key={s.id} onClick={() => { setSel(s.id); setTab(s.docs ? "analysis" : "estimate"); }} className={`${card} text-left hover:border-fl-gold/40`}>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-display text-lg font-semibold text-fl-cream">{s.name}</p>
                      <p className="text-xs text-fl-cream/55">{s.customer || "заказчик не указан"} · {dmy(s.start)} — {dmy(s.end)}</p>
                    </div>
                    <span className={`rounded border px-1.5 py-px text-[11px] ${s.status === "done" ? "border-fl-green/40 text-fl-green" : "border-fl-info/40 text-fl-info"}`}>{s.status === "done" ? "завершён" : "в работе"}</span>
                  </div>
                  <Progress value={s.progress} label="Сдано по актам" />
                  <div className="mt-2 grid grid-cols-3 gap-2 text-xs text-fl-cream/60">
                    <span>Смета работ<br /><b className="num text-sm text-fl-cream">{m0(s.planWorks)}</b></span>
                    <span>Затраты: факт / план<br /><b className="num text-sm text-fl-cream">{m0(s.factCost)}</b> / {m0(s.planCost)}</span>
                    <span>НЗП<br /><b className="num text-sm text-fl-cream">{m0(s.wip)}</b></span>
                  </div>
                  {s.warnings > 0 && <p className="mt-2 text-xs text-fl-amber">⚠ {s.warnings} замеч. в анализе</p>}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {sel && o && (
        <>
          <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 className="font-display text-2xl font-bold text-fl-cream">{o.name || "Новый объект"}</h2>
              <p className="text-sm text-fl-cream/55">{o.customer || "заказчик не указан"}{o.contractNo ? ` · договор № ${o.contractNo} от ${dmy(o.contractDate)}` : ""}</p>
            </div>
            {!readOnly && detail?.analysis && (
              <div className="flex flex-wrap gap-2">
                <button onClick={() => startDoc("writeoff")} className={btn}>+ Списание материалов</button>
                <button onClick={() => startDoc("cost")} className={btn}>+ Затраты</button>
                <button onClick={() => startDoc("ks2")} className={primary}>+ Акт КС-2</button>
              </div>
            )}
          </div>
          <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-fl-surface-2 p-1 text-sm">
            {([["analysis", "Анализ"], ["docs", `Документы (${detail?.docs.length ?? 0})`], ["estimate", "Смета"], ["card", "Карточка и договор"]] as Array<[Tab, string]>).map(([k, v]) => (
              <button key={k} onClick={() => setTab(k)} disabled={!detail?.analysis && (k === "analysis" || k === "docs")} className={`rounded-lg px-3 py-1.5 disabled:opacity-40 ${tab === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{v}</button>
            ))}
            {dirty && <span className="ml-auto self-center px-2 text-xs text-fl-amber">есть несохранённые изменения</span>}
          </div>

          {tab === "analysis" && a && <Analysis o={o} a={a} stageName={stageName} onPrint={print} />}

          {tab === "docs" && detail && (
            <>
              {draft && ddoc && (
                <section id="fl-bdoc" className={`${card} mb-5 scroll-mt-20`}>
                  <h3 className="font-display text-xl font-semibold text-fl-cream">{draft.entryId ? `${BDOC_LABEL[draft.type]} № ${draft.number}` : `${BDOC_LABEL[draft.type]} — новый`}</h3>
                  <p className="mt-1 text-xs text-fl-cream/55">{draft.type === "writeoff" ? "Материалы со склада на объект: Дт 1630 — Кт 1620 по средней себестоимости на дату. Сколько есть на складе — видно в строке." : draft.type === "cost" ? "Работа бригады, техника, субподряд, доставка — на объект (Дт 1630). Зарплату, уже начисленную в «Кадрах», переносите с её счёта." : "Выручка по актам: Дт 1410 — Кт 6140 (+ НДС); себестоимость сданного — Дт 7400 — Кт 1630, доля незавершённого производства объекта."}</p>
                  <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-6">
                    <label className="text-xs text-fl-cream/55">Номер<input value={draft.number} onChange={(e) => setDraft({ ...draft, number: e.target.value })} className={`${field} mt-1`} /></label>
                    <label className="text-xs text-fl-cream/55">Дата<input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={`${field} mt-1`} /></label>
                    {draft.type === "ks2" && <>
                      <label className="text-xs text-fl-cream/55">Период с<input type="date" value={draft.from} onChange={(e) => setDraft({ ...draft, from: e.target.value })} className={`${field} mt-1`} /></label>
                      <label className="text-xs text-fl-cream/55">по<input type="date" value={draft.to} onChange={(e) => setDraft({ ...draft, to: e.target.value })} className={`${field} mt-1`} /></label>
                      <label className="flex items-end gap-2 pb-2 text-sm text-fl-cream/80 lg:col-span-2"><input type="checkbox" checked={draft.final} onChange={(e) => setDraft({ ...draft, final: e.target.checked })} className="accent-fl-gold" /> последний акт — списать всё НЗП объекта</label>
                    </>}
                    {draft.type === "cost" && <>
                      <label className="text-xs text-fl-cream/55 lg:col-span-2">Откуда затраты<select value={draft.pay} onChange={(e) => setDraft({ ...draft, pay: e.target.value as CostPay })} className={`${field} mt-1`}>{Object.entries(COST_PAY_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
                      {draft.pay === "reclass" ? (
                        <label className="text-xs text-fl-cream/55 lg:col-span-2">С какого счёта<select value={draft.reclass} onChange={(e) => setDraft({ ...draft, reclass: e.target.value })} className={`${field} mt-1`}>{RECLASS_ACCOUNTS.map((x) => <option key={x} value={x}>{x} {accountName(x)}</option>)}</select></label>
                      ) : <>
                        <label className="text-xs text-fl-cream/55">{draft.pay === "credit" ? "Поставщик, субподрядчик" : "Кому (необязательно)"}<input value={draft.party} onChange={(e) => setDraft({ ...draft, party: e.target.value })} className={`${field} mt-1`} /></label>
                        <label className="text-xs text-fl-cream/55">ИНН<input inputMode="numeric" value={draft.partyInn} onChange={(e) => setDraft({ ...draft, partyInn: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={`${field} mt-1`} /></label>
                      </>}
                    </>}
                  </div>
                  {draft.type !== "cost" && (
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
                      <span className="text-xs text-fl-cream/55">{draft.type === "ks2" ? "Заполнить из сметы (несданный остаток):" : "Заполнить по нормам сметы (ещё не списано):"}</span>
                      <button onClick={() => fillFromEstimate("")} className="text-fl-gold hover:underline">весь объект</button>
                      {o.stages.map((s) => <button key={s.id} onClick={() => fillFromEstimate(s.id)} className="text-fl-gold hover:underline">{s.name}</button>)}
                    </div>
                  )}
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[900px] text-sm">
                      <thead><tr className="text-left text-xs text-fl-cream/50">
                        <th className="w-6 py-1.5">№</th>
                        {draft.type === "ks2" && <th className="w-56">Работа по смете</th>}
                        {draft.type === "cost" && <th className="w-40">Вид затрат</th>}
                        <th>{draft.type === "writeoff" ? "Материал" : "Наименование"}</th>
                        <th className="w-48">Этап</th>
                        <th className="w-20">Ед.</th>
                        <th className="w-24 text-right">{draft.type === "cost" ? "Кол-во" : draft.type === "ks2" ? "Объём" : "Кол-во"}</th>
                        {draft.type !== "writeoff" && <th className="w-28 text-right">{draft.type === "cost" ? "Цена без НДС" : "Цена"}</th>}
                        {draft.type === "cost" && draft.pay !== "reclass" && <th className="w-24 text-right">НДС, сом</th>}
                        <th className="w-28 text-right">Сумма</th><th className="w-6" />
                      </tr></thead>
                      <tbody>{draft.rows.map((r, i) => {
                        const s = draft.type === "writeoff" && r.name.trim() ? stockBy.get(itemKey(r.name)) : undefined;
                        const short = draft.type === "writeoff" && r.name.trim() && (!s || s.qty < parseNum(r.qty) - 1e-9);
                        const amount = draft.type === "writeoff" ? (s ? parseNum(r.qty) * s.avg : 0) : parseNum(r.qty) * parseNum(r.price);
                        return (
                          <tr key={i} className="align-top">
                            <td className="py-1 pr-1 text-xs text-fl-cream/45">{i + 1}</td>
                            {draft.type === "ks2" && <td className="py-1 pr-1"><select value={r.workId ?? ""} onChange={(e) => setRow(i, { workId: e.target.value || undefined })} className={cell}><option value="">— вне сметы —</option>{o.works.map((w) => <option key={w.id} value={w.id}>{w.code ? `${w.code} ` : ""}{w.name}</option>)}</select></td>}
                            {draft.type === "cost" && <td className="py-1 pr-1"><select value={r.costType ?? "other"} onChange={(e) => setRow(i, { costType: e.target.value as CostType })} className={cell}>{COST_TYPES.filter((x) => x !== "material").map((x) => <option key={x} value={x}>{COST_LABEL[x]}</option>)}</select></td>}
                            <td className="py-1 pr-1">
                              <input list={draft.type === "writeoff" ? "fl-mat" : undefined} value={r.name} onChange={(e) => setRow(i, { name: e.target.value })} className={cell} />
                              {draft.type === "writeoff" && r.name.trim() && <p className={`mt-0.5 text-[11px] ${short ? "text-fl-amber" : "text-fl-cream/45"}`}>{s ? `на складе ${qn(s.qty)} ${s.unit} по ${m2(s.avg)}` : "нет на складе на эту дату"}{short && s ? " — меньше, чем списываете" : ""}</p>}
                            </td>
                            <td className="py-1 pr-1"><select value={r.stageId ?? ""} onChange={(e) => setRow(i, { stageId: e.target.value || undefined })} className={cell}>{o.stages.map((st) => <option key={st.id} value={st.id}>{st.name}</option>)}</select></td>
                            <td className="py-1 pr-1"><input list={OKEI_LIST_ID} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} className={cell} /></td>
                            <td className="py-1 pr-1"><input inputMode="decimal" value={r.qty} onChange={(e) => setRow(i, { qty: e.target.value })} className={`${cell} text-right`} /></td>
                            {draft.type !== "writeoff" && <td className="py-1 pr-1"><input inputMode="decimal" value={r.price} onChange={(e) => setRow(i, { price: e.target.value })} className={`${cell} text-right`} /></td>}
                            {draft.type === "cost" && draft.pay !== "reclass" && <td className="py-1 pr-1"><input inputMode="decimal" value={r.vat} onChange={(e) => setRow(i, { vat: e.target.value })} className={`${cell} text-right`} /></td>}
                            <td className="num py-2 pr-1 text-right">{amount ? m2(amount) : ""}</td>
                            <td className="py-1">{draft.rows.length > 1 && <button aria-label={`Удалить строку ${i + 1}`} onClick={() => setDraft({ ...draft, rows: draft.rows.filter((_, j) => j !== i) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>}</td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                  <button onClick={() => setDraft({ ...draft, rows: [...draft.rows, emptyRow(draft.type, o.stages[0]?.id)] })} className="mt-1 text-sm text-fl-gold hover:underline">+ строка</button>
                  <div className="mt-4 flex flex-wrap items-end justify-between gap-4 border-t border-fl-line pt-4">
                    <div className="text-sm text-fl-cream/75">
                      {draft.type === "writeoff"
                        ? <p>Себестоимость считается по средней цене склада на дату списания.</p>
                        : <><p>Без НДС: <span className="num">{m2(dnet)}</span>{dvat ? <> · НДС: <span className="num">{m2(dvat)}</span></> : null}</p>
                          <p className="mt-0.5 font-display text-xl font-bold text-fl-cream">Всего: <span className="num">{m2(dnet + dvat)}</span> сом</p></>}
                    </div>
                    <div className="flex gap-2">
                      <button onClick={saveDoc} disabled={busy} className={primary}>{busy ? "Провожу…" : draft.entryId ? "Сохранить изменения" : "Провести"}</button>
                      <button onClick={() => setDraft(null)} className={btn}>Отмена</button>
                    </div>
                  </div>
                </section>
              )}
              <section className={card}>
                {detail.docs.length === 0 ? <p className="text-sm text-fl-cream/60">Документов по объекту пока нет. Начните со списания материалов или затрат, затем оформите акт КС-2.</p> : (
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-sm">
                      <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">Дата</th><th>Документ</th><th>Содержание</th><th className="text-right">Сумма</th><th className="text-right">Себестоимость</th><th /></tr></thead>
                      <tbody>{[...detail.docs].reverse().map((x) => {
                        const d = x.doc;
                        const net = d.rows.reduce((s, r) => s + rowAmount(r), 0);
                        return (
                          <tr key={x.entryId} className="border-t border-fl-line align-top">
                            <td className="whitespace-nowrap py-2 pr-3 text-fl-cream/70">{dmy(d.date)}</td>
                            <td className="whitespace-nowrap py-2 pr-3"><span className={`mr-1.5 inline-block rounded border px-1.5 py-px text-[11px] ${d.type === "ks2" ? "border-fl-green/40 text-fl-green" : d.type === "writeoff" ? "border-fl-gold/40 text-fl-gold" : "border-fl-info/40 text-fl-info"}`}>{BDOC_LABEL[d.type]}</span>№ {d.number}{x.locked && " 🔒"}</td>
                            <td className="py-2 pr-3 text-xs text-fl-cream/70">{d.rows.slice(0, 3).map((r) => r.name).join("; ")}{d.rows.length > 3 ? ` и ещё ${d.rows.length - 3}` : ""}{d.party ? ` — ${d.party}` : ""}</td>
                            <td className="num py-2 pr-3 text-right">{m2(net)}</td>
                            <td className="num py-2 pr-3 text-right text-fl-cream/60">{d.type === "ks2" ? m2(d.cost ?? 0) : "—"}</td>
                            <td className="whitespace-nowrap py-2 text-right text-xs">
                              {d.type === "ks2" && <>
                                <button onClick={() => print(["ks2"], "pdf", x.entryId)} className="text-fl-cream/70 hover:text-fl-gold hover:underline">КС-2</button>
                                <button onClick={() => print(["ks3"], "pdf", x.entryId)} className="ml-2 text-fl-cream/70 hover:text-fl-gold hover:underline">КС-3</button>
                                <button onClick={() => print(["act"], "pdf", x.entryId)} className="ml-2 text-fl-cream/70 hover:text-fl-gold hover:underline">Акт</button>
                                <button onClick={() => print(["invoice"], "pdf", x.entryId)} className="ml-2 text-fl-cream/70 hover:text-fl-gold hover:underline">Счёт</button>
                                <button onClick={() => print(["act", "invoice"], "docx", x.entryId)} className="ml-2 text-fl-cream/50 hover:text-fl-gold hover:underline">Word</button>
                              </>}
                              {d.type === "writeoff" && <button onClick={() => print(["writeoff"], "pdf", x.entryId)} className="text-fl-cream/70 hover:text-fl-gold hover:underline">Акт списания</button>}
                              {!readOnly && !x.locked && <>
                                <button onClick={() => openDoc(x)} className="ml-3 text-fl-info hover:underline">Изменить</button>
                                <button onClick={() => removeDoc(x)} className="ml-2 text-fl-cream/40 hover:text-fl-red hover:underline">Удалить</button>
                              </>}
                            </td>
                          </tr>
                        );
                      })}</tbody>
                    </table>
                  </div>
                )}
                <p className="mt-3 text-xs text-fl-cream/45">ЭСФ по актам КС-2 выгружается в разделе <a href="/esf" className="text-fl-gold hover:underline">«ЭСФ»</a> → продажи (выручка 6140 идёт как акт услуг).</p>
              </section>
            </>
          )}

          {tab === "estimate" && est && (
            <Estimate o={o} est={est} readOnly={readOnly} patch={patchObj} catalog={catalog} toast={toast} />
          )}

          {tab === "card" && (
            <section className={card}>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <label className="text-xs text-fl-cream/55 sm:col-span-2">Наименование объекта<input value={o.name} disabled={readOnly} onChange={(e) => patchObj({ name: e.target.value })} placeholder="Склад 32 м², ул. …" className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55 sm:col-span-2">Адрес<input value={o.address ?? ""} disabled={readOnly} onChange={(e) => patchObj({ address: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55 sm:col-span-2">Заказчик (генподрядчик)<input value={o.customer} disabled={readOnly} onChange={(e) => patchObj({ customer: e.target.value })} placeholder="ОсОО «…»" className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">ИНН заказчика<input inputMode="numeric" value={o.customerInn ?? ""} disabled={readOnly} onChange={(e) => patchObj({ customerInn: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Инвестор (если другой)<input value={o.investor ?? ""} disabled={readOnly} onChange={(e) => patchObj({ investor: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Договор подряда №<input value={o.contractNo ?? ""} disabled={readOnly} onChange={(e) => patchObj({ contractNo: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">от<input type="date" value={o.contractDate ?? ""} disabled={readOnly} onChange={(e) => patchObj({ contractDate: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Начало работ<input type="date" value={o.start ?? ""} disabled={readOnly} onChange={(e) => patchObj({ start: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Окончание<input type="date" value={o.end ?? ""} disabled={readOnly} onChange={(e) => patchObj({ end: e.target.value })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Аванс, %<input inputMode="decimal" value={String(o.advancePct ?? 0)} disabled={readOnly} onChange={(e) => patchObj({ advancePct: Math.min(100, parseNum(e.target.value)) })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Гарантийное удержание, %<input inputMode="decimal" value={String(o.retentionPct)} disabled={readOnly} onChange={(e) => patchObj({ retentionPct: Math.min(50, parseNum(e.target.value)) })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Гарантия, мес.<input inputMode="numeric" value={String(o.warrantyMonths ?? 12)} disabled={readOnly} onChange={(e) => patchObj({ warrantyMonths: Math.round(parseNum(e.target.value)) })} className={`${field} mt-1`} /></label>
                <label className="text-xs text-fl-cream/55">Статус<select value={o.status} disabled={readOnly} onChange={(e) => patchObj({ status: e.target.value as BuildObject["status"] })} className={`${field} mt-1`}><option value="active">в работе</option><option value="done">завершён — следующий акт спишет всё НЗП</option></select></label>
                <label className="flex items-end gap-2 pb-2 text-sm text-fl-cream/80"><input type="checkbox" checked={o.vat} disabled={readOnly} onChange={(e) => patchObj({ vat: e.target.checked })} className="accent-fl-gold" /> работы облагаются НДС 12 %</label>
              </div>
              <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-fl-line pt-4">
                {!readOnly && <button onClick={saveObject} disabled={busy} className={primary}>{busy ? "Сохраняю…" : "Сохранить объект"}</button>}
                {detail?.analysis && <>
                  <button onClick={() => print(["contract"], "docx")} className={btn}>Договор подряда — Word</button>
                  <button onClick={() => print(["contract"], "pdf")} className={btn}>PDF</button>
                </>}
                {!readOnly && detail?.analysis && <button onClick={deleteObject} className="ml-auto text-sm text-fl-cream/45 hover:text-fl-red hover:underline">Удалить объект</button>}
              </div>
              <p className="mt-2 text-xs text-fl-cream/45">Договор подряда собирается из карточки и сметы работ: предмет, стоимость по этапам, аванс, оплата по КС-2/КС-3, гарантийное удержание, сроки, гарантия, ответственность. Это типовой текст — сверьте его с юристом и условиями заказчика.</p>
            </section>
          )}
          {tab === "estimate" && !readOnly && dirty && (
            <div className="sticky bottom-20 mt-3 flex justify-end"><button onClick={saveObject} disabled={busy} className={`${primary} shadow-card`}>{busy ? "Сохраняю…" : "Сохранить смету"}</button></div>
          )}
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

function Progress({ value, label }: { value: number | null; label: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className="mt-3">
      <div className="flex justify-between text-xs text-fl-cream/55"><span>{label}</span><span className="num text-fl-cream">{pctText(value)}</span></div>
      <div className="mt-1 h-2 rounded-full bg-fl-surface-2"><div className="h-2 rounded-full bg-fl-gold" style={{ width: `${v}%` }} /></div>
    </div>
  );
}

function Tile({ title, value, sub, tone }: { title: string; value: string; sub?: string; tone?: "good" | "bad" }) {
  return (
    <div className="rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2.5">
      <p className="text-xs text-fl-cream/55">{title}</p>
      <p className={`num mt-0.5 font-display text-xl font-bold ${tone === "bad" ? "text-fl-red" : tone === "good" ? "text-fl-green" : "text-fl-cream"}`}>{value}</p>
      {sub && <p className="text-[11px] text-fl-cream/50">{sub}</p>}
    </div>
  );
}

/** Две полосы на строку: план (светлая) и факт (золотая) в одном масштабе. */
function Bars({ rows, unit = "сом" }: { rows: Array<{ label: string; plan: number; fact: number }>; unit?: string }) {
  const max = Math.max(1, ...rows.flatMap((r) => [r.plan, r.fact]));
  return (
    <div className="space-y-2.5">
      <div className="flex gap-4 text-[11px] text-fl-cream/55"><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-fl-cream/25" /> по смете</span><span className="flex items-center gap-1"><i className="inline-block h-2 w-3 rounded-sm bg-fl-gold" /> фактически</span></div>
      {rows.map((r) => (
        <div key={r.label} title={`${r.label}: по смете ${m0(r.plan)} ${unit}, факт ${m0(r.fact)} ${unit}`}>
          <div className="flex justify-between gap-2 text-xs"><span className="truncate text-fl-cream/80">{r.label}</span><span className="num shrink-0 text-fl-cream/60">{m0(r.fact)} / {m0(r.plan)}</span></div>
          <div className="mt-0.5 h-1.5 rounded-sm bg-fl-cream/10"><div className="h-1.5 rounded-sm bg-fl-cream/25" style={{ width: `${(r.plan / max) * 100}%` }} /></div>
          <div className="mt-0.5 h-1.5 rounded-sm"><div className={`h-1.5 rounded-sm ${r.plan > 0 && r.fact > r.plan ? "bg-fl-red" : "bg-fl-gold"}`} style={{ width: `${(r.fact / max) * 100}%` }} /></div>
        </div>
      ))}
    </div>
  );
}

function Analysis({ o, a, stageName, onPrint }: { o: BuildObject; a: ObjectAnalysis; stageName: Map<string, string>; onPrint: (forms: string[], f: "pdf" | "docx") => void }) {
  const over = a.factCost > a.plan.cost && a.plan.cost > 0;
  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile title="Смета работ (без НДС)" value={m0(a.plan.works)} sub={`плановые затраты ${m0(a.plan.cost)} · маржа ${pctText(a.plan.marginPct)}`} />
          <Tile title="Сдано по актам КС-2" value={m0(a.accepted)} sub={`${pctText(a.progress)} сметы${a.acceptedVat ? ` · с НДС ${m0(a.acceptedGross)}` : ""}`} />
          <Tile title="Затраты: факт" value={m0(a.factCost)} sub={`из них в НЗП ${m0(a.wip)} · списано актами ${m0(a.writtenOff)}`} tone={over ? "bad" : undefined} />
          <Tile title="Прибыль по сданным работам" value={m0(a.grossProfit)} sub={`рентабельность ${pctText(a.marginPct)}${a.forecastMargin != null ? ` · прогноз по объекту ${m0(a.forecastMargin)}` : ""}`} tone={a.grossProfit < 0 ? "bad" : a.grossProfit > 0 ? "good" : undefined} />
        </div>
        <Progress value={a.progress} label="Готовность по актам" />
        <div className="mt-3 flex flex-wrap gap-2 text-sm">
          <button onClick={() => onPrint(["report"], "pdf")} className={btn}>Отчёт по объекту — PDF</button>
          <button onClick={() => onPrint(["report"], "docx")} className={btn}>Word</button>
          <button onClick={() => onPrint(["materials"], "pdf")} className={btn}>Расход материалов по нормам — PDF</button>
          <button onClick={() => onPrint(["materials"], "docx")} className={btn}>Word</button>
        </div>
      </section>

      {a.warnings.length > 0 && (
        <section className="rounded-xl border border-fl-amber/40 bg-fl-amber/10 p-4 text-sm">
          <p className="mb-1 font-semibold text-fl-cream">На что обратить внимание</p>
          <ul className="list-disc space-y-0.5 pl-5 text-fl-cream/80">{a.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
        </section>
      )}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className={card}>
          <h3 className="mb-3 font-display text-lg font-semibold text-fl-cream">Затраты по этапам</h3>
          <Bars rows={a.stages.map((s) => ({ label: s.name, plan: s.planCost, fact: s.factCost }))} />
        </section>
        <section className={card}>
          <h3 className="mb-3 font-display text-lg font-semibold text-fl-cream">Затраты по видам</h3>
          <Bars rows={COST_TYPES.map((t) => ({ label: COST_LABEL[t], plan: a.plan.byType[t], fact: a.factByType[t] })).filter((r) => r.plan || r.fact)} />
        </section>
      </div>

      <section className={card}>
        <h3 className="mb-2 font-display text-lg font-semibold text-fl-cream">Этапы: смета и факт</h3>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[960px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">Этап</th><th className="text-right">Работы по смете</th><th className="text-right">Сдано</th><th className="text-right">%</th><th className="text-right">Материалы факт / план</th><th className="text-right">Труд и техника факт</th><th className="text-right">Затраты факт / план</th><th className="text-right">Отклонение</th><th className="text-right">Прибыль этапа</th></tr></thead>
            <tbody>{a.stages.map((s) => (
              <tr key={s.stageId} className="border-t border-fl-line">
                <td className="py-2 pr-3 text-fl-cream/90">{s.name}</td>
                <td className="num pr-3 text-right">{m0(s.planWorks)}</td>
                <td className="num pr-3 text-right">{m0(s.accepted)}</td>
                <td className="num whitespace-nowrap pr-3 text-right">{pctText(s.progress)}</td>
                <td className="num whitespace-nowrap pr-3 text-right">{m0(s.factByType.material)} / {m0(s.planByType.material)}</td>
                <td className="num pr-3 text-right">{m0(s.factByType.labor + s.factByType.machine + s.factByType.subcontract)}</td>
                <td className="num whitespace-nowrap pr-3 text-right">{m0(s.factCost)} / {m0(s.planCost)}</td>
                <td className={`num text-right ${s.costVariance != null && s.costVariance > 0 ? "text-fl-red" : s.costVariance != null && s.costVariance < 0 ? "text-fl-green" : "text-fl-cream/50"}`}>{s.costVariance == null ? "—" : `${s.costVariance > 0 ? "▲ +" : "▼ "}${m0(s.costVariance)}`}</td>
                <td className={`num pl-3 text-right ${s.profit < 0 ? "text-fl-red" : ""}`} title={`сдано ${m0(s.accepted)} − себестоимость сданного ${m0(s.writtenOff)}`}>{s.accepted ? m0(s.profit) : "—"}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-xs text-fl-cream/45">Отклонение — фактические затраты этапа минус плановые на сданный объём: ▲ перерасход, ▼ экономия. Прибыль этапа — сдано по актам минус себестоимость, списанная актами этого этапа.</p>
      </section>

      <section className={card}>
        <h3 className="mb-2 font-display text-lg font-semibold text-fl-cream">Материалы: нормы сметы, расход, остатки</h3>
        {a.materials.length === 0 ? <p className="text-sm text-fl-cream/60">В смете нет материалов и списаний пока не было.</p> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">Материал</th><th>Ед.</th><th className="text-right">Норма</th><th className="text-right">Списано</th><th className="text-right">Откл.</th><th className="text-right">Цена факт / смета</th><th className="text-right">Сумма факт</th><th className="text-right">Ещё нужно</th><th className="text-right">На складе</th><th className="text-right">Докупить</th></tr></thead>
              <tbody>{a.materials.map((m) => {
                const bad = m.qtyVariancePct != null && m.qtyVariancePct > 5;
                return (
                  <tr key={m.key} className="border-t border-fl-line" title={m.byStage.map((b) => `${stageName.get(b.stageId) ?? ""}: норма ${qn(b.planQty)}, списано ${qn(b.factQty)}`).join("\n")}>
                    <td className="py-2 pr-3 text-fl-cream/90">{m.name}</td>
                    <td className="pr-3 text-fl-cream/60">{m.unit}</td>
                    <td className="num pr-3 text-right">{m.planQty ? qn(m.planQty) : "—"}</td>
                    <td className="num pr-3 text-right">{qn(m.factQty)}</td>
                    <td className={`num whitespace-nowrap pr-3 text-right ${bad ? "text-fl-red" : m.done && m.qtyVariance < 0 ? "text-fl-green" : "text-fl-cream/50"}`} title={m.done ? "этапы сданы — отклонение окончательное" : "этап ещё в работе"}>{m.planQty ? `${bad ? "▲ " : m.done && m.qtyVariance < 0 ? "▼ " : ""}${pctText(m.qtyVariancePct)}${m.done || bad ? "" : " · в работе"}` : "вне сметы"}</td>
                    <td className="num pr-3 text-right text-fl-cream/70">{m.factPrice != null ? m2(m.factPrice) : "—"} / {m.planPrice != null ? m2(m.planPrice) : "—"}</td>
                    <td className="num pr-3 text-right">{m0(m.factAmount)}</td>
                    <td className="num pr-3 text-right">{m.needQty ? qn(m.needQty) : "—"}</td>
                    <td className="num pr-3 text-right text-fl-cream/70">{qn(m.onHand)}</td>
                    <td className={`num text-right ${m.toBuy > 0 ? "font-semibold text-fl-amber" : "text-fl-cream/50"}`}>{m.toBuy ? qn(m.toBuy) : "—"}</td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        )}
      </section>

      {a.months.length > 0 && (
        <section className={card}>
          <h3 className="mb-2 font-display text-lg font-semibold text-fl-cream">По месяцам</h3>
          <table className="w-full max-w-xl text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5">Месяц</th><th className="text-right">Затраты</th><th className="text-right">Сдано по актам</th></tr></thead>
            <tbody>{a.months.map((m) => <tr key={m.month} className="border-t border-fl-line"><td className="py-1.5">{m.month.split("-").reverse().join(".")}</td><td className="num text-right">{m0(m.cost)}</td><td className="num text-right">{m0(m.accepted)}</td></tr>)}</tbody>
          </table>
          {o.retentionPct > 0 && <p className="mt-2 text-xs text-fl-cream/55">Гарантийное удержание заказчика ({String(o.retentionPct).replace(".", ",")} %): {m0(a.retention)} сом — придёт после гарантийного срока.</p>}
        </section>
      )}
    </div>
  );
}

function Estimate({ o, est, readOnly, patch, catalog, toast }: {
  o: BuildObject; est: ReturnType<typeof estimateTotals>; readOnly: boolean; patch: (p: Partial<BuildObject>) => void;
  catalog: Array<{ name: string; unit: string }>; toast: ReturnType<typeof useToast>;
}) {
  const [paste, setPaste] = useState<{ to: "works" | "resources"; stageId: string; type: CostType; text: string } | null>(null);
  const setWork = (id: string, p: Partial<BuildObject["works"][number]>) => patch({ works: o.works.map((w) => (w.id === id ? { ...w, ...p } : w)) });
  const setRes = (id: string, p: Partial<BuildObject["resources"][number]>) => patch({ resources: o.resources.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const st0 = o.stages[0]?.id ?? "";
  function applyPaste() {
    if (!paste) return;
    const rows = parsePasted(paste.text);
    if (!rows.length) { toast.show("Не нашёл строк: нужны колонки «наименование, ед., количество, цена»", "error"); return; }
    if (paste.to === "works") patch({ works: [...o.works, ...rows.map((r) => ({ id: newId(), stageId: paste.stageId || st0, code: r.code, name: r.name, unit: r.unit, qty: r.qty, price: r.price }))] });
    else patch({ resources: [...o.resources, ...rows.map((r) => ({ id: newId(), stageId: paste.stageId || st0, type: paste.type, name: r.name, unit: r.unit, qty: r.qty, price: r.price }))] });
    toast.show(`Добавлено строк: ${rows.length}`);
    setPaste(null);
  }
  const pasteBox = (to: "works" | "resources") => paste?.to === to && (
    <div className="mt-2 rounded-lg border border-fl-line bg-fl-charcoal p-3">
      <div className="flex flex-wrap gap-2 text-xs">
        <label className="text-fl-cream/55">Этап<select value={paste.stageId} onChange={(e) => setPaste({ ...paste, stageId: e.target.value })} className={`${cell} mt-1`}>{o.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></label>
        {to === "resources" && <label className="text-fl-cream/55">Вид<select value={paste.type} onChange={(e) => setPaste({ ...paste, type: e.target.value as CostType })} className={`${cell} mt-1`}>{COST_TYPES.map((t) => <option key={t} value={t}>{COST_LABEL[t]}</option>)}</select></label>}
      </div>
      <textarea value={paste.text} onChange={(e) => setPaste({ ...paste, text: e.target.value })} rows={6} placeholder={"Скопируйте строки сметы из Excel: [шифр] наименование · ед. · количество · цена\n1.1	Монтаж каркаса из бруса	м2	32	4500"} className={`${cell} mt-2 font-mono text-xs`} />
      <div className="mt-2 flex gap-2"><button onClick={applyPaste} className={primary}>Добавить строки</button><button onClick={() => setPaste(null)} className={btn}>Отмена</button></div>
    </div>
  );

  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <h3 className="font-display text-lg font-semibold text-fl-cream">Этапы</h3>
          {!readOnly && <button onClick={() => patch({ stages: [...o.stages, { id: newId(), name: `Этап ${o.stages.length + 1}` }] })} className="text-sm text-fl-gold hover:underline">+ этап</button>}
        </div>
        <div className="mt-2 space-y-1.5">{o.stages.map((s, i) => {
          const used = o.works.some((w) => w.stageId === s.id) || o.resources.some((r) => r.stageId === s.id);
          const e = estimateTotals(o, s.id);
          return (
            <div key={s.id} className="flex flex-wrap items-center gap-2">
              <span className="w-6 text-xs text-fl-cream/45">{i + 1}</span>
              <input value={s.name} disabled={readOnly} onChange={(ev) => patch({ stages: o.stages.map((x) => (x.id === s.id ? { ...x, name: ev.target.value } : x)) })} className={`${cell} min-w-[260px] flex-1`} />
              <span className="num text-xs text-fl-cream/55">работы {m0(e.works)} · затраты {m0(e.cost)}</span>
              {!readOnly && o.stages.length > 1 && <button disabled={used} title={used ? "В этапе есть строки сметы" : "Удалить этап"} onClick={() => patch({ stages: o.stages.filter((x) => x.id !== s.id) })} className="px-1 text-fl-cream/40 hover:text-fl-red disabled:opacity-30">×</button>}
            </div>
          );
        })}</div>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-display text-lg font-semibold text-fl-cream">Работы — сдаются заказчику по КС-2</h3><p className="text-xs text-fl-cream/50">Объём и цена без НДС; итог — сметная (договорная) стоимость.</p></div>
          {!readOnly && <div className="flex gap-3 text-sm"><button onClick={() => patch({ works: [...o.works, { id: newId(), stageId: o.stages[o.stages.length - 1]?.id ?? st0, name: "", unit: "м2", qty: 0, price: 0 }] })} className="text-fl-gold hover:underline">+ работа</button><button onClick={() => setPaste({ to: "works", stageId: st0, type: "material", text: "" })} className="text-fl-gold hover:underline">вставить из Excel</button></div>}
        </div>
        {pasteBox("works")}
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="w-52 py-1.5">Этап</th><th className="w-28">Шифр</th><th>Наименование работ</th><th className="w-20">Ед.</th><th className="w-24 text-right">Объём</th><th className="w-28 text-right">Цена</th><th className="w-32 text-right">Стоимость</th><th className="w-6" /></tr></thead>
            <tbody>{o.works.map((w) => (
              <tr key={w.id}>
                <td className="py-1 pr-1"><select value={w.stageId} disabled={readOnly} onChange={(e) => setWork(w.id, { stageId: e.target.value })} className={cell}>{o.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td className="py-1 pr-1"><input value={w.code ?? ""} disabled={readOnly} onChange={(e) => setWork(w.id, { code: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><input value={w.name} disabled={readOnly} onChange={(e) => setWork(w.id, { name: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><input list={OKEI_LIST_ID} value={w.unit} disabled={readOnly} onChange={(e) => setWork(w.id, { unit: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><NumInput value={w.qty} disabled={readOnly} onChange={(v) => setWork(w.id, { qty: v })} /></td>
                <td className="py-1 pr-1"><NumInput value={w.price} disabled={readOnly} onChange={(v) => setWork(w.id, { price: v })} /></td>
                <td className="num py-2 pr-1 text-right">{m2(workSum(w))}</td>
                <td>{!readOnly && <button aria-label="Удалить работу" onClick={() => patch({ works: o.works.filter((x) => x.id !== w.id) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <p className="mt-2 text-right text-sm text-fl-cream/75">Сметная стоимость работ: <b className="num text-fl-cream">{m2(est.works)}</b> сом{o.vat ? ` + НДС 12 % ${m2(est.works * 0.12)}` : ""}</p>
      </section>

      <section className={card}>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-display text-lg font-semibold text-fl-cream">Ресурсы — плановые затраты и нормы материалов</h3><p className="text-xs text-fl-cream/50">Материалы с количеством — это нормы: с ними сравнивается фактическое списание. Труд, техника, субподряд — плановая себестоимость.</p></div>
          {!readOnly && <div className="flex gap-3 text-sm"><button onClick={() => patch({ resources: [...o.resources, { id: newId(), stageId: o.stages[o.stages.length - 1]?.id ?? st0, type: "material", name: "", unit: "шт", qty: 0, price: 0 }] })} className="text-fl-gold hover:underline">+ ресурс</button><button onClick={() => setPaste({ to: "resources", stageId: st0, type: "material", text: "" })} className="text-fl-gold hover:underline">вставить из Excel</button></div>}
        </div>
        {pasteBox("resources")}
        <datalist id="fl-catalog">{catalog.slice(0, 3000).map((x) => <option key={x.name} value={x.name} label={x.unit} />)}</datalist>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="w-52 py-1.5">Этап</th><th className="w-40">Вид</th><th>Наименование</th><th className="w-20">Ед.</th><th className="w-24 text-right">Кол-во</th><th className="w-28 text-right">Цена</th><th className="w-32 text-right">Сумма</th><th className="w-6" /></tr></thead>
            <tbody>{o.resources.map((r) => (
              <tr key={r.id}>
                <td className="py-1 pr-1"><select value={r.stageId} disabled={readOnly} onChange={(e) => setRes(r.id, { stageId: e.target.value })} className={cell}>{o.stages.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select></td>
                <td className="py-1 pr-1"><select value={r.type} disabled={readOnly} onChange={(e) => setRes(r.id, { type: e.target.value as CostType })} className={cell}>{COST_TYPES.map((t) => <option key={t} value={t}>{COST_LABEL[t]}</option>)}</select></td>
                <td className="py-1 pr-1"><input list={r.type === "material" ? "fl-catalog" : undefined} value={r.name} disabled={readOnly} onChange={(e) => { const it = catalog.find((x) => itemKey(x.name) === itemKey(e.target.value)); setRes(r.id, { name: e.target.value, ...(it ? { unit: it.unit } : {}) }); }} className={cell} /></td>
                <td className="py-1 pr-1"><input list={OKEI_LIST_ID} value={r.unit} disabled={readOnly} onChange={(e) => setRes(r.id, { unit: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><NumInput value={r.qty} disabled={readOnly} onChange={(v) => setRes(r.id, { qty: v })} /></td>
                <td className="py-1 pr-1"><NumInput value={r.price} disabled={readOnly} onChange={(v) => setRes(r.id, { price: v })} /></td>
                <td className="num py-2 pr-1 text-right">{m2(resSum(r))}</td>
                <td>{!readOnly && <button aria-label="Удалить ресурс" onClick={() => patch({ resources: o.resources.filter((x) => x.id !== r.id) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        <div className="mt-3 grid gap-2 border-t border-fl-line pt-3 text-sm sm:grid-cols-3 lg:grid-cols-6">
          {COST_TYPES.map((t) => <p key={t} className="text-fl-cream/60">{COST_LABEL[t]}<br /><b className="num text-fl-cream">{m0(est.byType[t])}</b></p>)}
          <p className="text-fl-cream/60">Маржа по смете<br /><b className={`num ${est.margin < 0 ? "text-fl-red" : "text-fl-green"}`}>{m0(est.margin)} ({pctText(est.marginPct)})</b></p>
        </div>
      </section>
      <p className="text-xs text-fl-cream/45">Изменения сметы сохраняются кнопкой «Сохранить смету». Строки, по которым уже есть акты, можно менять — пересчитается анализ; проведённые документы не меняются.</p>
    </div>
  );
}

function NumInput({ value, onChange, disabled }: { value: number; onChange: (v: number) => void; disabled?: boolean }) {
  const [s, setS] = useState(value ? String(value).replace(".", ",") : "");
  useEffect(() => { if (parseNum(s) !== value) setS(value ? String(value).replace(".", ",") : ""); }, [value]); // eslint-disable-line react-hooks/exhaustive-deps
  return <input inputMode="decimal" value={s} disabled={disabled} onChange={(e) => { setS(e.target.value); onChange(parseNum(e.target.value)); }} className={`${cell} text-right`} />;
}
