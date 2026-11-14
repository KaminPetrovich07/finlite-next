"use client";

import { useState } from "react";
import { AuthShell, ErrorNote, field, nextPath, primaryBtn } from "@/components/auth/ui";
import { useT } from "@/components/i18n";

export default function LoginPage() {
  const t = useT();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // второй шаг входа: код из приложения-аутентификатора или резервный код
  const [need2fa, setNeed2fa] = useState(false);
  const [code, setCode] = useState("");
  // «Забыли пароль»: null — форма скрыта, "" — показана, иначе текст ответа
  const [forgot, setForgot] = useState<string | null>(null);

  async function requestReset() {
    if (!email.trim()) { setError(t("Введите e-mail, на который зарегистрирован аккаунт")); return; }
    setBusy(true); setError(null);
    const res = await fetch("/api/auth/forgot", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(t(body.error ?? "Не удалось отправить запрос")); return; }
    setForgot(body.mail
      ? t("Если такой e-mail зарегистрирован, на него ушло письмо со ссылкой для смены пароля (действует 1 час). Проверьте и папку «Спам».")
      : t("Запрос передан администратору — он пришлёт вам одноразовую ссылку для смены пароля в Telegram или WhatsApp."));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/auth/login", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, password, ...(need2fa ? { code } : {}) }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (body.need2fa) { setNeed2fa(true); setCode(""); setError(need2fa ? t(body.error) : null); return; }
    if (!res.ok) { setError(t(body.error ?? "Не удалось войти")); return; }
    window.location.href = nextPath();
  }

  function demo() {
    document.cookie = "fl_demo=1; path=/; max-age=2592000; samesite=lax";
    try { localStorage.setItem("finlite:companyId", "demo"); } catch { /* storage blocked */ }
    window.location.href = "/reports";
  }

  return (
    <AuthShell
      title={t("Вход в FinLite KG")}
      subtitle={t("Учёт, налоги и отчётность для бизнеса в Кыргызстане")}
      footer={<>{t("Нет аккаунта?")} <a href="/register" className="font-semibold text-fl-gold hover:underline">{t("Зарегистрироваться")}</a></>}
    >
      <form onSubmit={submit} className="space-y-4">
        {!need2fa ? (
          <>
            <label className="block text-xs text-fl-cream/60">{t("E-mail")}
              <input type="email" required autoComplete="email" autoFocus value={email} onChange={(e) => setEmail(e.target.value)} className={field} />
            </label>
            <label className="block text-xs text-fl-cream/60">{t("Пароль")}
              <input type="password" required autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className={field} />
            </label>
          </>
        ) : (
          <label className="block text-xs text-fl-cream/60">{t("Код из приложения-аутентификатора")}
            <input inputMode="numeric" autoComplete="one-time-code" autoFocus required value={code} onChange={(e) => setCode(e.target.value)} placeholder="123 456" className={`${field} num tracking-widest`} />
            <span className="mt-1 block text-[11px] text-fl-cream/45">{t("Нет телефона под рукой — введите один из резервных кодов (вида abcde-12345).")} <button type="button" onClick={() => { setNeed2fa(false); setError(null); }} className="underline">{t("Другой аккаунт")}</button></span>
          </label>
        )}
        <ErrorNote text={error} />
        <button type="submit" disabled={busy} className={primaryBtn}>{busy ? t("Вхожу…") : need2fa ? t("Подтвердить") : t("Войти")}</button>
      </form>
      {!need2fa && (forgot ? (
        <p className="mt-3 rounded-lg bg-fl-surface-2 px-3 py-2 text-xs text-fl-cream/75">{forgot}</p>
      ) : (
        <p className="mt-3 text-xs text-fl-cream/55">
          {t("Забыли пароль? Введите e-mail выше и")} <button type="button" onClick={requestReset} disabled={busy} className="font-semibold text-fl-gold hover:underline disabled:opacity-50">{t("запросите ссылку для смены")}</button>.
        </p>
      ))}
      <div className="mt-6 border-t border-fl-line pt-5">
        <button onClick={demo} className="w-full rounded-lg border border-fl-line px-5 py-2.5 text-sm text-fl-cream/85 hover:border-fl-gold/40">
          {t("Посмотреть демо без регистрации")}
        </button>
        <p className="mt-2 text-center text-xs text-fl-cream/50">{t("Готовая учебная компания, только просмотр")}</p>
      </div>
    </AuthShell>
  );
}
