"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { downloadGet } from "@/components/download";
import { usePlanFeature, PlanNotice } from "@/components/PlanGate";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { accountName } from "@/lib/ledger/accounts";
import { ASSET_ACCOUNTS, BOOK_METHOD, EXPENSE_ACCOUNTS, NOT_DEPRECIATED, TAX_GROUPS, type FixedAsset, type TaxGroup } from "@/lib/assets/types";
import type { TaxSettings, TaxYear } from "@/lib/assets/depreciation";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const btn = "rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40";
const ghost = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const d = (iso: string | null) => (iso ? iso.split("-").reverse().join(".") : "—");
const m = (n: number) => formatNumber(n, 0);
const thisMonth = () => new Date(Date.now() + 6 * 3600 * 1000).toISOString().slice(0, 7);

type Row = FixedAsset & { depreciable: boolean; accumulated: number; nbv: number; monthAmount: number; fullyDepreciatedAt: string | null };
type Tab = "cards" | "month" | "tax";

const blank = (): Record<string, string> => ({
  name: "", inventoryNo: "", account: "2140", expenseAccount: "7150", taxGroup: "2", acquiredAt: new Date().toISOString().slice(0, 10), inServiceAt: "",
  cost: "", residual: "", lifeMonths: "120", method: "straight", openingAccumulated: "", openingDate: "", location: "", responsible: "", supplier: "", note: "", post: "3110",
});

