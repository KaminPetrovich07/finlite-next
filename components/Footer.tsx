import { TAX_RULES } from "@/lib/tax-rules";
import { AUTH_ON } from "@/lib/auth/mode";

export function Footer() {
  return (
    <footer className="no-print border-t border-fl-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-fl-cream/50 sm:px-6">
        <span>© FinLite KG</span>
        <a href="/tax-rules" className="hover:text-fl-cream">Налоговые правила: ред. НК КР от {TAX_RULES.version.split("-").reverse().join(".")}</a>
        {AUTH_ON && <a href="/pricing" className="hover:text-fl-cream">Тарифы</a>}
        <a href="/terms" className="hover:text-fl-cream">Пользовательское соглашение</a>
        <a href="/privacy" className="hover:text-fl-cream">Персональные данные</a>
      </div>
    </footer>
  );
}
