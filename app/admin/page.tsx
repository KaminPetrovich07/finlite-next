"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useMe } from "@/components/auth/useMe";
import { ROLE_LABEL, type Role } from "@/lib/auth/session";
import { REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";

type Tab = "overview" | "users" | "companies" | "feedback" | "activity";
const TABS: Array<[Tab, string]> = [["overview", "Обзор"], ["users", "Пользователи"], ["companies", "Компании"], ["feedback", "Обратная связь"], ["activity", "Журнал действий"]];

const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const input = "rounded-lg border border-fl-line bg-fl-charcoal px-2.5 py-1.5 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
const dt = (s: string | null) => (s ? new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—");

const ACTION: Record<string, string> = {
  register: "регистрация", login: "вход", password_change: "сменил пароль",
  company_create: "создал компанию", company_update: "изменил настройки компании", company_delete: "удалил компанию",
  demo_copy: "создал копию демо", entry_delete: "удалил проводку", bank_import: "загрузил выписку",
  esg_save: "сохранил ESG-данные", export: "скачал отчёт", access_grant: "открыл доступ", access_revoke: "закрыл доступ",
  admin_user_update: "изменил пользователя", admin_password_reset: "сбросил пароль", admin_user_delete: "удалил пользователя",
  admin_company_owner: "сменил владельца компании",
};

type ToastFn = (m: string, k?: "success" | "error" | "info") => void;

async function api<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init && init.body ? { ...init, headers: { "Content-Type": "application/json" } } : init);
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error ?? "Ошибка запроса");
  return body as T;
}

