"use client";

// Сбор отчётности: ведомство объявляет сбор по группе, предприятия сдают отчёты.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { STATUS_LABEL, STATUS_TONE as TONE, campaignTitle, daysLeft, type CampaignStats, type RowStatus } from "@/lib/collect/collect";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const primary = "rounded-lg bg-fl-accent px-5 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
const dmy = (d: string) => d.split("-").reverse().join(".");

interface Overview {
  segments: string[]; today: string;
  campaigns: Array<{ id: string; title: string; segment: string; periodEnd: string; deadline: string; closed: boolean; stats: CampaignStats }>;
  mine: Array<{ campaignId: string; title: string; deadline: string; periodEnd: string; companyId: string; companyName: string; status: RowStatus; returnReason: string | null }>;
}

/** Последний закончившийся квартал и срок через 25 дней после него (ориентир, меняется). */
function defaults(today: string) {
  const [y, m] = today.split("-").map(Number);
  const periodEnd = new Date(Date.UTC(y, Math.floor((m - 1) / 3) * 3, 0)).toISOString().slice(0, 10);
  const due = new Date(Date.parse(`${periodEnd}T00:00:00Z`) + 25 * 864e5).toISOString().slice(0, 10);
  return { periodEnd, deadline: due < today ? new Date(Date.parse(`${today}T00:00:00Z`) + 10 * 864e5).toISOString().slice(0, 10) : due };
}

