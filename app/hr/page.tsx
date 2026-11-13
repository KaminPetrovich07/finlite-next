"use client";

// Кадры и зарплата: карточки сотрудников, табель месяца, расчёт с отпускными и больничными,
// проводка в журнал, расчётные листки и свод для Соцфонда.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies, NEW_COMPANY } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import type { Employee, HrSettings, PayRow, TimesheetRow } from "@/lib/hr/payroll";
import { DEPARTMENTS } from "@/lib/ledger/payroll";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-16 rounded border border-fl-line bg-fl-charcoal-2 px-1.5 py-1 text-right text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thisMonth = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 7);
const monthName = (m: string) => new Date(`${m}-15`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });

interface MonthData { month: string; norm: number; settings: HrSettings; employees: Employee[]; timesheet: TimesheetRow[]; rows: PayRow[]; totals: { gross: number; employeeSocial: number; employerSocial: number; pit: number; net: number }; posted: { entryId: string; at: string | null } | null }

async function call(url: string, method: string, body?: unknown) {
  const r = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Не получилось");
  return b;
}

export default function HrPage() {
  const { companies, companyId, setCompanyId, company } = useCompanies();
  const toast = useToast();
  const [tab, setTab] = useState<"month" | "people" | "settings">("month");
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [settings, setSettings] = useState<HrSettings | null>(null);
  const [months, setMonths] = useState<Array<{ month: string; posted: boolean }>>([]);
  const [error, setError] = useState<string | null>(null);
  const [month, setMonth] = useState(thisMonth());
  const isDemo = companyId === "demo" || company?.demo;
  const canEdit = company?.access !== "view" && !isDemo;

  const load = useCallback(async () => {
    if (!companyId || isDemo) return;
    try { const b = await call(`/api/hr?companyId=${companyId}&year=${month.slice(0, 4)}`, "GET"); setEmployees(b.employees); setSettings(b.settings); setMonths(b.months); setError(null); }
    catch (e) { setError((e as Error).message); }
  }, [companyId, isDemo, month]);
  useEffect(() => { load(); }, [load]);
  // пустая компания — сразу к карточкам сотрудников (только когда данные кадров уже пришли)
  useEffect(() => { if (settings && !employees.length) setTab((t) => (t === "month" ? "people" : t)); }, [settings, employees.length]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Кадры и зарплата</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Карточки сотрудников, табель, оклад за отработанные дни, отпускные и больничные по среднему заработку, удержания и взносы. Месяц проводится в журнал одной проводкой по отделам.</p>
      </header>
      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        {tab === "month" && <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Месяц</span><input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} className={field} /></label>}
      </div>
      {isDemo ? <p className="rounded-xl border-l-4 border-fl-info bg-fl-info/[0.07] px-4 py-3 text-sm text-fl-cream/85">Демо-компания только для просмотра. Чтобы вести кадры, создайте свою компанию или <a href="/companies" className="font-semibold text-fl-gold underline">копию демо-компании</a>.</p>
        : error ? <p className="text-sm text-fl-red">{error}</p> : !settings ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : (
        <>
          <div role="tablist" className="mb-5 flex gap-1 overflow-x-auto border-b border-fl-line">
            {([["month", "Зарплата за месяц"], ["people", `Сотрудники (${employees.length})`], ["settings", "Ставки и календарь"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px shrink-0 border-b-2 px-4 py-2 text-sm ${tab === k ? "border-fl-gold font-semibold text-fl-cream" : "border-transparent text-fl-cream/60 hover:text-fl-cream"}`}>{l}</button>
            ))}
          </div>
          {tab === "people" && <People companyId={companyId} employees={employees} canEdit={canEdit} reload={load} toast={toast.show} />}
          {tab === "month" && (employees.length ? <Month companyId={companyId} month={month} canEdit={canEdit} months={months} reload={load} toast={toast.show} /> : <p className="text-sm text-fl-cream/60">Сначала добавьте сотрудников на вкладке «Сотрудники».</p>)}
          {tab === "settings" && <Settings companyId={companyId} year={Number(month.slice(0, 4))} s={settings} canEdit={canEdit} reload={load} toast={toast.show} />}
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

type Toast = (m: string, k?: "success" | "error") => void;

// ── Сотрудники ────────────────────────────────────────────────────────────
const blank = { id: "", name: "", pin: "", position: "", dept: "production", salary: "", hiredAt: "", firedAt: "", priorYears: "", dependents3: false };
function People({ companyId, employees, canEdit, reload, toast }: { companyId: string; employees: Employee[]; canEdit: boolean; reload: () => void; toast: Toast }) {
  const [f, setF] = useState<typeof blank | null>(null);
  const set = (k: keyof typeof blank) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF((x) => x && ({ ...x, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value }));
  async function save(e: React.FormEvent) {
    e.preventDefault();
    if (!f) return;
    try { await call("/api/hr", "POST", { companyId, employee: { ...f, id: f.id || undefined, salary: Number(String(f.salary).replace(/\s/g, "").replace(",", ".")), priorYears: Number(String(f.priorYears).replace(",", ".")) || 0 } }); toast(f.id ? "Карточка обновлена" : "Сотрудник добавлен"); setF(null); reload(); }
    catch (err) { toast((err as Error).message, "error"); }
  }
  async function remove(e: Employee) {
    if (!confirm(`Удалить карточку «${e.name}»? Проведённые месяцы останутся в журнале. Если сотрудник уволился, лучше укажите дату увольнения.`)) return;
    try { await call(`/api/hr?companyId=${companyId}&id=${e.id}`, "DELETE"); toast("Карточка удалена"); reload(); } catch (err) { toast((err as Error).message, "error"); }
  }
  return (
    <div className="space-y-4">
      {canEdit && !f && <button onClick={() => setF({ ...blank })} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">+ Сотрудник</button>}
      {f && (
        <form onSubmit={save} className="grid gap-3 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 sm:grid-cols-3">
          <label className="text-sm text-fl-cream/75 sm:col-span-2">ФИО<input value={f.name} onChange={set("name")} className={field} required /></label>
          <label className="text-sm text-fl-cream/75">ПИН (14 цифр)<input value={f.pin} onChange={set("pin")} inputMode="numeric" className={field} /></label>
          <label className="text-sm text-fl-cream/75">Должность<input value={f.position} onChange={set("position")} className={field} /></label>
          <label className="text-sm text-fl-cream/75">Отдел (счёт затрат)<select value={f.dept} onChange={set("dept")} className={field}>{Object.entries(DEPARTMENTS).map(([k, d]) => <option key={k} value={k}>{d.label} — {d.wages}</option>)}</select></label>
          <label className="text-sm text-fl-cream/75">Оклад в месяц, сом<input value={f.salary} onChange={set("salary")} inputMode="decimal" className={field} required /></label>
          <label className="text-sm text-fl-cream/75">Дата приёма<input type="date" value={f.hiredAt} onChange={set("hiredAt")} className={field} required /></label>
          <label className="text-sm text-fl-cream/75">Дата увольнения<input type="date" value={f.firedAt} onChange={set("firedAt")} className={field} /></label>
          <label className="text-sm text-fl-cream/75">Стаж до приёма, лет<input value={f.priorYears} onChange={set("priorYears")} inputMode="decimal" className={field} /></label>
          <label className="flex items-center gap-2 text-sm text-fl-cream/75 sm:col-span-3"><input type="checkbox" checked={f.dependents3} onChange={set("dependents3")} /> Трое и более иждивенцев (больничный 100 % независимо от стажа)</label>
          <div className="flex gap-2 sm:col-span-3">
            <button className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Сохранить</button>
            <button type="button" onClick={() => setF(null)} className="rounded-lg px-3 py-2 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
          </div>
        </form>
      )}
      {employees.length === 0 ? <p className="text-sm text-fl-cream/60">Сотрудников пока нет.</p> : (
        <div className="overflow-x-auto rounded-2xl border border-fl-line">
          <table className="w-full min-w-[720px] text-sm">
            <thead className="bg-fl-surface-2 text-left text-[11px] uppercase tracking-wide text-fl-cream/50"><tr><th className="px-3 py-2">Сотрудник</th><th className="px-3 py-2">Отдел</th><th className="px-3 py-2 text-right">Оклад</th><th className="px-3 py-2">Принят</th><th className="px-3 py-2">Уволен</th><th /></tr></thead>
            <tbody>{employees.map((e) => (
              <tr key={e.id} className="border-t border-fl-line">
                <td className="px-3 py-2 text-fl-cream">{e.name}<span className="block text-xs text-fl-cream/50">{[e.position, e.pin && `ПИН ${e.pin}`].filter(Boolean).join(" · ")}</span></td>
                <td className="px-3 py-2 text-fl-cream/75">{DEPARTMENTS[e.dept].label}</td>
                <td className="num px-3 py-2 text-right text-fl-cream">{money(e.salary)}</td>
                <td className="px-3 py-2 text-fl-cream/70">{e.hiredAt.split("-").reverse().join(".")}</td>
                <td className="px-3 py-2 text-fl-cream/70">{e.firedAt ? e.firedAt.split("-").reverse().join(".") : "—"}</td>
                <td className="px-3 py-2 text-right">{canEdit && <span className="flex justify-end gap-3 text-xs">
                  <button className="text-fl-gold underline" onClick={() => setF({ id: e.id, name: e.name, pin: e.pin ?? "", position: e.position ?? "", dept: e.dept, salary: String(e.salary), hiredAt: e.hiredAt, firedAt: e.firedAt ?? "", priorYears: String(e.priorYears ?? ""), dependents3: !!e.dependents3 })}>изменить</button>
                  <button className="text-fl-cream/50 hover:text-fl-red" onClick={() => remove(e)}>удалить</button>
                </span>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Месяц: табель и расчёт ────────────────────────────────────────────────
const COLS: Array<[keyof TimesheetRow, string, string]> = [["worked", "Отраб., дн.", "рабочие дни"], ["vacationDays", "Отпуск, к.дн.", "календарные дни отпуска"], ["sickDays", "Больн., р.дн.", "рабочие дни больничного"], ["unpaidDays", "Без сохр.", "дни без сохранения зарплаты"], ["bonus", "Премия", "сом"], ["other", "Прочее", "сом"]];

function Month({ companyId, month, canEdit, months, reload, toast }: { companyId: string; month: string; canEdit: boolean; months: Array<{ month: string; posted: boolean }>; reload: () => void; toast: Toast }) {
  const [d, setD] = useState<MonthData | null>(null);
  const [ts, setTs] = useState<TimesheetRow[]>([]);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<string | null>(null);
  const load = useCallback(() => call(`/api/hr/payrun?companyId=${companyId}&month=${month}`, "GET").then((b: MonthData) => { setD(b); setTs(b.timesheet); setDirty(false); }).catch((e) => toast(e.message, "error")), [companyId, month, toast]);
  useEffect(() => { load(); }, [load]);
  const edit = (i: number, k: keyof TimesheetRow, v: string) => { setTs((x) => x.map((r, j) => (j === i ? { ...r, [k]: Number(v.replace(",", ".")) || 0 } : r))); setDirty(true); };
  async function save() { setBusy(true); try { const b = await call("/api/hr/payrun", "PUT", { companyId, month, timesheet: ts }); setD(b); setTs(b.timesheet); setDirty(false); toast("Табель сохранён, расчёт обновлён"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); } }
  async function post() {
    if (d?.posted && !confirm("Зарплата за этот месяц уже проведена. Заменить проводку новым расчётом?")) return;
    setBusy(true);
    try { const b = await call("/api/hr/payrun", "POST", { companyId, month, timesheet: ts }); setD(b); setTs(b.timesheet); setDirty(false); toast("Зарплата проведена в журнал"); reload(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  const prevPosted = useMemo(() => months.filter((m) => m.posted && m.month < month).length, [months, month]);
  if (!d) return <p className="text-sm text-fl-cream/50">Считаю…</p>;
  const rowOf = (id: string) => d.rows.find((r) => r.employeeId === id);
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm text-fl-cream/70">
        <span>{monthName(month)}: <b className="text-fl-cream">{d.norm}</b> рабочих дней</span>
        <span>Сотрудников: <b className="text-fl-cream">{d.rows.length}</b></span>
        {d.posted ? <span className="rounded-full bg-fl-green/15 px-2.5 py-0.5 text-fl-green">проведено {d.posted.at ? new Date(d.posted.at).toLocaleDateString("ru-RU") : ""}</span> : <span className="rounded-full bg-fl-amber/15 px-2.5 py-0.5 text-fl-amber">не проведено</span>}
        {!prevPosted && <span className="text-xs text-fl-cream/50">Проведённых прошлых месяцев нет — отпускные и больничные считаются от оклада, пока не накопится история.</span>}
      </div>
      <div className="overflow-x-auto rounded-2xl border border-fl-line">
        <table className="w-full min-w-[1080px] text-sm">
          <thead className="bg-fl-surface-2 text-left text-[11px] uppercase tracking-wide text-fl-cream/50">
            <tr><th className="px-3 py-2">Сотрудник</th>{COLS.map(([k, l, t]) => <th key={k} title={t} className="px-1 py-2 text-right">{l}</th>)}<th className="px-2 py-2 text-right">Начислено</th><th className="px-2 py-2 text-right">Взносы раб.</th><th className="px-2 py-2 text-right">ПН</th><th className="px-2 py-2 text-right">К выплате</th></tr>
          </thead>
          <tbody>{ts.map((t, i) => { const r = rowOf(t.employeeId); return (
            <tr key={t.employeeId} className="border-t border-fl-line align-top">
              <td className="px-3 py-1.5"><button className="text-left text-fl-cream hover:text-fl-gold" onClick={() => setOpen(open === t.employeeId ? null : t.employeeId)}>{r?.name}</button>{r?.notes.length ? <span className="ml-1 text-fl-amber" title={r.notes.join("\n")}>●</span> : null}</td>
              {COLS.map(([k]) => <td key={k} className="px-1 py-1.5 text-right"><input aria-label={`${r?.name}: ${k}`} disabled={!canEdit} value={String(t[k] ?? 0)} onChange={(e) => edit(i, k, e.target.value)} inputMode="decimal" className={cell} /></td>)}
              <td className="num px-2 py-1.5 text-right text-fl-cream">{dirty ? "…" : money(r?.gross ?? 0)}</td>
              <td className="num px-2 py-1.5 text-right text-fl-cream/70">{dirty ? "…" : money(r?.employeeSocial ?? 0)}</td>
              <td className="num px-2 py-1.5 text-right text-fl-cream/70">{dirty ? "…" : money(r?.pit ?? 0)}</td>
              <td className="num px-2 py-1.5 text-right font-semibold text-fl-cream">{dirty ? "…" : money(r?.net ?? 0)}</td>
            </tr>
          ); })}</tbody>
          <tfoot className="border-t-2 border-fl-line text-fl-cream"><tr>
            <td className="px-3 py-2 font-semibold" colSpan={COLS.length + 1}>Итого {dirty && <span className="font-normal text-fl-amber">— сохраните табель, чтобы пересчитать</span>}</td>
            <td className="num px-2 py-2 text-right font-semibold">{money(d.totals.gross)}</td><td className="num px-2 py-2 text-right">{money(d.totals.employeeSocial)}</td><td className="num px-2 py-2 text-right">{money(d.totals.pit)}</td><td className="num px-2 py-2 text-right font-semibold">{money(d.totals.net)}</td>
          </tr></tfoot>
        </table>
      </div>
      <p className="text-sm text-fl-cream/65">Взносы работодателя: <b className="text-fl-cream">{money(d.totals.employerSocial)}</b> · всего в Соцфонд: <b className="text-fl-cream">{money(d.totals.employerSocial + d.totals.employeeSocial)}</b> · подоходный налог: <b className="text-fl-cream">{money(d.totals.pit)}</b></p>
      {open && (() => { const r = rowOf(open)!; return (
        <div className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 text-sm">
          <p className="font-semibold text-fl-cream">{r.name}: как посчитано</p>
          <ul className="mt-2 grid gap-x-8 gap-y-1 text-fl-cream/75 sm:grid-cols-2">
            <li>Оклад за {r.worked} из {r.norm} дней: <b className="text-fl-cream">{money(r.salaryPart)}</b></li>
            <li>Отпускные: {money(r.avgVacation)} в день × дни = <b className="text-fl-cream">{money(r.vacationPay)}</b></li>
            <li>Больничный: {money(r.avgSick)} в день × дни × {Math.round(r.sickPct * 100)} % (стаж {r.stazh} лет) = <b className="text-fl-cream">{money(r.sickPay)}</b></li>
            <li>Премия и прочее: <b className="text-fl-cream">{money(r.bonus + r.other)}</b></li>
            <li>База взносов: {money(r.socialBase)} → работник {money(r.employeeSocial)}, работодатель {money(r.employerSocial)}</li>
            <li>База ПН: {money(r.pitBase)} → ПН {money(r.pit)}</li>
          </ul>
          {r.notes.length > 0 && <ul className="mt-2 list-disc pl-5 text-xs text-fl-amber">{r.notes.map((n) => <li key={n}>{n}</li>)}</ul>}
        </div>
      ); })()}
      <div className="flex flex-wrap gap-2">
        {canEdit && <button disabled={busy || !dirty} onClick={save} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream hover:border-fl-gold/50 disabled:opacity-40">Сохранить табель</button>}
        {canEdit && <button disabled={busy} onClick={post} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{d.posted ? "Провести заново" : "Провести в журнал"}</button>}
        <a href={`/hr/payslips?companyId=${companyId}&month=${month}`} target="_blank" rel="noopener" className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream hover:border-fl-gold/50">Расчётные листки</a>
        <a href={`/api/hr/payrun/csv?companyId=${companyId}&month=${month}`} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream hover:border-fl-gold/50">Свод для Соцфонда (Excel)</a>
      </div>
      <p className="text-xs leading-relaxed text-fl-cream/45">Проводка: Дт 7120/7130 (производство), 7520/7530 (продажи), 8010/8020 (администрация) — Кт 3520 к выплате, 3530 взносы, 3420 подоходный налог. Выплату на руки проведите шаблоном «Выплата зарплаты» или из банковской выписки.</p>
    </div>
  );
}

// ── Настройки ─────────────────────────────────────────────────────────────
function Settings({ companyId, year, s, canEdit, reload, toast }: { companyId: string; year: number; s: HrSettings; canEdit: boolean; reload: () => void; toast: Toast }) {
  const [f, setF] = useState({ ...s, holidaysText: s.holidays.join("\n") });
  useEffect(() => setF({ ...s, holidaysText: s.holidays.join("\n") }), [s]);
  const pct = (k: "employeeRate" | "employerRate" | "pitRate") => ({ value: String(Math.round(f[k] * 10000) / 100), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: (Number(e.target.value.replace(",", ".")) || 0) / 100 }) });
  const num = (k: "maxBase" | "minBase" | "sickDaysEmployer" | "vacationDivisor") => ({ value: String(f[k]), onChange: (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: Number(e.target.value.replace(",", ".").replace(/\s/g, "")) || 0 }) });
  async function save() {
    const holidays = f.holidaysText.split(/[\s,;]+/).map((x) => x.trim()).filter(Boolean).map((x) => (/^\d{2}\.\d{2}\.\d{4}$/.test(x) ? x.split(".").reverse().join("-") : x));
    try { await call("/api/hr", "PUT", { companyId, year, settings: { ...f, holidays } }); toast("Настройки сохранены"); reload(); } catch (e) { toast((e as Error).message, "error"); }
  }
  return (
    <div className="space-y-4">
      <div className="grid gap-4 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 sm:grid-cols-3">
        <label className="text-sm text-fl-cream/75">Взносы работника, %<input {...pct("employeeRate")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Взносы работодателя, %<input {...pct("employerRate")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Подоходный налог, %<input {...pct("pitRate")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Предельная база взносов в месяц, сом<input {...num("maxBase")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Минимальная база ПН и взносов, сом<input {...num("minBase")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Больничный за счёт работодателя, рабочих дней<input {...num("sickDaysEmployer")} disabled={!canEdit} className={field} /></label>
        <label className="text-sm text-fl-cream/75">Делитель для отпускных, дней в месяце<input {...num("vacationDivisor")} disabled={!canEdit} className={field} /></label>
        <label className="flex items-center gap-2 text-sm text-fl-cream/75"><input type="checkbox" disabled={!canEdit} checked={f.sickSocialTaxable} onChange={(e) => setF({ ...f, sickSocialTaxable: e.target.checked })} /> больничные входят в базу взносов</label>
        <label className="flex items-center gap-2 text-sm text-fl-cream/75"><input type="checkbox" disabled={!canEdit} checked={f.sickPitTaxable} onChange={(e) => setF({ ...f, sickPitTaxable: e.target.checked })} /> больничные облагаются ПН</label>
        <label className="text-sm text-fl-cream/75 sm:col-span-3">Нерабочие праздничные дни {year} года (по одной дате в строке, ГГГГ-ММ-ДД или ДД.ММ.ГГГГ)
          <textarea rows={6} value={f.holidaysText} disabled={!canEdit} onChange={(e) => setF({ ...f, holidaysText: e.target.value })} className={`${field} font-mono`} />
        </label>
        {canEdit && <div className="sm:col-span-3"><button onClick={save} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Сохранить</button></div>}
      </div>
      <div className="rounded-xl border-l-4 border-fl-amber bg-fl-amber/10 px-4 py-3 text-sm leading-relaxed text-fl-cream/85">
        <p className="font-semibold">Что заложено по умолчанию и что проверить</p>
        <ul className="mt-1 list-disc space-y-1 pl-5">
          <li>Взносы 12,25 % (10 % работник + 2,25 % работодатель). Для отдельных категорий плательщиков ставка 27,25 % — тогда укажите 17,25 % у работодателя.</li>
          <li>Предельная база — 20 средних зарплат прошлого года (632 080 сом на 2026 год). Меняется ежегодно.</li>
          <li>Минимальная база: если зарплата ниже средней по региону, ПН и взносы считаются от средней (СМЗ публикует ГНС). Укажите её, если правило касается вашей компании; 0 — не применять.</li>
          <li>Отпускные: заработок за 3 месяца / 3 / 29,6 × календарные дни отпуска (ст. 95 ТК КР). Больничный: первые 10 рабочих дней — работодатель, 60 % / 80 % / 100 % среднего заработка при стаже до 5 / 5–8 / от 8 лет.</li>
          <li>Облагаются ли больничные ПН и взносами — проверьте по действующей редакции НК КР и закона о тарифах и при необходимости переключите флажки.</li>
          <li>Праздники {year} года — по календарю Минтруда; Орозо айт и Курман айт объявляются отдельно, проверьте даты.</li>
        </ul>
      </div>
    </div>
  );
}
