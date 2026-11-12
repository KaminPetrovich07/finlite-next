"use client";

import { useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { formatNumber } from "@/lib/format";
import { ago, KindBadge } from "@/components/community/NewsCard";
import type { PostKind } from "@/lib/news/types";

const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const today = () => new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10); // Бишкек
const money = (x: number) => formatNumber(Math.round(x), 0);
const MONTHS = ["янв", "фев", "мар", "апр", "май", "июн", "июл", "авг", "сен", "окт", "ноя", "дек"];

interface Entry { id: string; date: string; description: string; source: string; lines: Array<{ account: string; debit: number; credit: number }> }
interface Monthly { month: string; revenue: number; expenses: number; netProfit: number; cashEnd: number }
interface Stat {
  statements: {
    trialBalance: { rows: Array<{ account: string; openingDr: number; openingCr: number; closingDr: number; closingCr: number }> };
    incomeStatement: { netRevenue: number; netProfit: number };
    taxes: { computed: { total: number } };
    monthly: Monthly[];
    entryCount: number;
  };
  entries: Entry[];
}
interface Ev { key: string; companyId: string; form: string; title: string; periodLabel: string; deadline: string; daysLeft: number; status: string; amount: number | null }
interface News { id: string; kind: PostKind; title: string; sourceName: string | null; authorName: string; docDate: string | null; createdAt: string }

const SOURCE: Record<string, string> = { manual: "вручную", bank: "из выписки", opening: "остатки", closing: "закрытие", payroll: "зарплата", esf: "ЭСФ", depreciation: "амортизация", cogs: "себестоимость", fx: "курсовые", import1c: "из 1С", demo: "демо" };

