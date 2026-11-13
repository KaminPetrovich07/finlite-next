"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { formatNumber } from "@/lib/format";
import type { CalendarEvent } from "@/lib/calendar/events";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string) => iso.split("-").reverse().join(".");
const MONTHS = ["Январь", "Февраль", "Март", "Апрель", "Май", "Июнь", "Июль", "Август", "Сентябрь", "Октябрь", "Ноябрь", "Декабрь"];
const DAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];

const tone = (e: CalendarEvent) =>
  e.status === "done" ? "bg-fl-green/15 text-fl-green" : e.status === "overdue" ? "bg-fl-red/15 text-fl-red" : e.daysLeft <= 3 ? "bg-fl-amber/25 text-fl-amber" : "bg-fl-gold/15 text-fl-cream";
const when = (e: CalendarEvent) =>
  e.status === "done" ? "сдан" : e.daysLeft < 0 ? `просрочен на ${-e.daysLeft} дн.` : e.daysLeft === 0 ? "сегодня" : e.daysLeft === 1 ? "завтра" : `через ${e.daysLeft} дн.`;

interface Data {
  today: string;
  events: CalendarEvent[];
  problems: Array<{ company: string; problem: string }>;
  settings: { daysBefore: number; emails: string[]; chats: Array<{ id: number; name: string; at: string }>; botLink: string | null } | null;
  channels: { telegram: boolean; email: boolean };
}

