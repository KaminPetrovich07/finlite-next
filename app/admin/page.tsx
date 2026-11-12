"use client";

import { useCallback, useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/chart-theme";
import { PLANS, PLAN_ORDER, planKey } from "@/lib/plans";
import { reviewOverdue, TAX_RULES } from "@/lib/tax-rules";
import { card, field, ghostBtn } from "@/components/auth/ui";

type Tab = "metrics" | "users" | "companies" | "feedback";
const TABS: Array<[Tab, string]> = [["metrics", "Метрики"], ["users", "Пользователи"], ["companies", "Компании"], ["feedback", "Обратная связь"]];
const pct = (x: number | null | undefined) => (x == null ? "—" : `${Math.round(x * 100)} %`);
const date = (d: string | null) => (d ? new Date(d).toLocaleDateString("ru-RU") : "—");

export default function AdminPage() {
  const [tab, setTab] = useState<Tab>("metrics");
  const [allowed, setAllowed] = useState<boolean | null>(null);
  useEffect(() => { fetch("/api/auth/me").then((r) => r.json()).then((b) => setAllowed(b?.user?.role === "admin")).catch(() => setAllowed(false)); }, []);

  if (allowed === null) return <main className="mx-auto max-w-6xl px-4 py-10 text-sm text-fl-cream/50">Загружаю…</main>;
  if (!allowed) return <main className="mx-auto max-w-6xl px-4 py-10 text-fl-cream/70">Раздел доступен только администратору.</main>;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <h1 className="font-display text-3xl font-bold text-fl-cream">Администрирование</h1>
      {reviewOverdue() && (
        <p className="mt-3 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-4 py-2.5 text-sm text-fl-cream/85">
          Налоговые правила последний раз сверялись {TAX_RULES.reviewed.split("-").reverse().join(".")}. Пора сверить ставки с действующей редакцией НК КР
          и при изменениях добавить новую версию в <code>lib/tax-rules.ts</code>.
        </p>
      )}
      <div role="tablist" className="mt-5 flex flex-wrap gap-1 border-b border-fl-line">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)}
            className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-fl-gold font-semibold text-fl-cream" : "border-transparent text-fl-cream/60 hover:text-fl-cream"}`}>
            {label}
          </button>
        ))}
      </div>
      <div className="mt-5">
        {tab === "metrics" && <Metrics />}
        {tab === "users" && <Users />}
        {tab === "companies" && <Companies />}
        {tab === "feedback" && <Feedback />}
      </div>
    </main>
  );
}

interface M {
  users: number; newUsers7: number; dau: number; wau: number; mau: number; stickiness: number | null;
  daily: Array<{ day: string; active: number; registered: number }>;
  cohorts: Array<{ week: string; size: number; retention: Array<number | null> }>;
  funnel: Array<{ step: string; users: number; share: number }>;
  companies: number; entries: number; feedbackNew: number;
}

function Tile({ label, value, hint }: { label: string; value: string | number; hint?: string }) {
  return (
    <div className={`${card} px-4 py-3`}>
      <p className="label-caps">{label}</p>
      <p className="num mt-1 font-display text-2xl font-bold text-fl-cream">{value}</p>
      {hint && <p className="text-xs text-fl-cream/50">{hint}</p>}
    </div>
  );
}

