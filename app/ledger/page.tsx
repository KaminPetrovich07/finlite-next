"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { EntryCard } from "@/components/ledger/EntryCard";
import { EntryForm } from "@/components/ledger/EntryForm";
import { EntryHistory } from "@/components/ledger/EntryHistory";
import { RecurringPanel } from "@/components/ledger/RecurringPanel";
import { Attachments } from "@/components/ledger/Attachments";
import { Trash } from "@/components/ledger/Trash";
import { SOURCE_NOTE } from "@/lib/ledger/source-note";
import { SOURCE_LABEL } from "@/lib/ledger/types";
import { uploadAttachment } from "@/components/ledger/attach-upload";
import { nextMonth } from "@/lib/ledger/recurring";
import { ReceiptScan } from "@/components/ledger/ReceiptScan";
import { PayrollForm } from "@/components/ledger/PayrollForm";
import { Notice } from "@/components/ledger/statements";
import { useToast } from "@/components/Toast";
import { demoEntries, DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod, periodLabel } from "@/lib/ledger/period";
import type { LedgerEntry } from "@/lib/ledger/types";
import { useT } from "@/components/i18n";

function currentMonth() {
  const d = new Date();
  return monthPeriod(d.getFullYear(), d.getMonth() + 1);
}

const todayIso = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек

