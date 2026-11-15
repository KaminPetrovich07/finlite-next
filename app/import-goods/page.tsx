"use client";

// Ввоз товара: себестоимость каждой позиции с доставкой, пошлиной и НДС при ввозе; проводка одним документом.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { calcImport, EAEU, ORIGIN_LABEL, type ImportDoc, type ImportRow, type Origin } from "@/lib/import-goods/calc";
import type { ImportSummary } from "@/lib/import-goods/server";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const gold = "rounded-lg bg-fl-gold px-4 py-2 text-sm font-semibold text-fl-charcoal hover:opacity-90 disabled:opacity-40";
const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const ru = (d: string) => d.split("-").reverse().join(".");
const CURRENCIES = ["USD", "CNY", "RUB", "KZT", "EUR", "TRY", "KGS"];
const emptyRow = (): ImportRow => ({ item: "", hs: "", unit: "шт", qty: 0, price: 0, duty: 0 });
const blank = (number = "1"): ImportDoc => ({
  number, date: today(), origin: "third", country: "Китай", supplier: "", currency: "USD", rate: 0, rows: [emptyRow()],
  delivery: 0, carrier: "", deliveryInCustomsValue: true, fees: 0, other: 0, vatPayer: true, paidNow: false, docs: "",
});
const n = (v: string) => { const x = Number(v.replace(",", ".").replace(/\s/g, "")); return Number.isFinite(x) ? x : 0; };

