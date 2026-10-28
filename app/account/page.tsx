"use client";

import { useEffect, useState } from "react";
import { FeedbackDialog } from "@/components/auth/FeedbackDialog";
import { logout, useMe } from "@/components/auth/useMe";
import { ROLE_LABEL } from "@/lib/auth/session";

interface MyFeedback {
  id: string;
  kind: string;
  page: string | null;
  message: string;
  status: string;
  reply: string | null;
  repliedAt: string | null;
  createdAt: string;
}

const KIND: Record<string, string> = { idea: "Идея", bug: "Ошибка", question: "Вопрос", other: "Другое" };
const STATUS: Record<string, { label: string; cls: string }> = {
  new: { label: "получено", cls: "bg-fl-info/15 text-fl-info" },
  in_progress: { label: "в работе", cls: "bg-fl-amber/15 text-fl-amber" },
  done: { label: "решено", cls: "bg-fl-green/15 text-fl-green" },
};
const field = "mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 p-5 shadow-card sm:p-6";
const dt = (s: string) => new Date(s).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export default function AccountPage() {
  const { me } = useMe();
  const [items, setItems] = useState<MyFeedback[] | null>(null);
  const [feedback, setFeedback] = useState(false);
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const load = () => fetch("/api/feedback").then((r) => (r.ok ? r.json() : [])).then(setItems).catch(() => setItems([]));
  useEffect(() => { load(); }, []);

  async function changePassword(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await fetch("/api/auth/password", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ current: cur, next }) });
    const body = await res.json().catch(() => ({}));
    setMsg(res.ok ? { ok: true, text: "Пароль изменён" } : { ok: false, text: body.error ?? "Не удалось изменить пароль" });
    if (res.ok) { setCur(""); setNext(""); }
  }

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Профиль</h1>

      <div className="mt-6 grid gap-5 md:grid-cols-2">
        <section className={card}>
          <h2 className="font-display text-lg font-semibold text-fl-cream">Аккаунт</h2>
          {me && (
            <dl className="mt-3 space-y-2 text-sm">
              <div><dt className="text-fl-cream/50">Имя</dt><dd className="text-fl-cream">{me.name ?? "—"}</dd></div>
              <div><dt className="text-fl-cream/50">Email</dt><dd className="text-fl-cream">{me.email}</dd></div>
              <div><dt className="text-fl-cream/50">Роль</dt><dd className="text-fl-cream">{ROLE_LABEL[me.role]}</dd></div>
            </dl>
          )}
          <button onClick={logout} className="mt-5 rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Выйти</button>
        </section>

        <form onSubmit={changePassword} className={card}>
          <h2 className="font-display text-lg font-semibold text-fl-cream">Сменить пароль</h2>
          <label className="mt-3 block text-xs text-fl-cream/60">Текущий пароль<input type="password" required value={cur} onChange={(e) => setCur(e.target.value)} className={field} autoComplete="current-password" /></label>
          <label className="mt-3 block text-xs text-fl-cream/60">Новый пароль<input type="password" required minLength={8} value={next} onChange={(e) => setNext(e.target.value)} className={field} autoComplete="new-password" /></label>
          {msg && <p className={`mt-3 text-sm ${msg.ok ? "text-fl-green" : "text-fl-red"}`}>{msg.text}</p>}
          <button type="submit" className="mt-4 rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Сменить</button>
        </form>
      </div>

      <section className={`${card} mt-5`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold text-fl-cream">Мои обращения</h2>
            <p className="text-sm text-fl-cream/55">Здесь появляются ответы создателя FinLite.</p>
          </div>
          <button onClick={() => setFeedback(true)} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Написать</button>
        </div>
        {items === null ? <p className="mt-4 text-sm text-fl-cream/50">Загружаю…</p> : items.length === 0 ? (
          <p className="mt-4 text-sm text-fl-cream/55">Обращений пока нет.</p>
        ) : (
          <ul className="mt-4 space-y-3">
            {items.map((f) => (
              <li key={f.id} className="rounded-xl border border-fl-line p-4">
                <div className="flex flex-wrap items-center gap-2 text-xs text-fl-cream/55">
                  <span className="font-semibold text-fl-cream/80">{KIND[f.kind] ?? f.kind}</span>
                  <span>{dt(f.createdAt)}</span>
                  {f.page && <span>· {f.page}</span>}
                  <span className={`ml-auto rounded-full px-2 py-0.5 font-medium ${STATUS[f.status]?.cls ?? ""}`}>{STATUS[f.status]?.label ?? f.status}</span>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-fl-cream/90">{f.message}</p>
                {f.reply && (
                  <div className="mt-3 rounded-lg border-l-4 border-fl-gold bg-fl-gold/[0.07] px-3 py-2">
                    <p className="text-xs font-semibold text-fl-gold">Ответ создателя{f.repliedAt ? ` · ${dt(f.repliedAt)}` : ""}</p>
                    <p className="mt-1 whitespace-pre-wrap text-sm text-fl-cream/90">{f.reply}</p>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
      <FeedbackDialog open={feedback} onClose={() => { setFeedback(false); load(); }} />
    </main>
  );
}
