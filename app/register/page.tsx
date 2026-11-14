"use client";

import { useState } from "react";
import { AuthShell, ErrorNote, field, primaryBtn } from "@/components/auth/ui";
import { useT } from "@/components/i18n";

export default function RegisterPage() {
  const t = useT();
  const [f, setF] = useState({ name: "", email: "", organization: "", phone: "", password: "", password2: "" });
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement>) => setF({ ...f, [k]: e.target.value });

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (f.password !== f.password2) { setError(t("Пароли не совпадают")); return; }
    setBusy(true);
    setError(null);
    const { password2: _p, ...data } = f;
    const res = await fetch("/api/auth/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...data, consent }) });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(t(body.error ?? "Не удалось зарегистрироваться")); return; }
    window.location.href = "/companies?welcome=1";
  }

  return (
    <AuthShell
      title={t("Регистрация")}
      subtitle={t("Бесплатный тариф: одна компания, отчётность и налоги по НК КР")}
      footer={<>{t("Уже есть аккаунт?")} <a href="/login" className="font-semibold text-fl-gold hover:underline">{t("Войти")}</a></>}
    >
      <form onSubmit={submit} className="space-y-4">
        <label className="block text-xs text-fl-cream/60">{t("Имя и фамилия")} *<input required autoComplete="name" value={f.name} onChange={set("name")} className={field} /></label>
        <label className="block text-xs text-fl-cream/60">{t("E-mail")} *<input type="email" required autoComplete="email" value={f.email} onChange={set("email")} className={field} /></label>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block text-xs text-fl-cream/60">{t("Организация")}<input value={f.organization} onChange={set("organization")} placeholder={t("ОсОО, ИП или вуз")} className={field} /></label>
          <label className="block text-xs text-fl-cream/60">{t("Телефон")}<input type="tel" autoComplete="tel" value={f.phone} onChange={set("phone")} placeholder="+996 …" className={field} /></label>
        </div>
        <label className="block text-xs text-fl-cream/60">{t("Пароль")} *
          <input type="password" required autoComplete="new-password" value={f.password} onChange={set("password")} className={field} />
          <span className="mt-1 block text-[11px] text-fl-cream/45">{t("Не короче 8 символов, буквы и цифры")}</span>
        </label>
        <label className="block text-xs text-fl-cream/60">{t("Пароль ещё раз")} *<input type="password" required autoComplete="new-password" value={f.password2} onChange={set("password2")} className={field} /></label>
        <label className="flex items-start gap-2.5 text-xs leading-relaxed text-fl-cream/75">
          <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span>
            {t("Я принимаю")} <a href="/terms" target="_blank" className="text-fl-gold underline">{t("пользовательское соглашение")}</a> {t("и даю согласие на обработку моих персональных данных на условиях")}{" "}
            <a href="/privacy" target="_blank" className="text-fl-gold underline">{t("политики обработки персональных данных")}</a> {t("в соответствии с Законом Кыргызской Республики «Об информации персонального характера».")}
          </span>
        </label>
        <ErrorNote text={error} />
        <button type="submit" disabled={busy || !consent} className={primaryBtn}>{busy ? t("Создаю аккаунт…") : t("Зарегистрироваться")}</button>
      </form>
    </AuthShell>
  );
}
