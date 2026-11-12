"use client";

import { useState } from "react";
import { AuthShell, ErrorNote, field, nextPath, primaryBtn } from "@/components/auth/ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Не удалось войти"); return; }
    window.location.href = nextPath();
  }

  function demo() {
    document.cookie = "fl_demo=1; path=/; max-age=2592000; samesite=lax";
    try { localStorage.setItem("finlite:companyId", "demo"); } catch { /* storage blocked */ }
    window.location.href = "/reports";
  }

  return (
    <AuthShell
      title="Вход в FinLite KG"
      subtitle="Учёт, налоги и отчётность для бизнеса в Кыргызстане"
      footer={<>Нет аккаунта? <a href="/register" className="font-semibold text-fl-gold hover:underline">Зарегистрироваться</a></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-fl-cream/60">E-mail
          <input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
        </label>
        <label className="block text-xs text-fl-cream/60">Пароль
          <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
        </label>
        <ErrorNote text={error} />
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Вхожу…" : "Войти"}</button>
      </form>
      <p className="mt-3 text-xs text-fl-cream/55">
        Забыли пароль? Напишите администратору через кнопку «Отзыв» или по контактам на странице <a href="/privacy" className="underline">политики</a> — он пришлёт одноразовую ссылку для смены пароля.
      </p>
      <div className="mt-6 border-t border-fl-line pt-5">
        <button onClick={demo} className="w-full rounded-lg border border-fl-line px-5 py-2.5 text-sm text-fl-cream/85 hover:border-fl-gold/40">
          Посмотреть демо без регистрации
        </button>
        <p className="mt-2 text-center text-xs text-fl-cream/50">Готовая учебная компания, только просмотр</p>
      </div>
    </AuthShell>
  );
}
