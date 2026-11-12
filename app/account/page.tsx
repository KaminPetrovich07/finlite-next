"use client";

import { useCallback, useEffect, useState } from "react";
import { card, ErrorNote, field, ghostBtn } from "@/components/auth/ui";

interface Me {
  user: { id: string; email: string; name: string | null; organization: string | null; role: string; plan: string; paidUntil: string | null } | null;
  plan?: { key: string; name: string; companies: number | null; entriesPerMonth: number | null; paid?: boolean };
  owned?: number;
}
interface Sess { createdAt: string; lastSeenAt: string; ip: string | null; userAgent: string | null; current: boolean }
interface Msg { id: string; kind: string; message: string; status: string; reply: string | null; createdAt: string }

const fmt = (d: string) => new Date(d).toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
const browser = (ua: string | null) => {
  if (!ua) return "Неизвестный браузер";
  const os = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "";
  const b = /Edg\//.test(ua) ? "Edge" : /YaBrowser/.test(ua) ? "Яндекс Браузер" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Браузер";
  return [b, os].filter(Boolean).join(", ");
};

export default function AccountPage() {
  const [me, setMe] = useState<Me | null>(null);
  const load = useCallback(async () => {
    const r = await fetch("/api/auth/me");
    setMe(await r.json().catch(() => ({ user: null })));
  }, []);
  useEffect(() => { load(); }, [load]);

  if (!me) return <main className="mx-auto max-w-3xl px-4 py-10 text-sm text-fl-cream/50">Загружаю…</main>;
  if (!me.user) {
    return (
      <main className="mx-auto max-w-3xl px-4 py-10">
        <p className="text-fl-cream/70">Вы не вошли в систему. <a href="/login?next=/account" className="font-semibold text-fl-gold underline">Войти</a></p>
      </main>
    );
  }
  const u = me.user;
  return (
    <main className="mx-auto max-w-3xl space-y-5 px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header>
        <h1 className="font-display text-3xl font-bold text-fl-cream">Мой аккаунт</h1>
        <p className="mt-1 text-sm text-fl-cream/60">{u.email}{u.role === "admin" ? " · администратор" : ""}</p>
      </header>
      <Profile u={u} onSaved={load} />
      <section className={`${card} p-5`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Тариф</h2>
        <p className="mt-2 text-sm text-fl-cream/80">
          <span className="font-semibold text-fl-gold">{me.plan?.name}</span>
          {u.paidUntil && me.plan?.paid && <> · оплачен до {new Date(u.paidUntil).toLocaleDateString("ru-RU")}</>}
        </p>
        <p className="mt-1 text-sm text-fl-cream/60">
          Компаний: {me.owned}{me.plan?.companies != null ? ` из ${me.plan.companies}` : " (без ограничения)"}; проводок в месяц на компанию: {me.plan?.entriesPerMonth ?? "без ограничения"}.
        </p>
        <a href="/pricing" className={`${ghostBtn} mt-3 inline-block`}>Тарифы</a>
      </section>
      <Password />
      <Sessions />
      <Messages />
      <Data />
    </main>
  );
}

function Profile({ u, onSaved }: { u: NonNullable<Me["user"]>; onSaved: () => void }) {
  const [name, setName] = useState(u.name ?? "");
  const [org, setOrg] = useState(u.organization ?? "");
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null); setMsg(null);
    const res = await fetch("/api/account", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name, organization: org || null, ...(phone ? { phone } : {}) }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setError(b.error ?? "Не удалось сохранить"); return; }
    setMsg("Сохранено"); onSaved();
  }
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Профиль</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-fl-cream/60">Имя<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
        <label className="text-xs text-fl-cream/60">Организация<input value={org} onChange={(e) => setOrg(e.target.value)} className={field} /></label>
        <label className="text-xs text-fl-cream/60">Новый телефон<input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="оставьте пустым, чтобы не менять" className={field} /></label>
      </div>
      <ErrorNote text={error} />
      <div className="mt-3 flex items-center gap-3"><button onClick={save} className={ghostBtn}>Сохранить</button>{msg && <span className="text-sm text-fl-green">{msg}</span>}</div>
    </section>
  );
}

