"use client";

// Земельные участки: реестр (ЕНИ, право, документы, аренда) и налоговая стоимость по НК КР.
import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { downloadGet } from "@/components/download";
import { useT } from "@/components/i18n";
import { AGRI_TYPE, CATEGORY, RIGHT, type AgriType, type LandCategory, type LandIssue, type LandRight, type LandSummary, type Parcel, type ParcelTax } from "@/lib/land/land";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-lg bg-fl-accent px-5 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
const money = (n: number | null | undefined) => (n == null ? "—" : Math.round(n).toLocaleString("ru-RU"));
const ha = (m2: number) => (m2 / 10_000).toLocaleString("ru-RU", { maximumFractionDigits: 4 });
const dmy = (d?: string) => (d ? d.split("-").reverse().join(".") : "—");

type Row = Parcel & ParcelTax;
interface Data { parcels: Row[]; summary: LandSummary; issues: LandIssue[]; readOnly: boolean }
type Draft = Omit<Parcel, "areaM2" | "bns" | "ki" | "ratePct" | "leaseRentYear"> & { area: string; unit: "m2" | "ha"; bns: string; ki: string; ratePct: string; leaseRentYear: string };

const empty = (): Draft => ({ id: "", eni: "", name: "", category: "agri", agriType: "irrigated", region: "", district: "", address: "", area: "", unit: "ha", purpose: "", right: "own", docKind: "Государственный акт", docNumber: "", docDate: "", leaseTo: "", leaseRentYear: "", bns: "", ki: "", ratePct: "", taxNote: "", exempt: false, notes: "" });
const toDraft = (p: Parcel): Draft => ({ ...p, area: String(p.areaM2 >= 10_000 ? p.areaM2 / 10_000 : p.areaM2).replace(".", ","), unit: p.areaM2 >= 10_000 ? "ha" : "m2", bns: p.bns == null ? "" : String(p.bns).replace(".", ","), ki: p.ki == null ? "" : String(p.ki).replace(".", ","), ratePct: p.ratePct == null ? "" : String(p.ratePct).replace(".", ","), leaseRentYear: p.leaseRentYear == null ? "" : String(p.leaseRentYear), leaseTo: p.leaseTo ?? "", taxNote: p.taxNote ?? "", notes: p.notes ?? "" });
const num = (s: string) => { const t = s.replace(/\s/g, "").replace(",", "."); if (!t) return null; const n = Number(t); return Number.isFinite(n) ? n : NaN; };