export default function CollectPage() {
  const t = useT();
  const [d, setD] = useState<Overview | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [form, setForm] = useState<{ title: string; segment: string; periodEnd: string; deadline: string; note: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    fetch("/api/collect").then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setD(b); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  function openForm() {
    if (!d) return;
    const x = defaults(d.today);
    setForm({ title: campaignTitle(x.periodEnd), segment: d.segments[0] ?? "", periodEnd: x.periodEnd, deadline: x.deadline, note: "" });
  }
  async function create() {
    if (!form) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/collect", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      window.location.href = `/collect/${b.id}`;
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); setBusy(false); }
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Сбор отчётности")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Ведомство объявляет сбор по группе предприятий — каждое предприятие сдаёт отчёт здесь: заполняет онлайн или загружает Excel. Ведомство видит, кто сдал, кто нет и у кого признаки риска, а программа сама напоминает о сроке.")}</p>
      </header>
      {err && <p className="mb-4 text-sm text-fl-red">{t(err)}</p>}
      {!d ? <p className="text-sm text-fl-cream/50">{t("Загружаю…")}</p> : (
        <div className="space-y-8">
          {d.mine.length > 0 && (
            <section>
              <h2 className="mb-3 text-lg font-semibold text-fl-cream">{t("Отчёты моих предприятий")}</h2>
              <ul className="grid gap-3 md:grid-cols-2">{d.mine.map((m) => {
                const left = daysLeft(m.deadline, d.today);
                const done = m.status === "submitted" || m.status === "accepted";
                return (
                  <li key={m.campaignId + m.companyId}>
                    <Link href={`/collect/${m.campaignId}/${m.companyId}`} className={`block rounded-2xl border p-4 hover:border-fl-gold/50 ${!done && left < 0 ? "border-fl-red/50" : m.status === "returned" ? "border-fl-amber/60" : "border-fl-line"} bg-fl-charcoal-2`}>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-fl-cream">{m.companyName}</span>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${TONE[m.status]}`}>{t(STATUS_LABEL[m.status])}</span>
                      </div>
                      <div className="mt-1 text-sm text-fl-cream/70">{t(m.title)}</div>
                      <div className={`mt-1 text-xs ${!done && left < 0 ? "text-fl-red" : "text-fl-cream/50"}`}>
                        {done ? t("Сдан") : left < 0 ? t("Срок прошёл {date}", { date: dmy(m.deadline) }) : left === 0 ? t("Сегодня последний день") : t("Срок {date}, осталось {n} дн.", { date: dmy(m.deadline), n: left })}
                      </div>
                      {m.status === "returned" && m.returnReason && <div className="mt-2 text-xs text-fl-amber">{t("Что исправить: {text}", { text: m.returnReason })}</div>}
                    </Link>
                  </li>
                );
              })}</ul>
            </section>
          )}

          {d.segments.length > 0 && (
            <section>
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-fl-cream">{t("Сборы, которые я веду")}</h2>
                {!form && <button className={primary} onClick={openForm}>{t("Объявить сбор")}</button>}
              </div>
              {form && (
                <div className="mb-4 rounded-2xl border border-fl-gold/40 bg-fl-charcoal-2 p-4">
                  <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                    <label className="lg:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">{t("Название")}</span><input className={field} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} /></label>
                    <label className="lg:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">{t("Группа предприятий")}</span>
                      <select className={field} value={form.segment} onChange={(e) => setForm({ ...form, segment: e.target.value })}>{d.segments.map((s) => <option key={s} value={s}>{t(s)}</option>)}</select></label>
                    <label><span className="mb-1 block text-xs text-fl-cream/55">{t("Период — на дату")}</span><input type="date" className={field} value={form.periodEnd} onChange={(e) => setForm({ ...form, periodEnd: e.target.value, title: campaignTitle(e.target.value) })} /></label>
                    <label><span className="mb-1 block text-xs text-fl-cream/55">{t("Срок сдачи")}</span><input type="date" className={field} value={form.deadline} onChange={(e) => setForm({ ...form, deadline: e.target.value })} /></label>
                    <label className="sm:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">{t("Пояснение для предприятий (необязательно)")}</span><input className={field} value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} /></label>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <button className={primary} disabled={busy || !form.segment} onClick={create}>{busy ? t("Создаю…") : t("Объявить")}</button>
                    <button className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80" onClick={() => setForm(null)}>{t("Отмена")}</button>
                  </div>
                </div>
              )}
              {!d.campaigns.length ? <p className="rounded-xl border border-fl-line px-4 py-6 text-center text-sm text-fl-cream/55">{t("Сборов пока нет. Объявите первый — предприятия группы увидят его в своём кабинете.")}</p> : (
                <ul className="space-y-3">{d.campaigns.map((c) => (
                  <li key={c.id}>
                    <Link href={`/collect/${c.id}`} className="block rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 hover:border-fl-gold/50">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-semibold text-fl-cream">{t(c.title)}</span>
                        <span className="text-xs text-fl-cream/50">{t(c.segment)} · {t("срок {date}", { date: dmy(c.deadline) })}{c.closed ? ` · ${t("закрыт")}` : ""}</span>
                      </div>
                      <div className="mt-2 h-2 overflow-hidden rounded-full bg-fl-surface-2"><div className="h-full bg-fl-green" style={{ width: `${c.stats.pct}%` }} /></div>
                      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-fl-cream/65">
                        <span>{t("сдали {a} из {b}", { a: c.stats.in, b: c.stats.total })}</span>
                        <span>{t("заполняют {n}", { n: c.stats.draft })}</span>
                        <span>{t("на доработке {n}", { n: c.stats.returned })}</span>
                        <span>{t("не начинали {n}", { n: c.stats.none })}</span>
                        {c.stats.overdue > 0 && <span className="text-fl-red">{t("просрочили {n}", { n: c.stats.overdue })}</span>}
                      </div>
                    </Link>
                  </li>
                ))}</ul>
              )}
            </section>
          )}

          {!d.segments.length && !d.mine.length && (
            <p className="rounded-xl border border-fl-line px-4 py-6 text-sm text-fl-cream/60">{t("Здесь появятся отчёты, которые ваше предприятие должно сдать ведомству, и сборы, если вы их ведёте. Доступ к группе предприятий открывает администратор («Админ → Ведомства»).")}</p>
          )}
        </div>
      )}
    </main>
  );
}