export default function AssetsPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [ym, setYm] = useState(thisMonth());
  const [rows, setRows] = useState<Row[] | null>(null);
  const [posted, setPosted] = useState<string[]>([]);
  const [readOnly, setReadOnly] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("cards");
  const [form, setForm] = useState<Record<string, string> | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [disposing, setDisposing] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const allowed = usePlanFeature("fixedAssets");
  const { show, ToastContainer } = useToast();

  useEffect(() => { if (company?.demo) setYm("2026-09"); }, [company?.demo]);

  const seq = useRef(0);
  const load = useCallback(async () => {
    if (!companyId) return;
    const my = ++seq.current; // a slower earlier response must not overwrite a newer one
    setError(null);
    try {
      const r = await fetch(`/api/assets?companyId=${encodeURIComponent(companyId)}&ym=${ym}`);
      const b = await r.json();
      if (my !== seq.current) return;
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
      setRows(b.assets); setPosted(b.posted); setReadOnly(b.readOnly);
    } catch (e: any) { if (my === seq.current) { setError(e.message); setRows(null); } }
  }, [companyId, ym]);
  useEffect(() => { if (loaded) load(); }, [load, loaded]);

  const totals = useMemo(() => {
    const live = (rows ?? []).filter((r) => !r.disposedAt || r.disposedAt.slice(0, 7) > ym);
    return { cost: live.reduce((s, r) => s + r.cost, 0), acc: live.reduce((s, r) => s + r.accumulated, 0), nbv: live.reduce((s, r) => s + r.nbv, 0), month: live.reduce((s, r) => s + r.monthAmount, 0), n: live.length };
  }, [rows, ym]);

  async function call(url: string, method: string, body?: unknown) {
    const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) throw new Error(b.error ?? "Ошибка");
    return b;
  }

  function openNew() { setEditing(null); setForm(blank()); }
  function openEdit(a: Row) {
    setEditing(a.id);
    setForm({
      name: a.name, inventoryNo: a.inventoryNo, account: a.account, expenseAccount: a.expenseAccount, taxGroup: a.taxGroup ? String(a.taxGroup) : "",
      acquiredAt: a.acquiredAt, inServiceAt: a.inServiceAt, cost: String(a.cost), residual: a.residual ? String(a.residual) : "", lifeMonths: String(a.lifeMonths),
      method: a.method, openingAccumulated: a.openingAccumulated ? String(a.openingAccumulated) : "", openingDate: a.openingDate ?? "",
      location: a.location, responsible: a.responsible, supplier: a.supplier, note: a.note, post: "",
    });
  }
  function pickKind(code: string) {
    const k = ASSET_ACCOUNTS.find((x) => x.code === code)!;
    setForm((f) => f && { ...f, account: code, expenseAccount: k.expense, taxGroup: k.group ? String(k.group) : "", lifeMonths: String(k.life) });
  }

  async function save() {
    if (!form) return;
    setBusy("save");
    const asset = {
      ...form, id: editing ?? undefined,
      cost: parseFormattedNumber(form.cost), residual: parseFormattedNumber(form.residual), lifeMonths: Number(form.lifeMonths) || 0,
      openingAccumulated: parseFormattedNumber(form.openingAccumulated), openingDate: form.openingDate || null,
      taxGroup: form.taxGroup ? Number(form.taxGroup) : null, inServiceAt: form.inServiceAt || form.acquiredAt,
    };
    try {
      if (editing) await call("/api/assets", "PUT", { companyId, asset });
      else await call("/api/assets", "POST", { companyId, asset, ...(form.post ? { post: { creditAccount: form.post } } : {}) });
      show(editing ? "Карточка сохранена" : form.post ? "Объект принят к учёту, проводка поступления создана" : "Объект принят к учёту");
      setForm(null); await load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  async function remove(a: Row) {
    if (!confirm(`Удалить карточку «${a.name}»? Проводки поступления и выбытия этой карточки тоже удалятся; начисленная амортизация останется в журнале.`)) return;
    try { await call(`/api/assets?companyId=${encodeURIComponent(companyId)}&id=${a.id}`, "DELETE"); show("Карточка удалена"); await load(); }
    catch (e: any) { show(e.message, "error"); }
  }

  async function doc(kind: "os1" | "os6" | "sheet", format: "pdf" | "docx", id?: string) {
    setBusy(`${kind}:${id ?? ""}:${format}`);
    try { await downloadGet(`/api/assets/doc?companyId=${encodeURIComponent(companyId)}&kind=${kind}&format=${format}&ym=${ym}${id ? `&id=${id}` : ""}`, `${kind}.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const status = (a: Row) => a.disposedAt && a.disposedAt.slice(0, 7) <= ym ? <span className="text-fl-cream/45">выбыл {d(a.disposedAt)}</span>
    : !a.depreciable ? <span className="text-fl-cream/55">не амортизируется</span>
      : a.inServiceAt.slice(0, 7) > ym ? <span className="text-fl-cream/55">не введён</span>
        : a.nbv - a.residual < 0.01 ? <span className="text-fl-amber">самортизирован</span>
          : <span className="text-fl-green">в эксплуатации</span>;

  const canEdit = !readOnly && allowed !== false;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Основные средства</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Карточки объектов и нематериальных активов, ежемесячная амортизация одной проводкой, выбытие с финансовым
          результатом, документы ОС-1 и ОС-6. Отдельно — налоговая амортизация по группам статьи 226 НК КР.
        </p>
      </header>

      {allowed === false && <PlanNotice feature="fixedAssets" />}

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Месяц</span>
          <input type="month" value={ym} onChange={(e) => e.target.value && setYm(e.target.value)} className={field} />
        </label>
        {canEdit && tab === "cards" && <button type="button" onClick={openNew} className={`${btn} ml-auto`}>+ Принять объект к учёту</button>}
      </div>

      <div className="mb-4 flex flex-wrap gap-1.5">
        {([["cards", "Карточки"], ["month", "Амортизация за месяц"], ["tax", "Налоговая амортизация"]] as Array<[Tab, string]>).map(([k, t]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={`rounded-lg px-3 py-2 text-sm ${tab === k ? "bg-fl-gold/20 font-semibold text-fl-gold" : "text-fl-cream/65 hover:text-fl-cream"}`}>{t}</button>
        ))}
      </div>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {form && (
        <section className={`${card} mb-5 p-4 sm:p-5`}>
          <h2 className="font-display text-lg font-semibold text-fl-cream">{editing ? "Карточка объекта" : "Новый объект"}</h2>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <L t="Наименование" wide><input className={field} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="Например: кромкооблицовочный станок KDT" /></L>
            <L t="Вид объекта (счёт учёта)">
              <select className={field} value={form.account} onChange={(e) => pickKind(e.target.value)}>
                {ASSET_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.title}</option>)}
              </select>
            </L>
            <L t="Инвентарный номер"><input className={field} value={form.inventoryNo} onChange={(e) => setForm({ ...form, inventoryNo: e.target.value })} placeholder="присвоится сам" /></L>
            <L t="Дата приобретения"><input type="date" className={field} value={form.acquiredAt} onChange={(e) => setForm({ ...form, acquiredAt: e.target.value })} /></L>
            <L t="Ввод в эксплуатацию"><input type="date" className={field} value={form.inServiceAt} onChange={(e) => setForm({ ...form, inServiceAt: e.target.value })} placeholder="как приобретение" /></L>
            <L t="Первоначальная стоимость, сом"><input inputMode="decimal" className={`${field} num text-right`} value={form.cost} onChange={(e) => setForm({ ...form, cost: e.target.value })} /></L>
            <L t="Ликвидационная стоимость, сом"><input inputMode="decimal" className={`${field} num text-right`} value={form.residual} onChange={(e) => setForm({ ...form, residual: e.target.value })} placeholder="0" /></L>
            {!NOT_DEPRECIATED.has(form.account) && <>
              <L t="Срок полезного использования, мес."><input inputMode="numeric" className={`${field} num text-right`} value={form.lifeMonths} onChange={(e) => setForm({ ...form, lifeMonths: e.target.value })} /></L>
              <L t="Метод амортизации">
                <select className={field} value={form.method} onChange={(e) => setForm({ ...form, method: e.target.value })}>
                  {Object.entries(BOOK_METHOD).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </L>
              <L t="Куда относить амортизацию">
                <select className={field} value={form.expenseAccount} onChange={(e) => setForm({ ...form, expenseAccount: e.target.value })}>
                  {EXPENSE_ACCOUNTS.map((a) => <option key={a.code} value={a.code}>{a.title}</option>)}
                </select>
              </L>
              <L t="Налоговая группа (ст. 226 НК КР)">
                <select className={field} value={form.taxGroup} onChange={(e) => setForm({ ...form, taxGroup: e.target.value })}>
                  <option value="">не амортизируется в налоговом учёте</option>
                  {([1, 2, 3, 4, 5, 6] as TaxGroup[]).map((g) => <option key={g} value={g}>{g} — {TAX_GROUPS[g].rate * 100} %: {TAX_GROUPS[g].title}</option>)}
                </select>
              </L>
            </>}
            <L t="Место нахождения"><input className={field} value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} /></L>
            <L t="Ответственное лицо"><input className={field} value={form.responsible} onChange={(e) => setForm({ ...form, responsible: e.target.value })} /></L>
            <L t="Поставщик"><input className={field} value={form.supplier} onChange={(e) => setForm({ ...form, supplier: e.target.value })} /></L>
          </div>

          <details className="mt-3 text-sm text-fl-cream/70">
            <summary className="cursor-pointer text-fl-gold">Объект уже был в учёте до FinLite</summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <L t="Накопленная амортизация, сом"><input inputMode="decimal" className={`${field} num text-right`} value={form.openingAccumulated} onChange={(e) => setForm({ ...form, openingAccumulated: e.target.value })} /></L>
              <L t="На дату"><input type="date" className={field} value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} /></L>
              <p className="text-xs text-fl-cream/50 sm:col-span-2">Амортизация продолжится с месяца после этой даты так, чтобы объект самортизировался к концу срока. Накопленную сумму перенесите и в начальные остатки журнала.</p>
            </div>
          </details>

          {!editing && (
            <L t="Проводка поступления" className="mt-3 max-w-md">
              <select className={field} value={form.post} onChange={(e) => setForm({ ...form, post: e.target.value })}>
                <option value="3110">Дт счёт ОС — Кт расчёты с поставщиком</option>
                <option value="1210">Дт счёт ОС — Кт расчётный счёт</option>
                <option value="1110">Дт счёт ОС — Кт касса</option>
                <option value="5240">Дт счёт ОС — Кт вклад собственника</option>
                <option value="">Не создавать (объект уже в журнале)</option>
              </select>
            </L>
          )}
          <div className="mt-4 flex gap-2">
            <button type="button" onClick={save} disabled={busy !== null} className={btn}>{busy === "save" ? "Сохраняю…" : editing ? "Сохранить" : "Принять к учёту"}</button>
            <button type="button" onClick={() => setForm(null)} className="px-3 py-2 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
          </div>
        </section>
      )}

      {disposing && <Disposal a={disposing} companyId={companyId} onDone={async (msg) => { setDisposing(null); if (msg) { show(msg); await load(); } }} />}

      {tab === "cards" && rows && (
        <>
          <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Kpi t="Объектов в учёте" v={String(totals.n)} />
            <Kpi t="Первоначальная стоимость" v={m(totals.cost)} />
            <Kpi t={`Накопленная амортизация на ${ym.slice(5)}.${ym.slice(0, 4)}`} v={m(totals.acc)} />
            <Kpi t="Остаточная стоимость" v={m(totals.nbv)} />
          </div>
          <section className={`${card} overflow-x-auto`}>
            {rows.length === 0 ? (
              <p className="p-6 text-sm text-fl-cream/60">Карточек пока нет. Нажмите «Принять объект к учёту» — программа сама предложит срок, группу и счёт расходов.</p>
            ) : (
              <table className="w-full min-w-[980px] text-sm">
                <thead>
                  <tr className="text-xs text-fl-cream/50">
                    <th className="px-3 py-2 text-left font-medium">Инв. №</th><th className="px-3 py-2 text-left font-medium">Объект</th>
                    <th className="px-3 py-2 text-left font-medium">Ввод</th><th className="px-3 py-2 text-right font-medium">Стоимость</th>
                    <th className="px-3 py-2 text-right font-medium">Накоплено</th><th className="px-3 py-2 text-right font-medium">Остаточная</th>
                    <th className="px-3 py-2 text-right font-medium">За месяц</th><th className="px-3 py-2 text-left font-medium">Статус</th><th className="px-3 py-2" />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((a) => (
                    <tr key={a.id} className="border-t border-fl-line/60 align-top text-fl-cream/85">
                      <td className="num px-3 py-2 text-fl-cream/60">{a.inventoryNo}</td>
                      <td className="px-3 py-2">
                        <span className="text-fl-cream">{a.name}</span>
                        <span className="block text-xs text-fl-cream/45">{ASSET_ACCOUNTS.find((x) => x.code === a.account)?.title}{a.lifeMonths ? ` · ${a.lifeMonths} мес., ${BOOK_METHOD[a.method]}` : ""}{a.taxGroup ? ` · налог. гр. ${a.taxGroup}` : ""}</span>
                      </td>
                      <td className="num px-3 py-2">{d(a.inServiceAt)}</td>
                      <td className="num px-3 py-2 text-right">{m(a.cost)}</td>
                      <td className="num px-3 py-2 text-right">{m(a.accumulated)}</td>
                      <td className="num px-3 py-2 text-right font-medium text-fl-cream">{m(a.nbv)}</td>
                      <td className="num px-3 py-2 text-right">{a.monthAmount ? m(a.monthAmount) : "—"}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-xs">{status(a)}</td>
                      <td className="whitespace-nowrap px-3 py-2 text-right text-xs">
                        <button onClick={() => doc("os1", "pdf", a.id)} className="text-fl-gold hover:underline">ОС-1</button>
                        <button onClick={() => doc("os6", "pdf", a.id)} className="ml-2 text-fl-gold hover:underline">ОС-6</button>
                        {canEdit && <>
                          <button onClick={() => openEdit(a)} className="ml-2 text-fl-cream/60 hover:text-fl-cream">изменить</button>
                          {!a.disposedAt && <button onClick={() => setDisposing(a)} className="ml-2 text-fl-cream/60 hover:text-fl-cream">выбытие</button>}
                          <button onClick={() => remove(a)} className="ml-2 text-fl-cream/40 hover:text-fl-red">×</button>
                        </>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      )}

      {tab === "month" && <MonthTab companyId={companyId} ym={ym} posted={posted} canEdit={canEdit} onChanged={load} onDoc={(f) => doc("sheet", f)} busy={busy} />}
      {tab === "tax" && <TaxTab companyId={companyId} canEdit={canEdit} defaultYear={Number(ym.slice(0, 4))} />}
    </main>
  );
}

function L({ t, children, wide, className = "" }: { t: string; children: React.ReactNode; wide?: boolean; className?: string }) {
  return <label className={`block ${wide ? "sm:col-span-2" : ""} ${className}`}><span className="mb-1 block text-xs text-fl-cream/55">{t}</span>{children}</label>;
}

function Kpi({ t, v }: { t: string; v: string }) {
  return <div className={`${card} p-3`}><p className="text-xs text-fl-cream/55">{t}</p><p className="num mt-1 font-display text-xl font-semibold text-fl-cream">{v}</p></div>;
}

function Disposal({ a, companyId, onDone }: { a: Row; companyId: string; onDone: (msg: string | null) => void }) {
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [proceeds, setProceeds] = useState("");
  const [buyer, setBuyer] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function go() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/assets/dispose", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, id: a.id, date, proceeds: parseFormattedNumber(proceeds), buyer, reason }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      onDone(`Выбытие проведено: ${b.gain >= 0 ? "прибыль" : "убыток"} ${formatNumber(Math.abs(b.gain), 0)} сом. Акт ОС-4 — в «Первичных документах».`);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <section className={`${card} mb-5 border-fl-amber/40 p-4 sm:p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Выбытие: {a.name}</h2>
      <p className="mt-1 text-sm text-fl-cream/60">Накопленная амортизация спишется, остаточная стоимость уйдёт в прочие расходы, выручка от продажи — в прочие доходы. Амортизация за месяц выбытия начисляется.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-4">
        <L t="Дата выбытия"><input type="date" className={field} value={date} onChange={(e) => setDate(e.target.value)} /></L>
        <L t="Продан за, сом (0 — списание)"><input inputMode="decimal" className={`${field} num text-right`} value={proceeds} onChange={(e) => setProceeds(e.target.value)} placeholder="0" /></L>
        <L t="Покупатель"><input className={field} value={buyer} onChange={(e) => setBuyer(e.target.value)} /></L>
        <L t="Причина"><input className={field} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="износ, продажа, авария…" /></L>
      </div>
      {err && <p className="mt-2 text-sm text-fl-red">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={go} disabled={busy} className={btn}>{busy ? "Провожу…" : "Провести выбытие"}</button>
        <button type="button" onClick={() => onDone(null)} className="px-3 py-2 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
      </div>
    </section>
  );
}

function MonthTab({ companyId, ym, posted, canEdit, onChanged, onDoc, busy }: { companyId: string; ym: string; posted: string[]; canEdit: boolean; onChanged: () => Promise<void>; onDoc: (f: "pdf" | "docx") => void; busy: string | null }) {
  const [data, setData] = useState<{ total: number; rows: Array<{ id: string; name: string; amount: number }>; lines: Array<{ account: string; debit: number; credit: number }>; date: string } | null>(null);
  const [working, setWorking] = useState(false);
  const { show, ToastContainer } = useToast();
  const isPosted = posted.includes(ym);
  const load = useCallback(async () => {
    const r = await fetch(`/api/assets/depreciate?companyId=${encodeURIComponent(companyId)}&ym=${ym}`);
    if (r.ok) setData(await r.json());
  }, [companyId, ym]);
  useEffect(() => { load(); }, [load]);
  async function post(method: "POST" | "DELETE") {
    setWorking(true);
    try {
      const r = await fetch(method === "POST" ? "/api/assets/depreciate" : `/api/assets/depreciate?companyId=${encodeURIComponent(companyId)}&ym=${ym}`, { method, headers: { "Content-Type": "application/json" }, body: method === "POST" ? JSON.stringify({ companyId, ym }) : undefined });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      show(method === "POST" ? (b.replaced ? "Амортизация перепроведена" : "Амортизация начислена") : "Проводка амортизации удалена");
      await onChanged();
    } catch (e: any) { show(e.message, "error"); } finally { setWorking(false); }
  }
  const byAcc = useMemo(() => {
    const mm = new Map<string, { dr: number; cr: number }>();
    for (const l of data?.lines ?? []) { const x = mm.get(l.account) ?? { dr: 0, cr: 0 }; x.dr += l.debit; x.cr += l.credit; mm.set(l.account, x); }
    return [...mm];
  }, [data]);
  return (
    <section className={`${card} p-4 sm:p-5`}>
      <ToastContainer />
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fl-cream">Амортизация за {ym.slice(5)}.{ym.slice(0, 4)}: <span className="num">{formatNumber(data?.total ?? 0, 2)}</span> сом</h2>
          <p className="text-sm text-fl-cream/55">{isPosted ? "Проведена в журнале. После изменения карточек нажмите «Перепровести»." : "Ещё не проведена."} Дата проводки — последний день месяца.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {canEdit && <button type="button" onClick={() => post("POST")} disabled={working || !data?.rows.length} className={btn}>{isPosted ? "Перепровести" : "Начислить амортизацию"}</button>}
          {canEdit && isPosted && <button type="button" onClick={() => post("DELETE")} disabled={working} className={ghost}>Отменить</button>}
          <button type="button" onClick={() => onDoc("pdf")} disabled={busy !== null || !data?.rows.length} className={ghost}>Ведомость PDF</button>
          <button type="button" onClick={() => onDoc("docx")} disabled={busy !== null || !data?.rows.length} className={ghost}>Word</button>
        </div>
      </div>
      {data && data.rows.length > 0 && (
        <div className="mt-4 grid gap-4 lg:grid-cols-[2fr_1fr]">
          <table className="w-full text-sm">
            <thead><tr className="text-xs text-fl-cream/50"><th className="py-1 text-left font-medium">Объект</th><th className="py-1 text-right font-medium">Сумма, сом</th></tr></thead>
            <tbody>{data.rows.map((r) => <tr key={r.id} className="border-t border-fl-line/60"><td className="py-1.5 text-fl-cream/85">{r.name}</td><td className="num py-1.5 text-right">{formatNumber(r.amount, 2)}</td></tr>)}</tbody>
          </table>
          <div>
            <p className="mb-1 text-xs text-fl-cream/50">Проводка</p>
            <table className="w-full text-xs">
              <tbody>{byAcc.map(([acc, x]) => <tr key={acc} className="text-fl-cream/75"><td className="py-0.5">{x.dr ? "Дт" : "Кт"} {acc}</td><td className="py-0.5">{accountName(acc)}</td><td className="num py-0.5 text-right">{formatNumber(x.dr || x.cr, 2)}</td></tr>)}</tbody>
            </table>
          </div>
        </div>
      )}
      {posted.length > 0 && <p className="mt-4 text-xs text-fl-cream/50">Проведённые месяцы: {posted.map((p) => `${p.slice(5)}.${p.slice(0, 4)}`).join(", ")}</p>}
    </section>
  );
}

function TaxTab({ companyId, canEdit, defaultYear }: { companyId: string; canEdit: boolean; defaultYear: number }) {
  const [year, setYear] = useState(defaultYear);
  const [data, setData] = useState<{ settings: TaxSettings; years: TaxYear[]; assets: Array<{ id: string; name: string; taxGroup: number | null; acquiredAt: string }> } | null>(null);
  const [st, setSt] = useState<TaxSettings | null>(null);
  const [saving, setSaving] = useState(false);
  const { show, ToastContainer } = useToast();
  const load = useCallback(async () => {
    const r = await fetch(`/api/assets/tax?companyId=${encodeURIComponent(companyId)}&year=${year}`);
    const b = await r.json();
    if (r.ok) { setData(b); setSt(b.settings); }
  }, [companyId, year]);
  useEffect(() => { load(); }, [load]);
  const y = data?.years.find((x) => x.year === year);
  async function save() {
    if (!st) return;
    setSaving(true);
    try {
      const r = await fetch("/api/assets/tax", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, settings: st }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show("Сохранено"); await load();
    } catch (e: any) { show(e.message, "error"); } finally { setSaving(false); }
  }
  const num = (v: string) => parseFormattedNumber(v);
  const oldBuildings = (data?.assets ?? []).filter((a) => a.taxGroup === 5 && Number(a.acquiredAt.slice(0, 4)) < (st?.startYear ?? 0));
  return (
    <div className="space-y-4">
      <ToastContainer />
      <section className={`${card} p-4 sm:p-5`}>
        <div className="flex flex-wrap items-end gap-3">
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Налоговый год</span>
            <input type="number" className={`${field} w-28`} value={year} onChange={(e) => setYear(Number(e.target.value) || year)} /></label>
          {st && <>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Расчётный показатель, сом</span>
              <input type="number" className={`${field} w-32`} value={st.rp} onChange={(e) => setSt({ ...st, rp: Number(e.target.value) || 0 })} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Начало расчёта, год</span>
              <input type="number" className={`${field} w-28`} value={st.startYear} onChange={(e) => setSt({ ...st, startYear: Number(e.target.value) || st.startYear })} /></label>
          </>}
          {canEdit && <button type="button" onClick={save} disabled={saving} className={`${btn} ml-auto`}>{saving ? "Сохраняю…" : "Сохранить настройки"}</button>}
        </div>
        <p className="mt-2 text-xs text-fl-cream/50">
          Метод уменьшаемого остатка по стоимости группы на конец года (ст. 226 НК КР). Объекты дешевле 100 расчётных показателей
          ({formatNumber(100 * (st?.rp ?? 100), 0)} сом) не входят в группы — их стоимость вычитается в году приобретения (ст. 225).
          Ремонт вычитается в пределах 15 % стоимости группы на начало года, остальное увеличивает стоимость группы (ст. 229).
        </p>
        {st && (
          <details className="mt-3 text-sm text-fl-cream/75">
            <summary className="cursor-pointer text-fl-gold">Стоимость групп на начало {st.startYear} года и ремонт за {year} год</summary>
            <div className="mt-3 overflow-x-auto">
              <table className="w-full min-w-[560px] text-sm">
                <thead><tr className="text-xs text-fl-cream/50"><th className="py-1 text-left font-medium">Группа</th><th className="py-1 text-right font-medium">Стоимость на начало {st.startYear}</th><th className="py-1 text-right font-medium">Ремонт за {year}</th></tr></thead>
                <tbody>
                  {([1, 2, 3, 4, 5, 6] as TaxGroup[]).map((g) => (
                    <tr key={g} className="border-t border-fl-line/60">
                      <td className="py-1.5 text-fl-cream/80">{g} — {TAX_GROUPS[g].rate * 100} %</td>
                      <td className="py-1.5 text-right">{g === 5 ? <span className="text-xs text-fl-cream/45">по объектам ниже</span> : <input inputMode="decimal" className={`${field} num ml-auto w-40 text-right`} value={st.opening[g] ?? ""} onChange={(e) => setSt({ ...st, opening: { ...st.opening, [g]: num(e.target.value) } })} />}</td>
                      <td className="py-1.5 text-right"><input inputMode="decimal" className={`${field} num ml-auto w-40 text-right`} value={st.repairs[String(year)]?.[g] ?? ""} onChange={(e) => setSt({ ...st, repairs: { ...st.repairs, [String(year)]: { ...(st.repairs[String(year)] ?? {}), [g]: num(e.target.value) } } })} /></td>
                    </tr>
                  ))}
                  {oldBuildings.map((a) => (
                    <tr key={a.id} className="border-t border-fl-line/60">
                      <td className="py-1.5 pl-4 text-fl-cream/70">гр. 5: {a.name}</td>
                      <td className="py-1.5 text-right"><input inputMode="decimal" className={`${field} num ml-auto w-40 text-right`} value={st.objectOpening[a.id] ?? ""} onChange={(e) => setSt({ ...st, objectOpening: { ...st.objectOpening, [a.id]: num(e.target.value) } })} /></td>
                      <td />
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
        )}
      </section>

      {y ? (
        <section className={`${card} overflow-x-auto`}>
          <table className="w-full min-w-[920px] text-sm">
            <thead>
              <tr className="text-xs text-fl-cream/50">
                {["Группа / объект", "Норма", "На начало года", "Поступило", "Выбыло (по цене продажи)", "Ремонт сверх 15 %", "На конец года", "Амортизация"].map((h, i) => <th key={h} className={`px-3 py-2 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}
              </tr>
            </thead>
            <tbody>
              {y.rows.map((r) => (
                <Fragment key={`${r.group}-${r.objectId ?? ""}`}>
                  <tr className="border-t border-fl-line/60 text-fl-cream/85">
                    <td className="px-3 py-2">{r.group}{r.objectName ? `: ${r.objectName}` : ` — ${TAX_GROUPS[r.group].title}`}</td>
                    <td className="num px-3 py-2 text-right">{r.rate * 100} %</td>
                    <td className="num px-3 py-2 text-right">{m(r.open)}</td>
                    <td className="num px-3 py-2 text-right">{m(r.additions)}</td>
                    <td className="num px-3 py-2 text-right">{m(r.disposals)}</td>
                    <td className="num px-3 py-2 text-right">{m(r.repairExcess)}</td>
                    <td className="num px-3 py-2 text-right">{m(r.close)}</td>
                    <td className="num px-3 py-2 text-right font-semibold text-fl-cream">{m(r.depreciation)}</td>
                  </tr>
                  {r.note && <tr><td colSpan={8} className="px-3 pb-2 text-xs text-fl-amber">{r.note}</td></tr>}
                </Fragment>
              ))}
            </tbody>
          </table>
          <div className="grid gap-2 border-t border-fl-line p-4 text-sm sm:grid-cols-2">
            <p className="text-fl-cream/75">Амортизация по группам: <span className="num font-semibold text-fl-cream">{m(y.totalDepreciation)}</span></p>
            <p className="text-fl-cream/75">Ремонт в пределах 15 %: <span className="num font-semibold text-fl-cream">{m(y.totalRepairs)}</span></p>
            <p className="text-fl-cream/75">Объекты дешевле порога ({y.expensed.length}): <span className="num font-semibold text-fl-cream">{m(y.totalExpensed)}</span></p>
            {y.totalIncomeAdd > 0 && <p className="text-fl-amber">Включить в совокупный доход: <span className="num font-semibold">{m(y.totalIncomeAdd)}</span></p>}
            <p className="font-semibold text-fl-gold sm:col-span-2">Вычет из совокупного дохода за {year} год: <span className="num">{m(y.deduction)}</span> сом</p>
          </div>
        </section>
      ) : (
        <p className="text-sm text-fl-cream/60">{data && data.settings.startYear > year ? `Расчёт начинается с ${data.settings.startYear} года.` : "Нет объектов с налоговой группой."}</p>
      )}
    </div>
  );
}
