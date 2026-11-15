"use client";

// Ввоз товара: себестоимость каждой позиции с доставкой, пошлиной и НДС при ввозе; проводка одним документом.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { useT } from "@/components/i18n";
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
  const t = useT();
  const { companies, companyId, setCompanyId, company } = useCompanies();
  const [list, setList] = useState<ImportSummary[] | null>(null);
  const [readOnly, setReadOnly] = useState(true);
  const [doc, setDoc] = useState<ImportDoc | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const [stiPick, setStiMonth] = useState("");

  const load = useCallback(() => {
    if (!companyId || companyId === NEW_COMPANY) return;
    fetch(`/api/import-goods?companyId=${companyId}`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setList(b.imports); setReadOnly(b.readOnly); setDoc((d) => d ?? blank(b.next)); })
      .catch((e) => setMsg({ ok: false, text: e.message }));
  }, [companyId]);
  useEffect(() => { setList(null); setDoc(null); load(); }, [load]);

  const calc = useMemo(() => (doc ? calcImport({ ...doc, rate: doc.rate || 0 }, t) : null), [doc, t]);
  const set = <K extends keyof ImportDoc>(k: K, v: ImportDoc[K]) => setDoc((d) => (d ? { ...d, [k]: v } : d));
  const setRow = (i: number, patch: Partial<ImportRow>) => setDoc((d) => (d ? { ...d, rows: d.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)) } : d));

  async function nbkr() {
    if (!doc) return;
    const r = await fetch(`/api/import-goods?companyId=${companyId}&rate=${doc.currency}&date=${doc.date}`).then((x) => x.json()).catch(() => null);
    if (r?.rate) set("rate", r.rate); else setMsg({ ok: false, text: t("Курса НБКР {cur} на {date} в базе нет — введите вручную", { cur: doc.currency, date: ru(doc.date) }) });
  }
  async function save() {
    if (!doc) return;
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/import-goods", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, doc }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setMsg({ ok: true, text: t("Ввоз № {n} проведён: товар на складе по полной себестоимости.", { n: doc.number }) });
      setDoc(blank(String((Number(doc.number) || 0) + 1)));
      load();
    } catch (e) { setMsg({ ok: false, text: e instanceof Error ? e.message : String(e) }); } finally { setBusy(false); }
  }
  async function remove(id: string) {
    await fetch(`/api/import-goods?companyId=${companyId}&entryId=${id}`, { method: "DELETE" });
    load();
  }

  const eaeuMonths = [...new Set((list ?? []).filter((s) => s.doc.origin === "eaeu").map((s) => s.doc.date.slice(0, 7)))].sort().reverse();
  const stiMonth = stiPick && eaeuMonths.includes(stiPick) ? stiPick : eaeuMonths[0] ?? "";
  const third = doc?.origin === "third";
  const touched = !!doc && (!!doc.supplier.trim() || doc.rows.some((r) => r.item.trim() || r.qty));
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Ввоз товара (импорт)")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          {t("Цена в валюте, доставка, пошлина, сборы и НДС при ввозе раскладываются на каждую позицию — товар встаёт на склад по полной себестоимости одной проводкой. Из ЕАЭС — с суммой и сроком НДС по заявлению о ввозе; из третьих стран — с таможенной стоимостью и пошлиной по вашей ставке ЕТТ.")}
        </p>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Компания")}</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>{t("+ Добавить компанию…")}</option>
          </select>
        </label>
        {eaeuMonths.length > 0 && (
          <div className="flex items-end gap-1">
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Ввоз из ЕАЭС за месяц")}</span>
              <select value={stiMonth} onChange={(e) => setStiMonth(e.target.value)} className={field}>{eaeuMonths.map((m) => <option key={m} value={m}>{m.slice(5)}.{m.slice(0, 4)}</option>)}</select>
            </label>
            <a href={`/api/import-goods/sti123?companyId=${companyId}&month=${stiMonth}`} className={btn} title={t("Коды ТН ВЭД, единицы, количество, база и НДС — для переноса в кабинет налогоплательщика")}>{t("Раздел 3 STI-123 (Excel)")}</a>
          </div>
        )}
      </div>
      {company?.demo && <p className="mb-4 rounded-xl border border-fl-line px-4 py-3 text-sm text-fl-cream/70">{t("Демо-компания только для просмотра. Чтобы провести ввоз, выберите свою компанию или создайте демо для показа в «Компаниях».")}</p>}
      {msg && <p className={`mb-4 rounded-lg px-3 py-2 text-sm ${msg.ok ? "bg-fl-green/10 text-fl-green" : "bg-fl-red/10 text-fl-red"}`}>{t(msg.text)}</p>}

      {doc && calc && !readOnly && (
        <section className="mb-6 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <h2 className="font-semibold text-fl-cream">{t("Новый ввоз")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="text-xs text-fl-cream/55">{t("Номер")}</span><input className={field} value={doc.number} onChange={(e) => set("number", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">{t("Дата принятия на учёт")}</span><input type="date" className={field} value={doc.date} onChange={(e) => set("date", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">{t("Откуда")}</span>
              <select className={field} value={doc.origin} onChange={(e) => { const o = e.target.value as Origin; setDoc({ ...doc, origin: o, country: o === "eaeu" ? "Казахстан" : "Китай" }); }}>
                {(Object.keys(ORIGIN_LABEL) as Origin[]).map((o) => <option key={o} value={o}>{t(ORIGIN_LABEL[o])}</option>)}
              </select>
            </label>
            <label><span className="text-xs text-fl-cream/55">{t("Страна")}</span>
              {doc.origin === "eaeu"
                ? <select className={field} value={doc.country} onChange={(e) => set("country", e.target.value)}>{EAEU.map((c) => <option key={c} value={c}>{t(c)}</option>)}</select>
                : <input className={field} value={doc.country} onChange={(e) => set("country", e.target.value)} />}
            </label>
            <label className="sm:col-span-2"><span className="text-xs text-fl-cream/55">{t("Поставщик")}</span><input className={field} value={doc.supplier} onChange={(e) => set("supplier", e.target.value)} placeholder="Yiwu Trading Co., Ltd" /></label>
            <label><span className="text-xs text-fl-cream/55">{t("Валюта контракта")}</span><select className={field} value={doc.currency} onChange={(e) => setDoc({ ...doc, currency: e.target.value, rate: e.target.value === "KGS" ? 1 : 0 })}>{CURRENCIES.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label><span className="text-xs text-fl-cream/55">{t("Курс НБКР, сом")}</span>
              <div className="flex gap-1"><input className={field} value={doc.rate || ""} onChange={(e) => set("rate", n(e.target.value))} placeholder={t("на дату")} />{doc.currency !== "KGS" && <button type="button" className={btn} onClick={nbkr} title={t("Курс НБКР на дату")}>НБКР</button>}</div>
            </label>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[860px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50">
                <th className="py-1 pr-2 font-normal">{t("Наименование")}</th><th className="py-1 pr-2 font-normal">{t("Код ТН ВЭД (10 цифр)")}</th><th className="py-1 pr-2 font-normal">{t("Ед.")}</th><th className="py-1 pr-2 font-normal">{t("Кол-во")}</th><th className="py-1 pr-2 font-normal">{t("Цена, {cur}", { cur: doc.currency })}</th>
                {third ? <th className="py-1 pr-2 font-normal">{t("Пошлина, %")}</th> : <th className="py-1 pr-2 font-normal" title={t("Для товаров из перечня ГНС «налоговая база НДС, имеющая признаки риска»")}>{t("База ГНС, сом/ед.")}</th>}
                <th className="py-1 pr-2 text-right font-normal">{t("Себестоимость")}</th><th className="py-1 pr-2 text-right font-normal">{t("за ед.")}</th><th />
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
                    <td className="py-1"><button className="text-fl-cream/40 hover:text-fl-red" onClick={() => setDoc({ ...doc, rows: doc.rows.filter((_, j) => j !== i) })} aria-label={t("Удалить строку")}>×</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="mt-1 text-sm text-fl-gold" onClick={() => setDoc({ ...doc, rows: [...doc.rows, emptyRow()] })}>{t("+ позиция")}</button>
          </div>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label><span className="text-xs text-fl-cream/55">{t("Доставка до склада, сом")}</span><input className={field} value={doc.delivery || ""} onChange={(e) => set("delivery", n(e.target.value))} /></label>
            <label><span className="text-xs text-fl-cream/55">{t("Перевозчик")}</span><input className={field} value={doc.carrier ?? ""} onChange={(e) => set("carrier", e.target.value)} /></label>
            <label><span className="text-xs text-fl-cream/55">{third ? t("Таможенные сборы, брокер, сом") : t("Сертификаты, брокер, сом")}</span><input className={field} value={doc.fees || ""} onChange={(e) => set("fees", n(e.target.value))} /></label>
            <label><span className="text-xs text-fl-cream/55">{t("Прочие расходы на ввоз, сом")}</span><input className={field} value={doc.other || ""} onChange={(e) => set("other", n(e.target.value))} /></label>
            <label className="sm:col-span-2"><span className="text-xs text-fl-cream/55">{third ? t("Декларация на товары, CMR/ТТН") : t("ТТН/CMR, номер заявления о ввозе")}</span><input className={field} value={doc.docs ?? ""} onChange={(e) => set("docs", e.target.value)} /></label>
            <div className="flex flex-col justify-end gap-1 text-sm text-fl-cream/80 sm:col-span-2">
              {third && <label className="flex items-center gap-2"><input type="checkbox" checked={doc.deliveryInCustomsValue} onChange={(e) => set("deliveryInCustomsValue", e.target.checked)} /> {t("доставка входит в таможенную стоимость")}</label>}
              <label className="flex items-center gap-2"><input type="checkbox" checked={doc.vatPayer} onChange={(e) => set("vatPayer", e.target.checked)} /> {t("компания — плательщик НДС (НДС при ввозе к зачёту)")}</label>
              <label className="flex items-center gap-2"><input type="checkbox" checked={doc.paidNow} onChange={(e) => set("paidNow", e.target.checked)} /> {third ? t("доставка и таможенные платежи уже оплачены с расчётного счёта") : t("доставка и расходы уже оплачены с расчётного счёта")}</label>
            </div>
          </div>

          <div className="mt-4 grid gap-2 text-sm sm:grid-cols-3 lg:grid-cols-6">
            {[[t("Товар по контракту"), calc.totals.invoice], [t("Доставка и расходы"), calc.totals.delivery + calc.totals.fees], [t("Пошлина"), calc.totals.duty], [t("НДС при ввозе"), calc.totals.vat], [t("Себестоимость на склад"), calc.totals.cost]].map(([a, b]) => (
              <div key={a} className="rounded-lg bg-fl-surface-2 px-3 py-2"><div className="text-xs text-fl-cream/55">{a}</div><div className="font-semibold tabular-nums text-fl-cream">{t("{sum} сом", { sum: money(b as number) })}</div></div>
            ))}
            <div className="rounded-lg bg-fl-surface-2 px-3 py-2"><div className="text-xs text-fl-cream/55">{t("Наценка к контракту")}</div><div className="font-semibold tabular-nums text-fl-cream">{calc.totals.invoice ? `${((calc.totals.cost / calc.totals.invoice - 1) * 100).toFixed(1).replace(".", ",")} %` : "—"}</div></div>
          </div>
          {calc.vatDue && <p className="mt-3 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-3 py-2 text-sm text-fl-cream/85">{t("НДС при ввозе из ЕАЭС {sum} сом — уплатить и подать отчёт по косвенным налогам (STI-123, раздел 3) до {date}. С 01.11.2026 кабинет налогоплательщика проверяет в нём коды ТН ВЭД, единицы и количество — они берутся из этого документа.", { sum: money(calc.totals.vat), date: ru(calc.vatDue) })}</p>}
          {calc.problems.length > 0 && touched && <ul className="mt-3 list-disc pl-5 text-sm text-fl-amber">{calc.problems.slice(0, 6).map((p) => <li key={p}>{p}</li>)}</ul>}
          <details className="mt-3 text-sm"><summary className="cursor-pointer text-fl-cream/70">{t("Проводка")}</summary>
            <table className="mt-2 w-full text-xs"><tbody className="divide-y divide-fl-line">{calc.lines.map((l, i) => (
              <tr key={i}><td className="py-1 pr-2 text-fl-cream/60">{l.debit ? t("Дт") : t("Кт")} {l.account}</td><td className="py-1 pr-2 text-fl-cream/80">{l.item ?? (l.party ? t(l.party) : l.memo)}</td><td className="py-1 text-right tabular-nums text-fl-cream">{money(l.debit || l.credit)}</td></tr>
            ))}</tbody></table>
          </details>
          <div className="mt-4 flex justify-end"><button className={gold} disabled={busy || calc.problems.length > 0} onClick={save}>{busy ? t("Провожу…") : t("Провести ввоз")}</button></div>
        </section>
      )}

      <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
        <h2 className="font-semibold text-fl-cream">{t("Проведённые ввозы")}</h2>
        {!list ? <p className="mt-2 text-sm text-fl-cream/50">{t("Загружаю…")}</p> : list.length === 0 ? <p className="mt-2 text-sm text-fl-cream/55">{t("Пока нет.")}</p> : (
          <div className="mt-2 overflow-x-auto"><table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-3 font-normal">{t("№, дата")}</th><th className="py-1.5 pr-3 font-normal">{t("Поставщик")}</th><th className="py-1.5 pr-3 font-normal">{t("Откуда")}</th><th className="py-1.5 pr-3 text-right font-normal">{t("Себестоимость")}</th><th className="py-1.5 pr-3 text-right font-normal">{t("Пошлина")}</th><th className="py-1.5 pr-3 text-right font-normal">{t("НДС")}</th><th className="py-1.5 font-normal">{t("НДС ЕАЭС")}</th><th /></tr></thead>
            <tbody className="divide-y divide-fl-line">{list.map((s) => {
              const late = s.vatDue && s.vatPaid < s.totals.vat - 0.01 && s.vatDue < today();
              return (
                <Fragment key={s.entryId}>
                  <tr className="cursor-pointer hover:bg-fl-surface-2/50" onClick={() => setOpen(open === s.entryId ? null : s.entryId)}>
                    <td className="py-1.5 pr-3 text-fl-cream">{t("№ {n} от {date}", { n: s.doc.number, date: ru(s.doc.date) })}</td>
                    <td className="py-1.5 pr-3 text-fl-cream/80">{s.doc.supplier}</td>
                    <td className="py-1.5 pr-3 text-fl-cream/65">{s.doc.origin === "eaeu" ? t("ЕАЭС, {country}", { country: t(s.doc.country) }) : t(s.doc.country)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream">{money(s.totals.cost)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/70">{money(s.totals.duty)}</td>
                    <td className="py-1.5 pr-3 text-right tabular-nums text-fl-cream/70">{money(s.totals.vat)}</td>
                    <td className={`py-1.5 pr-3 text-xs ${late ? "font-semibold text-fl-red" : "text-fl-cream/60"}`}>{s.vatDue ? (s.vatPaid >= s.totals.vat - 0.01 ? t("уплачен") : late ? t("просрочен с {date}", { date: ru(s.vatDue) }) : t("до {date}", { date: ru(s.vatDue) })) : "—"}</td>
                    <td className="py-1.5 text-right"><a className="text-xs text-fl-gold underline" href={`/ledger?entry=${s.entryId}&date=${s.doc.date}`} onClick={(e) => e.stopPropagation()}>{t("в журнале")}</a></td>
                  </tr>
                  {open === s.entryId && (
                    <tr><td colSpan={8} className="bg-fl-surface-2/40 px-3 py-2">
                      <table className="w-full text-xs"><thead><tr className="text-left text-fl-cream/50"><th className="py-1 font-normal">{t("Позиция")}</th><th className="font-normal">{t("ТН ВЭД")}</th><th className="text-right font-normal">{t("Кол-во")}</th><th className="text-right font-normal">{t("Себестоимость")}</th><th className="text-right font-normal">{t("за ед.")}</th></tr></thead>
                        <tbody>{calcImport(s.doc).rows.map((r, i) => <tr key={i}><td className="py-0.5 text-fl-cream/85">{r.item}</td><td className="tabular-nums text-fl-cream/65">{r.hs}</td><td className="text-right tabular-nums">{r.qty} {r.unit}</td><td className="text-right tabular-nums">{money(r.cost)}</td><td className="text-right tabular-nums">{money(r.unitCost)}</td></tr>)}</tbody></table>
                      {!readOnly && <button className="mt-2 text-xs text-fl-red underline" onClick={() => remove(s.entryId)}>{t("Удалить ввоз (проводка уйдёт в корзину)")}</button>}
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
