"use client";

// Портфель компаний: все доступные компании на одном экране — балл риска, карта, сигналы.
// Для ведомства-учредителя госпредприятий и для бухгалтера с десятками клиентов.
import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { CartesianGrid, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, ScatterChart, Tooltip, XAxis, YAxis, ZAxis } from "recharts";
import { downloadPost } from "@/components/download";
import { useT } from "@/components/i18n";
import { CHART } from "@/lib/chart-theme";
import type { Band, PortfolioRow, PortfolioSummary } from "@/lib/portfolio/score";

interface Res { rows: PortfolioRow[]; summary: PortfolioSummary; segments: string[]; asOf: string }
type SortKey = "score" | "name" | "current" | "overdue" | "profit3" | "taxHigh";

const field = "rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40";
const COLOR: Record<Band, string> = { ok: "#2f9e6f", watch: "#d99a1e", risk: "#d0453b" };
const BADGE: Record<Band, string> = { ok: "bg-fl-green/15 text-fl-green", watch: "bg-fl-amber/15 text-fl-amber", risk: "bg-fl-red/15 text-fl-red" };
const money = (n: number) => Math.round(n).toLocaleString("ru-RU");
const mln = (n: number) => (Math.abs(n) >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".", ",")} млн` : money(n));
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10);
const COMPANY_KEY = "finlite:companyId";

/** Маленький график ликвидности по месяцам; пунктир — уровень 1. */
function Spark({ values, band }: { values: Array<number | null>; band: Band }) {
  const v = values.map((x) => (x == null ? null : Math.max(0, Math.min(4, x))));
  const pts = v.map((x, i) => (x == null ? null : [i * (88 / Math.max(1, v.length - 1)) + 2, 26 - (x / 4) * 24] as const)).filter(Boolean) as Array<readonly [number, number]>;
  if (pts.length < 2) return <span className="text-fl-cream/40">—</span>;
  return (
    <svg width="92" height="28" viewBox="0 0 92 28" aria-hidden className="inline-block align-middle">
      <line x1="0" x2="92" y1={26 - 6} y2={26 - 6} stroke="currentColor" strokeOpacity="0.25" strokeDasharray="2 2" />
      <polyline points={pts.map((p) => p.join(",")).join(" ")} fill="none" stroke={COLOR[band]} strokeWidth="1.8" />
      <circle cx={pts[pts.length - 1][0]} cy={pts[pts.length - 1][1]} r="2.4" fill={COLOR[band]} />
    </svg>
  );
}

export default function PortfolioPage() {
  const t = useT();
  const [asOf, setAsOf] = useState(today());
  const [months, setMonths] = useState(6);
  const [segment, setSegment] = useState("");
  const [r, setR] = useState<Res | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [only, setOnly] = useState<Band | "all">("all");
  const [sort, setSort] = useState<{ key: SortKey; desc: boolean }>({ key: "score", desc: true });
  const [open, setOpen] = useState<string | null>(null);
  const [seeding, setSeeding] = useState<number | null>(null);
  const [segEdit, setSegEdit] = useState("");

  const load = useCallback(() => {
    setErr(null);
    const q = new URLSearchParams({ asOf, months: String(months), ...(segment ? { segment } : {}) });
    fetch(`/api/portfolio?${q}`).then(async (x) => { const b = await x.json(); if (!x.ok) throw new Error(b.error); setR(b); }).catch((e) => setErr(e.message));
  }, [asOf, months, segment]);
  useEffect(() => { load(); }, [load]);

  async function seed() {
    setErr(null);
    try {
      for (let i = 0; i < 10; i++) {
        setSeeding(i + 1);
        const x = await fetch(`/api/demo?kind=soe&i=${i}`, { method: "POST" });
        if (!x.ok) { const b = await x.json().catch(() => ({})); throw new Error(b.error ?? t("Не удалось создать демо-компанию")); }
      }
      setSegment("Госпредприятия (демо)");
      load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setSeeding(null); }
  }
  async function download(format: "pdf" | "docx") {
    setBusy(format);
    try { await downloadPost(`/api/portfolio?format=${format}`, { asOf, months, segment: segment || undefined, title: segment || t("Все компании") }, `${t("Портфель компаний")}.${format}`); }
    catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(null); }
  }
  async function saveSegment(companyId: string) {
    await fetch("/api/portfolio", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, segment: segEdit }) });
    load();
  }
  function openCompany(id: string, path: string) {
    try { localStorage.setItem(COMPANY_KEY, id); } catch { /* storage blocked */ }
    window.location.href = path;
  }

  const live = useMemo(() => (r?.rows ?? []).filter((x) => !x.empty), [r]);
  const rows = useMemo(() => {
    const list = live.filter((x) => only === "all" || x.band === only);
    const rank: Record<Band, number> = { ok: 0, watch: 1, risk: 2 };
    const val = (x: PortfolioRow): number | string => (sort.key === "name" ? x.name : sort.key === "current" ? x.current ?? -1 : sort.key === "score" ? rank[x.band] * 1000 + x.score : x[sort.key]);
    return [...list].sort((a, b) => { const va = val(a), vb = val(b); const c = typeof va === "string" ? va.localeCompare(vb as string, "ru") : (va as number) - (vb as number); return sort.desc ? -c : c; });
  }, [live, only, sort]);
  const label: Record<Band, string> = { ok: t("устойчиво"), watch: t("внимание"), risk: t("высокий риск") };
  const s = r?.summary;
  const map = live.map((x) => ({ name: x.name, x: Math.max(0, Math.min(4, x.current ?? 0)), y: Math.max(-60, Math.min(100, x.equityShare ?? 0)), z: Math.max(1, x.revenue3), band: x.band, score: x.score }));
  const th = (key: SortKey, text: string, right = false) => (
    <th className={`cursor-pointer select-none py-2 pr-3 font-normal hover:text-fl-cream ${right ? "text-right" : ""}`} onClick={() => setSort({ key, desc: sort.key === key ? !sort.desc : key !== "name" })}>
      {text}{sort.key === key ? (sort.desc ? " ↓" : " ↑") : ""}
    </th>
  );
  const hasSoe = (r?.segments ?? []).includes("Госпредприятия (демо)");

  return (
    <main className="mx-auto max-w-7xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Портфель компаний")}</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Все компании на одном экране: кто устойчив, кому нужно внимание и кто в зоне высокого риска — с причинами. Для ведомства, которому подчинены предприятия, и для бухгалтера с десятками клиентов. Считается по данным учёта каждой компании, балл риска складывается из видимых признаков.")} {t("Предприятия, которые не ведут учёт в программе, оцениваются по загруженной квартальной отчётности.")}</p>
        </div>
        <div className="flex gap-2">
          <button className={btn} disabled={!live.length || busy !== null} onClick={() => download("pdf")}>{busy === "pdf" ? "…" : t("Обзор для руководства (PDF)")}</button>
          <button className={btn} disabled={!live.length || busy !== null} onClick={() => download("docx")}>{busy === "docx" ? "…" : "Word"}</button>
        </div>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Группа")}</span>
          <select value={segment} onChange={(e) => setSegment(e.target.value)} className={`${field} min-w-[220px]`}>
            <option value="">{t("Все компании")}</option>
            {(r?.segments ?? []).map((x) => <option key={x} value={x}>{t(x)}</option>)}
            <option value="—">{t("Без группы")}</option>
          </select>
        </label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("На дату")}</span><input type="date" value={asOf} onChange={(e) => e.target.value && setAsOf(e.target.value)} className={field} /></label>
        <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Динамика")}</span>
          <select value={months} onChange={(e) => setMonths(Number(e.target.value))} className={field}>{[3, 6, 12].map((n) => <option key={n} value={n}>{t("{n} мес.", { n })}</option>)}</select>
        </label>
        <a href="/reported" className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream">{t("Загрузить отчётность предприятий")}</a>
        {!hasSoe && (
          <button className="ml-auto rounded-lg border border-fl-gold/50 bg-fl-gold/10 px-4 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-60" disabled={seeding !== null} onClick={seed} title={t("10 вымышленных госпредприятий с разным финансовым состоянием — для показа экрана")}>
            {seeding ? t("Создаю {n} из 10…", { n: seeding }) : t("Демо-портфель: 10 госпредприятий")}
          </button>
        )}
      </div>

      {err && <p className="mb-4 text-sm text-fl-red">{t(err)}</p>}
      {!r ? !err && <p className="text-sm text-fl-cream/50">{t("Считаю…")}</p> : live.length === 0 ? (
        <p className="rounded-xl border border-fl-line px-4 py-6 text-center text-sm text-fl-cream/60">{t("В портфеле пока нет компаний с данными. Добавьте компании или создайте демо-портфель.")}</p>
      ) : s && (
        <div className="space-y-5">
          <section className="grid gap-3 lg:grid-cols-[1.1fr_1fr]">
            <div className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
              <div className="flex items-baseline justify-between"><h2 className="font-semibold text-fl-cream">{t("Компаний: {n}", { n: s.companies })}</h2><span className="text-xs text-fl-cream/50">{t("на {date}", { date: r.asOf.split("-").reverse().join(".") })}</span></div>
              <div className="mt-3 flex h-4 overflow-hidden rounded-full" role="img" aria-label={t("Распределение компаний по оценке")}>
                {(["ok", "watch", "risk"] as const).map((b) => s[b] > 0 && <div key={b} style={{ width: `${(s[b] / s.companies) * 100}%`, background: COLOR[b] }} />)}
              </div>
              <div className="mt-3 grid grid-cols-3 gap-2">
                {(["ok", "watch", "risk"] as const).map((b) => (
                  <button key={b} onClick={() => setOnly(only === b ? "all" : b)} className={`rounded-xl border p-3 text-left ${only === b ? "border-fl-gold bg-fl-gold/10" : "border-fl-line"}`}>
                    <div className="flex items-center gap-1.5 text-xs text-fl-cream/60"><span className="h-2.5 w-2.5 rounded-full" style={{ background: COLOR[b] }} />{label[b]}</div>
                    <div className="font-display text-3xl font-semibold tabular-nums text-fl-cream">{s[b]}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {[[t("Не погашено в срок"), `${mln(s.overdue)} ${t("сом")}`, s.overdue > 0],
                [t("из них зарплата"), `${mln(s.overdueStaff)} ${t("сом")}`, s.overdueStaff > 0],
                [t("из них бюджет и Соцфонд"), `${mln(s.overdueBudget)} ${t("сом")}`, s.overdueBudget > 0],
                [t("Результат за 3 месяца"), `${mln(s.profit3)} ${t("сом")}`, s.profit3 < 0],
              ].map(([a, b, bad]) => (
                <div key={a as string} className={`rounded-2xl border p-3 ${bad ? "border-fl-amber/40" : "border-fl-line"} bg-fl-charcoal-2`}>
                  <div className="text-xs text-fl-cream/55">{a}</div>
                  <div className={`mt-1 font-display text-xl font-semibold tabular-nums ${bad ? "text-fl-amber" : "text-fl-cream"}`}>{b}</div>
                </div>
              ))}
              <p className="col-span-2 text-xs text-fl-cream/50">{t("Убыточных за 3 месяца: {n} из {all}. Выручка за 3 месяца: {rev} сом.", { n: s.lossMaking, all: s.companies, rev: mln(s.revenue3) })}</p>
            </div>
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <h2 className="font-semibold text-fl-cream">{t("Карта риска")}</h2>
            <p className="mt-0.5 text-xs text-fl-cream/55">{t("Вправо — выше текущая ликвидность, вверх — больше доля собственного капитала, размер — выручка. Левый нижний угол — компании, которым не хватает ни оборотных средств, ни капитала.")}</p>
            <div className="mt-2 h-80" role="img" aria-label={t("Карта риска: ликвидность и доля капитала")}>
              <ResponsiveContainer width="100%" height="100%">
                <ScatterChart margin={{ top: 10, right: 16, bottom: 22, left: 4 }}>
                  <CartesianGrid stroke={CHART.grid} />
                  <ReferenceArea x1={0} x2={1} y1={-60} y2={0} fill={COLOR.risk} fillOpacity={0.07} />
                  <ReferenceLine x={1} stroke={CHART.axis} strokeDasharray="4 3" />
                  <ReferenceLine y={0} stroke={CHART.axis} strokeDasharray="4 3" />
                  <XAxis type="number" dataKey="x" domain={[0, 4]} ticks={[0, 1, 2, 3, 4]} tick={{ fill: CHART.axis, fontSize: 11 }} label={{ value: t("Текущая ликвидность (до 4)"), position: "insideBottom", offset: -12, fill: CHART.axis, fontSize: 11 }} />
                  <YAxis type="number" dataKey="y" domain={[-60, 100]} tick={{ fill: CHART.axis, fontSize: 11 }} width={56} tickFormatter={(v) => `${v} %`} />
                  <ZAxis type="number" dataKey="z" range={[60, 600]} />
                  <Tooltip contentStyle={CHART.tooltip} cursor={false} content={({ payload }) => {
                    const p = payload?.[0]?.payload as (typeof map)[number] | undefined;
                    return p ? <div className="rounded-lg border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-xs text-fl-cream shadow-card"><b>{p.name}</b><div>{t("Балл риска: {n}", { n: p.score })} · {label[p.band]}</div></div> : null;
                  }} />
                  {(["ok", "watch", "risk"] as const).map((b) => <Scatter key={b} data={map.filter((m) => m.band === b)} fill={COLOR[b]} fillOpacity={0.8} isAnimationActive={false} />)}
                </ScatterChart>
              </ResponsiveContainer>
            </div>
          </section>

          <section className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="mr-auto font-semibold text-fl-cream">{t("Компании")}</h2>
              {([["all", t("Все")], ["risk", label.risk], ["watch", label.watch], ["ok", label.ok]] as const).map(([k, l]) => (
                <button key={k} onClick={() => setOnly(k)} className={`rounded-full border px-3 py-1 text-sm ${only === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65"}`}>{l}</button>
              ))}
            </div>
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[980px] text-sm">
                <thead><tr className="text-left text-xs text-fl-cream/50">
                  {th("name", t("Компания"))}{th("score", t("Балл риска"))}<th className="py-2 pr-3 font-normal">{t("Динамика ликвидности")}</th>
                  {th("current", t("Текущая"), true)}{th("overdue", t("Не погашено в срок"), true)}{th("profit3", t("Результат 3 мес."), true)}{th("taxHigh", t("Налог. риски"), true)}<th className="py-2 font-normal">{t("Главное")}</th>
                </tr></thead>
                <tbody className="divide-y divide-fl-line">
                  {rows.map((x) => (
                    <Fragment key={x.companyId}>
                      <tr className="cursor-pointer hover:bg-fl-surface-2/50" onClick={() => { setOpen(open === x.companyId ? null : x.companyId); setSegEdit(x.segment); }}>
                        <td className="py-2 pr-3"><div className="font-medium text-fl-cream">{x.name}</div><div className="text-xs text-fl-cream/45">{x.segment ? `${t(x.segment)} · ` : ""}{x.source === "reported" ? <span className="text-fl-info" title={t("Цифры из загруженной отчётности предприятия, а не из журнала проводок")}>{t("отчётность на {date}", { date: x.dataDate.split("-").reverse().join(".") })}</span> : t("учёт в программе")}</div></td>
                        <td className="py-2 pr-3"><div className="flex items-center gap-2"><span className="w-7 text-right font-semibold tabular-nums text-fl-cream">{x.score}</span><span className="h-1.5 w-16 overflow-hidden rounded-full bg-fl-surface-2"><span className="block h-full" style={{ width: `${x.score}%`, background: COLOR[x.band] }} /></span><span className={`whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-semibold ${BADGE[x.band]}`}>{label[x.band]}</span></div></td>
                        <td className="py-2 pr-3 text-fl-cream/60"><Spark values={x.trend} band={x.band} /></td>
                        <td className="py-2 pr-3 text-right tabular-nums text-fl-cream">{x.current == null ? "—" : x.current.toLocaleString("ru-RU")}</td>
                        <td className="py-2 pr-3 text-right tabular-nums">
                          <div className={x.overdue > 0 ? "text-fl-cream" : "text-fl-cream/40"}>{x.overdue > 0 ? money(x.overdue) : "—"}</div>
                          {(x.overdueStaff > 0 || x.overdueBudget > 0) && <div className="text-[11px] text-fl-amber">{[x.overdueStaff > 0 ? t("зарплата {sum}", { sum: mln(x.overdueStaff) }) : "", x.overdueBudget > 0 ? t("бюджет {sum}", { sum: mln(x.overdueBudget) }) : ""].filter(Boolean).join(" · ")}</div>}
                        </td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${x.profit3 < 0 ? "text-fl-red" : "text-fl-cream"}`}>{mln(x.profit3)}</td>
                        <td className={`py-2 pr-3 text-right tabular-nums ${x.taxHigh ? "text-fl-red" : "text-fl-cream/40"}`}>{x.taxHigh || "—"}</td>
                        <td className="max-w-[300px] py-2 text-xs text-fl-cream/70">{x.topSignal ? t(x.topSignal.title, x.topSignal.vars) : t("Признаков риска нет")}</td>
                      </tr>
                      {open === x.companyId && (
                        <tr><td colSpan={8} className="bg-fl-surface-2/40 px-3 py-3">
                          <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
                            <div>
                              <div className="text-xs font-semibold text-fl-cream/70">{t("Из чего сложился балл")}</div>
                              {x.parts.length ? <ul className="mt-1 space-y-0.5 text-sm">{x.parts.map((p) => <li key={p.key} className="flex justify-between gap-3"><span className="text-fl-cream/80">{t(p.label)}</span><span className="tabular-nums text-fl-cream">+{p.points}</span></li>)}</ul> : <p className="mt-1 text-sm text-fl-cream/60">{t("Признаков риска нет")}</p>}
                            </div>
                            <div>
                              {x.topSignal && <><div className="text-xs font-semibold text-fl-cream/70">{t(x.topSignal.title, x.topSignal.vars)}</div><p className="mt-1 text-sm text-fl-cream/75">{t(x.topSignal.detail, x.topSignal.vars)}</p></>}
                              {x.taxTitles.length > 0 && <p className="mt-2 text-xs text-fl-red">{t("Налоговые риски:")} {x.taxTitles.map((tt) => t(tt.title, tt.vars)).join("; ")}</p>}
                            </div>
                            <div className="flex flex-col gap-2">
                              <button className={btn} onClick={() => openCompany(x.companyId, "/diagnostics")}>{t("Финансовая диагностика")}</button>
                              <button className={btn} onClick={() => openCompany(x.companyId, "/taxrisk")}>{t("Налоговые риски")}</button>
                              <div className="flex gap-1">
                                <input className={`${field} w-40`} value={segEdit} onChange={(e) => setSegEdit(e.target.value)} placeholder={t("Группа")} />
                                <button className={btn} onClick={() => saveSegment(x.companyId)}>{t("Сохранить")}</button>
                              </div>
                            </div>
                          </div>
                        </td></tr>
                      )}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-fl-cream/50">{t("Балл риска 0–100 из видимых признаков: недостаточность активов 35, просроченного больше ликвидных активов 30, задержка зарплаты 15, ликвидность ниже 1 — 15, просрочка перед бюджетом 10, просрочка поставщикам 10, поставщикам не платят больше 120 дней ещё 10, падение ликвидности, убыток или нехватка денег по 5, высокие налоговые риски по 3. 0–19 — устойчиво, 20–49 — внимание, 50 и выше — высокий риск; оценка не мягче вывода финансовой диагностики.")}</p>
          </section>
        </div>
      )}
    </main>
  );
}
