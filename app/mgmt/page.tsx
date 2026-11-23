"use client";

// Управленческий учёт: аналитики (подразделения, проекты и объекты, направления), разметка проводок
// вручную и правилами, отчёт о прибылях и убытках по сегментам с распределением общих затрат.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { formatNumber } from "@/lib/format";
import { quarterPeriod } from "@/lib/ledger/period";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { SOURCE_LABEL, type EntrySource } from "@/lib/ledger/types";
import {
  ALLOC_LABEL, DIM_KINDS, DIM_LABEL, DIM_SHORT, newId, SEG_ROW_LABEL, SEG_ROWS,
  type AllocBase, type DimKind, type DimValue, type MgmtSettings, type Rule, type SegColumn, type SegReport, type SegRow, type TagOrigin, type Tags,
} from "@/lib/mgmt/model";
import { MARGINAL_ROWS, whatIf, type MarginalColumn, type MarginalReport } from "@/lib/mgmt/marginal";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-full rounded border border-fl-line bg-fl-charcoal px-2 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
const m0 = (n: number) => formatNumber(n, 0);
const pctText = (n: number | null) => (n == null ? "—" : `${String(n).replace(".", ",")} %`);
const dmy = (iso: string) => iso.split("-").reverse().join(".");
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const ORIGIN: Record<TagOrigin, string> = { manual: "вручную", build: "стройка", rule: "правило" };

type Tab = "report" | "marginal" | "tags" | "setup";
interface Row { id: string; date: string; description: string; source: EntrySource; accounts: string[]; party: string | null; income: number; expense: number; tags: Tags; origin: Partial<Record<DimKind, TagOrigin>> }