function Metrics() {
  const [m, setM] = useState<M | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    fetch("/api/admin/metrics").then(async (r) => { const b = await r.json(); if (!r.ok) setError(b.error); else setM(b); }).catch(() => setError("Нет связи с сервером"));
  }, []);
  if (error) return <p className="text-sm text-fl-red">{error}</p>;
  if (!m) return <p className="text-sm text-fl-cream/50">Считаю…</p>;
  return (
    <div className="space-y-5">
      <p className="text-sm text-fl-cream/60">Без учёта администраторов. Активность — вход или работа в системе в течение дня (время Бишкека).</p>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Tile label="Пользователи" value={m.users} hint={`+${m.newUsers7} за 7 дней`} />
        <Tile label="Активны сегодня (DAU)" value={m.dau} />
        <Tile label="За 7 дней (WAU)" value={m.wau} />
        <Tile label="За 30 дней (MAU)" value={m.mau} hint={`DAU/MAU ${pct(m.stickiness)}`} />
        <Tile label="Компаний" value={m.companies} />
        <Tile label="Проводок" value={m.entries.toLocaleString("ru-RU")} />
        <Tile label="Новых сообщений" value={m.feedbackNew} />
      </div>
      <section className={`${card} p-4`}>
        <h2 className="font-display text-base font-semibold text-fl-cream">Активные пользователи по дням, 30 дней</h2>
        <div className="mt-3 h-56">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={m.daily} margin={{ top: 8, right: 8, left: -16, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="day" tickFormatter={(d: string) => d.slice(8, 10) + "." + d.slice(5, 7)} tick={{ fill: CHART.axis, fontSize: 11 }} interval={4} />
              <YAxis allowDecimals={false} tick={{ fill: CHART.axis, fontSize: 11 }} />
              <Tooltip contentStyle={CHART.tooltip} labelFormatter={(d) => new Date(String(d)).toLocaleDateString("ru-RU")} formatter={(v, n) => [v, n === "active" ? "активны" : "новые"]} />
              <Bar dataKey="active" fill={CHART.s1} radius={[3, 3, 0, 0]} />
              <Bar dataKey="registered" fill={CHART.s2} radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <p className="mt-2 flex gap-4 text-xs text-fl-cream/60">
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART.s1 }} />активны</span>
          <span><span className="mr-1.5 inline-block h-2.5 w-2.5 rounded-sm" style={{ background: CHART.s2 }} />зарегистрировались</span>
        </p>
      </section>
      <section className={`${card} p-4`}>
        <h2 className="font-display text-base font-semibold text-fl-cream">Воронка пилота</h2>
        <div className="mt-3 space-y-2">
          {m.funnel.map((f) => (
            <div key={f.step} className="grid grid-cols-[minmax(10rem,16rem)_1fr_5rem] items-center gap-3 text-sm">
              <span className="text-fl-cream/80">{f.step}</span>
              <div className="h-3 rounded bg-fl-surface-2"><div className="h-3 rounded" style={{ width: `${f.share * 100}%`, background: CHART.s1 }} /></div>
              <span className="num text-right text-fl-cream">{f.users} · {pct(f.share)}</span>
            </div>
          ))}
        </div>
      </section>
      <section className={`${card} overflow-x-auto p-4`}>
        <h2 className="font-display text-base font-semibold text-fl-cream">Удержание по неделям регистрации</h2>
        <p className="mt-1 text-xs text-fl-cream/55">Доля когорты, которая была активна на неделе N после регистрации. Неделя 0 — неделя регистрации.</p>
        <table className="num mt-3 w-full min-w-[640px] table-fixed text-sm">
          <thead><tr className="text-xs text-fl-cream/55"><th className="py-1 text-left font-medium">Неделя с</th><th className="w-14 pr-3 text-right font-medium">Чел.</th>{m.cohorts[0]?.retention.map((_, i) => <th key={i} className="w-16 text-center font-medium">{i}</th>)}</tr></thead>
          <tbody>
            {m.cohorts.map((c) => (
              <tr key={c.week} className="border-t border-fl-line">
                <td className="py-1.5 text-fl-cream/80">{c.week.split("-").reverse().join(".")}</td>
                <td className="pr-3 text-right text-fl-cream/80">{c.size}</td>
                {c.retention.map((r, i) => (
                  <td key={i} className="w-16 px-0.5 py-1 text-center">
                    {r == null || !c.size ? <span className="text-fl-cream/25">·</span> : (
                      <span className="block rounded px-1 py-0.5 text-xs" style={{ background: `rgb(var(--c-s1) / ${0.08 + r * 0.6})`, color: r > 0.55 ? "white" : undefined }}>{pct(r)}</span>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

interface U {
  id: string; email: string; name: string | null; organization: string | null; phone: string | null; role: string; blocked: boolean;
  plan: string; paidUntil: string | null; planNote: string | null; createdAt: string; lastLoginAt: string | null; lastSeenAt: string | null;
  lockedUntil: string | null; companies: number; entries: number; feedback: number;
}

function Users() {
  const [rows, setRows] = useState<U[] | null>(null);
  const [q, setQ] = useState("");
  const [link, setLink] = useState<{ email: string; link: string } | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/users"); setRows(r.ok ? await r.json() : []); }, []);
  useEffect(() => { load(); }, [load]);

  async function patch(id: string, data: Record<string, unknown>) {
    const r = await fetch(`/api/admin/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); alert(b.error ?? "Ошибка"); }
    load();
  }
  async function reset(id: string) {
    const r = await fetch(`/api/admin/users/${id}/reset`, { method: "POST" });
    const b = await r.json();
    if (r.ok) setLink({ email: b.email, link: b.link });
  }

  const list = (rows ?? []).filter((u) => !q || [u.email, u.name, u.organization].some((x) => x?.toLowerCase().includes(q.toLowerCase())));
  return (
    <div className="space-y-3">
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по e-mail, имени, организации" className={`${field} max-w-md`} />
      {link && (
        <div className="rounded-lg border-l-4 border-fl-gold bg-fl-gold/10 p-3 text-sm">
          <p>Ссылка для смены пароля {link.email} (действует 24 часа, одноразовая). Передайте её лично:</p>
          <div className="mt-2 flex gap-2"><input readOnly value={link.link} className={field} onFocus={(e) => e.target.select()} /><button onClick={() => navigator.clipboard.writeText(link.link)} className={ghostBtn}>Копировать</button></div>
        </div>
      )}
      {rows === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/55">
              <th className="py-2 font-medium">Пользователь</th><th className="font-medium">Использование</th><th className="font-medium">Тариф</th><th className="font-medium">Оплачен до</th><th className="font-medium">Действия</th>
            </tr></thead>
            <tbody>
              {list.map((u) => (
                <tr key={u.id} className={`border-t border-fl-line align-top ${u.blocked ? "opacity-50" : ""}`}>
                  <td className="py-2 pr-3">
                    <p className="font-medium text-fl-cream">{u.name ?? "—"} {u.role === "admin" && <span className="text-xs text-fl-gold">админ</span>}{u.blocked && <span className="ml-1 text-xs text-fl-red">заблокирован</span>}</p>
                    <p className="text-xs text-fl-cream/60">{u.email}{u.phone ? ` · ${u.phone}` : ""}</p>
                    {u.organization && <p className="text-xs text-fl-cream/60">{u.organization}</p>}
                    <p className="text-xs text-fl-cream/45">с {date(u.createdAt)}</p>
                  </td>
                  <td className="pr-3 text-xs text-fl-cream/70">
                    компаний {u.companies} · проводок {u.entries}<br />
                    последний визит {date(u.lastSeenAt ?? u.lastLoginAt)}<br />
                    сообщений {u.feedback}
                  </td>
                  <td className="pr-3">
                    <select value={planKey(u.plan)} onChange={(e) => patch(u.id, { plan: e.target.value })} className="rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-xs text-fl-cream">
                      {PLAN_ORDER.map((k) => <option key={k} value={k}>{PLANS[k].name}{PLANS[k].semesterOnly ? ` · ${PLANS[k].priceSemesterKgs}/сем.` : PLANS[k].priceKgs ? ` · ${PLANS[k].contract ? "от " : ""}${PLANS[k].priceKgs}` : ""}</option>)}
                    </select>
                  </td>
                  <td className="pr-3">
                    <input type="date" defaultValue={u.paidUntil?.slice(0, 10) ?? ""} onBlur={(e) => { const v = e.target.value || null; if (v !== (u.paidUntil?.slice(0, 10) ?? null)) patch(u.id, { paidUntil: v }); }}
                      className="rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-xs text-fl-cream" />
                  </td>
                  <td className="space-x-2 whitespace-nowrap text-xs">
                    <button onClick={() => reset(u.id)} className="text-fl-info hover:underline">ссылка сброса</button>
                    <button onClick={() => patch(u.id, { blocked: !u.blocked })} className="text-fl-red/80 hover:underline">{u.blocked ? "разблокировать" : "заблокировать"}</button>
                    {u.lockedUntil && new Date(u.lockedUntil) > new Date() && <button onClick={() => patch(u.id, { unlock: true })} className="text-fl-cream/70 hover:underline">снять блокировку входа</button>}
                    <button onClick={() => patch(u.id, { role: u.role === "admin" ? "user" : "admin" })} className="text-fl-cream/60 hover:underline">{u.role === "admin" ? "снять админа" : "сделать админом"}</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

interface C { id: string; name: string; inn: string | null; createdAt: string; owner: { email: string; name: string | null } | null; entries: number; shared: number }

function Companies() {
  const [rows, setRows] = useState<C[] | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/companies"); setRows(r.ok ? await r.json() : []); }, []);
  useEffect(() => { load(); }, [load]);
  async function assign(id: string) {
    const email = prompt("E-mail нового владельца (пользователь должен быть зарегистрирован):");
    if (!email) return;
    const r = await fetch(`/api/admin/companies/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ownerEmail: email }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); alert(b.error ?? "Ошибка"); }
    load();
  }
  if (!rows) return <p className="text-sm text-fl-cream/50">Загружаю…</p>;
  const orphans = rows.filter((c) => !c.owner).length;
  return (
    <div>
      {orphans > 0 && <p className="mb-3 rounded-lg border-l-4 border-fl-amber bg-fl-amber/10 px-4 py-2.5 text-sm">Без владельца: {orphans}. Это компании, созданные до включения входа, — их видит только администратор. Назначьте владельца.</p>}
      <div className="overflow-x-auto">
        <table className="w-full min-w-[720px] text-sm">
          <thead><tr className="text-left text-xs text-fl-cream/55"><th className="py-2 font-medium">Компания</th><th className="font-medium">Владелец</th><th className="text-right font-medium">Проводок</th><th className="text-right font-medium">Доступов</th><th className="font-medium" /></tr></thead>
          <tbody>
            {rows.map((c) => (
              <tr key={c.id} className="border-t border-fl-line">
                <td className="py-2 pr-3"><p className="text-fl-cream">{c.name}</p><p className="text-xs text-fl-cream/50">{c.inn ? `ИНН ${c.inn} · ` : ""}с {date(c.createdAt)}</p></td>
                <td className="pr-3 text-fl-cream/80">{c.owner ? c.owner.email : <span className="text-fl-amber">нет</span>}</td>
                <td className="num pr-3 text-right">{c.entries}</td>
                <td className="num pr-3 text-right">{c.shared}</td>
                <td className="text-right"><button onClick={() => assign(c.id)} className="text-xs text-fl-info hover:underline">{c.owner ? "сменить владельца" : "назначить владельца"}</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface F { id: string; kind: string; page: string | null; message: string; status: string; reply: string | null; createdAt: string; user: { email: string; name: string | null; organization: string | null } | null }

function Feedback() {
  const [rows, setRows] = useState<F[] | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/admin/feedback"); setRows(r.ok ? await r.json() : []); }, []);
  useEffect(() => { load(); }, [load]);
  async function patch(id: string, data: Record<string, unknown>) {
    await fetch(`/api/admin/feedback/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    load();
  }
  const kinds: Record<string, string> = { idea: "идея", bug: "ошибка", question: "вопрос", other: "другое" };
  if (!rows) return <p className="text-sm text-fl-cream/50">Загружаю…</p>;
  if (!rows.length) return <p className="text-sm text-fl-cream/60">Сообщений пока нет.</p>;
  return (
    <ul className="space-y-3">
      {rows.map((f) => (
        <li key={f.id} className={`${card} p-4`}>
          <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-fl-cream/55">
            <span>{new Date(f.createdAt).toLocaleString("ru-RU")} · {kinds[f.kind] ?? f.kind}{f.page ? ` · ${f.page}` : ""} · {f.user ? `${f.user.name ?? ""} ${f.user.email}${f.user.organization ? `, ${f.user.organization}` : ""}` : "без входа"}</span>
            <select value={f.status} onChange={(e) => patch(f.id, { status: e.target.value })} className="rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-xs text-fl-cream">
              <option value="new">новое</option><option value="in_progress">в работе</option><option value="done">решено</option>
            </select>
          </div>
          <p className="mt-2 whitespace-pre-wrap text-sm text-fl-cream">{f.message}</p>
          {f.user ? (
            <textarea defaultValue={f.reply ?? ""} placeholder="Ответ увидит пользователь в своём аккаунте" onBlur={(e) => { if (e.target.value !== (f.reply ?? "")) patch(f.id, { reply: e.target.value || null }); }}
              className={`${field} mt-2 min-h-[64px]`} />
          ) : <p className="mt-2 text-xs text-fl-cream/45">Пользователь не вошёл в систему — ответить можно только по контакту из текста.</p>}
        </li>
      ))}
    </ul>
  );
}
