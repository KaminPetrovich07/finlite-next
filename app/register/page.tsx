"use client";

import { useState } from "react";
import { AuthShell, authButton, authField } from "@/components/auth/AuthShell";

export default function RegisterPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [password2, setPassword2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== password2) { setError("Пароли не совпадают"); return; }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/register", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось зарегистрироваться"); setBusy(false); return; }
    window.location.href = "/companies?welcome=1";
  }

  return (
    <AuthShell title="Регистрация" subtitle="Бесплатно. После регистрации создайте компанию или откройте демо.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-fl-cream/70">
          Имя
          <input autoComplete="name" required minLength={2} value={name} onChange={(e) => setName(e.target.value)} className={authField} />
        </label>
        <label className="block text-sm text-fl-cream/70">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={authField} />
        </label>
        <label className="block text-sm text-fl-cream/70">
          Пароль
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} className={authField} />
          <span className="mt-1 block text-xs text-fl-cream/45">Не меньше 8 символов, буквы и цифры</span>
        </label>
        <label className="block text-sm text-fl-cream/70">
          Пароль ещё раз
          <input type="password" autoComplete="new-password" required value={password2} onChange={(e) => setPassword2(e.target.value)} className={authField} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-fl-red/10 px-3 py-2 text-sm text-fl-red">{error}</p>}
        <button type="submit" disabled={busy} className={authButton}>{busy ? "Создаю аккаунт…" : "Зарегистрироваться"}</button>
      </form>
      <p className="mt-6 text-sm text-fl-cream/60">
        Уже есть аккаунт? <a href="/login" className="font-medium text-fl-info hover:underline">Войти</a>
      </p>
    </AuthShell>
  );
}
