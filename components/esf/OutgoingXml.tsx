"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { formatNumber } from "@/lib/format";
import { salesXml, servicesXml, VAT_CATEGORY_LABEL, type OutDoc, type OutSettings, type VatCategory } from "@/lib/esf/outgoing";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => (iso ? iso.split("-").reverse().join(".") : "—");
const pad = (n: number) => String(n).padStart(2, "0");

type Missing = { key: string; name: string; unit: string; unitCode: string; service: boolean; count: number };
interface Data { settings: OutSettings; saved: boolean; today: string; docs: OutDoc[]; missing: Missing[] }

function defaultPeriod(): { from: string; to: string } {
  const t = new Date(Date.now() + 6 * 3600e3);
  const y = t.getUTCFullYear(), m = t.getUTCMonth() + 1;
  const py = m === 1 ? y - 1 : y, pm = m === 1 ? 12 : m - 1;
  return { from: `${py}-${pad(pm)}-01`, to: t.toISOString().slice(0, 10) };
}

function download(name: string, text: string) {
  const url = URL.createObjectURL(new Blob([text], { type: "application/xml;charset=utf-8" }));
  const a = document.createElement("a");
  a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function OutgoingXml({ companyId, demo, show }: { companyId: string; demo: boolean; show: (m: string, kind?: "error") => void }) {
  const [period, setPeriod] = useState(defaultPeriod);
  const [data, setData] = useState<Data | null>(null);
  const [s, setS] = useState<OutSettings | null>(null);
  const [codes, setCodes] = useState<Record<string, { code: string; unitCode: string; service: boolean }>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!companyId) return;
    setError(null);
    try {
      const r = await fetch(`/api/esf/outgoing?${new URLSearchParams({ companyId, ...period })}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить продажи");
      setData(b); setS(b.settings);
      setCodes(Object.fromEntries((b.missing as Missing[]).map((m) => [m.key, { code: "", unitCode: m.unitCode, service: m.service }])));
    } catch (e: any) { setError(e.message); }
  }, [companyId, period]);
  useEffect(() => { load(); }, [load]);

  async function save(next: OutSettings) {
    setBusy(true);
    try {
      const r = await fetch("/api/esf/outgoing", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, settings: next }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show("Сохранено"); await load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }

  function saveCodes() {
    if (!s) return;
    const add = Object.fromEntries(Object.entries(codes).filter(([, v]) => v.code.trim()).map(([k, v]) => [k, { code: v.code.trim(), unitCode: v.unitCode.trim(), service: v.service }]));
    if (!Object.keys(add).length) { show("Впишите хотя бы один код", "error"); return; }
    save({ ...s, catalog: { ...s.catalog, ...add } });
  }

  const docs = data?.docs ?? [];
  const ready = docs.filter((x) => !x.problems.length);
  const goods = ready.filter((x) => !x.service), svc = ready.filter((x) => x.service);
  const totals = ready.reduce((a, x) => ({ net: a.net + x.esf.net, vat: a.vat + x.esf.vat, total: a.total + x.esf.total }), { net: 0, vat: 0, total: 0 });

  function exportFiles(kind: "goods" | "services") {
    if (!s || !data) return;
    const files = kind === "goods" ? salesXml(data.docs, s) : servicesXml(data.docs, s);
    files.forEach((x, i) => download(`esf-${kind === "goods" ? "tovary" : "uslugi"}-${period.from}_${period.to}${files.length > 1 ? `-${i + 1}` : ""}.xml`, x));
  }

  const catalogRows = useMemo(() => Object.entries(s?.catalog ?? {}), [s]);

  if (error) return <p className="rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>;
  if (!data || !s) return <p className="text-sm text-fl-cream/60">Загружаю продажи…</p>;

  return (
    <div className="space-y-5">
      <section className={`${card} p-4 text-sm text-fl-cream/75 sm:p-5`}>
        <p>
          Продажи из журнала собираются в XML-файл для массовой загрузки в ЭСФ 2.0 (схемы ГНС <code>sales-v1</code> для товаров
          и <code>services-v1</code> для актов услуг). Загрузка создаёт только черновики: номер ЭСФ присваивается и документ уходит
          покупателю после подписи ЭЦП в кабинете. Сначала загрузите файл в режиме проверки — сервер вернёт отчёт по строкам,
          ничего не создавая.
        </p>
        <p className="mt-2 text-xs text-fl-cream/50">
          Сроки выписки показаны по рабочим дням без учёта праздников — настоящий срок может быть позже, но не раньше.
          Суммы и налоги в ЭСФ считает сервер; здесь они повторены по его формулам, чтобы сверить с проводками.
        </p>
      </section>

      <section className={`${card} p-4 sm:p-5`}>
        <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream">Настройки компании в ЭСФ 2.0</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Налоговый режим</span>
            <select value={s.special ? "special" : "general"} onChange={(e) => setS({ ...s, special: e.target.value === "special" })} className={field}>
              <option value="general">Общий</option><option value="special">Специальный (единый налог, патент)</option>
            </select></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Код склада в ЭСФ 2.0</span>
            <input value={s.warehouseCode} onChange={(e) => setS({ ...s, warehouseCode: e.target.value })} className={field} /></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Вид поставки</span>
            <input value={s.supplyKind} onChange={(e) => setS({ ...s, supplyKind: e.target.value })} className={field} /></label>
          {!s.special && (
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Код поставки</span>
              <input value={s.supplyCode} onChange={(e) => setS({ ...s, supplyCode: e.target.value })} className={field} /></label>
          )}
          {!s.special && (
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Ставка НДС</span>
              <select value={s.vatCategory} onChange={(e) => setS({ ...s, vatCategory: e.target.value as VatCategory })} className={field}>
                {(Object.keys(VAT_CATEGORY_LABEL) as VatCategory[]).map((k) => <option key={k} value={k}>{VAT_CATEGORY_LABEL[k]}</option>)}
              </select></label>
          )}
          {!s.special && s.vatCategory === "Vat12" && (
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Процент ставки (если у кода две облагаемые)</span>
              <input value={s.vatRatePercent ?? ""} placeholder="12" onChange={(e) => setS({ ...s, vatRatePercent: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) })} className={field} /></label>
          )}
          {!s.special && (
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Ставка НсП, %</span>
              <select value={s.nspRate} onChange={(e) => setS({ ...s, nspRate: Number(e.target.value) })} className={field}>
                {[0, 1, 2, 3, 4, 5].map((n) => <option key={n} value={n}>{n}</option>)}
              </select></label>
          )}
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Банк продавца (для безнала)</span>
            <input value={s.bankName} onChange={(e) => setS({ ...s, bankName: e.target.value })} className={field} /></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Расчётный счёт</span>
            <input value={s.bankAccount} onChange={(e) => setS({ ...s, bankAccount: e.target.value })} className={field} /></label>
        </div>
        <p className="mt-2 text-xs text-fl-cream/50">Код склада — на странице «Склады» в кабинете ЭСФ 2.0. Вид и код поставки, ставки НДС кода — из справочника ГНС; 003 / 100 — обычная реализация внутри страны по ставке 12 %.</p>
        {!demo && <button type="button" disabled={busy} onClick={() => save(s)} className="mt-3 rounded-lg border border-fl-gold/50 px-3 py-2 text-sm text-fl-gold hover:bg-fl-gold/10 disabled:opacity-40">Сохранить настройки</button>}
      </section>

      {data.missing.length > 0 && (
        <section className={`${card} overflow-x-auto p-4 sm:p-5`}>
          <h2 className="font-display text-[15px] font-semibold text-fl-cream">Коды позиций из каталога ЭСФ 2.0</h2>
          <p className="mt-1 text-xs text-fl-cream/55">
            В ЭСФ 2.0 позиция передаётся кодом из каталога организации — наименование сервер берёт оттуда. Для товара — уникальный
            код (НТИН), для услуги — код из каталога услуг. Код вписывается один раз и запоминается для этой компании.
          </p>
          <table className="mt-3 w-full min-w-[720px] text-sm">
            <thead><tr className="text-xs text-fl-cream/50"><th className="py-2 pr-3 text-left font-medium">Позиция в проводках</th><th className="py-2 pr-3 text-left font-medium">Что это</th><th className="py-2 pr-3 text-left font-medium">Код в каталоге ЭСФ</th><th className="py-2 pr-3 text-left font-medium">Код единицы</th><th className="py-2 text-right font-medium">Документов</th></tr></thead>
            <tbody>
              {data.missing.map((m) => {
                const v = codes[m.key] ?? { code: "", unitCode: m.unitCode, service: m.service };
                const set = (p: Partial<typeof v>) => setCodes({ ...codes, [m.key]: { ...v, ...p } });
                return (
                  <tr key={m.key} className="border-t border-fl-line/60">
                    <td className="py-1.5 pr-3">{m.name}{m.unit && <span className="text-xs text-fl-cream/45"> · {m.unit}</span>}</td>
                    <td className="py-1.5 pr-3"><select value={v.service ? "s" : "g"} onChange={(e) => set({ service: e.target.value === "s" })} className={`${field} py-1`}><option value="g">товар</option><option value="s">услуга</option></select></td>
                    <td className="py-1.5 pr-3"><input value={v.code} onChange={(e) => set({ code: e.target.value })} placeholder={v.service ? "1000000001" : "НТИН, 14 цифр"} className={`${field} py-1`} /></td>
                    <td className="py-1.5 pr-3"><input value={v.unitCode} onChange={(e) => set({ unitCode: e.target.value })} placeholder={v.service ? "из каталога" : "796"} className={`${field} w-24 py-1`} /></td>
                    <td className="num py-1.5 text-right">{m.count}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {!demo && <button type="button" disabled={busy} onClick={saveCodes} className="mt-3 rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">Сохранить коды</button>}
        </section>
      )}

      <section className={`${card} overflow-x-auto`}>
        <div className="flex flex-wrap items-end justify-between gap-3 border-b border-fl-line px-4 py-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">С</span><input type="date" value={period.from} onChange={(e) => setPeriod({ ...period, from: e.target.value })} className={`${field} py-1.5`} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">По</span><input type="date" value={period.to} onChange={(e) => setPeriod({ ...period, to: e.target.value })} className={`${field} py-1.5`} /></label>
            <p className="pb-2 text-sm text-fl-cream/75">Продаж: {docs.length}; готово {ready.length} на <span className="num font-semibold text-fl-cream">{formatNumber(totals.total, 2)}</span> сом (НДС {formatNumber(totals.vat, 2)})</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button type="button" disabled={!goods.length} onClick={() => exportFiles("goods")} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">XML товары ({goods.length})</button>
            <button type="button" disabled={!svc.length} onClick={() => exportFiles("services")} className="rounded-lg border border-fl-line px-3 py-2 text-sm font-semibold text-fl-cream hover:border-fl-gold/40 disabled:opacity-40">XML услуги ({svc.length})</button>
          </div>
        </div>
        <table className="w-full min-w-[960px] text-sm">
          <thead><tr className="text-xs text-fl-cream/50">{["Дата", "Покупатель", "Вид", "В проводке", "Без налогов", "НДС", "НсП", "Итого ЭСФ", "Срок", ""].map((h, i) => <th key={i} className={`px-3 py-2 font-medium ${i >= 3 && i <= 7 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
          <tbody>
            {docs.length === 0 && <tr><td colSpan={10} className="px-3 py-6 text-center text-fl-cream/55">Продаж за период нет: ищутся проводки с кредитом 6110 или 6130.</td></tr>}
            {docs.map((x) => (
              <tr key={x.externalId} className="border-t border-fl-line/60 align-top">
                <td className="num px-3 py-1.5">{d(x.date)}</td>
                <td className="px-3 py-1.5">{x.buyerKind === "Population" ? "Население" : x.buyerName || "—"}<span className="block text-xs text-fl-cream/45">{x.buyerTin}{x.lines.length ? ` · ${x.lines.map((l) => l.name).join(", ").slice(0, 70)}` : ""}</span></td>
                <td className="px-3 py-1.5 text-xs">{x.service ? "акт услуг" : "товары"}<span className="block text-fl-cream/45">{x.payment === "Cash" ? "наличные" : "безнал"}</span></td>
                <td className="num px-3 py-1.5 text-right">{formatNumber(x.ledger.total, 2)}</td>
                <td className="num px-3 py-1.5 text-right">{formatNumber(x.esf.net, 2)}</td>
                <td className="num px-3 py-1.5 text-right">{formatNumber(x.esf.vat, 2)}</td>
                <td className="num px-3 py-1.5 text-right">{formatNumber(x.esf.nsp, 2)}</td>
                <td className="num px-3 py-1.5 text-right font-medium text-fl-cream">{formatNumber(x.esf.total, 2)}</td>
                <td className="num px-3 py-1.5">{x.deadline ? d(x.deadline) : "—"}</td>
                <td className="px-3 py-1.5 text-xs">
                  {x.problems.length ? x.problems.map((p) => <span key={p} className="block text-fl-red">{p}</span>) : <span className="text-fl-green">готов</span>}
                  {x.notes.map((p) => <span key={p} className="block text-fl-gold">{p}</span>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      {catalogRows.length > 0 && (
        <details className={`${card} p-4 text-sm`}>
          <summary className="cursor-pointer text-fl-cream/80">Сохранённые коды позиций ({catalogRows.length})</summary>
          <table className="mt-3 w-full text-sm">
            <tbody>
              {catalogRows.map(([k, v]) => (
                <tr key={k} className="border-t border-fl-line/60">
                  <td className="py-1.5 pr-3">{k}</td><td className="py-1.5 pr-3 text-xs">{v.service ? "услуга" : "товар"}</td>
                  <td className="num py-1.5 pr-3">{v.code}</td><td className="num py-1.5 pr-3">{v.unitCode}</td>
                  <td className="py-1.5 text-right">{!demo && <button type="button" className="text-xs text-fl-red hover:underline" onClick={() => { const c = { ...s.catalog }; delete c[k]; save({ ...s, catalog: c }); }}>убрать</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </details>
      )}
    </div>
  );
}

