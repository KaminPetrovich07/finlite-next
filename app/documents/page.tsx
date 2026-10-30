"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Drawer } from "@/components/ledger/Drawer";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import type { DocKind } from "@/lib/primary/detect";
import type { Overrides } from "@/lib/primary/build";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";

interface Doc { kind: DocKind; number: number; code: string; title: string; amount: number }
interface Row { entryId: string; date: string; description: string; counterparty: string; docs: Doc[] }
interface Register { kind: string; code: string; title: string; hint: string }
interface People { director: string; chief: string; cashier: string; storekeeper: string }

/** Which editable fields make sense for each document. */
const FIELDS: Partial<Record<DocKind, Array<[keyof Overrides, string]>>> = {
  ko1: [["party", "Принято от"], ["basis", "Основание"], ["attachment", "Приложение"]],
  ko2: [["party", "Выдать (Ф.И.О. или организация)"], ["basis", "Основание"], ["attachment", "Приложение"], ["idDoc", "Документ, удостоверяющий личность"]],
  ao1: [["party", "Подотчётное лицо"], ["basis", "Назначение аванса"], ["attachment", "Приложено документов"]],
  m4: [["party", "Поставщик"], ["item", "Наименование ценностей"], ["unit", "Ед. изм."], ["qty", "Количество"], ["attachment", "Сопроводительный документ"]],
  m11: [["item", "Наименование ценностей"], ["unit", "Ед. изм."], ["qty", "Количество"], ["basis", "Основание"]],
  m15: [["party", "Получатель"], ["item", "Наименование ценностей"], ["unit", "Ед. изм."], ["qty", "Количество"]],
  os1: [["party", "Сдатчик (поставщик)"], ["item", "Наименование объекта"], ["invNo", "Инвентарный номер"]],
  os4: [["item", "Наименование объекта"], ["invNo", "Инвентарный номер"], ["reason", "Причина списания"]],
  t49: [["basis", "Основание"]],
  t53: [["basis", "Основание"]],
  waybill: [["party", "Покупатель"], ["item", "Наименование товара"], ["unit", "Ед. изм."], ["qty", "Количество"], ["attachment", "Основание (договор)"]],
  act: [["party", "Заказчик"], ["item", "Наименование работ (услуг)"], ["attachment", "Основание (договор)"]],
  invoice: [["party", "Покупатель"], ["item", "Наименование"], ["unit", "Ед. изм."], ["qty", "Количество"], ["attachment", "Основание (договор)"]],
};