export default function LedgerPage() {
  const { companies, companyId, setCompanyId, company, loaded, reload, readOnly } = useCompanies();
  const t = useT();
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [entries, setEntries] = useState<LedgerEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState<null | "manual" | "opening" | "payroll" | "receipt">(null);
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<LedgerEntry | null>(null);
  const [historyOf, setHistoryOf] = useState<LedgerEntry | null>(null);
  const [docsOf, setDocsOf] = useState<LedgerEntry | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [trashOpen, setTrashOpen] = useState(false);
  const toast = useToast();
  const lockedThrough = company?.lockedThrough ? company.lockedThrough.slice(0, 10) : null;
  const isLocked = (e: LedgerEntry) => !!lockedThrough && e.date <= lockedThrough;
  useEffect(() => { if (form) setEditing(null); }, [form]);

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);

  // /ledger?entry=…&date=… — открыть месяц операции и подсветить её (из «Проверки журнала»)
  const [focus, setFocus] = useState<string | null>(null);
  useEffect(() => {
    if (!loaded || period) return;
    const sp = new URLSearchParams(window.location.search);
    const date = sp.get("date"), entry = sp.get("entry");
    if (entry && date && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
      const [y, m] = date.split("-").map(Number);
      setPeriod({ from: `${date.slice(0, 7)}-01`, to: new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10) });
      setFocus(entry);
    } else setPeriod(company?.demo ? DEMO_PERIOD : currentMonth());
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);
  useEffect(() => {
    if (!focus || !entries.length) return;
    const el = document.getElementById(`e-${focus}`);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "center" });
    el.classList.add("ring-2", "ring-fl-gold");
    const t = setTimeout(() => { el.classList.remove("ring-2", "ring-fl-gold"); setFocus(null); }, 4000);
    return () => clearTimeout(t);
  }, [focus, entries]);

  const isDemo = !!company?.demo;

  // /ledger?new=1, ?payroll=1, ?receipt=1 — из нижней панели телефона, поиска и ярлыков установленного приложения
  useEffect(() => {
    if (!loaded || !period || isDemo || readOnly) return;
    const sp = new URLSearchParams(window.location.search);
    const want = sp.get("new") ? "manual" : sp.get("payroll") ? "payroll" : sp.get("receipt") ? "receipt" : null;
    if (!want) return;
    setForm(want);
    history.replaceState(null, "", "/ledger");
    setTimeout(() => document.getElementById("fl-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 100);
  }, [loaded, period, isDemo, readOnly]);

  const load = useCallback(async () => {
    if (!companyId || !period) return;
    setError(null);
    if (isDemo) {
      setEntries(
        demoEntries()
          .filter((e) => e.source === "opening" || (e.date >= period.from && e.date <= period.to))
          .sort((a, b) => b.date.localeCompare(a.date))
      );
      return;
    }
    try {
      const res = await fetch(`/api/ledger?companyId=${companyId}&from=${period.from}&to=${period.to}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error);
      setEntries(body);
    } catch (e: any) {
      setError(t(e.message ?? "Не удалось загрузить журнал"));
      setEntries([]);
    }
  }, [companyId, period, isDemo]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPicked(new Set()); }, [companyId, period]);

  const [recKey, setRecKey] = useState(0);

  async function save(entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number; memo?: string; party?: string; item?: string; qty?: number; unit?: string }>; repeat?: { day: number }; photo?: File }) {
    const { repeat, photo, ...data } = entry;
    const res = await fetch("/api/ledger", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...data, companyId, source: form === "opening" ? "opening" : "manual" }),
    });
    const body = await res.json();
    if (!res.ok) { toast.show(t(body.error ?? "Проводка не сохранена"), "error"); return false; }
    if (repeat) {
      // эта проводка — первый месяц; дальше шаблон проводится сам
      const r = await fetch("/api/ledger/recurring", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, description: data.description, lines: data.lines, day: repeat.day, from: nextMonth(data.date.slice(0, 7)) }),
      });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) toast.show(t("Проводка сохранена, но регулярную операцию создать не удалось: {e}", { e: t(b.error ?? "ошибка") }), "error");
      else { toast.show(t("Проводка сохранена; со следующего месяца она будет проводиться сама")); setRecKey((k) => k + 1); }
    } else toast.show(t("Проводка сохранена — отчётность обновлена"));
    if (photo && body.id) {
      try { await uploadAttachment(body.id, photo); } catch (e: any) { toast.show(t("Проводка сохранена, но фото не прикрепилось: {e}", { e: e.message }), "error"); }
    }
    setForm(null);
    load();
    return true;
  }

  async function update(entry: { date: string; description: string; lines: Array<{ account: string; debit: number; credit: number }> }) {
    if (!editing) return false;
    const res = await fetch(`/api/ledger/${editing.id}`, {
      method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(entry),
    });
    const body = await res.json();
    if (!res.ok) { toast.show(t(body.error ?? "Изменения не сохранены"), "error"); return false; }
    toast.show(body.note ? t("Проводка изменена — прежняя версия в истории. Помните: повторный расчёт в разделе может заменить правки") : t("Проводка изменена — прежняя версия в истории"));
    setEditing(null);
    load();
    return true;
  }

  function startEdit(e: LedgerEntry) {
    setForm(null);
    setEditing(e);
    setTimeout(() => document.getElementById("fl-entry-form")?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  async function remove(id: string) {
    const e = entries.find((x) => x.id === id);
    const extra = e?.source === "bank" ? ` ${t("Строка банковской выписки удалится вместе с ней.")}` : "";
    if (!confirm(`${t("Удалить проводку? Все отчёты пересчитаются без неё.")}${extra} ${t("Вернуть можно в разделе «Удалённые».")}`)) return;
    const res = await fetch(`/api/ledger/${id}`, { method: "DELETE" });
    const body = await res.json();
    if (!res.ok) { toast.show(body.error ?? "Не удалось удалить", "error"); return; }
    toast.show(body.cogs ? t("Проводка и списание себестоимости по ней удалены") : t("Проводка удалена — вернуть можно в «Удалённых»"), "info");
    setPicked((p) => { const n = new Set(p); n.delete(id); return n; });
    load();
  }

  async function removePicked() {
    const ids = [...picked];
    if (!ids.length) return;
    const bank = entries.filter((e) => picked.has(e.id) && e.source === "bank").length;
    if (!confirm(`${t("Удалить отмеченные проводки ({n})? Отчёты пересчитаются без них.", { n: ids.length })}${bank ? ` ${t("Строки выписки ({n}) удалятся вместе с ними.", { n: bank })}` : ""} ${t("Вернуть можно в разделе «Удалённые».")}`)) return;
    setBusy(true);
    const res = await fetch("/api/ledger/bulk", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, action: "delete", ids }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { toast.show(body.error ?? "Не удалось удалить", "error"); return; }
    toast.show(`${t("Удалено: {n}", { n: body.deleted })}${body.cogs ? t(", и списаний себестоимости: {n}", { n: body.cogs }) : ""}${body.locked ? t(". В закрытом периоде пропущено: {n}", { n: body.locked }) : ""}`, body.locked ? "error" : "info");
    setPicked(new Set());
    load();
  }

  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  async function savePayroll(p: { date: string; production: number; sales: number; admin: number }) {
    const res = await fetch("/api/ledger/payroll", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...p, companyId }),
    });
    const body = await res.json();
    if (!res.ok) { toast.show(t(body.error ?? "Не удалось начислить"), "error"); return false; }
    toast.show(t("Зарплата начислена — отчётность обновлена"));
    setForm(null);
    load();
    return true;
  }

  async function closePeriod() {
    if (!period) return;
    if (!confirm(t("Закрыть счета доходов и расходов за {p}? Прибыль перейдёт на счёт 5300 через 5999. Повторное закрытие заменит проводку.", { p: periodLabel(period.from, period.to).toLowerCase() }))) return;
    setBusy(true);
    const res = await fetch("/api/ledger/close", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...period }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.show(body.error ?? "Ошибка", "error"); return; }
    toast.show(body.entry ? t("Период закрыт: прибыль перенесена на 5300") : t("Закрывать нечего — нет доходов и расходов"), "info");
    load();
  }

  async function postBank() {
    setBusy(true);
    const res = await fetch("/api/ledger/post-bank", {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId }),
    });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.show(body.error ?? "Ошибка", "error"); return; }
    toast.show(body.posted ? t("Проведено операций из выписок: {n}", { n: body.posted }) : t("Все операции выписок уже в журнале"), "info");
    load();
  }

  async function createDemoCopy() {
    setBusy(true);
    const res = await fetch("/api/demo", { method: "POST" });
    const body = await res.json();
    setBusy(false);
    if (!res.ok) { toast.show(t(body.error ?? "Не удалось создать компанию"), "error"); return; }
    toast.show(t("Создана редактируемая копия демо-компании"));
    await reload(body.id);
  }

  const opening = entries.filter((e) => e.source === "opening");
  const parties = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.party ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")).slice(0, 300);
  const items = [...new Set(entries.flatMap((e) => e.lines.map((l) => l.item ?? "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "ru")).slice(0, 500);
  const inPeriod = entries.filter((e) => e.source !== "opening");

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-5 sm:px-6 sm:pt-10">
      <header className="mb-4 flex flex-wrap items-end justify-between gap-2 sm:mb-6 sm:gap-4">
        <div>
          <h1 className="font-display text-2xl font-bold text-fl-cream sm:text-4xl">{t("Журнал проводок")}</h1>
          <p className="mt-1 hidden max-w-2xl text-sm text-fl-cream/60 sm:block">
            {t("Единственный источник данных для баланса, ОПиУ, ОДДС, отчёта о капитале и налогов. Операции из банковских выписок попадают сюда автоматически.")}
          </p>
        </div>
        <a href="/reports" className="text-sm text-fl-gold underline-offset-4 hover:underline">{t("Открыть отчётность")}</a>
      </header>

      <section className="mb-4 flex flex-col gap-3 rounded-xl border border-fl-line bg-fl-charcoal-2 p-3 sm:mb-5 sm:p-5 lg:flex-row lg:items-center">
        <label className="flex flex-col gap-1 text-xs text-fl-cream/50 lg:min-w-[220px]">
          {t("Компания")}
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setForm(null); }}
            className="rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}{c.access === "view" && !c.demo ? ` · ${t("просмотр")}` : ""}</option>)}
            <option value={NEW_COMPANY}>+ {t("Добавить компанию…")}</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">
          {t("Период")}
          {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
        </div>
      </section>

      {isDemo ? (
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-fl-line bg-fl-gold/5 px-4 py-3">
          <p className="text-sm text-fl-cream/70">{t("Демо-компания только для просмотра. Копию можно менять, удалять и дополнять.")}</p>
          <button onClick={createDemoCopy} disabled={busy}
            className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">
            {t("Создать редактируемую копию")}
          </button>
        </div>
      ) : readOnly ? (
        <div className="mb-5 rounded-xl border border-fl-line bg-fl-info/5 px-4 py-3 text-sm text-fl-cream/70">
          {t("У вас доступ к этой компании только для просмотра: журнал и отчёты открыты, изменения недоступны.")}
        </div>
      ) : (
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:overflow-visible sm:px-0">
          <button onClick={() => { setEditing(null); setForm("manual"); }} className="shrink-0 rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">
            {t("Новая проводка")}
          </button>
          <button onClick={() => setForm("receipt")} className="shrink-0 rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/80 hover:text-fl-cream">
            {t("Чек по фото")}
          </button>
          <button onClick={() => setForm("opening")} className="shrink-0 rounded-md border border-fl-gold/40 px-4 py-2.5 text-sm text-fl-gold-bright hover:bg-fl-gold/10">
            {t("Ввести начальные остатки")}
          </button>
          <button onClick={() => setForm("payroll")} className="shrink-0 rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/80 hover:text-fl-cream">
            {t("Начислить зарплату")}
          </button>
          <button onClick={closePeriod} disabled={busy} className="shrink-0 rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/80 hover:text-fl-cream disabled:opacity-50">
            {t("Закрыть период")}
          </button>
          <button onClick={postBank} disabled={busy} className="shrink-0 rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/70 hover:text-fl-cream disabled:opacity-50">
            {t("Провести операции из выписок")}
          </button>
          <button onClick={() => setTrashOpen(true)} className="shrink-0 rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/70 hover:text-fl-cream">
            {t("Удалённые")}
          </button>
        </div>
      )}

      {editing && period && (
        <div id="fl-entry-form" className="mb-6 scroll-mt-20">
          {SOURCE_NOTE[editing.source] && (
            <p className="mb-2 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-3 py-2 text-xs text-fl-cream/75">
              <span className="font-semibold text-fl-amber">{t(SOURCE_LABEL[editing.source] ?? editing.source)}.</span> {t(SOURCE_NOTE[editing.source])}
            </p>
          )}
          <EntryForm key={`edit-${editing.id}`} mode={editing.source === "opening" ? "opening" : "manual"} defaultDate={editing.date} initial={editing}
            onSubmit={update} onCancel={() => setEditing(null)} parties={parties} items={items} lockedThrough={lockedThrough} />
        </div>
      )}

      {!isDemo && companyId && <RecurringPanel companyId={companyId} readOnly={readOnly} refreshKey={recKey} onPosted={load} toast={(m, k) => toast.show(m, k)} />}

      {form && period && !editing && (
        <div id="fl-entry-form" className="mb-6 scroll-mt-20">
          {form === "receipt" ? <ReceiptScan defaultDate={todayIso() >= period.from && todayIso() <= period.to ? todayIso() : period.from} onSubmit={save} onCancel={() => setForm(null)} />
            : form === "payroll"
            ? <PayrollForm defaultDate={period.to} onSubmit={savePayroll} onCancel={() => setForm(null)} />
            : <EntryForm key={form} mode={form as "manual" | "opening"} defaultDate={form === "manual" && todayIso() >= period.from && todayIso() <= period.to ? todayIso() : period.from} onSubmit={save} onCancel={() => setForm(null)} parties={parties} items={items} lockedThrough={lockedThrough} />}
        </div>
      )}

      {error && <div className="mb-5"><Notice>{error}</Notice></div>}

      {period && (
        <section className="space-y-6">
          {opening.length > 0 && (
            <div>
              <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">{t("Начальные остатки")}</h2>
              <div className="space-y-2.5">
                {opening.map((e) => <EntryCard key={e.id} entry={e} locked={isLocked(e)} onDelete={readOnly ? undefined : remove} onEdit={readOnly ? undefined : startEdit} onHistory={isDemo ? undefined : setHistoryOf} onAttachments={isDemo ? undefined : setDocsOf} selected={picked.has(e.id)} onSelect={readOnly || isDemo ? undefined : toggle} />)}
              </div>
            </div>
          )}
          <div>
            <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">
              {t("Операции за {p}", { p: periodLabel(period.from, period.to).toLowerCase() })}
              <span className="ml-2 font-body text-sm font-normal text-fl-cream/45">{inPeriod.length}</span>
              {!readOnly && !isDemo && inPeriod.some((e) => !isLocked(e)) && (
                <button onClick={() => { const open = inPeriod.filter((e) => !isLocked(e)).map((e) => e.id); setPicked(open.every((id) => picked.has(id)) ? new Set() : new Set(open)); }}
                  className="ml-3 font-body text-xs font-normal text-fl-info hover:underline">
                  {inPeriod.filter((e) => !isLocked(e)).every((e) => picked.has(e.id)) ? t("снять отметки") : t("отметить все за период")}
                </button>
              )}
            </h2>
            {inPeriod.length === 0 ? (
              <Notice>
                {t("За период проводок нет. Начните с начальных остатков, затем добавьте операции вручную или загрузите выписку на странице «Выписки» — она проведётся сюда сама.")}
              </Notice>
            ) : (
              <div className="space-y-2.5">
                {inPeriod.map((e) => <EntryCard key={e.id} entry={e} locked={isLocked(e)} onDelete={readOnly ? undefined : remove} onEdit={readOnly ? undefined : startEdit} onHistory={isDemo ? undefined : setHistoryOf} onAttachments={isDemo ? undefined : setDocsOf} selected={picked.has(e.id)} onSelect={readOnly || isDemo ? undefined : toggle} />)}
              </div>
            )}
          </div>
        </section>
      )}

      {lockedThrough && !isDemo && (
        <p className="mt-6 text-xs text-fl-cream/45">🔒 {t("Изменения по {d} запрещены — снять запрет может владелец компании на странице «Закрытие месяца».", { d: lockedThrough.split("-").reverse().join(".") })}</p>
      )}
      <Attachments entry={docsOf} readOnly={readOnly} locked={!!docsOf && isLocked(docsOf)} onClose={() => setDocsOf(null)} onChanged={load} />
      {picked.size > 0 && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto flex w-fit max-w-[95vw] flex-wrap items-center gap-3 rounded-xl border border-fl-line bg-fl-charcoal-2 px-4 py-2.5 text-sm shadow-card sm:bottom-6">
          <span className="text-fl-cream/80">{t("Отмечено: {n}", { n: picked.size })}</span>
          <button onClick={removePicked} disabled={busy} className="rounded-md border border-fl-red/50 px-3 py-1.5 text-xs font-semibold text-fl-red hover:bg-fl-red/10 disabled:opacity-50">{t("Удалить отмеченные")}</button>
          <button onClick={() => setPicked(new Set())} className="text-xs text-fl-cream/60 hover:underline">{t("снять отметки")}</button>
        </div>
      )}
      {!isDemo && companyId && <Trash companyId={companyId} open={trashOpen} readOnly={readOnly} onClose={() => setTrashOpen(false)} onRestored={(m) => { toast.show(m); load(); }} />}
      <EntryHistory companyId={companyId} entryId={historyOf?.id ?? null} title={historyOf?.description} onClose={() => setHistoryOf(null)} />
      <toast.ToastContainer />
    </main>
  );
}
