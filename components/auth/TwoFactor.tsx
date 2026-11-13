"use client";

import { useCallback, useEffect, useState } from "react";
import { card, ErrorNote, field, ghostBtn } from "@/components/auth/ui";

interface State { enabled: boolean; since: string | null; backupLeft: number }

/** Двухфакторный вход в «Моём аккаунте»: включение по QR-коду, резервные коды, выключение. */
export function TwoFactor() {
  const [st, setSt] = useState<State | null>(null);
  const [setup, setSetup] = useState<{ secret: string; qr: string } | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => { const r = await fetch("/api/auth/2fa"); if (r.ok) setSt(await r.json()); }, []);
  useEffect(() => { load(); }, [load]);

  async function call(body: Record<string, unknown>) {
    setBusy(true); setError(null);
    try {
      const r = await fetch("/api/auth/2fa", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(b.error ?? "Не удалось выполнить");
      return b;
    } catch (e: any) { setError(e.message); return null; } finally { setBusy(false); }
  }

  if (!st) return null;
  return (
    <section className={`${card} p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Двухфакторный вход</h2>
      {codes ? (
        <div className="mt-3 space-y-3">
          <p className="text-sm text-fl-cream/75">Сохраните резервные коды — распечатайте или запишите в надёжное место. Каждый действует один раз и заменяет код из приложения, если телефона нет под рукой. Больше они не будут показаны.</p>
          <ul className="grid grid-cols-2 gap-2 rounded-lg bg-fl-surface-2 p-3 font-mono text-sm text-fl-cream sm:grid-cols-5">{codes.map((c) => <li key={c}>{c}</li>)}</ul>
          <div className="flex gap-3">
            <button onClick={() => navigator.clipboard?.writeText(codes.join("\n"))} className={ghostBtn}>Скопировать</button>
            <button onClick={() => { setCodes(null); load(); }} className={ghostBtn}>Я сохранил коды</button>
          </div>
        </div>
      ) : st.enabled ? (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-fl-green">Включён{st.since ? ` с ${new Date(st.since).toLocaleDateString("ru-RU")}` : ""}. При входе, кроме пароля, нужен код из приложения.</p>
          <p className="text-xs text-fl-cream/55">Резервных кодов осталось: {st.backupLeft}.{st.backupLeft <= 3 ? " Получите новые, пока есть доступ." : ""}</p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="text-xs text-fl-cream/60">Код из приложения<input inputMode="numeric" autoComplete="one-time-code" value={code} onChange={(e) => setCode(e.target.value)} className={field} /></label>
            <label className="text-xs text-fl-cream/60">Пароль (для выключения)<input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} /></label>
          </div>
          <ErrorNote text={error} />
          <div className="flex flex-wrap gap-3">
            <button disabled={busy || !code} onClick={async () => { const b = await call({ action: "backup", code }); if (b) { setCode(""); setCodes(b.codes); } }} className={ghostBtn}>Новые резервные коды</button>
            <button disabled={busy || !code || !password} onClick={async () => { if (!confirm("Выключить двухфакторный вход? Аккаунт будет защищён только паролем.")) return; const b = await call({ action: "disable", code, password }); if (b) { setCode(""); setPassword(""); load(); } }} className="rounded-lg px-3 py-2 text-sm text-fl-red/80 hover:underline disabled:opacity-40">Выключить</button>
          </div>
        </div>
      ) : setup ? (
        <div className="mt-3 space-y-3">
          <ol className="list-decimal space-y-1 pl-5 text-sm text-fl-cream/75">
            <li>Откройте на телефоне Google Authenticator, Microsoft Authenticator или другое приложение для кодов.</li>
            <li>Отсканируйте QR-код (или введите ключ вручную).</li>
            <li>Введите 6 цифр, которые покажет приложение.</li>
          </ol>
          <div className="flex flex-wrap items-center gap-4">
            <div className="h-44 w-44 rounded-lg bg-white p-2 [&_svg]:h-full [&_svg]:w-full" dangerouslySetInnerHTML={{ __html: setup.qr }} />
            <p className="max-w-xs break-all text-xs text-fl-cream/55">Ключ: <span className="font-mono text-fl-cream">{setup.secret.replace(/(.{4})/g, "$1 ").trim()}</span></p>
          </div>
          <label className="block max-w-xs text-xs text-fl-cream/60">Код из приложения<input inputMode="numeric" autoComplete="one-time-code" autoFocus value={code} onChange={(e) => setCode(e.target.value)} className={field} /></label>
          <ErrorNote text={error} />
          <div className="flex gap-3">
            <button disabled={busy || code.replace(/\s/g, "").length !== 6} onClick={async () => { const b = await call({ action: "enable", code }); if (b) { setSetup(null); setCode(""); setCodes(b.codes); } }} className={ghostBtn}>Включить</button>
            <button onClick={() => { setSetup(null); setError(null); }} className="text-sm text-fl-cream/55 hover:text-fl-cream">Отмена</button>
          </div>
        </div>
      ) : (
        <div className="mt-2 space-y-3">
          <p className="text-sm text-fl-cream/65">Защитите аккаунт вторым шагом: даже если пароль узнают, без вашего телефона войти не получится. Рекомендуется владельцам компаний и администраторам.</p>
          <ErrorNote text={error} />
          <button disabled={busy} onClick={async () => { const b = await call({ action: "setup" }); if (b) setSetup({ secret: b.secret, qr: b.qr }); }} className={ghostBtn}>Включить двухфакторный вход</button>
        </div>
      )}
    </section>
  );
}
