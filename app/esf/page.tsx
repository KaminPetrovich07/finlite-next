"use client";

import { useEffect, useMemo, useState } from "react";
import * as XLSX from "xlsx";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { formatNumber } from "@/lib/format";
import { OutgoingXml } from "@/components/esf/OutgoingXml";
import { detectColumns, esfRef, FIELD_LABEL, parseRegistry, PURCHASE_ACCOUNTS, type Direction, type Field } from "@/lib/esf/registry";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => (iso ? iso.split("-").reverse().join(".") : "—");
const FIELDS: Field[] = ["number", "date", "inn", "party", "item", "qty", "unit", "net", "vat", "total"];

/** The header row: the first row with at least three cells that look like column titles. */
function headerIndex(rows: unknown[][]): number {
  for (let i = 0; i < Math.min(rows.length, 30); i++) {
    const c = detectColumns((rows[i] ?? []).map((x) => String(x ?? "")));
    if (Object.keys(c).length >= 3) return i;
  }
  return 0;
}

export default function EsfPage() {
  const { companies, companyId, setCompanyId, company } = useCompanies();
  const [rows, setRows] = useState<unknown[][] | null>(null);
  const [fileName, setFileName] = useState("");
  const [cols, setCols] = useState<Partial<Record<Field, number>>>({});
  const [direction, setDirection] = useState<Direction>("in");
  const [account, setAccount] = useState("1610");
  const [vatPayer, setVatPayer] = useState(true);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<"in" | "out">("in");
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/esf?companyId=${encodeURIComponent(companyId)}`).then((r) => r.json()).then((b) => setLoaded(new Set(b.loaded ?? []))).catch(() => setLoaded(new Set()));
  }, [companyId]);

  async function onFile(f: File) {
    try {
      const wb = XLSX.read(await f.arrayBuffer(), { type: "array", cellDates: false, raw: false });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      const all = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, raw: true, defval: null });
      const h = headerIndex(all);
      const body = all.slice(h);
      setRows(body); setFileName(f.name);
      setCols(detectColumns((body[0] ?? []).map((x) => String(x ?? ""))));
    } catch { show("Не удалось прочитать файл. Нужен Excel (.xlsx, .xls) или CSV.", "error"); }
  }

  const headers = (rows?.[0] ?? []).map((x, i) => String(x ?? `Колонка ${i + 1}`));
  const invoices = useMemo(() => (rows ? parseRegistry(rows, cols) : []), [rows, cols]);
  const isDup = (i: (typeof invoices)[number]) => loaded.has(esfRef(direction, i));
  const ready = invoices.filter((i) => !i.problem && !isDup(i));
  const totals = ready.reduce((s, i) => ({ net: s.net + i.net, vat: s.vat + i.vat, total: s.total + i.total }), { net: 0, vat: 0, total: 0 });

  async function importAll() {
    setBusy(true);
    try {
      const r = await fetch("/api/esf", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, direction, account: direction === "in" ? account : "6110", vatPayer, invoices: ready }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(`Проведено ЭСФ: ${b.created}${b.skipped ? `, пропущено уже загруженных: ${b.skipped}` : ""}`);
      const l = await fetch(`/api/esf?companyId=${encodeURIComponent(companyId)}`).then((x) => x.json());
      setLoaded(new Set(l.loaded ?? []));
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">ЭСФ</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Реестр полученных или выписанных счетов-фактур превращается в проводки, а продажи из журнала — в XML-файл
          для загрузки в ЭСФ 2.0.
        </p>
      </header>
      <div className="mb-5 flex flex-wrap gap-1.5">
        {([["in", "Реестр ЭСФ → проводки"], ["out", "Продажи → XML для ЭСФ 2.0"]] as const).map(([k, label]) => (
          <button key={k} type="button" onClick={() => setMode(k)} className={`rounded-full px-3 py-1.5 text-sm ${mode === k ? "bg-fl-gold/20 font-semibold text-fl-gold" : "border border-fl-line text-fl-cream/70 hover:text-fl-cream"}`}>{label}</button>
        ))}
      </div>
      {mode === "out" && (
        <>
          <div className="mb-5 max-w-sm">
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
              <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={field}>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                <option value={NEW_COMPANY}>+ Добавить компанию…</option>
              </select></label>
          </div>
          <OutgoingXml key={companyId} companyId={companyId} demo={!!company?.demo} show={show} />
        </>
      )}
      {mode === "in" && (<>
      <p className="mb-4 max-w-3xl text-sm text-fl-cream/60">
        Выгрузка журнала ЭСФ из кабинета в Excel или CSV: контрагент с ИНН, номенклатура, НДС к зачёту или к уплате.
        Колонки находятся по заголовкам; если что-то не распознано — выберите вручную. Повторная загрузка того же реестра ничего не задвоит.
      </p>
      <section className={`${card} mb-5 p-4 sm:p-5`}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={field}>
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value={NEW_COMPANY}>+ Добавить компанию…</option>
            </select></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Какие ЭСФ</span>
            <select value={direction} onChange={(e) => setDirection(e.target.value as Direction)} className={field}>
              <option value="in">Полученные (покупки)</option>
              <option value="out">Выписанные (продажи)</option>
            </select></label>
          {direction === "in" && (
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Что покупали — счёт дебета</span>
              <select value={account} onChange={(e) => setAccount(e.target.value)} className={field}>
                {PURCHASE_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.title}</option>)}
              </select></label>
          )}
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-fl-cream/80">
            <input type="checkbox" checked={vatPayer} onChange={(e) => setVatPayer(e.target.checked)} className="h-4 w-4" />
            Плательщик НДС {direction === "in" ? "(НДС к зачёту)" : ""}
          </label>
        </div>
        <label className="mt-4 flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-fl-line px-4 py-8 text-center hover:border-fl-gold/60">
          <span className="font-medium text-fl-cream">{fileName || "Выберите файл реестра ЭСФ"}</span>
          <span className="mt-1 text-xs text-fl-cream/50">Excel (.xlsx, .xls) или CSV — выгрузка журнала ЭСФ из ИС ЭСФ</span>
          <input type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={(e) => e.target.files?.[0] && onFile(e.target.files[0])} />
        </label>
        {!vatPayer && direction === "in" && <p className="mt-2 text-xs text-fl-cream/50">Не плательщик НДС: НДС включается в стоимость покупки, к зачёту не берётся.</p>}
      </section>

      {rows && (
        <>
          <section className={`${card} mb-5 p-4`}>
            <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Колонки файла</h2>
            <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
              {FIELDS.map((f) => (
                <label key={f} className="block"><span className="mb-1 block text-xs text-fl-cream/55">{FIELD_LABEL[f]}</span>
                  <select value={cols[f] ?? ""} onChange={(e) => setCols({ ...cols, [f]: e.target.value === "" ? undefined : Number(e.target.value) })} className={`${field} py-1.5`}>
                    <option value="">— нет —</option>
                    {headers.map((h, i) => <option key={i} value={i}>{h}</option>)}
                  </select></label>
              ))}
            </div>
          </section>

          <section className={`${card} overflow-x-auto`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-fl-line px-4 py-3">
              <p className="text-sm text-fl-cream/75">
                Документов: {invoices.length}; к проведению {ready.length} на <span className="num font-semibold text-fl-cream">{formatNumber(totals.total, 2)}</span> сом (НДС {formatNumber(totals.vat, 2)})
              </p>
              {!company?.demo && <button type="button" onClick={importAll} disabled={busy || !ready.length} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Провожу…" : `Провести ${ready.length}`}</button>}
            </div>
            <table className="w-full min-w-[900px] text-sm">
              <thead><tr className="text-xs text-fl-cream/50">{["Номер", "Дата", "Контрагент", "Без НДС", "НДС", "Всего", ""].map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i >= 3 && i <= 5 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
              <tbody>
                {invoices.slice(0, 500).map((i) => (
                  <tr key={`${i.inn}|${i.number}|${i.date}`} className="border-t border-fl-line/60 align-top">
                    <td className="num px-3 py-1.5">{i.number}</td>
                    <td className="num px-3 py-1.5">{d(i.date)}</td>
                    <td className="px-3 py-1.5">{i.party}<span className="block text-xs text-fl-cream/45">{i.inn}{i.item ? ` · ${i.item.slice(0, 80)}` : ""}</span></td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(i.net, 2)}</td>
                    <td className="num px-3 py-1.5 text-right">{formatNumber(i.vat, 2)}</td>
                    <td className="num px-3 py-1.5 text-right font-medium text-fl-cream">{formatNumber(i.total, 2)}</td>
                    <td className="px-3 py-1.5 text-xs">{i.problem ? <span className="text-fl-red">{i.problem}</span> : isDup(i) ? <span className="text-fl-cream/50">уже загружен</span> : <span className="text-fl-green">готов</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
      </>)}
    </main>
  );
}
