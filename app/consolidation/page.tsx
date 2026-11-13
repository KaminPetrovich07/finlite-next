"use client";

// Консолидированная отчётность группы: состав группы, доли, корректировки и сводные отчёты
// со столбцом на каждого участника, столбцом исключений и итогом по группе.
import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { AccountPicker } from "@/components/ledger/AccountPicker";
import { KpiCard } from "@/components/KpiCard";
import { useToast } from "@/components/Toast";
import { formatNumber, parseFormattedNumber } from "@/lib/format";
import { monthPeriod } from "@/lib/ledger/period";
import type { GroupRow, GroupTables } from "@/lib/consolidation/present";
import type { GroupSettings } from "@/lib/consolidation/server";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const m0 = (n: number) => (Math.abs(n) < 0.5 ? "—" : n < 0 ? `(${formatNumber(Math.round(-n), 0)})` : formatNumber(Math.round(n), 0));
const KEY = "finlite:groupParent";

type Member = GroupSettings["members"][number] & { sharePct?: string };
type Adj = GroupSettings["adjustments"][number];
type Data = GroupTables & { name: string };

export default function ConsolidationPage() {
  const { companies, loaded } = useCompanies();
  const own = useMemo(() => companies.filter((c) => !c.demo && c.access !== "view"), [companies]);
  const [parentId, setParentId] = useState("");
  const [settings, setSettings] = useState<{ name: string; members: Member[]; adjustments: Adj[] } | null>(null);
  const [dirty, setDirty] = useState(false);
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const [data, setData] = useState<Data | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"sfp" | "pl" | "cf" | "elim">("sfp");
  const [editOpen, setEditOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    if (!loaded || parentId) return;
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    setParentId(own.some((c) => c.id === saved) ? saved! : own[0]?.id ?? "");
    const d = new Date(Date.now() + 6 * 3600e3);
    const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1));
    setPeriodState(monthPeriod(prev.getUTCFullYear(), prev.getUTCMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, own, parentId]);

  const setPeriod = useCallback((p: { from: string; to: string }) => setPeriodState((c) => (c && c.from === p.from && c.to === p.to ? c : p)), []);

  // group settings of the chosen parent
  useEffect(() => {
    if (!parentId) return;
    try { localStorage.setItem(KEY, parentId); } catch { /* storage blocked */ }
    setSettings(null); setData(null); setDirty(false);
    fetch(`/api/consolidation/group?parentId=${encodeURIComponent(parentId)}`)
      .then((r) => r.json())
      .then((g: GroupSettings) => {
        setSettings({ name: g.name ?? "", adjustments: g.adjustments ?? [], members: (g.members ?? []).map((m) => ({ ...m, sharePct: m.share ? String(Math.round(m.share * 10000) / 100).replace(".", ",") : "100" })) });
        if (!g.members?.length) setEditOpen(true);
      })
      .catch(() => setSettings({ name: "", members: [], adjustments: [] }));
  }, [parentId]);

  const load = useCallback(async () => {
    if (!parentId || !period || !settings?.members.length || dirty) return;
    setError(null);
    try {
      const r = await fetch(`/api/consolidation?parentId=${encodeURIComponent(parentId)}&from=${period.from}&to=${period.to}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось построить отчётность");
      setData(b);
    } catch (e: any) { setError(e.message); setData(null); }
  }, [parentId, period, settings, dirty]);
  useEffect(() => { load(); }, [load]);

  const update = (patch: Partial<NonNullable<typeof settings>>) => { setSettings((s) => (s ? { ...s, ...patch } : s)); setDirty(true); };
  const memberOf = (id: string) => settings?.members.find((m) => m.companyId === id);
  const setMember = (id: string, patch: Partial<Member> | null) => {
    if (!settings) return;
    const has = memberOf(id);
    const members = patch === null ? settings.members.filter((m) => m.companyId !== id)
      : has ? settings.members.map((m) => (m.companyId === id ? { ...m, ...patch } : m))
      : [...settings.members, { companyId: id, role: "common", sharePct: "100", ...patch } as Member];
    update({ members });
  };

  async function save() {
    if (!settings) return;
    setBusy(true);
    try {
      const body = {
        parentId, name: settings.name,
        members: settings.members.map((m) => ({
          companyId: m.companyId, role: m.role,
          ...(m.role === "subsidiary" ? {
            share: parseFormattedNumber(m.sharePct ?? "100") || 100,
            acquiredAt: m.acquiredAt || null,
            investmentCost: m.investmentCost ? Number(m.investmentCost) : null,
          } : {}),
        })),
        adjustments: settings.adjustments,
      };
      const r = await fetch("/api/consolidation/group", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось сохранить");
      setSettings({ name: b.name, adjustments: b.adjustments, members: b.members.map((m: Member) => ({ ...m, sharePct: m.share ? String(Math.round(m.share * 10000) / 100).replace(".", ",") : "100" })) });
      setDirty(false);
      setEditOpen(false);
      show("Группа сохранена — отчётность пересчитана");
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }

  const exportUrl = (f: string) => period ? `/api/consolidation/export?parentId=${encodeURIComponent(parentId)}&from=${period.from}&to=${period.to}&format=${f}` : "#";
  const others = companies.filter((c) => !c.demo && c.id !== parentId);
  const parentName = companies.find((c) => c.id === parentId)?.name ?? "";

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Консолидация группы</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Сводная отчётность нескольких компаний как одной: взаиморасчёты, продажи и платежи между участниками исключаются,
          вложения материнской компании — против капитала дочерних, доля других собственников показывается отдельно
          (МСФО (IFRS) 10). Строится из журналов участников — ничего не нужно вводить повторно.
        </p>
      </header>

      {loaded && own.length === 0 ? (
        <p className={card}>Нужна хотя бы одна своя компания — создайте её на странице «Компании».</p>
      ) : (
        <>
          <div className="mb-4 flex flex-wrap items-end gap-3">
            <label className="block">
              <span className="mb-1 block text-xs text-fl-cream/55">Материнская компания</span>
              <select value={parentId} onChange={(e) => { if (!dirty || confirm("Несохранённые изменения состава группы пропадут. Продолжить?")) setParentId(e.target.value); }} className={`${field} min-w-[260px]`}>
                {own.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </label>
            <div>
              <span className="mb-1 block text-xs text-fl-cream/55">Период</span>
              {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
            </div>
            <button onClick={() => setEditOpen((v) => !v)} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream/80 hover:border-fl-gold">
              {editOpen ? "Скрыть состав группы" : `Состав группы${settings ? `: ${settings.members.length + 1}` : ""}`}
            </button>
            {data && (
              <div className="ml-auto flex gap-2 text-sm">
                {(["pdf", "docx", "xlsx"] as const).map((f) => <a key={f} href={exportUrl(f)} className="rounded-lg border border-fl-line px-3 py-2 text-fl-cream/80 hover:border-fl-gold">{f === "pdf" ? "PDF" : f === "docx" ? "Word" : "Excel"}</a>)}
              </div>
            )}
          </div>

          {settings && editOpen && (
            <section className={`${card} mb-5 space-y-4`}>
              <label className="block max-w-md text-xs text-fl-cream/55">Название группы
                <input value={settings.name} onChange={(e) => update({ name: e.target.value })} placeholder={`Группа «${parentName}»`} className={`${field} mt-1`} />
              </label>
              <div>
                <p className="mb-2 text-sm text-fl-cream/75">Участники — кроме материнской «{parentName}». Внутригрупповые операции программа узнаёт по ИНН (или наименованию) контрагента в проводках, поэтому укажите ИНН компаний на странице «Компании».</p>
                {others.length === 0 && <p className="text-sm text-fl-cream/50">Других компаний нет — создайте их или попросите владельцев открыть вам просмотр.</p>}
                <ul className="divide-y divide-fl-line/60">
                  {others.map((c) => {
                    const m = memberOf(c.id);
                    return (
                      <li key={c.id} className="flex flex-col gap-2 py-2.5 lg:flex-row lg:items-center">
                        <label className="flex min-w-[240px] items-center gap-2 text-sm text-fl-cream">
                          <input type="checkbox" checked={!!m} onChange={(e) => setMember(c.id, e.target.checked ? {} : null)} className="h-4 w-4" />
                          {c.name}{c.access === "view" && <span className="text-xs text-fl-cream/45">· просмотр</span>}
                        </label>
                        {m && (
                          <div className="flex flex-wrap items-end gap-2 text-xs text-fl-cream/55">
                            <select value={m.role} onChange={(e) => setMember(c.id, { role: e.target.value as Member["role"] })} className="rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1.5 text-sm text-fl-cream">
                              <option value="common">Под общим контролем (тот же владелец)</option>
                              <option value="subsidiary">Дочерняя — доля материнской</option>
                            </select>
                            {m.role === "subsidiary" && (
                              <>
                                <label>Доля, %<input inputMode="decimal" value={m.sharePct ?? "100"} onChange={(e) => setMember(c.id, { sharePct: e.target.value })} className="ml-1 w-20 rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1.5 text-right text-sm text-fl-cream" /></label>
                                <label>Приобретена<input type="date" value={m.acquiredAt ?? ""} onChange={(e) => setMember(c.id, { acquiredAt: e.target.value || null })} className="ml-1 rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1 text-sm text-fl-cream" title="Пусто — создана материнской компанией" /></label>
                                <label>Вложение, сом<input inputMode="decimal" value={m.investmentCost ?? ""} onChange={(e) => setMember(c.id, { investmentCost: e.target.value ? parseFormattedNumber(e.target.value) : null })} placeholder="из счёта 2830" className="ml-1 w-32 rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1.5 text-right text-sm text-fl-cream" /></label>
                              </>
                            )}
                          </div>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
              <Adjustments items={settings.adjustments} onChange={(adjustments) => update({ adjustments })} defaultDate={period?.to ?? ""} />
              <div className="flex items-center gap-3">
                <button onClick={save} disabled={busy || !dirty} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Сохраняю…" : "Сохранить группу"}</button>
                {dirty && <span className="text-xs text-fl-amber">Есть несохранённые изменения</span>}
              </div>
            </section>
          )}

          {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}
          {settings && !settings.members.length && !editOpen && <p className={card}>Добавьте в группу хотя бы одну компанию — кнопка «Состав группы».</p>}

          {data && (
            <div className="space-y-5">
              <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                <KpiCard label="Выручка группы" value={m0(data.totals.revenue)} />
                <KpiCard label="Прибыль группы" value={m0(data.totals.netProfit)} sub={data.nci.profit ? `неконтр. доля ${m0(data.nci.profit)}` : undefined} highlight />
                <KpiCard label="Активы группы" value={m0(data.totals.assets)} />
                <KpiCard label="Капитал группы" value={m0(data.totals.equity)} sub={data.nci.close ? `неконтр. доля ${m0(data.nci.close)}` : undefined} />
              </div>

              {data.warnings.length > 0 && (
                <section className="rounded-xl border border-fl-amber/40 bg-fl-amber/[0.06] p-4">
                  <h2 className="mb-1.5 text-sm font-semibold text-fl-cream">Требует внимания</h2>
                  <ul className="list-disc space-y-1 pl-5 text-sm text-fl-cream/80">{data.warnings.map((w, i) => <li key={i}>{w}</li>)}</ul>
                </section>
              )}

              <div className="flex gap-1 overflow-x-auto rounded-xl bg-fl-surface-2 p-1 text-sm sm:inline-flex">
                {([["sfp", "Финансовое положение"], ["pl", "Прибыль или убыток"], ["cf", "Движение денег"], ["elim", `Исключения: ${data.eliminations.length}`]] as const).map(([k, l]) => (
                  <button key={k} onClick={() => setTab(k)} className={`shrink-0 rounded-lg px-3 py-1.5 ${tab === k ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{l}</button>
                ))}
              </div>

              {(tab === "sfp" || tab === "pl") && <GroupTable rows={tab === "sfp" ? data.sfp : data.pl} columns={data.columns} prevLabel={tab === "sfp" ? "Группа, на начало" : "Группа, пред. период"} />}
              {tab === "cf" && (
                <div className={`${card} overflow-x-auto`}>
                  <table className="w-full min-w-[520px] text-sm">
                    <thead><tr className="text-xs text-fl-cream/50"><th className="py-1.5 text-left font-medium">Статья</th><th className="py-1.5 text-right font-medium">Период</th><th className="py-1.5 text-right font-medium">Пред. период</th></tr></thead>
                    <tbody>{data.cf.map((r) => (
                      <tr key={r.key} className={`border-t border-fl-line/60 ${r.kind === "heading" ? "text-xs uppercase tracking-wide text-fl-cream/50" : r.kind === "line" ? "text-fl-cream/80" : "font-semibold text-fl-cream"}`}>
                        <td className="py-1.5 pr-3">{r.label}</td>
                        <td className="num py-1.5 text-right">{r.kind === "heading" ? "" : m0(r.current)}</td>
                        <td className="num py-1.5 text-right text-fl-cream/55">{r.kind === "heading" ? "" : m0(r.previous)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                  <p className="mt-2 text-xs text-fl-cream/50">Платежи между участниками группы — перемещение денег внутри группы: они не показываются ни поступлениями, ни выплатами.</p>
                </div>
              )}
              {tab === "elim" && (
                <div className="space-y-3">
                  {data.eliminations.length === 0 && <p className={card}>Операций между участниками за период не найдено. Если они были — проверьте, что в проводках указан контрагент с ИНН участника.</p>}
                  {data.eliminations.map((e, i) => (
                    <section key={i} className={card}>
                      <div className="flex flex-wrap items-baseline justify-between gap-2">
                        <h3 className="font-semibold text-fl-cream">{e.title}</h3>
                        <span className="num text-sm text-fl-cream/70">{m0(e.amount)}</span>
                      </div>
                      <p className="mt-1 text-sm text-fl-cream/70">{e.detail}</p>
                      {e.lines.length > 0 && (
                        <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 rounded-md bg-fl-surface-2 px-2.5 py-1.5 text-xs text-fl-cream/75">
                          {e.lines.map((l, j) => <span key={j} className="num">{l.debit ? "Дт" : "Кт"} {l.account} {m0(l.debit || l.credit)}</span>)}
                        </p>
                      )}
                    </section>
                  ))}
                  {data.nci.items.length > 0 && (
                    <section className={card}>
                      <h3 className="font-semibold text-fl-cream">Неконтролирующая доля</h3>
                      <table className="mt-2 w-full text-sm">
                        <thead><tr className="text-xs text-fl-cream/50">{["Компания", "Доля группы", "Капитал", "Неконтр. доля", "Прибыль", "Её доля"].map((h, i) => <th key={h} className={`py-1 font-medium ${i ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                        <tbody>{data.nci.items.map((n) => (
                          <tr key={n.companyId} className="border-t border-fl-line/60 text-fl-cream/80">
                            <td className="py-1.5">{n.name}</td><td className="num text-right">{formatNumber(n.share * 100, 1)} %</td>
                            <td className="num text-right">{m0(n.equityClose)}</td><td className="num text-right">{m0(n.nciClose)}</td>
                            <td className="num text-right">{m0(n.profit)}</td><td className="num text-right">{m0(n.nciProfit)}</td>
                          </tr>
                        ))}</tbody>
                      </table>
                    </section>
                  )}
                </div>
              )}

              <section className={card}>
                <h2 className="mb-2 text-sm font-semibold text-fl-cream">Сверки сводной отчётности</h2>
                <ul className="space-y-1 text-sm">{data.checks.map((c, i) => (
                  <li key={i} className="flex gap-2"><span className={c.ok ? "text-fl-green" : "text-fl-red"}>{c.ok ? "✓" : "×"}</span><span className="text-fl-cream/80">{c.title}{!c.ok && <span className="text-fl-cream/55"> — {c.detail}</span>}</span></li>
                ))}</ul>
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function GroupTable({ rows, columns, prevLabel }: { rows: GroupRow[]; columns: Array<{ companyId: string; name: string }>; prevLabel: string }) {
  return (
    <div className="overflow-x-auto rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card">
      <table className="w-full text-sm" style={{ minWidth: 200 + (columns.length + 3) * 110 }}>
        <thead>
          <tr className="text-xs text-fl-cream/55">
            <th className="sticky left-0 z-10 w-[46vw] bg-fl-charcoal-2 px-3 py-2 text-left font-medium sm:w-auto">Статья</th>
            {columns.map((c) => <th key={c.companyId} className="px-3 py-2 text-right font-medium">{c.name}</th>)}
            <th className="px-3 py-2 text-right font-medium text-fl-amber">Исключения</th>
            <th className="px-3 py-2 text-right font-semibold text-fl-cream">Группа</th>
            <th className="px-3 py-2 text-right font-medium">{prevLabel}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const strong = r.kind === "total" || r.kind === "subtotal";
            if (r.kind === "heading") return <tr key={r.key} className="border-t border-fl-line"><td colSpan={columns.length + 4} className="sticky left-0 bg-fl-charcoal-2 px-3 pb-1 pt-3 text-xs font-semibold uppercase tracking-wide text-fl-cream/50">{r.label}</td></tr>;
            return (
              <tr key={r.key} className={`border-t border-fl-line/60 ${strong ? "font-semibold text-fl-cream" : r.kind === "nci" ? "text-fl-cream/65 italic" : "text-fl-cream/80"} ${r.kind === "total" ? "bg-fl-gold/[0.06]" : ""}`}>
                <td className={`sticky left-0 z-10 w-[46vw] bg-fl-charcoal-2 px-3 py-1.5 text-[13px] leading-snug sm:w-auto sm:text-sm ${r.kind === "nci" ? "pl-6" : ""}`}>{r.label}</td>
                {r.members.map((v, i) => <td key={i} className="num px-3 py-1.5 text-right">{r.kind === "nci" ? "" : m0(v)}</td>)}
                <td className={`num px-3 py-1.5 text-right ${Math.abs(r.elim) > 0.5 ? "text-fl-amber" : "text-fl-cream/40"}`}>{r.kind === "nci" ? "" : m0(r.elim)}</td>
                <td className="num px-3 py-1.5 text-right font-semibold text-fl-cream">{m0(r.group)}</td>
                <td className="num px-3 py-1.5 text-right text-fl-cream/55">{m0(r.previous)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Ручные корректировки консолидации: нереализованная прибыль в остатках, справедливая стоимость и т. п. */
function Adjustments({ items, onChange, defaultDate }: { items: Adj[]; onChange: (a: Adj[]) => void; defaultDate: string }) {
  const [draft, setDraft] = useState<{ date: string; description: string; lines: Array<{ account: string; debit: string; credit: string }> } | null>(null);
  const tot = draft ? draft.lines.reduce((s, l) => [s[0] + parseFormattedNumber(l.debit), s[1] + parseFormattedNumber(l.credit)], [0, 0]) : [0, 0];
  const ok = draft && draft.description.trim() && draft.date && tot[0] > 0 && Math.abs(tot[0] - tot[1]) < 0.005 && draft.lines.filter((l) => l.account).length >= 2;
  return (
    <div>
      <p className="mb-1.5 text-sm text-fl-cream/75">Корректировки консолидации</p>
      <p className="mb-2 text-xs text-fl-cream/50">То, что программа не исключает сама: нереализованная прибыль в остатках товаров, купленных внутри группы (Дт 7200 Кт 1610), переоценка до справедливой стоимости при приобретении. Проводятся только в сводной отчётности — журналы участников не меняются.</p>
      {items.length > 0 && (
        <ul className="mb-2 divide-y divide-fl-line/60 text-sm">
          {items.map((a) => (
            <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-1.5">
              <span className="text-fl-cream/55">{a.date.split("-").reverse().join(".")}</span>
              <span className="text-fl-cream">{a.description}</span>
              <span className="num text-xs text-fl-cream/60">{a.lines.map((l) => `${l.debit ? "Дт" : "Кт"} ${l.account} ${formatNumber(l.debit || l.credit, 0)}`).join(" · ")}</span>
              <button onClick={() => onChange(items.filter((x) => x.id !== a.id))} className="ml-auto text-xs text-fl-cream/45 hover:text-fl-red">Убрать</button>
            </li>
          ))}
        </ul>
      )}
      {draft ? (
        <div className="space-y-2 rounded-lg bg-fl-surface-2 p-3">
          <div className="grid gap-2 sm:grid-cols-[160px_1fr]">
            <input type="date" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} className={field} />
            <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Нереализованная прибыль в остатках" className={field} />
          </div>
          {draft.lines.map((l, i) => (
            <div key={i} className="grid grid-cols-[1fr_110px_110px] gap-2">
              <AccountPicker value={l.account} onChange={(code) => setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, account: code } : x)) })} ifrs={false} label={`Счёт, строка ${i + 1}`} />
              <input inputMode="decimal" placeholder="Дебет" value={l.debit} onChange={(e) => setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, debit: e.target.value, credit: e.target.value ? "" : x.credit } : x)) })} className={`${field} num text-right`} />
              <input inputMode="decimal" placeholder="Кредит" value={l.credit} onChange={(e) => setDraft({ ...draft, lines: draft.lines.map((x, j) => (j === i ? { ...x, credit: e.target.value, debit: e.target.value ? "" : x.debit } : x)) })} className={`${field} num text-right`} />
            </div>
          ))}
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <button onClick={() => setDraft({ ...draft, lines: [...draft.lines, { account: "", debit: "", credit: "" }] })} className="text-fl-gold underline-offset-2 hover:underline">Добавить строку</button>
            <span className="num text-xs text-fl-cream/55">Дт {formatNumber(tot[0], 2)} / Кт {formatNumber(tot[1], 2)}</span>
            <button disabled={!ok} onClick={() => { onChange([...items, { id: Math.random().toString(36).slice(2, 10), date: draft.date, description: draft.description.trim(), lines: draft.lines.filter((l) => l.account).map((l) => ({ account: l.account, debit: parseFormattedNumber(l.debit), credit: parseFormattedNumber(l.credit) })).filter((l) => l.debit > 0 || l.credit > 0) }]); setDraft(null); }}
              className="ml-auto rounded-md bg-fl-accent px-3 py-1.5 font-semibold text-fl-on-accent disabled:opacity-40">Добавить</button>
            <button onClick={() => setDraft(null)} className="text-fl-cream/55">Отмена</button>
          </div>
        </div>
      ) : (
        <button onClick={() => setDraft({ date: defaultDate, description: "", lines: [{ account: "", debit: "", credit: "" }, { account: "", debit: "", credit: "" }] })} className="text-sm text-fl-gold underline-offset-2 hover:underline">+ Корректировка</button>
      )}
    </div>
  );
}