function Step({ done, n, title, text, href, cta }: { done: boolean; n: number; title: string; text: string; href: string; cta: string }) {
  return (
    <li className={`flex gap-3 rounded-xl p-3 ${done ? "opacity-60" : "bg-fl-surface-2/70"}`}>
      <span className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${done ? "bg-fl-green text-white" : "border-2 border-fl-gold text-fl-gold"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1">
        <p className={`text-sm font-semibold ${done ? "text-fl-cream/70 line-through decoration-fl-cream/30" : "text-fl-cream"}`}>{title}</p>
        {!done && <p className="mt-0.5 text-xs text-fl-cream/60">{text}</p>}
      </div>
      {!done && <a href={href} className="self-center whitespace-nowrap rounded-lg bg-fl-accent px-3 py-1.5 text-xs font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{cta}</a>}
    </li>
  );
}

function Tile({ label, value, note, href, children }: { label: string; value: string; note?: string; href?: string; children?: React.ReactNode }) {
  const body = (
    <>
      <p className="text-xs font-medium text-fl-cream/55">{label}</p>
      <p className="num mt-1 font-display text-2xl font-bold tracking-tight text-fl-cream">{value}<span className="ml-1 text-sm font-medium text-fl-cream/45">сом</span></p>
      {note && <p className="mt-0.5 text-xs text-fl-cream/50">{note}</p>}
      {children}
    </>
  );
  return href ? <a href={href} className={`${card} block p-4 transition hover:border-fl-gold/50`}>{body}</a> : <div className={`${card} p-4`}>{body}</div>;
}

/** Помесячные столбики выручки — без библиотеки графиков, чтобы рабочий стол открывался мгновенно. */
function Bars({ data }: { data: Monthly[] }) {
  const max = Math.max(1, ...data.map((d) => d.revenue));
  return (
    <div className="mt-3 flex h-12 items-end gap-1" aria-hidden>
      {data.slice(-8).map((d) => (
        <div key={d.month} className="flex flex-1 flex-col items-center gap-1">
          <div className="w-full rounded-sm bg-fl-gold/70" style={{ height: `${Math.max(4, (d.revenue / max) * 40)}px` }} title={`${d.month}: ${money(d.revenue)} сом`} />
          <span className="text-[9px] text-fl-cream/40">{MONTHS[Number(d.month.slice(5)) - 1]}</span>
        </div>
      ))}
    </div>
  );
}

const ACTIONS: Array<{ href: string; label: string; text: string; icon: string }> = [
  { href: "/ledger?new=1", label: "Новая проводка", text: "Продажа, покупка, оплата — по шаблону", icon: "M12 5v14M5 12h14" },
  { href: "/transactions", label: "Банковская выписка", text: "Загрузить и разнести по счетам", icon: "M4 10h16M6 10v8m4-8v8m4-8v8m4-8v8M3 20h18M12 3l9 5H3l9-5Z" },
  { href: "/ledger?payroll=1", label: "Зарплата", text: "Начислить, удержать, Соцфонд", icon: "M12 3v18M8 7h6a3 3 0 0 1 0 6H9a3 3 0 0 0 0 6h7" },
  { href: "/reports", label: "Отчётность", text: "Баланс, ОПиУ, ОДДС, ОСВ", icon: "M4 20V10m6 10V4m6 16v-7" },
  { href: "/taxreports", label: "Налоги ГНС", text: "Суммы и сроки по формам", icon: "M7 3h10v18l-5-3-5 3V3Zm3 6h4" },
  { href: "/close", label: "Закрыть месяц", text: "Проверка и закрытие периода", icon: "M5 12l4 4L19 6" },
];

export default function Home() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const [stat, setStat] = useState<Stat | null>(null);
  const [events, setEvents] = useState<Ev[]>([]);
  const [news, setNews] = useState<News[]>([]);
  const [policySaved, setPolicySaved] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [hideSteps, setHideSteps] = useState(false);
  const [dateLabel, setDateLabel] = useState("");
  useEffect(() => { setDateLabel(new Date().toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })); }, []);
  const year = today().slice(0, 4);

  useEffect(() => {
    if (!loaded || !companyId || companyId === NEW_COMPANY) return;
    setStat(null); setError(null); setPolicySaved(null);
    try { setHideSteps(localStorage.getItem(`finlite:steps-hidden:${companyId}`) === "1"); } catch { setHideSteps(false); }
    fetch(`/api/statements?${new URLSearchParams({ companyId, from: `${year}-01-01`, to: today() })}`)
      .then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setStat(b); })
      .catch((e) => setError(e.message));
    fetch(`/api/policy?companyId=${encodeURIComponent(companyId)}`).then((r) => r.json()).then((b) => setPolicySaved(!!b.saved)).catch(() => setPolicySaved(null));
  }, [loaded, companyId, year]);

  useEffect(() => {
    fetch("/api/calendar").then((r) => r.json()).then((b) => setEvents(b.events ?? [])).catch(() => {});
    fetch("/api/news?take=4").then((r) => r.json()).then((b) => setNews(b.posts ?? [])).catch(() => {});
  }, []);

  const k = useMemo(() => {
    if (!stat) return null;
    const s = stat.statements;
    const cash = s.trialBalance.rows.filter((r) => /^1[12]/.test(r.account)).reduce((t, r) => t + r.closingDr - r.closingCr, 0);
    const month = today().slice(0, 7);
    const thisMonth = s.monthly.find((m) => m.month === month);
    const entries = stat.entries;
    const steps = {
      opening: s.trialBalance.rows.some((r) => r.openingDr || r.openingCr) || entries.some((e) => e.source === "opening"),
      first: entries.some((e) => e.source !== "opening" && e.source !== "closing"),
      bank: entries.some((e) => e.source === "bank"),
      closed: entries.some((e) => e.source === "closing"),
    };
    const recent = [...entries].filter((e) => e.source !== "closing").sort((a, b) => b.date.localeCompare(a.date)).slice(0, 6);
    return { cash, revenue: s.incomeStatement.netRevenue, profit: s.incomeStatement.netProfit, taxes: s.taxes.computed.total, thisMonth, monthly: s.monthly, steps, recent, count: s.entryCount };
  }, [stat]);

  const upcoming = events.filter((e) => e.companyId === companyId && e.status !== "done" && e.daysLeft >= -60).sort((a, b) => a.deadline.localeCompare(b.deadline)).slice(0, 5);
  const isDemo = !!company?.demo;
  const steps = k && !isDemo ? [
    { done: true, title: "Компания создана", text: "", href: "/companies", cta: "" },
    { done: !!policySaved, title: "Учётная политика", text: "Приказ и политика по шаблону КР — за 5 минут, с планом счетов и документооборотом.", href: "/policy", cta: "Оформить" },
    { done: k.steps.opening, title: "Начальные остатки", text: "Деньги, долги, товары и капитал на дату начала учёта — чтобы баланс сходился.", href: "/ledger", cta: "Ввести" },
    { done: k.steps.first, title: "Первые операции", text: "Продажа, покупка, оплата — шаблоном за полминуты, или загрузите банковскую выписку.", href: "/ledger?new=1", cta: "Провести" },
    { done: k.steps.bank, title: "Банковская выписка", text: "Выписка из банка превращается в проводки сама — вы только проверяете счета.", href: "/transactions", cta: "Загрузить" },
    { done: k.steps.closed, title: "Закрыть месяц и получить отчётность", text: "Проверка всех разделов, закрытие периода, баланс и налоговые отчёты.", href: "/close", cta: "Закрыть" },
  ] : [];
  const doneSteps = steps.filter((s) => s.done).length;
  const showSteps = steps.length > 0 && doneSteps < steps.length && !hideSteps;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-5 sm:px-6 sm:pt-8">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <p className="min-h-5 text-sm text-fl-cream/55">{dateLabel}</p>
          <h1 className="font-display text-2xl font-bold text-fl-cream sm:text-3xl">Рабочий стол</h1>
        </div>
        {loaded && (
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} aria-label="Компания"
            className="max-w-full rounded-lg border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm font-medium text-fl-cream sm:max-w-xs">
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        )}
      </header>

      {isDemo && (
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-fl-gold/30 bg-fl-gold/10 px-4 py-3">
          <p className="text-sm text-fl-cream/80">Это демо-компания: всё можно посмотреть, но не изменить. Чтобы вести свой учёт — создайте компанию.</p>
          <a href="/companies" className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Создать свою компанию</a>
        </div>
      )}
      {error && <p className="mt-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {showSteps && (
        <section className={`${card} mt-5 p-4 sm:p-5`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-display text-lg font-semibold text-fl-cream">Первые шаги</h2>
            <div className="flex items-center gap-3">
              <span className="text-xs text-fl-cream/55">{doneSteps} из {steps.length}</span>
              <button type="button" onClick={() => { setHideSteps(true); try { localStorage.setItem(`finlite:steps-hidden:${companyId}`, "1"); } catch { /* */ } }} className="text-xs text-fl-cream/45 hover:text-fl-cream">скрыть</button>
            </div>
          </div>
          <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-fl-surface-2"><div className="h-full rounded-full bg-fl-green transition-all" style={{ width: `${(doneSteps / steps.length) * 100}%` }} /></div>
          <ol className="mt-4 grid gap-2 lg:grid-cols-2">
            {steps.map((s, i) => <Step key={s.title} n={i + 1} {...s} />)}
          </ol>
        </section>
      )}

      <section className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {!k ? Array.from({ length: 4 }).map((_, i) => <div key={i} className={`${card} h-28 animate-pulse`} />) : (
          <>
            <Tile label="Деньги: касса и банк" value={money(k.cash)} note="на сегодня" href="/reports" />
            <Tile label={`Выручка с начала ${year}`} value={money(k.revenue)} note={k.thisMonth ? `в этом месяце ${money(k.thisMonth.revenue)}` : "в этом месяце пока нет"} href="/reports">
              {k.monthly.length > 1 && <Bars data={k.monthly} />}
            </Tile>
            <Tile label={`Прибыль с начала ${year}`} value={money(k.profit)} note={k.revenue ? `рентабельность ${Math.round((k.profit / k.revenue) * 100)} %` : undefined} href="/executive" />
            <Tile label="Налоги по расчёту" value={money(k.taxes)} note="с начала года — суммы и сроки" href="/taxreports" />
          </>
        )}
      </section>

      <section className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
        {ACTIONS.map((a) => (
          <a key={a.href} href={a.href} className={`${card} group flex flex-col gap-2 p-3 transition hover:border-fl-gold/50`}>
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-fl-gold/15 text-fl-gold">
              <svg aria-hidden viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round"><path d={a.icon} /></svg>
            </span>
            <span className="text-sm font-semibold text-fl-cream">{a.label}</span>
            <span className="hidden text-xs text-fl-cream/55 sm:block">{a.text}</span>
          </a>
        ))}
      </section>

      <div className="mt-5 grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <section className={`${card} p-4 sm:p-5`}>
          <div className="flex items-center justify-between">
            <h2 className="font-display text-lg font-semibold text-fl-cream">Последние операции</h2>
            <a href="/ledger" className="text-sm text-fl-gold hover:underline">весь журнал</a>
          </div>
          {k && k.recent.length === 0 && (
            <div className="mt-4 rounded-xl bg-fl-surface-2 p-4 text-sm text-fl-cream/70">
              Операций в этом году ещё нет. <a href="/ledger?new=1" className="font-medium text-fl-gold hover:underline">Проведите первую</a> — например, «Продажа в долг» или «Оплата поставщику».
            </div>
          )}
          <ul className="mt-3 divide-y divide-fl-line/70">
            {k?.recent.map((e) => {
              const sum = e.lines.reduce((t, l) => t + l.debit, 0);
              return (
                <li key={e.id} className="flex items-center gap-3 py-2.5">
                  <span className="num w-12 shrink-0 text-xs text-fl-cream/50">{e.date.slice(8)}.{e.date.slice(5, 7)}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm text-fl-cream">{e.description}</span>
                    <span className="text-xs text-fl-cream/45">{SOURCE[e.source] ?? e.source}</span>
                  </span>
                  <span className="num shrink-0 text-sm font-medium text-fl-cream">{formatNumber(sum, 2)}</span>
                </li>
              );
            })}
          </ul>
        </section>

        <div className="space-y-5">
          <section className={`${card} p-4 sm:p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-fl-cream">Ближайшие сроки</h2>
              <a href="/calendar" className="text-sm text-fl-gold hover:underline">календарь</a>
            </div>
            {upcoming.length === 0 && <p className="mt-3 text-sm text-fl-cream/60">Ближайших сроков по этой компании нет.</p>}
            <ul className="mt-3 space-y-2">
              {upcoming.map((e) => (
                <li key={e.key} className={`rounded-xl px-3 py-2 ${e.daysLeft < 0 ? "bg-fl-red/10" : e.daysLeft <= 5 ? "bg-fl-amber/10" : "bg-fl-surface-2/70"}`}>
                  <div className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold text-fl-cream">{e.form}</span>
                    <span className={`text-xs font-medium ${e.daysLeft < 0 ? "text-fl-red" : e.daysLeft <= 5 ? "text-fl-amber" : "text-fl-cream/55"}`}>
                      {e.daysLeft < 0 ? `просрочен ${-e.daysLeft} дн.` : e.daysLeft === 0 ? "сегодня" : `через ${e.daysLeft} дн.`}
                    </span>
                  </div>
                  <p className="text-xs text-fl-cream/60">{e.title}, {e.periodLabel}{e.amount ? ` · ${money(e.amount)} сом` : ""}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className={`${card} p-4 sm:p-5`}>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-lg font-semibold text-fl-cream">Новости</h2>
              <a href="/news" className="text-sm text-fl-gold hover:underline">все</a>
            </div>
            {news.length === 0 && <p className="mt-3 text-sm text-fl-cream/60">Лента обновится при первом открытии раздела «Новости и наука».</p>}
            <ul className="mt-3 space-y-3">
              {news.map((n) => (
                <li key={n.id}>
                  <a href={`/news/${n.id}`} className="group block">
                    <span className="flex items-center gap-2 text-xs text-fl-cream/50"><KindBadge kind={n.kind} /> {n.sourceName || n.authorName} · {ago(n.docDate ?? n.createdAt)}</span>
                    <span className="mt-1 line-clamp-2 block text-sm font-medium text-fl-cream group-hover:text-fl-gold">{n.title}</span>
                  </a>
                </li>
              ))}
            </ul>
          </section>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-fl-cream/40">
        Нажмите <kbd className="rounded border border-fl-line px-1">Ctrl</kbd> + <kbd className="rounded border border-fl-line px-1">K</kbd> или <kbd className="rounded border border-fl-line px-1">/</kbd>, чтобы быстро найти любой раздел.
      </p>
    </main>
  );
}