export default function AdminPage() {
  const { me, loaded } = useMe();
  const [tab, setTab] = useState<Tab>("overview");
  const toast = useToast();

  useEffect(() => {
    const h = window.location.hash.slice(1) as Tab;
    if (TABS.some(([k]) => k === h)) setTab(h);
  }, []);
  const go = (t: Tab) => { setTab(t); history.replaceState(null, "", `#${t}`); };

  if (loaded && me?.role !== "admin") {
    return <main className="mx-auto max-w-3xl px-4 py-16 text-center text-fl-cream/70">Эта страница доступна только администратору.</main>;
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <p className="text-xs font-semibold uppercase tracking-wider text-fl-gold">Администратор</p>
        <h1 className="mt-1 font-display text-3xl font-bold text-fl-cream sm:text-4xl">Управление FinLite</h1>
      </header>
      <div role="tablist" className="mb-6 flex gap-1 overflow-x-auto rounded-xl border border-fl-line bg-fl-charcoal-2 p-1 shadow-card [scrollbar-width:none]">
        {TABS.map(([k, label]) => (
          <button key={k} role="tab" aria-selected={tab === k} onClick={() => go(k)}
            className={`whitespace-nowrap rounded-lg px-4 py-2 text-sm font-medium ${tab === k ? "bg-fl-accent text-fl-on-accent" : "text-fl-cream/70 hover:text-fl-cream"}`}>
            {label}
          </button>
        ))}
      </div>
      {me?.role === "admin" && (
        <>
          {tab === "overview" && <Overview go={go} />}
          {tab === "users" && <Users meId={me.id} toast={toast.show} />}
          {tab === "companies" && <Companies toast={toast.show} />}
          {tab === "feedback" && <Feedback toast={toast.show} />}
          {tab === "activity" && <Activity />}
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

// ── Обзор ──────────────────────────────────────────────────────────────────

interface OverviewData { users: number; companies: number; entries: number; feedbackNew: number; activeWeek: number; exportsWeek: number; roles: Record<string, number> }

function Overview({ go }: { go: (t: Tab) => void }) {
  const [d, setD] = useState<OverviewData | null>(null);
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => { api<OverviewData>("/api/admin/overview").then(setD).catch((e) => setErr(e.message)); }, []);
  if (err) return <p className="text-sm text-fl-red">{err}</p>;
  if (!d) return <p className="text-sm text-fl-cream/50">Загружаю…</p>;
  const tiles: Array<[string, string | number, string, Tab]> = [
    ["Пользователи", d.users, `админ ${d.roles.admin ?? 0} · полный ${d.roles.full ?? 0} · огранич. ${d.roles.limited ?? 0}`, "users"],
    ["Активны за неделю", d.activeWeek, "входили в систему", "users"],
    ["Компании", d.companies, `${d.entries.toLocaleString("ru-RU")} проводок всего`, "companies"],
    ["Новые обращения", d.feedbackNew, "ждут ответа", "feedback"],
    ["Скачано отчётов", d.exportsWeek, "за последние 7 дней", "activity"],
  ];
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {tiles.map(([label, v, note, t]) => (
          <button key={label} onClick={() => go(t)} className={`${card} px-4 py-4 text-left hover:border-fl-gold/40`}>
            <p className="text-xs text-fl-cream/55">{label}</p>
            <p className={`mt-1 font-display text-3xl font-bold ${label === "Новые обращения" && Number(v) > 0 ? "text-fl-gold" : "text-fl-cream"}`}>{v}</p>
            <p className="mt-1 text-xs text-fl-cream/50">{note}</p>
          </button>
        ))}
      </div>
      <section className={`${card} p-5`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Последние действия</h2>
        <Activity compact />
      </section>
    </div>
  );
}

// ── Пользователи ───────────────────────────────────────────────────────────

interface UserRow {
  id: string; email: string; name: string | null; role: Role; blocked: boolean; createdAt: string; lastLoginAt: string | null;
  ownedCompanies: Array<{ id: string; name: string }>;
  access: Array<{ level: string; company: { id: string; name: string } }>;
  _count: { feedback: number; activities: number };
}

function Users({ meId, toast }: { meId: string; toast: ToastFn }) {
  const [rows, setRows] = useState<UserRow[] | null>(null);
  const [q, setQ] = useState("");
  const [temp, setTemp] = useState<{ email: string; password: string } | null>(null);
  const load = useCallback(() => api<UserRow[]>("/api/admin/users").then(setRows).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  async function patch(u: UserRow, data: Record<string, unknown>, ok: string) {
    try {
      const r = await api<{ password?: string }>(`/api/admin/users/${u.id}`, { method: "PATCH", body: JSON.stringify(data) });
      if (r.password) setTemp({ email: u.email, password: r.password });
      else toast(ok);
      load();
    } catch (e: any) { toast(e.message, "error"); }
  }

  async function remove(u: UserRow) {
    if (!confirm(`Удалить пользователя ${u.email}? Его компании останутся без владельца.`)) return;
    try { await api(`/api/admin/users/${u.id}`, { method: "DELETE" }); toast("Пользователь удалён"); load(); } catch (e: any) { toast(e.message, "error"); }
  }

  const list = (rows ?? []).filter((u) => !q || `${u.name} ${u.email}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-3 border-b border-fl-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-fl-cream">Пользователи <span className="text-sm font-normal text-fl-cream/45">{rows?.length ?? ""}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по имени или email" className={`${input} ml-auto w-full sm:w-64`} />
      </div>
      {temp && (
        <div className="mx-5 mt-4 rounded-lg border-l-4 border-fl-gold bg-fl-gold/[0.07] px-4 py-3 text-sm">
          Временный пароль для <b>{temp.email}</b>: <code className="rounded bg-fl-charcoal px-1.5 py-0.5 font-mono text-[15px] text-fl-cream">{temp.password}</code>
          <span className="block text-xs text-fl-cream/60">Передайте его пользователю — он сможет сменить пароль в профиле. Больше он нигде не показывается.</span>
          <button onClick={() => setTemp(null)} className="mt-1 text-xs text-fl-info hover:underline">Скрыть</button>
        </div>
      )}
      {rows === null ? <p className="px-5 py-4 text-sm text-fl-cream/50">Загружаю…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[860px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/55">
              <th className="px-5 py-2.5 font-medium">Пользователь</th><th className="px-3 py-2.5 font-medium">Роль</th>
              <th className="px-3 py-2.5 font-medium">Компании</th><th className="px-3 py-2.5 font-medium">Последний вход</th><th className="px-5 py-2.5 text-right font-medium">Действия</th>
            </tr></thead>
            <tbody className="divide-y divide-fl-line">
              {list.map((u) => (
                <tr key={u.id} className={u.blocked ? "opacity-60" : ""}>
                  <td className="px-5 py-3 align-top">
                    <p className="font-medium text-fl-cream">{u.name ?? "—"}{u.blocked && <span className="ml-2 rounded-full bg-fl-red/15 px-2 py-0.5 text-[11px] text-fl-red">заблокирован</span>}</p>
                    <p className="text-xs text-fl-cream/55">{u.email}</p>
                    <p className="text-[11px] text-fl-cream/40">с {dt(u.createdAt)} · обращений {u._count.feedback}</p>
                  </td>
                  <td className="px-3 py-3 align-top">
                    <select value={u.role} disabled={u.id === meId} onChange={(e) => patch(u, { role: e.target.value }, "Роль изменена")} className={input}>
                      {(Object.keys(ROLE_LABEL) as Role[]).map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                    </select>
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-fl-cream/70">
                    {u.ownedCompanies.length === 0 && u.access.length === 0 ? <span className="text-fl-cream/40">нет</span> : (
                      <ul className="space-y-0.5">
                        {u.ownedCompanies.map((c) => <li key={c.id}>{c.name} <span className="text-fl-cream/40">владелец</span></li>)}
                        {u.access.map((a) => <li key={a.company.id}>{a.company.name} <span className="text-fl-cream/40">{a.level === "edit" ? "ред." : "просмотр"}</span></li>)}
                      </ul>
                    )}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-fl-cream/70">{dt(u.lastLoginAt)}</td>
                  <td className="px-5 py-3 text-right align-top">
                    {u.id !== meId && (
                      <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                        <button onClick={() => patch(u, { resetPassword: true }, "")} className="text-fl-info hover:underline">сбросить пароль</button>
                        <button onClick={() => patch(u, { blocked: !u.blocked }, u.blocked ? "Разблокирован" : "Заблокирован")} className="text-fl-amber hover:underline">{u.blocked ? "разблокировать" : "заблокировать"}</button>
                        <button onClick={() => remove(u)} className="text-fl-red hover:underline">удалить</button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Компании ───────────────────────────────────────────────────────────────

interface CompanyRow {
  id: string; name: string; inn: string | null; defaultRegime: string | null; createdAt: string; lastEntry: string | null;
  owner: { id: string; name: string | null; email: string } | null;
  access: Array<{ level: string; user: { id: string; name: string | null; email: string } }>;
  _count: { journalEntries: number; bankTransactions: number; esgReports: number };
}

function Companies({ toast }: { toast: ToastFn }) {
  const [rows, setRows] = useState<CompanyRow[] | null>(null);
  const [q, setQ] = useState("");
  const load = useCallback(() => api<CompanyRow[]>("/api/admin/companies").then(setRows).catch((e) => toast(e.message, "error")), [toast]);
  useEffect(() => { load(); }, [load]);

  async function setOwner(c: CompanyRow) {
    const email = prompt(`Email нового владельца «${c.name}» (пусто — без владельца):`, c.owner?.email ?? "");
    if (email === null) return;
    try { await api(`/api/admin/companies/${c.id}`, { method: "PATCH", body: JSON.stringify({ ownerEmail: email.trim() || null }) }); toast("Владелец изменён"); load(); }
    catch (e: any) { toast(e.message, "error"); }
  }
  async function remove(c: CompanyRow) {
    if (prompt(`Удаление «${c.name}» сотрёт её журнал (${c._count.journalEntries} проводок), выписки и ESG-данные. Введите название компании для подтверждения:`) !== c.name) return;
    try { await api(`/api/companies/${c.id}`, { method: "DELETE" }); toast("Компания удалена"); load(); } catch (e: any) { toast(e.message, "error"); }
  }
  function open(id: string, path: string) {
    try { localStorage.setItem("finlite:companyId", id); } catch { /* storage blocked */ }
    window.location.href = path;
  }

  const list = (rows ?? []).filter((c) => !q || `${c.name} ${c.inn ?? ""} ${c.owner?.email ?? ""}`.toLowerCase().includes(q.toLowerCase()));
  return (
    <section className={card}>
      <div className="flex flex-wrap items-center gap-3 border-b border-fl-line px-5 py-4">
        <h2 className="font-display text-lg font-semibold text-fl-cream">Все компании <span className="text-sm font-normal text-fl-cream/45">{rows?.length ?? ""}</span></h2>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Название, ИНН или email владельца" className={`${input} ml-auto w-full sm:w-72`} />
      </div>
      {rows === null ? <p className="px-5 py-4 text-sm text-fl-cream/50">Загружаю…</p> : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[900px] text-sm">
            <thead><tr className="text-left text-xs text-fl-cream/55">
              <th className="px-5 py-2.5 font-medium">Компания</th><th className="px-3 py-2.5 font-medium">Владелец</th><th className="px-3 py-2.5 font-medium">Доступ</th>
              <th className="px-3 py-2.5 text-right font-medium">Проводок</th><th className="px-3 py-2.5 font-medium">Последняя операция</th><th className="px-5 py-2.5 text-right font-medium">Действия</th>
            </tr></thead>
            <tbody className="divide-y divide-fl-line">
              {list.map((c) => (
                <tr key={c.id}>
                  <td className="px-5 py-3 align-top">
                    <p className="font-medium text-fl-cream">{c.name}</p>
                    <p className="text-xs text-fl-cream/55">{[c.inn && `ИНН ${c.inn}`, c.defaultRegime && c.defaultRegime in REGIME_INFO ? REGIME_INFO[c.defaultRegime as RegimeKey].short : "режим не выбран"].filter(Boolean).join(" · ")}</p>
                  </td>
                  <td className="px-3 py-3 align-top text-xs">
                    {c.owner ? <><p className="text-fl-cream/85">{c.owner.name ?? "—"}</p><p className="text-fl-cream/50">{c.owner.email}</p></> : <span className="text-fl-amber">нет владельца</span>}
                  </td>
                  <td className="px-3 py-3 align-top text-xs text-fl-cream/70">
                    {c.access.length === 0 ? <span className="text-fl-cream/40">—</span> : c.access.map((a) => <p key={a.user.id}>{a.user.email} <span className="text-fl-cream/40">{a.level === "edit" ? "ред." : "просм."}</span></p>)}
                  </td>
                  <td className="num px-3 py-3 text-right align-top text-fl-cream/85">{c._count.journalEntries}</td>
                  <td className="px-3 py-3 align-top text-xs text-fl-cream/70">{c.lastEntry ? new Date(c.lastEntry).toLocaleDateString("ru-RU") : "—"}</td>
                  <td className="px-5 py-3 text-right align-top">
                    <div className="flex flex-wrap justify-end gap-x-3 gap-y-1 text-xs">
                      <button onClick={() => open(c.id, "/reports")} className="text-fl-info hover:underline">отчётность</button>
                      <button onClick={() => open(c.id, "/ledger")} className="text-fl-info hover:underline">журнал</button>
                      <button onClick={() => setOwner(c)} className="text-fl-amber hover:underline">владелец</button>
                      <button onClick={() => remove(c)} className="text-fl-red hover:underline">удалить</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

// ── Обратная связь ─────────────────────────────────────────────────────────

interface FeedbackRow {
  id: string; kind: string; page: string | null; message: string; status: string; reply: string | null; repliedAt: string | null; createdAt: string;
  user: { name: string | null; email: string; role: string } | null;
}
const KIND: Record<string, string> = { idea: "Идея", bug: "Ошибка", question: "Вопрос", other: "Другое" };
const STATUS: Array<[string, string]> = [["new", "Новые"], ["in_progress", "В работе"], ["done", "Решённые"], ["", "Все"]];

function Feedback({ toast }: { toast: ToastFn }) {
  const [status, setStatus] = useState("new");
  const [rows, setRows] = useState<FeedbackRow[] | null>(null);
  const load = useCallback(() => {
    setRows(null);
    api<FeedbackRow[]>(`/api/admin/feedback${status ? `?status=${status}` : ""}`).then(setRows).catch((e) => toast(e.message, "error"));
  }, [status, toast]);
  useEffect(() => { load(); }, [load]);

  async function update(id: string, data: { status?: string; reply?: string }, ok: string) {
    try { await api(`/api/admin/feedback/${id}`, { method: "PATCH", body: JSON.stringify(data) }); toast(ok); load(); } catch (e: any) { toast(e.message, "error"); }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-2">
        {STATUS.map(([k, label]) => (
          <button key={k} onClick={() => setStatus(k)} className={`rounded-full border px-3.5 py-1.5 text-sm ${status === k ? "border-fl-accent bg-fl-accent text-fl-on-accent" : "border-fl-line text-fl-cream/75"}`}>{label}</button>
        ))}
      </div>
      {rows === null ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : rows.length === 0 ? (
        <p className={`${card} px-5 py-8 text-center text-sm text-fl-cream/55`}>Обращений нет.</p>
      ) : rows.map((f) => <FeedbackCard key={f.id} f={f} onUpdate={update} />)}
    </div>
  );
}

function FeedbackCard({ f, onUpdate }: { f: FeedbackRow; onUpdate: (id: string, d: { status?: string; reply?: string }, ok: string) => void }) {
  const [reply, setReply] = useState(f.reply ?? "");
  return (
    <article className={`${card} p-5`}>
      <div className="flex flex-wrap items-center gap-2 text-xs text-fl-cream/55">
        <span className="rounded-full bg-fl-gold/15 px-2 py-0.5 font-semibold text-fl-gold">{KIND[f.kind] ?? f.kind}</span>
        <span className="font-medium text-fl-cream/85">{f.user?.name ?? "—"}</span>
        <span>{f.user?.email}</span>
        <span>· {dt(f.createdAt)}</span>
        {f.page && <span>· страница {f.page}</span>}
      </div>
      <p className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-fl-cream">{f.message}</p>
      <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Ответ пользователю — он увидит его в профиле"
        className="mt-4 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none" />
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => onUpdate(f.id, { reply, status: reply.trim() ? "done" : f.status }, "Ответ отправлен")} disabled={!reply.trim() || reply === (f.reply ?? "")}
          className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">Ответить и закрыть</button>
        {f.status !== "in_progress" && <button onClick={() => onUpdate(f.id, { status: "in_progress" }, "Взято в работу")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80">В работу</button>}
        {f.status !== "done" && <button onClick={() => onUpdate(f.id, { status: "done" }, "Отмечено решённым")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80">Решено</button>}
        {f.status === "done" && <button onClick={() => onUpdate(f.id, { status: "new" }, "Открыто снова")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80">Открыть снова</button>}
      </div>
    </article>
  );
}

// ── Журнал действий ────────────────────────────────────────────────────────

interface ActivityRow { id: string; action: string; createdAt: string; companyName: string | null; details: Record<string, unknown> | null; user: { name: string | null; email: string } | null }

function detailText(a: ActivityRow): string {
  const d = a.details ?? {};
  if (a.action === "export") return `${String(d.package ?? "")} · ${String(d.format ?? "").toUpperCase()} · ${String(d.from ?? "")}…${String(d.to ?? "")}`;
  if (a.action === "bank_import") return `${String(d.file ?? "")} · ${String(d.count ?? "")} операций`;
  if (a.action === "access_grant") return `${String(d.email ?? "")} · ${d.level === "edit" ? "редактирование" : "просмотр"}`;
  if (a.action === "admin_user_update" || a.action === "admin_password_reset") return [d.email, d.role ? `роль: ${ROLE_LABEL[d.role as Role] ?? d.role}` : "", d.blocked === true ? "заблокирован" : d.blocked === false ? "разблокирован" : ""].filter(Boolean).join(" · ");
  if (a.action === "company_create" || a.action === "company_delete") return String(d.name ?? "");
  if (a.action === "entry_delete") return String(d.description ?? "");
  return "";
}

function Activity({ compact = false }: { compact?: boolean }) {
  const [rows, setRows] = useState<ActivityRow[] | null>(null);
  useEffect(() => { api<ActivityRow[]>(`/api/admin/activity?limit=${compact ? 12 : 200}`).then(setRows).catch(() => setRows([])); }, [compact]);
  if (rows === null) return <p className="mt-3 text-sm text-fl-cream/50">Загружаю…</p>;
  if (rows.length === 0) return <p className="mt-3 text-sm text-fl-cream/55">Действий пока нет.</p>;
  const table = (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <tbody className="divide-y divide-fl-line">
          {rows.map((a) => (
            <tr key={a.id}>
              <td className="whitespace-nowrap py-2 pr-3 text-xs text-fl-cream/50">{dt(a.createdAt)}</td>
              <td className="py-2 pr-3 text-fl-cream/85">{a.user?.name ?? a.user?.email ?? "—"}</td>
              <td className="py-2 pr-3 text-fl-cream/85">{ACTION[a.action] ?? a.action}{a.companyName ? <span className="text-fl-cream/55"> · {a.companyName}</span> : null}</td>
              <td className="py-2 text-xs text-fl-cream/55">{detailText(a)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
  return compact ? <div className="mt-3">{table}</div> : <section className={`${card} p-5`}>{table}</section>;
}