function Password() {
  const [cur, setCur] = useState("");
  const [n1, setN1] = useState("");
  const [n2, setN2] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  async function save() {
    setError(null); setMsg(null);
    if (n1 !== n2) { setError("Новые пароли не совпадают"); return; }
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next: n1 }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setError(b.error ?? "Не удалось сменить пароль"); return; }
    setCur(""); setN1(""); setN2(""); setMsg("Пароль изменён. Другие браузеры вышли из аккаунта.");
  }
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Пароль</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-fl-cream/60">Текущий<input type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} className={field} /></label>
        <label className="text-xs text-fl-cream/60">Новый<input type="password" autoComplete="new-password" value={n1} onChange={(e) => setN1(e.target.value)} className={field} /></label>
        <label className="text-xs text-fl-cream/60">Новый ещё раз<input type="password" autoComplete="new-password" value={n2} onChange={(e) => setN2(e.target.value)} className={field} /></label>
      </div>
      <ErrorNote text={error} />
      <div className="mt-3 flex items-center gap-3"><button onClick={save} className={ghostBtn}>Сменить пароль</button>{msg && <span className="text-sm text-fl-green">{msg}</span>}</div>
    </section>
  );
}

function Sessions() {
  const [rows, setRows] = useState<Sess[] | null>(null);
  const load = useCallback(async () => { const r = await fetch("/api/auth/sessions"); setRows(r.ok ? await r.json() : []); }, []);
  useEffect(() => { load(); }, [load]);
  async function revoke() { await fetch("/api/auth/sessions", { method: "DELETE" }); load(); }
  async function logout() { await fetch("/api/auth/logout", { method: "POST" }); window.location.href = "/login"; }
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Где выполнен вход</h2>
      <ul className="mt-3 divide-y divide-fl-line text-sm">
        {(rows ?? []).map((s, i) => (
          <li key={i} className="flex flex-wrap justify-between gap-2 py-2">
            <span className="text-fl-cream">{browser(s.userAgent)}{s.current && <span className="ml-2 text-xs text-fl-green">этот браузер</span>}</span>
            <span className="text-fl-cream/55">{s.ip ?? "IP неизвестен"} · активность {fmt(s.lastSeenAt)}</span>
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={revoke} className={ghostBtn}>Выйти на всех других устройствах</button>
        <button onClick={logout} className={ghostBtn}>Выйти</button>
      </div>
    </section>
  );
}

function Messages() {
  const [rows, setRows] = useState<Msg[]>([]);
  useEffect(() => { fetch("/api/feedback").then((r) => r.json()).then((b) => setRows(Array.isArray(b) ? b : [])).catch(() => undefined); }, []);
  if (!rows.length) return null;
  const status: Record<string, string> = { new: "новое", in_progress: "в работе", done: "решено" };
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Мои сообщения создателю</h2>
      <ul className="mt-3 space-y-3 text-sm">
        {rows.map((m) => (
          <li key={m.id} className="rounded-lg border border-fl-line p-3">
            <p className="text-xs text-fl-cream/50">{fmt(m.createdAt)} · {status[m.status] ?? m.status}</p>
            <p className="mt-1 whitespace-pre-wrap text-fl-cream/85">{m.message}</p>
            {m.reply && <p className="mt-2 whitespace-pre-wrap rounded-md bg-fl-gold/10 px-3 py-2 text-fl-cream"><span className="font-semibold text-fl-gold">Ответ: </span>{m.reply}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

function Data() {
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    setError(null);
    const res = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ password, confirm }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setError(b.error ?? "Не удалось удалить аккаунт"); return; }
    window.location.href = "/login";
  }
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Мои данные</h2>
      <p className="mt-1 text-sm text-fl-cream/60">Вы можете в любой момент получить все свои данные одним файлом или удалить аккаунт вместе со всеми своими компаниями.</p>
      <div className="mt-3 flex flex-wrap gap-2">
        <a href="/api/account/export" className={ghostBtn}>Скачать мои данные (JSON)</a>
        <button onClick={() => setOpen((v) => !v)} className="rounded-lg border border-fl-red/40 px-4 py-2 text-sm text-fl-red/90 hover:text-fl-red">Удалить аккаунт</button>
      </div>
      {open && (
        <div className="mt-4 rounded-lg border border-fl-red/40 bg-fl-red/[0.06] p-4">
          <p className="text-sm text-fl-cream/80">Будут удалены аккаунт, все компании, где вы владелец, их журналы, выписки и документы. Компании, к которым вам открыли доступ, останутся у владельцев. Действие нельзя отменить.</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-fl-cream/60">Пароль<input type="password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label>
            <label className="text-xs text-fl-cream/60">Введите слово УДАЛИТЬ<input value={confirm} onChange={(e) => setConfirm(e.target.value)} className={field} /></label>
          </div>
          <ErrorNote text={error} />
          <button onClick={remove} disabled={confirm !== "УДАЛИТЬ" || !password} className="mt-3 rounded-lg bg-fl-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Удалить навсегда</button>
        </div>
      )}
    </section>
  );
}