export default function ImportGoodsPage() {
  const { companies, companyId, setCompanyId, company } = useCompanies();
  const [list, setList] = useState<ImportSummary[] | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [doc, setDoc] = useState<ImportDoc | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  const load = useCallback(() => {
    if (!companyId || companyId === NEW_COMPANY) return;
    fetch(`/api/import-goods?companyId=${companyId}`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setList(b.imports); setReadOnly(b.readOnly); setDoc((d) => d ?? blank(b.next)); })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [companyId]);
  useEffect(() => { setList(null); setDoc(null); load(); }, [load]);

  const calc = useMemo(() => (doc ? calcImport({ ...doc, rate: doc.rate || 0 }) : null), [doc]);
  const set = <K extends keyof ImportDoc>(k: K, v: ImportDoc[K]) => setDoc((d) => (d ? { ...d, [k]: v } : d));
  const setRow = (i: number, patch: Partial<ImportRow>) => setDoc((d) => (d ? { ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d));

  async function nbkr() {
    if (!doc) return;
    const r = await fetch(`/api/import-goods?companyId=${companyId}&rate=${doc.currency}&date=${doc.date}`).then((x) => x.json()).catch(() => null);
    if (r?.rate) set("rate", r.rate); else setMsg({ ok: false, text: `Курса НБКР ${doc.currency} на ${ru(doc.date)} в базе нет — введите вручную` });
  }
  async function save() {
    if (!doc) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/import-goods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, doc }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setMsg({ ok: true, text: `Ввоз № ${doc.number} проведён: товар на складе по полной себестоимости.` });
      setDoc(blank(String((Number(doc.number) || 0) + 1)));
      load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    await fetch(`/api/import-goods?companyId=${companyId}&entryId=${id}`, { method: "DELETE" });
    load();
  }

  const third = doc?.origin === "third";
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Ввоз товара (импорт)</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Цена в валюте, доставка, пошлина, сборы и НДС при ввозе раскладываются на каждую позицию — товар встаёт на склад по полной себестоимости одной проводкой.
          Из ЕАЭС — с суммой и сроком НДС по заявлению о ввозе; из третьих стран — с таможенной стоимостью и пошлиной по вашей ставке ЕТТ.
        </p>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
      </div>
      {company?.demo && <p className="mb-4 rounded-xl border border-fl-line px-4 py-3 text-sm text-fl-cream/70">Демо-компания только для просмотра. Чтобы провести ввоз, выберите свою компанию или создайте демо для показа в «Компаниях».</p>}
      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-fl-green/10 text-fl-green" : "bg-fl-red/10 text-fl-red"}`}>{msg.text}</p>}

      {doc && calc && !readOnly && (
        <section className="mb-6 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <h2 className="font-semibold text-fl-cream">Новый ввоз</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="text-xs text-fl-cream/55">Номер</span><input className={field} value={doc.number} onChange={(e) => set("number", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">Дата принятия на учёт</span><input type="date" className={field} value={doc.date} onChange={(e) => set("date", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">Откуда</span>
              <select className={field} value={doc.origin} onChange={(e) => { const o = e.target.value as Origin; setDoc({ ...doc, origin: o, country: o === "eaeu" ? "Казахстан" : "Китай" }); }}>
                {(Object.keys(ORIGIN_LABEL) as Origin[]).map((o) => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
              </select>
            </label>
            <label><span className="text-xs text-fl-cream/55">Страна</span>
              {doc.origin === "eaeu"
                ? <select className={field} value={doc.country} onChange={(e) => set("country", e.target.value)}>{EAEU.map((c) => <option key={c}>{c}</option>)}</select>
                : <input className={field} value={doc.country} onChange={(e) => set("country", e.target.value)} />}
            </label>
            <label className="sm:col-span-2"><span className="text-xs text-fl-cream/55">Поставщик</span><input className={field} value={doc.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Yiwu Trading Co., Ltd" /></label>
            <label><span className="text-xs text-fl-cream/55">Валюта контракта</span><select className={field} value={doc.currency} onChange={(e) => setDoc({ ...doc, currency: e.target.value, rate: e.target.value === "KGS" ? 1 : 0 })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label><span className="text-xs text-fl-cream/55">Курс НБКР, сом</span>
              <div className="flex gap-1"><input className={field} value={doc.rate || ""} onChange={(e) => set("rate", n(e.target.value))} placeholder="на дату" />{doc.currency !== "KGS" && <button type="button" className={btn} onClick={nbkr} title="Курс НБКР на дату">НБКР</button>}</div>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50">
                <th className="py-1 pr-2 font-normal">Наименование</th><th className="py-1 pr-2 font-normal">Код ТН ВЭД (10 цифр)</th><th className="py-1 pr-2 font-normal">Ед.</th><th className="py-1 pr-2 font-normal">Кол-во</th><th className="py-1 pr-2 font-normal">Цена, {doc.currency}</th>
                {third ? <th className="py-1 pr-2 font-normal">Пошлина, %</th> : <th className="py-1 pr-2 font-normal" title="Для товаров из перечня ГНС «налоговая база НДС, имеющая признаки риска»">База ГНС, сом/ед.</th>}
                <th className="py-1 pr-2 text-right font-normal">Себестоимость</th><th className="py-1 pr-2 text-right font-normal">за ед.</th><th />
              </tr></thead>
              <tbody>
                {doc.rows.map((r, i) => (
                  <tr key={i}>
                    <td className="py-1 pr-2"><input className={field} value={r.item} onChange={(e) => setRow(i, { item: e.target.value })} /></td>
                    <td className="py-1 pr-2"><input className={`${field} tabular-nums ${r.hs && !/^\d{10}$/.test(r.hs.replace(/\s/g, "")) ? "border-fl-amber" : ""}`} value={r.hs} onChange={(e) => setRow(i, { hs: e.target.value })} inputMode="numeric" /></td>
                    <td className="w-20 py-1 pr-2"><input className={field} value={r.unit} onChange={(e) => setRow(i, { unit: e.target.value })} /></td>
                    <td className="w-24 py-1 pr-2"><input className={field} value={r.qty || ""} onChange={(e) => setRow(i, { qty: n(e.target.value) })} /></td>
                    <td className="w-24 py-1 pr-2"><input className={field} value={r.price || ""} onChange={(e) => setRow(i, { price: n(e.target.value) })} /></td>
                    <td className="w-24 py-1 pr-2">{third
                      ? <input className={field} value={r.duty ?? ""} onChange={(e) => setRow(i, { duty: n(e.target.value) })} />
                      : <input className={field} value={r.minBase ?? ""} onChange={(e) => setRow(i, { minBase: n(e.target.value) || undefined })} placeholder="—" />}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-fl-cream">{money(calc.rows[i]?.cost ?? 0)}</td>
                    <td className="py-1 pr-2 text-right tabular-nums text-fl-cream/70">{money(calc.rows[i]?.unitCost ?? 0)}</td>
                    <td className="py-1"><button className="text-fl-cream/40 hover:text-fl-red" onClick={() => setDoc({ ...doc, rows: doc.rows.filter((_, j) => j !== i) })} aria-label="Удалить строку">×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-1 text-sm text-fl-gold" onClick={() => setDoc({ ...doc, rows: [...doc.rows, emptyRow()] })}>+ позиция</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="text-xs text-fl-cream/55">Доставка до склада, сом</span><input className={field} value={doc.delivery || ""} onChange={(e) => set("delivery", n(e.target.value))} /></label>
            <label><span className="text-xs text-fl-cream/55">Перевозчик</span><input className={field} value={doc.carrier ?? ""} onChange={(e) => set("carrier", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">{third ? "Таможенные сборы, брокер, сом" : "Сертификаты, брокер, сом"}</span><input className={field} value={doc.fees || ""} onChange={(e) => set("fees", n(e.target.value))} /></label>
            <label><span className="text-xs text-fl-cream/55">Прочие расходы на ввоз, сом</span><input className={field} value={doc.other || ""} onChange={(e) => set("other", n(e.target.value))} /></label>
            <label className="sm:col-span-2"><span className="text-xs text-fl-cream/55">{third ? "Декларация на товары, CMR/ТТН" : "ТТН/CMR, номер заявления о ввозе"}</span><input className={field} value={doc.docs ?? ""} onChange={(e) => set("docs", e.target.value)} /></label>
            <div className="flex flex-col justify-end gap-1 text-sm text-fl-cream/80 sm:col-span-2">
              {third && <label className="flex items-center gap-2"><input type="checkbox" checked={doc.deliveryInCustomsValue} onChange={(e) => set("deliveryInCustomsValue", e.target.checked)} /> доставка входит в таможенную стоимость</label>}
              <label className="flex items-center gap-2"><input type="checkbox" checked={doc.vatPayer} onChange={(e) => set("vatPayer", e.target.checked)} /> компания — плательщик НДС (НДС при ввозе к зачёту)</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={doc.paidNow} onChange={(e) => set("paidNow", e.target.checked)} /> доставка и {third ? "таможенные платежи" : "расходы"} уже оплачены с расчётного счёта</label>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[["Товар по контракту", `${money(calc.totals.invoice)} сом`], ["Доставка и расходы", `${money(calc.totals.delivery + calc.totals.fees)} сом`], ["Пошлина", `${money(calc.totals.duty)} сом`], ["НДС при ввозе", `${money(calc.totals.vat)} сом`], ["Себестоимость на склад", `${money(calc.totals.cost)} сом`], ["Наценка к контракту", calc.totals.invoice ? `${((calc.totals.cost / calc.totals.invoice - 1) * 100).toFixed(1)} %` : "—"]].map(([a, b]) => (
              <div key={a} className="rounded-lg bg-fl-surface-2 px-3 py-2"><div className="text-xs text-fl-cream/55">{a}</div><div className="font-semibold tabular-nums text-fl-cream">{b}</div></div>
            ))}
          </div>
          {calc.vatDue && <p className="mt-3 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-3 py-2 text-sm text-fl-cream/85">НДС при ввозе из ЕАЭС {money(calc.totals.vat)} сом — уплатить и подать отчёт по косвенным налогам (STI-123, раздел 3) до <b>{ru(calc.vatDue)}</b>. С 01.11.2026 кабинет налогоплательщика проверяет в нём коды ТН ВЭД, единицы и количество — они берутся из этого документа.</p>}
          {calc.problems.length > 0 && (doc.supplier.trim() || doc.rows.some((r) => r.item.trim() || r.qty)) && <ul className="mt-3 list-disc pl-5 text-sm text-fl-amber">{calc.problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-fl-cream/70">Проводка</summary>
            <table className="mt-2 w-full text-xs"><tbody className="divide-y divide-fl-line">{calc.lines.map((l, i) => (
              <tr key={i}><td className="py-1 pr-2 text-fl-cream/60">{l.debit ? "Дт" : "Кт"} {l.account}</td><td className="py-1 pr-2 text-fl-cream/80">{l.item ?? l.party ?? l.memo}</td><td className="py-1 text-right tabular-nums text-fl-cream">{money(l.debit || l.credit)}</td></tr>
            ))}</tbody></table>
          </details>
          <div className="mt-4 flex justify-end"><button className={gold} disabled={busy || calc.problems.length > 0} onClick={save}>{busy ? "Провожу…" : "Провести ввоз"}</button></div>
        </section>
      )}

      <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
        <h2 className="font-semibold text-fl-cream">Проведённые ввозы</h2>
        {!list ? <p className="mt-2 text-sm text-fl-cream/50">Загружаю…</p> : list.length === 0 ? <p className="mt-2 text-sm text-fl-cream/55">Пока нет.</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-3 font-normal">№, дата</th><th className="py-1.5 pr-3 font-normal">Поставщик</th><th className="py-1.5 pr-3 font-normal">Откуда</th><th className="py-1.5 pr-3 text-right font-normal">Себестоимость</th><th className="py-1.5 pr-3 text-right font-normal">Пошлина</th><th className="py-1.5 pr-3 text-right font-normal">НДС</th><th className="py-1.5 font-normal">НДС ЕАЭС</th><th /></tr></thead>
            <tbody className="divide-y divide-fl-line">{list.map((s) => {
              const late = s.vatDue && s.vatPaid < s.totals.vat - 0.01 && s.vatDue < today();
              return (
                <Fragment key={s.entryId}>
                  <tr className="cursor-pointer hover:bg-fl-surface-2/50" onClick={() => setOpen(open === s.entryId ? null : s.entryId)}>
                    <td className="py-1.5 pr-3 text-fl-cream">№ {s.doc.number} от {ru(s.doc.date)}</td>
                    <td className="py-1.5 pr-3 text-fl-cream/80">{s.doc.supplier}</td>
                    <td className="py-1.5 pr-3 text-fl-cream/65">{s.doc.origin === "eaeu" ? `ЕАЭС, ${s.doc.country}` : s.doc.country}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream">{money(s.totals.cost)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/70">{money(s.totals.duty)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/70">{money(s.totals.vat)}</td>
                    <td className={`py-1.5 pr-3 text-xs ${late ? "font-semibold text-fl-red" : "text-fl-cream/60"}`}>{s.vatDue ? (s.vatPaid >= s.totals.vat - 0.01 ? "уплачен" : `${late ? "просрочен с" : "до"} ${ru(s.vatDue)}`) : "—"}</td>
                    <td className="py-1.5 text-right"><a className="text-xs text-fl-gold underline" href={`/ledger?entry=${s.entryId}&date=${s.doc.date}`} onClick={(e) => e.stopPropagation()}>в журнале</a></td>
                  </tr>
                  {open === s.entryId && (
                    <tr><td colSpan={8} className="bg-fl-surface-2/40 px-3 py-2">
                      <table className="w-full text-xs"><thead><tr className="text-left text-fl-cream/50"><th className="py-1 font-normal">Позиция</th><th className="font-normal">ТН ВЭД</th><th className="text-right font-normal">Кол-во</th><th className="text-right font-normal">Себестоимость</th><th className="text-right font-normal">за ед.</th></tr></thead>
                        <tbody>{calcImport(s.doc).rows.map((r, i) => <tr key={i}><td className="py-0.5 text-fl-cream/85">{r.item}</td><td className="tabular-nums text-fl-cream/65">{r.hs}</td><td className="text-right tabular-nums">{r.qty} {r.unit}</td><td className="text-right tabular-nums">{money(r.cost)}</td><td className="text-right tabular-nums">{money(r.unitCost)}</td></tr>)}</tbody></table>
                      {!readOnly && <button className="mt-2 text-xs text-fl-red underline" onClick={() => remove(s.entryId)}>Удалить ввоз (проводка уйдёт в корзину)</button>}
                    </td></tr>
                  )}
                </Fragment>
              );
            })}</tbody>
          </table></div>
        )}
      </section>
    </main>
  );
}
