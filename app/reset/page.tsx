"use client";

import { useEffect, useState } from "react";
import { AuthShell, ErrorNote, field, primaryBtn } from "@/components/auth/ui";

export default function ResetPage() {
  const [token, setToken] = useState("");
  const [p1, setP1] = useState("");
  const [p2, setP2] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const t = new URLSearchParams(window.location.search).get("token") ?? "";
    setToken(t);
    // the token must not stay in the address bar or the browser history
    if (t) window.history.replaceState(null, "", "/reset");
  }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (p1 !== p2) { setError("Пароли не совпадают"); return; }
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/reset", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, password: p1 }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Не удалось сменить пароль"); return; }
    window.location.href = "/companies";
  }

  return (
    <AuthShell title="Новый пароль" subtitle="Ссылка одноразовая и действует 24 часа">
      {!token ? (
        <p className="text-sm text-fl-cream/70">Откройте ссылку, которую прислал администратор, целиком.</p>
      ) : (
        <form onSubmit={submit} className="space-y-4">
          <label className="block text-xs text-fl-cream/60">Новый пароль<input type="password" required autoComplete="new-password" value={p1} onChange={(e) => setP1(e.target.value)} className={field} /></label>
          <label className="block text-xs text-fl-cream/60">Ещё раз<input type="password" required autoComplete="new-password" value={p2} onChange={(e) => setP2(e.target.value)} className={field} /></label>
          <ErrorNote text={error} />
          <button type="submit" disabled={busy} className={primaryBtn}>{busy ? "Сохраняю…" : "Сохранить и войти"}</button>
        </form>
      )}
    </AuthShell>
  );
}