export default function MgmtPage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const toast = useToast();
  const [period, setPeriod] = useState(() => { const t = today(); return quarterPeriod(Number(t.slice(0, 4)), Math.ceil(Number(t.slice(5, 7)) / 3)); });
  const [tab, setTab] = useState<Tab>("report");
  const [kind, setKind] = useState<DimKind>("dept");
  const [settings, setSettings] = useState<MgmtSettings | null>(null);
  const [draft, setDraft] = useState<MgmtSettings | null>(null);
  const [report, setReport] = useState<SegReport | null>(null);
  const [marginal, setMarginal] = useState<MarginalReport | null>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [ro, setRo] = useState(true);
  const [busy, setBusy] = useState(false);
  const [onlyKind, setOnlyKind] = useState<DimKind | "">("");
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [bulk, setBulk] = useState<Tags>({});

  useEffect(() => { if (company?.demo) { setPeriod(DEMO_PERIOD); setKind("line"); } }, [company?.demo]);

  const loadReport = useCallback(async () => {
    if (!companyId) return;
    setReport(null);
    const r = await fetch(`/api/mgmt?companyId=${companyId}&from=${period.from}&to=${period.to}&kind=${kind}`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось построить отчёт", "error"); return; }
    setReport(b.report); setSettings(b.settings); setDraft(b.settings); setRo(!!b.readOnly);
  }, [companyId, period, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadMarginal = useCallback(async () => {
    if (!companyId) return;
    setMarginal(null);
    const r = await fetch(`/api/mgmt?companyId=${companyId}&from=${period.from}&to=${period.to}&kind=${kind}&marginal=1`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось посчитать", "error"); return; }
    setMarginal(b.marginal); setSettings(b.settings); setRo(!!b.readOnly);
  }, [companyId, period, kind]); // eslint-disable-line react-hooks/exhaustive-deps
  const loadRows = useCallback(async () => {
    if (!companyId) return;
    setRows(null);
    const r = await fetch(`/api/mgmt?companyId=${companyId}&from=${period.from}&to=${period.to}&entries=1`);
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Не удалось загрузить проводки", "error"); return; }
    setRows(b.entries); setSettings(b.settings); setRo(!!b.readOnly); setSel(new Set());
  }, [companyId, period]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) loadReport(); }, [loaded, loadReport]);
  useEffect(() => { if (loaded && tab === "tags") loadRows(); }, [loaded, tab, loadRows]);
  useEffect(() => { if (loaded && tab === "marginal") loadMarginal(); }, [loaded, tab, loadMarginal]);

  const dimsOf = useCallback((k: DimKind, s = settings) => (s?.dims ?? []).filter((d) => d.kind === k), [settings]);
  const nameOf = useMemo(() => new Map((settings?.dims ?? []).map((d) => [d.id, d.name])), [settings]);

  async function saveSettings(next: MgmtSettings, msg = "Настройки сохранены") {
    if (ro) { setDraft(next); setSettings(next); return; }
    setBusy(true);
    const r = await fetch("/api/mgmt", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, settings: next }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(b.error ?? "Не сохранено", "error"); return false; }
    setSettings(b.settings); setDraft(b.settings); toast.show(msg);
    loadReport();
    if (tab === "marginal") loadMarginal();
    return true;
  }
  async function tagEntries(ids: string[], tags: Partial<Record<DimKind, string | null>>) {
    const r = await fetch("/api/mgmt/tags", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entryIds: ids, tags }) });
    const b = await r.json().catch(() => ({}));
    if (!r.ok) { toast.show(b.error ?? "Разметка не сохранена", "error"); return; }
    if (ids.length > 1) toast.show(`Размечено проводок: ${b.updated}`);
    loadRows();
  }
  async function print(format: "pdf" | "docx", mode: "segments" | "marginal" = "segments") {
    try { await downloadPost(`/api/mgmt/print?format=${format}`, { companyId, from: period.from, to: period.to, kind, mode }, `${mode === "marginal" ? "маржинальный-анализ" : "сегменты"}.${format}`); }
    catch (e) { toast.show(e instanceof Error ? e.message : "Не удалось сформировать", "error"); }
  }

  const alloc = settings?.alloc[kind] ?? { base: "revenue" as AllocBase };
  const segs = report?.columns.filter((c) => c.id) ?? [];
  const shown = (rows ?? []).filter((r) => !onlyKind || !r.tags[onlyKind]);

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Управленческий учёт</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Прибыль по подразделениям, проектам и объектам, направлениям. Проводки размечаются правилами и вручную; объекты стройки — сами. Общие затраты распределяются по выбранной базе, чтобы было видно, какой сегмент на самом деле зарабатывает.</p>
      </header>

      <section className={`${card} mb-4 flex flex-col gap-3 lg:flex-row lg:items-end`}>
        <label className="text-xs text-fl-cream/50">Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <div className="flex flex-col gap-1 text-xs text-fl-cream/50">Период<PeriodPicker key={`${period.from}${period.to}`} from={period.from} to={period.to} onChange={(p) => setPeriod((c) => (c.from === p.from && c.to === p.to ? c : p))} /></div>
      </section>
      {company?.demo && <p className={`${card} mb-4 text-sm text-fl-cream/70`}>Демо-мебельщик: подразделения «Цех», «Отдел продаж», «Салон», «Администрация» и направления «B2B» и «Розница» размечены правилами. Настройки можно пробовать — в демо они не сохраняются.</p>}

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-fl-surface-2 p-1 text-sm">
        {([["report", "Прибыль по сегментам"], ["marginal", "Маржинальный анализ"], ["tags", "Разметка операций"], ["setup", "Аналитики и правила"]] as Array<[Tab, string]>).map(([k, v]) => (
          <button key={k} onClick={() => setTab(k)} className={`rounded-lg px-3 py-1.5 ${tab === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{v}</button>
        ))}
      </div>

      {tab === "report" && (
        <>
          <section className={`${card} mb-4 flex flex-wrap items-end gap-4`}>
            <div className="text-xs text-fl-cream/50">Разрез
              <div className="mt-1 flex gap-1 rounded-lg bg-fl-surface-2 p-1">{DIM_KINDS.map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{DIM_SHORT[k]}</button>)}</div>
            </div>
            <label className="text-xs text-fl-cream/50">Общие затраты
              <select value={alloc.base} onChange={(e) => settings && saveSettings({ ...settings, alloc: { ...settings.alloc, [kind]: { ...alloc, base: e.target.value as AllocBase } } }, "База распределения сохранена")} className={`${field} mt-1 min-w-[260px]`}>
                {(Object.keys(ALLOC_LABEL) as AllocBase[]).map((b) => <option key={b} value={b}>{b === "none" ? "не распределять" : `распределять ${ALLOC_LABEL[b]}`}</option>)}
              </select>
            </label>
            <div className="ml-auto flex gap-2"><button onClick={() => print("pdf")} className={btn}>PDF</button><button onClick={() => print("docx")} className={btn}>Word</button></div>
          </section>

          {alloc.base === "manual" && settings && (
            <ManualAlloc segs={dimsOf(kind).filter((d) => !d.archived)} value={alloc.manual ?? {}} onSave={(manual) => saveSettings({ ...settings, alloc: { ...settings.alloc, [kind]: { base: "manual", manual } } }, "Проценты сохранены")} />
          )}

          {!report ? <p className="text-sm text-fl-cream/50">Считаю…</p> : (
            <>
              {report.warnings.length > 0 && (
                <section className="mb-4 rounded-xl border border-fl-amber/40 bg-fl-amber/10 p-4 text-sm">
                  <ul className="list-disc space-y-0.5 pl-5 text-fl-cream/85">{report.warnings.map((w) => <li key={w}>{w}</li>)}</ul>
                  {report.untagged > 0 && <button onClick={() => { setTab("tags"); setOnlyKind(kind); }} className="mt-2 text-sm text-fl-gold hover:underline">Разметить {report.untagged} проводок без значения «{DIM_SHORT[kind]}» →</button>}
                </section>
              )}
              {segs.length > 0 && (
                <section className={`${card} mb-4`}>
                  <h3 className="mb-3 font-display text-lg font-semibold text-fl-cream">{report.base === "none" ? "Прибыль сегментов без распределения общих затрат" : "Операционная прибыль сегментов после распределения"}</h3>
                  <ProfitBars cols={segs} />
                </section>
              )}
              <section className={card}>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead><tr className="text-left text-xs text-fl-cream/50">
                      <th className="py-2 pr-3">Показатель, сом</th>
                      {[...report.columns, report.total].map((c) => <th key={c.id || "common"} className={`min-w-[120px] px-2 text-right ${c.id === "total" ? "text-fl-cream" : ""}`}>{c.name}{c.role === "cost" ? <span className="block font-normal text-fl-cream/40">центр затрат</span> : null}</th>)}
                    </tr></thead>
                    <tbody>
                      {SEG_ROWS.map((r) => <SegLine key={r} row={r} cols={[...report.columns, report.total]} />)}
                      {([["grossPct", "Валовая маржа"], ["operatingPct", "Рентабельность после распределения"], ["share", "Доля в выручке"], ["allocShare", "Доля в общих затратах"]] as Array<[keyof SegColumn, string]>).map(([k, label]) => (
                        <tr key={k} className="border-t border-fl-line/60 text-fl-cream/65">
                          <td className="py-1.5 pr-3 text-xs">{label}</td>
                          {[...report.columns, report.total].map((c) => <td key={c.id || "common"} className="num px-2 text-right text-xs">{pctText(c[k] as number | null)}</td>)}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <p className="mt-3 text-xs text-fl-cream/45">
                  Вклад — выручка минус затраты, прямо отнесённые к сегменту. «Общее» — то, что не размечено: операционные затраты отсюда {report.base === "none" ? "не распределяются" : `распределены ${ALLOC_LABEL[report.base]} (${m0(report.pool)} сом)`}; неоперационные статьи и налог остаются на уровне компании.
                </p>
              </section>
            </>
          )}
        </>
      )}

      {tab === "marginal" && (
        <>
          <section className={`${card} mb-4 flex flex-wrap items-end gap-4`}>
            <div className="text-xs text-fl-cream/50">Разрез
              <div className="mt-1 flex gap-1 rounded-lg bg-fl-surface-2 p-1">{DIM_KINDS.map((k) => <button key={k} onClick={() => setKind(k)} className={`rounded-md px-3 py-1.5 text-sm ${kind === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{DIM_SHORT[k]}</button>)}</div>
            </div>
            <p className="max-w-xl text-xs text-fl-cream/55">Общие переменные и постоянные затраты делятся между сегментами по той же базе, что и в отчёте «Прибыль по сегментам» ({ALLOC_LABEL[alloc.base]}).</p>
            <div className="ml-auto flex gap-2"><button onClick={() => print("pdf", "marginal")} className={btn}>PDF</button><button onClick={() => print("docx", "marginal")} className={btn}>Word</button></div>
          </section>
          {!marginal ? <p className="text-sm text-fl-cream/50">Считаю…</p> : <Marginal rep={marginal} ro={ro} busy={busy} onSaveBehavior={(behavior) => settings && saveSettings({ ...settings, behavior }, "Доли переменных затрат сохранены")} />}
        </>
      )}

      {tab === "tags" && settings && (
        <section className={card}>
          <div className="mb-3 flex flex-wrap items-end gap-3">
            <label className="text-xs text-fl-cream/50">Показать
              <select value={onlyKind} onChange={(e) => setOnlyKind(e.target.value as DimKind | "")} className={`${field} mt-1 min-w-[220px]`}>
                <option value="">все проводки с доходами и расходами</option>
                {DIM_KINDS.map((k) => <option key={k} value={k}>без значения «{DIM_SHORT[k]}»</option>)}
              </select>
            </label>
            {rows && <p className="text-sm text-fl-cream/55">Проводок: {shown.length}{onlyKind ? ` из ${rows.length}` : ""}</p>}
          </div>
          {!ro && sel.size > 0 && (
            <div className="sticky top-16 z-10 mb-3 flex flex-wrap items-end gap-2 rounded-lg border border-fl-gold/40 bg-fl-charcoal p-3 text-sm">
              <span className="self-center text-fl-cream/80">Отмечено: {sel.size}</span>
              {DIM_KINDS.map((k) => (
                <select key={k} value={bulk[k] ?? ""} onChange={(e) => setBulk({ ...bulk, [k]: e.target.value || undefined })} className={`${cell} w-auto min-w-[180px]`}>
                  <option value="">{DIM_SHORT[k]}: не менять</option>
                  {dimsOf(k).filter((d) => !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                </select>
              ))}
              <button disabled={!DIM_KINDS.some((k) => bulk[k])} onClick={() => tagEntries([...sel], bulk)} className={primary}>Применить</button>
              <button onClick={() => setSel(new Set())} className={btn}>Снять отметки</button>
            </div>
          )}
          {rows === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : shown.length === 0 ? <p className="text-sm text-fl-cream/60">За период нет таких проводок.</p> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1000px] text-sm">
                <thead><tr className="text-left text-xs text-fl-cream/50">
                  {!ro && <th className="w-6 py-2"><input type="checkbox" aria-label="Отметить все" checked={shown.length > 0 && shown.every((r) => sel.has(r.id))} onChange={(e) => setSel(e.target.checked ? new Set(shown.map((r) => r.id)) : new Set())} className="accent-fl-gold" /></th>}
                  <th className="py-2">Дата</th><th>Операция</th><th className="text-right">Доход</th><th className="text-right">Расход</th>
                  {DIM_KINDS.map((k) => <th key={k} className="w-48 pl-2">{DIM_SHORT[k]}</th>)}
                </tr></thead>
                <tbody>{shown.map((r) => (
                  <tr key={r.id} className="border-t border-fl-line align-top">
                    {!ro && <td className="py-2"><input type="checkbox" aria-label={`Отметить ${r.description}`} checked={sel.has(r.id)} onChange={(e) => { const s = new Set(sel); if (e.target.checked) s.add(r.id); else s.delete(r.id); setSel(s); }} className="accent-fl-gold" /></td>}
                    <td className="whitespace-nowrap py-2 pr-3 text-fl-cream/70">{dmy(r.date)}</td>
                    <td className="py-2 pr-3"><span className="text-fl-cream/90">{r.description}</span><span className="block text-[11px] text-fl-cream/45">{SOURCE_LABEL[r.source] ?? r.source} · {r.accounts.join(", ")}{r.party ? ` · ${r.party}` : ""}</span></td>
                    <td className="num py-2 pr-3 text-right">{r.income ? m0(r.income) : ""}</td>
                    <td className="num py-2 pr-3 text-right">{r.expense ? m0(r.expense) : ""}</td>
                    {DIM_KINDS.map((k) => (
                      <td key={k} className="py-1 pl-2">
                        {ro ? <span className="text-xs text-fl-cream/80">{r.tags[k] ? nameOf.get(r.tags[k]!) : "—"}</span> : (
                          <select value={r.tags[k] ?? ""} onChange={(e) => tagEntries([r.id], { [k]: e.target.value || null })} className={`${cell} ${r.tags[k] ? "" : "text-fl-cream/45"}`}>
                            <option value="">—</option>
                            {dimsOf(k).filter((d) => !d.archived || d.id === r.tags[k]).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
                          </select>
                        )}
                        {r.origin[k] && <span className={`text-[10px] ${r.origin[k] === "manual" ? "text-fl-info" : "text-fl-cream/40"}`}>{ORIGIN[r.origin[k]!]}</span>}
                      </td>
                    ))}
                  </tr>
                ))}</tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-fl-cream/45">Выбор вручную важнее правил. Чтобы вернуть значение по правилу, выберите «—». Разметка относится к проводке целиком.</p>
        </section>
      )}

      {tab === "setup" && draft && (
        <Setup draft={draft} setDraft={setDraft} ro={ro} busy={busy} onSave={() => saveSettings(draft)} dirty={JSON.stringify(draft) !== JSON.stringify(settings)} />
      )}
      <toast.ToastContainer />
    </main>
  );
}

function SegLine({ row, cols }: { row: SegRow; cols: SegColumn[] }) {
  const strong = row === "gross" || row === "direct" || row === "operating" || row === "net";
  return (
    <tr className={`border-t border-fl-line ${strong ? "font-semibold text-fl-cream" : "text-fl-cream/85"}`}>
      <td className="py-2 pr-3">{SEG_ROW_LABEL[row]}</td>
      {cols.map((c) => {
        const v = row === "allocated" && c.id === "total" ? 0 : (c as unknown as Record<string, number>)[row];
        return <td key={c.id || "common"} className={`num whitespace-nowrap px-2 text-right ${strong && v < 0 ? "text-fl-red" : ""}`}>{v ? m0(v) : "—"}</td>;
      })}
    </tr>
  );
}

/** Прибыль после распределения: одна полоса на сегмент, убыток — красная, влево от нуля. */
function ProfitBars({ cols }: { cols: SegColumn[] }) {
  const max = Math.max(1, ...cols.map((c) => Math.abs(c.operating)));
  const hasNeg = cols.some((c) => c.operating < 0);
  return (
    <div className="space-y-2">
      {cols.map((c) => {
        const w = (Math.abs(c.operating) / max) * (hasNeg ? 50 : 100);
        return (
          <div key={c.id} className="grid grid-cols-[minmax(140px,240px)_1fr_auto] items-center gap-3 text-sm" title={`${c.name}: вклад ${m0(c.direct)}, распределено ${m0(c.allocated)}, прибыль ${m0(c.operating)} сом`}>
            <span className="truncate text-fl-cream/80">{c.name}</span>
            <div className="relative h-3 rounded-sm bg-fl-cream/5">
              {hasNeg && <span className="absolute left-1/2 top-0 h-3 w-px bg-fl-cream/30" />}
              <span className={`absolute top-0 h-3 rounded-sm ${c.operating < 0 ? "bg-fl-red" : "bg-fl-gold"}`} style={c.operating < 0 ? { right: hasNeg ? "50%" : undefined, width: `${w}%` } : { left: hasNeg ? "50%" : 0, width: `${w}%` }} />
            </div>
            <span className={`num w-40 whitespace-nowrap text-right ${c.operating < 0 ? "text-fl-red" : "text-fl-cream"}`}>{m0(c.operating)}{c.operatingPct != null ? <span className="ml-1 text-xs text-fl-cream/50">{pctText(c.operatingPct)}</span> : null}</span>
          </div>
        );
      })}
    </div>
  );
}

function ManualAlloc({ segs, value, onSave }: { segs: DimValue[]; value: Record<string, number>; onSave: (v: Record<string, number>) => void }) {
  const [v, setV] = useState<Record<string, string>>(() => Object.fromEntries(segs.map((s) => [s.id, String(value[s.id] ?? "")])));
  const total = Object.values(v).reduce((a, x) => a + (Number(x.replace(",", ".")) || 0), 0);
  return (
    <section className={`${card} mb-4`}>
      <p className="mb-2 text-sm text-fl-cream/75">Доли общих затрат по сегментам, %</p>
      <div className="flex flex-wrap items-end gap-3">
        {segs.map((s) => <label key={s.id} className="text-xs text-fl-cream/55">{s.name}<input inputMode="decimal" value={v[s.id] ?? ""} onChange={(e) => setV({ ...v, [s.id]: e.target.value })} className={`${cell} mt-1 w-28 text-right`} /></label>)}
        <span className={`self-center text-sm ${Math.abs(total - 100) > 0.01 ? "text-fl-amber" : "text-fl-green"}`}>итого {String(Math.round(total * 100) / 100).replace(".", ",")} %</span>
        <button onClick={() => onSave(Object.fromEntries(Object.entries(v).map(([k, x]) => [k, Number(x.replace(",", ".")) || 0])))} className={btn}>Сохранить доли</button>
      </div>
    </section>
  );
}

function Setup({ draft, setDraft, ro, busy, onSave, dirty }: { draft: MgmtSettings; setDraft: (s: MgmtSettings) => void; ro: boolean; busy: boolean; onSave: () => void; dirty: boolean }) {
  const setDim = (id: string, p: Partial<DimValue>) => setDraft({ ...draft, dims: draft.dims.map((d) => (d.id === id ? { ...d, ...p } : d)) });
  const setRule = (id: string, p: Partial<Rule>) => setDraft({ ...draft, rules: draft.rules.map((r) => (r.id === id ? { ...r, ...p } : r)) });
  const used = (id: string) => draft.rules.some((r) => Object.values(r.set).includes(id));
  return (
    <div className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-3">
        {DIM_KINDS.map((k) => (
          <section key={k} className={card}>
            <div className="mb-2 flex items-center justify-between"><h3 className="font-display text-lg font-semibold text-fl-cream">{DIM_LABEL[k]}</h3>
              {!ro && <button onClick={() => setDraft({ ...draft, dims: [...draft.dims, { id: newId(), kind: k, name: "", role: k === "dept" ? "cost" : "profit" }] })} className="text-sm text-fl-gold hover:underline">+ добавить</button>}</div>
            <div className="space-y-1.5">
              {draft.dims.filter((d) => d.kind === k).map((d) => (
                <div key={d.id} className={d.auto ? "flex items-center" : "grid grid-cols-[minmax(0,1fr)_6.5rem_1.25rem_1.25rem] items-center gap-1.5"}>
                  {d.auto ? <span className="flex-1 truncate text-sm text-fl-cream/80" title="объект раздела «Стройка»">🏗 {d.name}{d.archived ? " (завершён)" : ""}</span> : (
                    <>
                      <input value={d.name} disabled={ro} onChange={(e) => setDim(d.id, { name: e.target.value })} placeholder={k === "dept" ? "Цех, магазин № 1, офис…" : k === "project" ? "Проект, объект, договор…" : "Опт, розница, услуги…"} className={`${cell} ${d.archived ? "opacity-50" : ""}`} />
                      <select value={d.role ?? "profit"} disabled={ro} onChange={(e) => setDim(d.id, { role: e.target.value as DimValue["role"] })} title="Центр прибыли (есть выручка) или центр затрат" className={cell}><option value="profit">прибыль</option><option value="cost">затраты</option></select>
                      {!ro && <button title={d.archived ? "Вернуть" : "В архив"} onClick={() => setDim(d.id, { archived: !d.archived })} className="px-1 text-xs text-fl-cream/45 hover:text-fl-cream">{d.archived ? "↺" : "⌫"}</button>}
                      {!ro && <button title={used(d.id) ? "Используется в правилах" : "Удалить"} disabled={used(d.id)} onClick={() => setDraft({ ...draft, dims: draft.dims.filter((x) => x.id !== d.id) })} className="px-1 text-fl-cream/40 hover:text-fl-red disabled:opacity-30">×</button>}
                    </>
                  )}
                </div>
              ))}
              {!draft.dims.some((d) => d.kind === k) && <p className="text-xs text-fl-cream/45">{k === "project" ? "Объекты раздела «Стройка» появятся здесь сами." : "Пока пусто."}</p>}
            </div>
          </section>
        ))}
      </div>

      <section className={card}>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="font-display text-lg font-semibold text-fl-cream">Правила разметки</h3><p className="text-xs text-fl-cream/50">Проверяются сверху вниз; первое подходящее правило задаёт значение. Все заполненные условия должны выполняться вместе.</p></div>
          {!ro && <button onClick={() => setDraft({ ...draft, rules: [...draft.rules, { id: newId(), set: {} }] })} className="text-sm text-fl-gold hover:underline">+ правило</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[1000px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="w-6">№</th><th className="w-24">Счёт (начало)</th><th>Контрагент содержит</th><th>Текст содержит</th><th className="w-40">Источник</th>{DIM_KINDS.map((k) => <th key={k} className="w-40">→ {DIM_SHORT[k]}</th>)}<th className="w-14" /></tr></thead>
            <tbody>{draft.rules.map((r, i) => (
              <tr key={r.id}>
                <td className="py-1 text-xs text-fl-cream/45">{i + 1}</td>
                <td className="py-1 pr-1"><input value={r.account ?? ""} disabled={ro} onChange={(e) => setRule(r.id, { account: e.target.value.replace(/[^\d.]/g, "") })} placeholder="напр. 8030" className={cell} /></td>
                <td className="py-1 pr-1"><input value={r.party ?? ""} disabled={ro} onChange={(e) => setRule(r.id, { party: e.target.value })} className={cell} /></td>
                <td className="py-1 pr-1"><input value={r.text ?? ""} disabled={ro} onChange={(e) => setRule(r.id, { text: e.target.value })} placeholder="магазин № 1" className={cell} /></td>
                <td className="py-1 pr-1"><select value={r.source ?? ""} disabled={ro} onChange={(e) => setRule(r.id, { source: (e.target.value || undefined) as EntrySource | undefined })} className={cell}><option value="">любой</option>{(Object.keys(SOURCE_LABEL) as EntrySource[]).filter((s) => s !== "closing" && s !== "demo").map((s) => <option key={s} value={s}>{SOURCE_LABEL[s]}</option>)}</select></td>
                {DIM_KINDS.map((k) => (
                  <td key={k} className="py-1 pr-1"><select value={r.set[k] ?? ""} disabled={ro} onChange={(e) => setRule(r.id, { set: { ...r.set, [k]: e.target.value || undefined } })} className={cell}><option value="">—</option>{draft.dims.filter((d) => d.kind === k && !d.archived).map((d) => <option key={d.id} value={d.id}>{d.name || "(без названия)"}</option>)}</select></td>
                ))}
                <td className="whitespace-nowrap py-1">{!ro && <>
                  <button aria-label="Выше" disabled={i === 0} onClick={() => { const a = [...draft.rules]; [a[i - 1], a[i]] = [a[i], a[i - 1]]; setDraft({ ...draft, rules: a }); }} className="px-1 text-fl-cream/45 hover:text-fl-cream disabled:opacity-30">↑</button>
                  <button aria-label="Удалить правило" onClick={() => setDraft({ ...draft, rules: draft.rules.filter((x) => x.id !== r.id) })} className="px-1 text-fl-cream/40 hover:text-fl-red">×</button>
                </>}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
        {!draft.rules.length && <p className="text-sm text-fl-cream/55">Правил нет. Пример: счёт «8030» → подразделение «Магазин № 1»; текст «опт» → направление «Опт».</p>}
      </section>
      {!ro && <div className="sticky bottom-20 flex justify-end"><button onClick={onSave} disabled={busy || !dirty} className={`${primary} shadow-card`}>{busy ? "Сохраняю…" : dirty ? "Сохранить аналитики и правила" : "Сохранено"}</button></div>}
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

function Marginal({ rep, ro, busy, onSaveBehavior }: { rep: MarginalReport; ro: boolean; busy: boolean; onSaveBehavior: (b: Record<string, number>) => void }) {
  const t = rep.total;
  const cols = [...rep.columns, t];
  const [target, setTarget] = useState("total");
  const [d, setD] = useState({ volume: 0, price: 0, unitCost: 0, fixed: 0 });
  const [beh, setBeh] = useState<Record<string, string>>(() => Object.fromEntries(rep.accounts.map((a) => [a.code, String(a.variablePct)])));
  useEffect(() => { setBeh(Object.fromEntries(rep.accounts.map((a) => [a.code, String(a.variablePct)]))); }, [rep]);
  const base = cols.find((c) => c.id === target) ?? t;
  const sim = whatIf(base, d);
  const fmt = (v: number | null, kind: "money" | "pct" | "x") => (v == null ? "—" : kind === "money" ? m0(v) : kind === "pct" ? pctText(v) : String(v).replace(".", ","));
  const dirty = rep.accounts.some((a) => String(a.variablePct) !== (beh[a.code] ?? ""));
  return (
    <div className="space-y-4">
      <section className={card}>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Tile title="Маржинальный доход" value={m0(t.contribution)} sub={`коэффициент ${pctText(t.cmRatio)} — с каждых 100 сом выручки`} tone={t.contribution < 0 ? "bad" : undefined} />
          <Tile title="Точка безубыточности" value={t.breakEven == null ? "—" : m0(t.breakEven)} sub="выручка, при которой прибыль = 0" />
          <Tile title="Запас прочности" value={pctText(t.safety)} sub={t.safetyAmount != null ? `выручка может упасть на ${m0(Math.max(0, t.safetyAmount))} сом` : undefined} tone={t.safety != null && t.safety < 10 ? "bad" : t.safety != null && t.safety > 25 ? "good" : undefined} />
          <Tile title="Операционный рычаг" value={t.leverage == null ? "—" : String(t.leverage).replace(".", ",")} sub={t.leverage != null ? `+1 % выручки → +${String(t.leverage).replace(".", ",")} % прибыли` : "прибыли нет"} />
        </div>
      </section>
      {rep.warnings.length > 0 && <section className="rounded-xl border border-fl-amber/40 bg-fl-amber/10 p-4 text-sm"><ul className="list-disc space-y-0.5 pl-5 text-fl-cream/85">{rep.warnings.map((w) => <li key={w}>{w}</li>)}</ul></section>}
      <section className={card}>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[760px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2 pr-3">Показатель</th>{cols.map((c) => <th key={c.id || "common"} className={`min-w-[120px] px-2 text-right ${c.id === "total" ? "text-fl-cream" : ""}`}>{c.name}</th>)}</tr></thead>
            <tbody>{MARGINAL_ROWS.map(([k, label, kind]) => {
              const strong = label === label.toUpperCase();
              return (
                <tr key={k} className={`border-t border-fl-line ${strong ? "font-semibold text-fl-cream" : "text-fl-cream/85"}`}>
                  <td className="py-2 pr-3">{strong ? label.charAt(0) + label.slice(1).toLowerCase() : label}</td>
                  {cols.map((c) => { const v = c[k] as number | null; return <td key={c.id || "common"} className={`num whitespace-nowrap px-2 text-right ${strong && v != null && v < 0 ? "text-fl-red" : ""}`}>{fmt(v, kind)}</td>; })}
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
          <div><h3 className="font-display text-lg font-semibold text-fl-cream">Что если</h3><p className="text-xs text-fl-cream/50">Двигайте ползунки — прибыль и точка безубыточности пересчитываются сразу.</p></div>
          <label className="text-xs text-fl-cream/50">Для<select value={target} onChange={(e) => setTarget(e.target.value)} className={`${field} mt-1 min-w-[220px]`}>{cols.map((c) => <option key={c.id || "common"} value={c.id}>{c.id === "total" ? "компании в целом" : c.name}</option>)}</select></label>
        </div>
        <div className="grid gap-4 lg:grid-cols-2">
          <div className="space-y-3">
            {([["volume", "Объём продаж"], ["price", "Цены"], ["unitCost", "Переменные затраты на единицу"], ["fixed", "Постоянные затраты"]] as Array<[keyof typeof d, string]>).map(([k, label]) => (
              <label key={k} className="block text-sm text-fl-cream/80">
                <span className="flex justify-between"><span>{label}</span><span className={`num ${d[k] > 0 ? "text-fl-green" : d[k] < 0 ? "text-fl-red" : "text-fl-cream/50"}`}>{d[k] > 0 ? "+" : ""}{d[k]} %</span></span>
                <input type="range" min={-50} max={50} step={1} value={d[k]} onChange={(e) => setD({ ...d, [k]: Number(e.target.value) })} className="mt-1 w-full accent-fl-gold" aria-label={label} />
              </label>
            ))}
            <button onClick={() => setD({ volume: 0, price: 0, unitCost: 0, fixed: 0 })} className="text-xs text-fl-gold hover:underline">сбросить</button>
          </div>
          <table className="h-fit w-full text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5" /><th className="text-right">Сейчас</th><th className="text-right">Станет</th><th className="text-right">Изменение</th></tr></thead>
            <tbody>{([["revenue", "Выручка"], ["contribution", "Маржинальный доход"], ["fixed", "Постоянные затраты"], ["profit", "Прибыль"], ["breakEven", "Точка безубыточности"], ["safety", "Запас прочности, %"]] as Array<[keyof MarginalColumn, string]>).map(([k, label]) => {
              const a = base[k] as number | null, b = sim[k] as number | null;
              const pctRow = k === "safety";
              const delta = a != null && b != null ? (pctRow ? b - a : a !== 0 ? ((b - a) / Math.abs(a)) * 100 : null) : null;
              return (
                <tr key={k} className={`border-t border-fl-line ${k === "profit" ? "font-semibold text-fl-cream" : "text-fl-cream/85"}`}>
                  <td className="py-1.5">{label}</td>
                  <td className="num text-right">{pctRow ? pctText(a) : a == null ? "—" : m0(a)}</td>
                  <td className={`num text-right ${k === "profit" && b != null && b < 0 ? "text-fl-red" : ""}`}>{pctRow ? pctText(b) : b == null ? "—" : m0(b)}</td>
                  <td className={`num text-right text-xs ${delta == null || Math.abs(delta) < 0.05 ? "text-fl-cream/40" : (k === "breakEven" || k === "fixed" ? delta < 0 : delta > 0) ? "text-fl-green" : "text-fl-red"}`}>{delta == null ? "—" : `${delta > 0 ? "+" : ""}${String(Math.round(delta * 10) / 10).replace(".", ",")}${pctRow ? " п." : " %"}`}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>

      <section className={card}>
        <div className="mb-2 flex flex-wrap items-end justify-between gap-2">
          <div><h3 className="font-display text-lg font-semibold text-fl-cream">Переменные и постоянные затраты</h3><p className="text-xs text-fl-cream/50">Доля переменных затрат по каждому счёту расходов периода. 100 % — растут вместе с продажами, 0 % — не зависят от объёма.</p></div>
          {!ro && <button disabled={busy || !dirty} onClick={() => onSaveBehavior(Object.fromEntries(rep.accounts.map((a) => [a.code, Math.max(0, Math.min(100, Number((beh[a.code] ?? "").replace(",", ".")) || 0))])))} className={primary}>{dirty ? "Сохранить доли" : "Сохранено"}</button>}
        </div>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-2">Счёт</th><th>Наименование</th><th className="text-right">Сумма</th><th className="w-36 text-right">Переменные, %</th><th className="text-right">Переменные</th><th className="text-right">Постоянные</th></tr></thead>
            <tbody>{rep.accounts.map((a) => {
              const p = Math.max(0, Math.min(100, Number((beh[a.code] ?? "").replace(",", ".")) || 0));
              return (
                <tr key={a.code} className="border-t border-fl-line">
                  <td className="py-1.5 pr-3 text-fl-cream/70">{a.code}</td>
                  <td className="pr-3 text-fl-cream/85">{a.name}</td>
                  <td className="num pr-3 text-right">{m0(a.amount)}</td>
                  <td className="py-1 pr-3 text-right">{ro ? `${a.variablePct} %` : <input inputMode="numeric" value={beh[a.code] ?? ""} onChange={(e) => setBeh({ ...beh, [a.code]: e.target.value })} className={`${cell} ml-auto w-24 text-right`} aria-label={`Доля переменных, счёт ${a.code}`} />}</td>
                  <td className="num pr-3 text-right">{m0((a.amount * p) / 100)}</td>
                  <td className="num text-right">{m0((a.amount * (100 - p)) / 100)}</td>
                </tr>
              );
            })}</tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
