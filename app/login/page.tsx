"use client";

import { useState } from "react";
import { AuthShell, authButton, authField } from "@/components/auth/AuthShell";

function safeNext(): string {
  const n = new URLSearchParams(window.location.search).get("next");
  return n && n.startsWith("/") && !n.startsWith("//") ? n : "/reports";
}

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось войти"); setBusy(false); return; }
    window.location.href = safeNext();
  }

  return (
    <AuthShell title="Вход" subtitle="Войдите, чтобы открыть свои компании и отчётность.">
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-sm text-fl-cream/70">
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} className={authField} />
        </label>
        <label className="block text-sm text-fl-cream/70">
          Пароль
          <input type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} className={authField} />
        </label>
        {error && <p role="alert" className="rounded-lg bg-fl-red/10 px-3 py-2 text-sm text-fl-red">{error}</p>}
        <button type="submit" disabled={busy} className={authButton}>{busy ? "Вхожу…" : "Войти"}</button>
      </form>
      <p className="mt-6 text-sm text-fl-cream/60">
        Нет аккаунта? <a href="/register" className="font-medium text-fl-info hover:underline">Зарегистрироваться</a>
      </p>
      <p className="mt-2 text-xs text-fl-cream/45">Забыли пароль — напишите администратору, он выдаст временный.</p>
    </AuthShell>
  );
}