export default function DocumentsPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [registers, setRegisters] = useState<Register[]>([]);
  const [people, setPeople] = useState<People | null>(null);
  const [policySaved, setPolicySaved] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [open, setOpen] = useState<{ row: Row; doc: Doc } | null>(null);
  const [ov, setOv] = useState<Overrides>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  useEffect(() => {
    if (!loaded || period) return;
    const d = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(d.getFullYear(), d.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  useEffect(() => {
    if (!companyId || !period) return;
    setError(null);
    fetch(`/api/primary?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить"); return b; })
      .then((b) => { setRows(b.list); setRegisters(b.registers); setPeople(b.people); setPolicySaved(b.policySaved); })
      .catch((e) => { setError(e.message); setRows([]); });
  }, [companyId, period]);

  const areas = useMemo(() => {
    const m = new Map<string, number>();
    for (const r of rows) for (const d of r.docs) m.set(d.code === "—" ? d.title : d.code, (m.get(d.code === "—" ? d.title : d.code) ?? 0) + 1);
    return Array.from(m.entries());
  }, [rows]);
  const docKey = (d: Doc) => (d.code === "—" ? d.title : d.code);
  const visible = filter === "all" ? rows : rows.filter((r) => r.docs.some((d) => docKey(d) === filter));
  const total = rows.reduce((s, r) => s + r.docs.length, 0);

  async function download(items: Array<{ kind: string; entryId?: string; overrides?: Overrides }>, format: "pdf" | "docx", key: string) {
    if (!period) return;
    setBusy(key);
    try { await downloadPost(`/api/primary/export?format=${format}`, { companyId, from: period.from, to: period.to, items }, `Документы.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const allItems = () => visible.flatMap((r) => r.docs.filter((d) => filter === "all" || docKey(d) === filter).map((d) => ({ kind: d.kind, entryId: r.entryId })));

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Первичные документы</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Каждая проводка должна опираться на первичный документ (ПП № 231, п. 12). Платформа определяет по счетам, какой документ
          нужен — кассовый ордер, приходный ордер, акт ОС, ведомость, накладная, — нумерует его с начала года и заполняет по
          унифицированной форме. Подписанты берутся из учётной политики.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div>
          <span className="mb-1 block text-xs text-fl-cream/55">Период</span>
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
      </div>

      {!policySaved && (
        <div className="mb-4 rounded-lg border border-fl-amber/40 bg-fl-amber/10 p-3 text-sm text-fl-cream">
          Учётная политика не сохранена — в документах будут пустые строки для подписей.{" "}
          <a href="/policy" className="font-medium text-fl-gold underline">Заполнить политику</a>: руководитель, бухгалтер, кассир и кладовщик подставятся во все формы.
        </div>
      )}
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <h2 className="font-display text-[15px] font-semibold text-fl-cream">По операциям периода · {total} документов</h2>
            <div className="flex gap-2">
              <button type="button" disabled={!total || busy !== null} onClick={() => download(allItems(), "pdf", "all-pdf")} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === "all-pdf" ? "Собираю…" : "Скачать все · PDF"}</button>
              <button type="button" disabled={!total || busy !== null} onClick={() => download(allItems(), "docx", "all-docx")} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "all-docx" ? "…" : "Word"}</button>
            </div>
          </div>
          {areas.length > 0 && (
            <div className="mb-3 flex flex-wrap gap-1.5">
              <Chip on={filter === "all"} onClick={() => setFilter("all")}>Все</Chip>
              {areas.map(([k, n]) => <Chip key={k} on={filter === k} onClick={() => setFilter(k)}>{k} · {n}</Chip>)}
            </div>
          )}
          {visible.length === 0 && <p className="py-6 text-sm text-fl-cream/55">За период нет операций, требующих первичных документов.</p>}
          <ul className="divide-y divide-fl-line">
            {visible.map((r) => (
              <li key={r.entryId} className="py-2.5">
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-fl-cream/90"><span className="num mr-2 text-fl-cream/50">{r.date.slice(8, 10)}.{r.date.slice(5, 7)}</span>{r.description}</p>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {r.docs.map((d) => (
                    <button key={d.kind} type="button" onClick={() => { setOpen({ row: r, doc: d }); setOv({}); }}
                      className="rounded-md border border-fl-line bg-fl-gold/5 px-2 py-1 text-xs text-fl-cream hover:border-fl-gold">
                      <b className="text-fl-gold">{d.code === "—" ? "" : `${d.code} `}</b>{d.title} № {d.number} · <span className="num">{formatNumber(d.amount)}</span>
                    </button>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        </section>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="mb-1 font-display text-[15px] font-semibold text-fl-cream">Регистры и описи за период</h2>
            <p className="mb-3 text-xs text-fl-cream/55">Кассовая книга, журналы ПП № 609, инвентаризационные описи с учётными остатками.</p>
            <ul className="flex flex-col gap-2.5">
              {registers.map((r) => (
                <li key={r.kind} className="rounded-lg border border-fl-line p-2.5">
                  <p className="text-sm font-medium text-fl-cream"><span className="text-fl-gold">{r.code}</span> · {r.title}</p>
                  <p className="text-xs text-fl-cream/55">{r.hint}</p>
                  <div className="mt-2 flex gap-2">
                    <button type="button" disabled={busy !== null} onClick={() => download([{ kind: r.kind }], "pdf", `${r.kind}-pdf`)} className="rounded border border-fl-line px-2.5 py-1 text-xs text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === `${r.kind}-pdf` ? "…" : "PDF"}</button>
                    <button type="button" disabled={busy !== null} onClick={() => download([{ kind: r.kind }], "docx", `${r.kind}-docx`)} className="rounded border border-fl-line px-2.5 py-1 text-xs text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === `${r.kind}-docx` ? "…" : "Word"}</button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
          {people && (
            <section className={card}>
              <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Подписанты</h2>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">
                <dt className="text-fl-cream/55">Руководитель</dt><dd className="text-fl-cream">{people.director || "—"}</dd>
                <dt className="text-fl-cream/55">Бухгалтер</dt><dd className="text-fl-cream">{people.chief || "—"}</dd>
                <dt className="text-fl-cream/55">Кассир</dt><dd className="text-fl-cream">{people.cashier || "—"}</dd>
                <dt className="text-fl-cream/55">Кладовщик</dt><dd className="text-fl-cream">{people.storekeeper || "—"}</dd>
              </dl>
              <a href="/policy" className="mt-2 inline-block text-xs text-fl-gold hover:underline">Изменить в учётной политике</a>
            </section>
          )}
        </aside>
      </div>

      <Drawer open={!!open} title={open ? `${open.doc.code === "—" ? "" : `${open.doc.code} · `}${open.doc.title} № ${open.doc.number}` : ""} subtitle={open ? `${open.row.date} · ${open.row.description}` : ""} onClose={() => setOpen(null)}>
        {open && (
          <div className="flex flex-col gap-3">
            <p className="text-sm text-fl-cream/70">Сумма документа: <b className="num text-fl-cream">{formatNumber(open.doc.amount)} сом</b>. Поля ниже заполнены из журнала — поправьте, если нужно, и скачайте.</p>
            {(FIELDS[open.doc.kind] ?? []).map(([k, label]) => (
              <label key={k} className="block">
                <span className="mb-1 block text-xs text-fl-cream/60">{label}</span>
                <input className={field} value={ov[k] ?? ""} placeholder={k === "party" ? open.row.counterparty || "" : k === "basis" ? open.row.description : ""} onChange={(e) => setOv((o) => ({ ...o, [k]: e.target.value }))} />
              </label>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" disabled={busy !== null} onClick={() => download([{ kind: open.doc.kind, entryId: open.row.entryId, overrides: clean(ov) }], "pdf", "one-pdf")} className="rounded-lg bg-fl-accent px-3 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === "one-pdf" ? "…" : "Скачать PDF"}</button>
              <button type="button" disabled={busy !== null} onClick={() => download([{ kind: open.doc.kind, entryId: open.row.entryId, overrides: clean(ov) }], "docx", "one-docx")} className="rounded-lg border border-fl-line px-3 py-2.5 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "one-docx" ? "…" : "Word"}</button>
            </div>
          </div>
        )}
      </Drawer>
    </main>
  );
}

function clean(o: Overrides): Overrides {
  return Object.fromEntries(Object.entries(o).filter(([, v]) => typeof v === "string" && v.trim())) as Overrides;
}

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return <button type="button" onClick={onClick} className={`rounded-full border px-2.5 py-1 text-xs ${on ? "border-fl-gold bg-fl-gold/15 text-fl-cream" : "border-fl-line text-fl-cream/60 hover:border-fl-gold/50"}`}>{children}</button>;
}