export default function CalendarPage() {
  const { companies, companyId, setCompanyId, loaded } = useCompanies();
  const [data, setData] = useState<Data | null>(null);
  const [month, setMonth] = useState<{ y: number; m: number } | null>(null);
  const [filter, setFilter] = useState<string>("all");
  const [picked, setPicked] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    const r = await fetch(`/api/calendar${companyId ? `?companyId=${encodeURIComponent(companyId)}` : ""}`);
    const b = await r.json();
    if (r.ok) { setData(b); setMonth((m) => m ?? { y: +b.today.slice(0, 4), m: +b.today.slice(5, 7) }); } else show(b.error ?? "Не удалось загрузить календарь", "error");
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);

  const events = useMemo(() => (data?.events ?? []).filter((e) => filter === "all" || e.companyId === filter), [data, filter]);
  const byDay = useMemo(() => {
    const m = new Map<string, CalendarEvent[]>();
    for (const e of events) (m.get(e.deadline) ?? m.set(e.deadline, []).get(e.deadline)!).push(e);
    return m;
  }, [events]);

  const grid = useMemo(() => {
    if (!month) return [];
    const first = new Date(Date.UTC(month.y, month.m - 1, 1));
    const shift = (first.getUTCDay() + 6) % 7;
    const days = new Date(Date.UTC(month.y, month.m, 0)).getUTCDate();
    const cells: Array<string | null> = Array(shift).fill(null);
    for (let i = 1; i <= days; i++) cells.push(`${month.y}-${String(month.m).padStart(2, "0")}-${String(i).padStart(2, "0")}`);
    while (cells.length % 7) cells.push(null);
    return cells;
  }, [month]);

  const upcoming = events.filter((e) => e.status !== "done" && e.daysLeft >= -60).slice(0, 30);
  const step = (k: number) => setMonth((m) => m && { y: m.m + k > 12 ? m.y + 1 : m.m + k < 1 ? m.y - 1 : m.y, m: ((m.m + k + 11) % 12) + 1 });
  const companyOptions = companies.filter((c) => !c.demo);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Налоговый календарь</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Сроки отчётов в ГНС по всем компаниям — из того же расчёта, что «Налоговые отчёты»: суммы, сроки и отметки о сдаче
          совпадают. Напоминания приходят в Telegram или на почту за выбранное число дней, накануне и в день срока.
        </p>
      </header>

      {data && data.problems.length > 0 && (
        <div className="mb-4 rounded-xl border border-fl-amber/40 bg-fl-amber/10 px-4 py-3 text-sm text-fl-cream/85">
          {data.problems.map((p, i) => <p key={`${i}-${p.company}`}><b>{p.company}:</b> {p.problem}</p>)}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <section className={`${card} p-4`}>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1">
              <button type="button" onClick={() => step(-1)} className="rounded-md px-2 py-1 text-fl-cream/60 hover:text-fl-cream" aria-label="Предыдущий месяц">‹</button>
              <h2 className="min-w-[150px] text-center font-display text-lg font-semibold text-fl-cream">{month ? `${MONTHS[month.m - 1]} ${month.y}` : ""}</h2>
              <button type="button" onClick={() => step(1)} className="rounded-md px-2 py-1 text-fl-cream/60 hover:text-fl-cream" aria-label="Следующий месяц">›</button>
            </div>
            <select value={filter} onChange={(e) => setFilter(e.target.value)} className={`${field} w-auto`}>
              <option value="all">Все компании</option>
              {companyOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div className="grid grid-cols-7 gap-1 text-xs">
            {DAYS.map((x) => <div key={x} className="px-1 py-1 text-center text-fl-cream/45">{x}</div>)}
            {grid.map((day, i) => {
              const list = day ? byDay.get(day) ?? [] : [];
              const isToday = day === data?.today;
              return (
                <div key={i} className={`min-h-[74px] rounded-md border p-1 ${day ? "border-fl-line/70" : "border-transparent"} ${isToday ? "ring-1 ring-fl-gold" : ""}`}>
                  {day && <p className={`text-right ${isToday ? "font-semibold text-fl-gold" : "text-fl-cream/50"}`}>{+day.slice(8)}</p>}
                  {list.slice(0, 3).map((e) => (
                    <button key={`${e.companyId}-${e.key}`} type="button" onClick={() => setPicked(`${e.companyId}-${e.key}`)} className={`mt-0.5 block w-full truncate rounded px-1 text-left text-[11px] ${tone(e)}`} title={`${e.companyName}: ${e.title}`}>
                      {e.form.replace("STI-", "")} {filter === "all" ? e.companyName.replace(/^(ОсОО|ИП|ОАО|ЗАО)\s*/, "").slice(0, 10) : ""}
                    </button>
                  ))}
                  {list.length > 3 && <p className="text-[10px] text-fl-cream/45">ещё {list.length - 3}</p>}
                </div>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-fl-cream/45">Цвет: золотой — впереди, жёлтый — 3 дня и меньше, красный — просрочен, зелёный — сдан.</p>
        </section>

        <section className={`${card} p-4`}>
          <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Ближайшие сроки</h2>
          {upcoming.length === 0 ? <p className="text-sm text-fl-cream/60">Несданных отчётов нет.</p> : (
            <ul className="max-h-[560px] space-y-2 overflow-y-auto pr-1">
              {upcoming.map((e) => {
                const id = `${e.companyId}-${e.key}`;
                return (
                  <li key={id} className={`rounded-lg border px-3 py-2 text-sm ${picked === id ? "border-fl-gold" : "border-fl-line/70"}`}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-medium text-fl-cream">{e.form} · {d(e.deadline)}</span>
                      <span className={`rounded-full px-2 py-0.5 text-xs ${tone(e)}`}>{when(e)}</span>
                    </div>
                    <p className="text-fl-cream/75">{e.title} за {e.periodLabel}</p>
                    <p className="text-xs text-fl-cream/50">{e.companyName}{e.amount ? ` · по расчёту ${formatNumber(e.amount, 0)} сом` : ""}</p>
                  </li>
                );
              })}
            </ul>
          )}
          <a href="/taxreports" className="mt-3 inline-block text-sm text-fl-gold hover:underline">Цифры по строкам и отметка о сдаче →</a>
        </section>
      </div>

      <Reminders companies={companyOptions} companyId={companyId} setCompanyId={setCompanyId} data={data} reload={load} show={show} />
    </main>
  );
}

function Reminders({ companies, companyId, setCompanyId, data, reload, show }: {
  companies: Array<{ id: string; name: string }>; companyId: string; setCompanyId: (id: string) => void; data: Data | null; reload: () => Promise<void>;
  show: (m: string, k?: "success" | "error" | "info") => void;
}) {
  const s = data?.settings;
  const [days, setDays] = useState(3);
  const [emails, setEmails] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => { if (s) { setDays(s.daysBefore); setEmails(s.emails.join(", ")); } }, [s]);

  async function save(extra: Record<string, unknown> = {}) {
    setBusy(true);
    try {
      const r = await fetch("/api/calendar", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, daysBefore: days, emails: emails.split(/[,;\s]+/).filter(Boolean), ...extra }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show("Настройки напоминаний сохранены"); await reload();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(false); }
  }
  async function setupBot() {
    try {
      const r = await fetch("/api/telegram/setup", { method: "POST" });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(`Бот подключён к ${b.url}`);
    } catch (e: any) { show(e.message, "error"); }
  }

  if (!companies.length) return null;
  const real = companies.some((c) => c.id === companyId);
  return (
    <section className={`${card} mt-5 p-4 sm:p-5`}>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="font-display text-lg font-semibold text-fl-cream">Напоминания</h2>
        <select value={real ? companyId : ""} onChange={(e) => setCompanyId(e.target.value)} className={`${field} w-auto min-w-[240px]`}>
          {!real && <option value="">Выберите компанию</option>}
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>
      {real && s && (
        <div className="mt-4 grid gap-5 md:grid-cols-2">
          <div className="space-y-3">
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Напоминать за, дней</span>
              <input type="number" min={1} max={30} value={days} onChange={(e) => setDays(Number(e.target.value) || 3)} className={`${field} w-24`} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">E-mail (через запятую)</span>
              <input value={emails} onChange={(e) => setEmails(e.target.value)} placeholder="buh@company.kg, director@company.kg" className={field} /></label>
            {!data?.channels.email && <p className="text-xs text-fl-amber">Почта не настроена на сервере: письма начнут уходить, когда в Vercel появятся RESEND_API_KEY и FL_MAIL_FROM.</p>}
            <button type="button" onClick={() => save()} disabled={busy} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">Сохранить</button>
          </div>
          <div className="space-y-3 text-sm">
            <p className="text-fl-cream/75">Telegram: откройте бота по ссылке и нажмите «Start» — этот чат начнёт получать напоминания по компании. Ссылку можно переслать бухгалтеру или добавить бота в рабочую группу.</p>
            {s.botLink ? (
              <a href={s.botLink} target="_blank" rel="noreferrer" className="inline-block rounded-lg border border-fl-gold/50 px-3 py-2 text-fl-gold hover:bg-fl-gold/10">Открыть бота в Telegram</a>
            ) : (
              <p className="text-xs text-fl-amber">Бот не настроен на сервере: нужны TELEGRAM_BOT_TOKEN, TELEGRAM_BOT_USERNAME и TELEGRAM_WEBHOOK_SECRET в Vercel.</p>
            )}
            {data?.channels.telegram && <button type="button" onClick={setupBot} className="ml-2 text-xs text-fl-cream/50 underline hover:text-fl-cream">подключить бота к сайту (один раз)</button>}
            {s.chats.length > 0 && (
              <ul className="space-y-1">
                {s.chats.map((c) => (
                  <li key={c.id} className="flex items-center justify-between rounded-md border border-fl-line/70 px-3 py-1.5">
                    <span className="text-fl-cream/85">{c.name}<span className="text-xs text-fl-cream/45"> · с {d(c.at.slice(0, 10))}</span></span>
                    <button type="button" onClick={() => save({ removeChat: c.id })} className="text-xs text-fl-cream/45 hover:text-fl-red">отключить</button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