export default function LandPage() {
  const t = useT();
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [d, setD] = useState<Data | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [edit, setEdit] = useState<Draft | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!companyId || companyId === NEW_COMPANY) return;
    setErr(null);
    fetch(`/api/land?companyId=${companyId}`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setD(b); }).catch((e) => setErr(e.message));
  }, [companyId]);
  useEffect(() => { setD(null); load(); }, [load]);

  async function send(method: "POST" | "DELETE", body: object) {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/land", { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      load(); return true;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); return false; } finally { setBusy(false); }
  }

  async function save() {
    if (!edit) return;
    const area = num(edit.area);
    const vals = { bns: num(edit.bns), ki: num(edit.ki), ratePct: num(edit.ratePct), leaseRentYear: num(edit.leaseRentYear) };
    if (area == null || Number.isNaN(area) || area <= 0) { setErr(t("Площадь должна быть больше нуля")); return; }
    if (Object.values(vals).some((v) => Number.isNaN(v))) { setErr(t("Числа вводятся цифрами, дробная часть — через запятую")); return; }
    const { area: _a, unit, ...rest } = edit;
    const parcel = { ...rest, areaM2: unit === "ha" ? area * 10_000 : area, ...vals, leaseTo: edit.leaseTo || undefined };
    if (await send("POST", { parcel })) setEdit(null);
  }

  const set = <K extends keyof Draft>(k: K) => (e: { target: { value: string } }) => setEdit((x) => (x ? { ...x, [k]: e.target.value } : x));
  const ro = d?.readOnly ?? true;
  const lbl = (s: string) => <span className="mb-1 block text-xs text-fl-cream/55">{s}</span>;
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Земельные участки")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Реестр участков компании: код ЕНИ, категория, площадь, право и документы, аренда и её сроки. Налоговая стоимость считается по НК КР: площадь × БНС × Ки (ст. 400–401). Значения БНС, Ки и ставку вводит бухгалтер из кодекса и приказа ГНС — программа их не подставляет сама.")}</p>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">{lbl(t("Компания"))}
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>{t("+ Добавить компанию…")}</option>
          </select>
        </label>
        {!ro && <button className={primary} onClick={() => setEdit(empty())}>{t("Добавить участок")}</button>}
        {d && d.parcels.length > 0 && <button className={btn} onClick={() => downloadGet(`/api/land?companyId=${companyId}&format=xlsx`, "zemelnye-uchastki.xlsx")}>{t("Реестр в Excel")}</button>}
        {!ro && d && d.parcels.length === 0 && <button className={btn} disabled={busy} onClick={() => send("POST", { demo: true })}>{t("Пример: 4 участка (демо)")}</button>}
      </div>
      {loaded && company?.demo && <p className="mb-4 text-sm text-fl-cream/60">{t("Демо-компанию можно только смотреть. Создайте свою компанию.")}</p>}
      {err && <p className="mb-4 text-sm text-fl-red">{t(err)}</p>}

      {edit && (
        <section className="mb-6 rounded-2xl border border-fl-gold/40 bg-fl-charcoal-2 p-4">
          <h2 className="font-semibold text-fl-cream">{edit.id ? t("Участок: изменение") : t("Новый участок")}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label>{lbl(t("Название в компании"))}<input className={field} value={edit.name} onChange={set("name")} /></label>
            <label>{lbl(t("Код ЕНИ"))}<input className={field} value={edit.eni} onChange={set("eni")} placeholder="1-02-03-0004-0005" /></label>
            <label>{lbl(t("Категория земель"))}<select className={field} value={edit.category} onChange={(e) => setEdit({ ...edit, category: e.target.value as LandCategory })}>{(Object.keys(CATEGORY) as LandCategory[]).map((k) => <option key={k} value={k}>{t(CATEGORY[k])}</option>)}</select></label>
            {edit.category === "agri" && <label>{lbl(t("Вид угодий"))}<select className={field} value={edit.agriType} onChange={(e) => setEdit({ ...edit, agriType: e.target.value as AgriType })}>{(Object.keys(AGRI_TYPE) as AgriType[]).map((k) => <option key={k} value={k}>{t(AGRI_TYPE[k])}</option>)}</select></label>}
            <label>{lbl(t("Область"))}<input className={field} value={edit.region} onChange={set("region")} /></label>
            <label>{lbl(t("Район"))}<input className={field} value={edit.district} onChange={set("district")} /></label>
            <label className="sm:col-span-2">{lbl(t("Адрес, местоположение"))}<input className={field} value={edit.address} onChange={set("address")} /></label>
            <label>{lbl(t("Площадь"))}<div className="flex gap-2"><input className={field} value={edit.area} onChange={set("area")} inputMode="decimal" /><select className={`${field} w-24`} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value as "m2" | "ha" })}><option value="ha">{t("га")}</option><option value="m2">{t("м²")}</option></select></div></label>
            <label className="sm:col-span-2">{lbl(t("Целевое назначение"))}<input className={field} value={edit.purpose} onChange={set("purpose")} /></label>
            <label>{lbl(t("Право"))}<select className={field} value={edit.right} onChange={(e) => setEdit({ ...edit, right: e.target.value as LandRight })}>{(Object.keys(RIGHT) as LandRight[]).map((k) => <option key={k} value={k}>{t(RIGHT[k])}</option>)}</select></label>
            <label>{lbl(t("Документ"))}<input className={field} value={edit.docKind} onChange={set("docKind")} /></label>
            <label>{lbl(t("Номер документа"))}<input className={field} value={edit.docNumber} onChange={set("docNumber")} /></label>
            <label>{lbl(t("Дата документа"))}<input type="date" className={field} value={edit.docDate} onChange={set("docDate")} /></label>
            {edit.right === "lease" && <>
              <label>{lbl(t("Аренда до"))}<input type="date" className={field} value={edit.leaseTo} onChange={set("leaseTo")} /></label>
              <label>{lbl(t("Арендная плата в год, сом"))}<input className={field} value={edit.leaseRentYear} onChange={set("leaseRentYear")} inputMode="decimal" /></label>
            </>}
          </div>
          <div className="mt-4 rounded-xl border border-fl-line p-3">
            <div className="text-sm font-semibold text-fl-cream">{t("Налог (налог на имущество, НК КР ст. 400–401)")}</div>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <label>{lbl(t("БНС 1 м², сом"))}<input className={field} value={edit.bns} onChange={set("bns")} inputMode="decimal" placeholder={t("из ст. 401 ч. 2")} /></label>
              <label>{lbl(t("Ки — коэффициент инфляции"))}<input className={field} value={edit.ki} onChange={set("ki")} inputMode="decimal" placeholder={t("приказ ГНС на год")} /></label>
              <label>{lbl(t("Ставка, %"))}<input className={field} value={edit.ratePct} onChange={set("ratePct")} inputMode="decimal" /></label>
              <label className="flex items-end gap-2 pb-2 text-sm text-fl-cream/80"><input type="checkbox" checked={!!edit.exempt} onChange={(e) => setEdit({ ...edit, exempt: e.target.checked })} />{t("Освобождён (ст. 410–411)")}</label>
              <label className="sm:col-span-2 lg:col-span-4">{lbl(t("Откуда значения (статья, приказ, дата) — для проверяющих"))}<input className={field} value={edit.taxNote} onChange={set("taxNote")} /></label>
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button className={primary} disabled={busy} onClick={save}>{busy ? t("Сохраняю…") : t("Сохранить")}</button>
            <button className={btn} onClick={() => setEdit(null)}>{t("Отмена")}</button>
            {edit.id && <button className="ml-auto text-sm text-fl-cream/50 hover:text-fl-red" disabled={busy} onClick={async () => { if (confirm(t("Удалить участок «{name}»?", { name: edit.name })) && (await send("DELETE", { id: edit.id }))) setEdit(null); }}>{t("Удалить участок")}</button>}
          </div>
        </section>
      )}

      {!d ? (companyId && companyId !== NEW_COMPANY && !err ? <p className="text-sm text-fl-cream/50">{t("Загружаю…")}</p> : null) : (
        <div className="space-y-5">
          <div className="grid gap-3 sm:grid-cols-4">
            {[[t("Участков"), String(d.summary.count)], [t("Площадь, га"), d.summary.areaHa.toLocaleString("ru-RU", { maximumFractionDigits: 4 })], [t("Налог за год, сом"), d.summary.taxKnown ? money(d.summary.tax) : `${money(d.summary.tax)}*`], [t("Аренда в год, сом"), money(d.summary.leaseRentYear)]].map(([k, v]) => (
              <div key={k} className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4"><div className="text-xs text-fl-cream/55">{k}</div><div className="mt-1 text-2xl font-semibold tabular-nums text-fl-cream">{v}</div></div>
            ))}
          </div>
          {!d.summary.taxKnown && d.parcels.length > 0 && <p className="text-xs text-fl-cream/50">{t("* Посчитано только по участкам, где заданы БНС, Ки и ставка.")}</p>}
          {d.issues.length > 0 && (
            <ul className="space-y-1.5">{d.issues.map((i, n) => (
              <li key={n} className={`rounded-lg border px-3 py-2 text-sm ${i.level === "risk" ? "border-fl-red/50 bg-fl-red/[0.06]" : "border-fl-amber/50 bg-fl-amber/[0.06]"}`}>{t(i.text, i.vars)}</li>
            ))}</ul>
          )}
          {d.parcels.length === 0 ? <p className="rounded-xl border border-fl-line px-4 py-6 text-center text-sm text-fl-cream/55">{t("Участков пока нет.")}</p> : (
            <div className="overflow-x-auto rounded-2xl border border-fl-line bg-fl-charcoal-2">
              <table className="w-full min-w-[900px] text-sm">
                <thead><tr className="text-left text-xs text-fl-cream/50">{[t("Участок"), t("Категория"), t("Площадь, га"), t("Право и документ"), t("Аренда до"), t("Налоговая стоимость, сом"), t("Налог, сом")].map((h) => <th key={h} className="px-3 py-2 font-normal">{h}</th>)}</tr></thead>
                <tbody className="divide-y divide-fl-line">{d.parcels.map((p) => (
                  <tr key={p.id} className={ro ? "" : "cursor-pointer hover:bg-fl-gold/[0.04]"} onClick={() => !ro && setEdit(toDraft(p))}>
                    <td className="px-3 py-2"><div className="font-medium text-fl-cream">{p.name}</div><div className="text-xs text-fl-cream/45">{p.eni || "—"} · {[p.region, p.district].filter(Boolean).join(", ")}</div></td>
                    <td className="px-3 py-2 text-fl-cream/75">{t(CATEGORY[p.category])}{p.agriType ? <div className="text-xs text-fl-cream/45">{t(AGRI_TYPE[p.agriType])}</div> : null}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{ha(p.areaM2)}</td>
                    <td className="px-3 py-2 text-fl-cream/75">{t(RIGHT[p.right])}<div className="text-xs text-fl-cream/45">{p.docKind}{p.docNumber ? ` № ${p.docNumber}` : ""}{p.docDate ? ` ${t("от")} ${dmy(p.docDate)}` : ""}</div></td>
                    <td className="px-3 py-2 tabular-nums text-fl-cream/75">{p.right === "lease" ? dmy(p.leaseTo) : ""}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{money(p.taxValue)}</td>
                    <td className="px-3 py-2 text-right tabular-nums">{p.exempt ? t("освобождён") : p.tax == null ? <span className="whitespace-nowrap text-fl-amber">{t("нет параметров")}</span> : money(p.tax)}</td>
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="text-xs text-fl-cream/50">{t("Налоговая база — площадь по правоудостоверяющему документу; налоговая стоимость 1 м² = БНС × Ки (НК КР, ст. 400–401). Сумма налога = налоговая стоимость × ставка; сверяйте ставку и сроки уплаты с действующей редакцией кодекса.")}</p>
        </div>
      )}
    </main>
  );
}
