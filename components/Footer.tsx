import { TAX_RULES } from "@/lib/tax-rules";
import { AUTH_ON } from "@/lib/auth/mode";
import { T } from "@/components/i18n";

export function Footer() {
  return (
    <footer className="no-print border-t border-fl-line">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-5 gap-y-2 px-4 py-5 text-xs text-fl-cream/50 sm:px-6">
        <span>© FinLite KG</span>
        <a href="/tax-rules" className="hover:text-fl-cream"><T vars={{ d: TAX_RULES.version.split("-").reverse().join(".") }}>{"Налоговые правила: ред. НК КР от {d}"}</T></a>
        {AUTH_ON && <a href="/pricing" className="hover:text-fl-cream"><T>Тарифы</T></a>}
        <a href="/terms" className="hover:text-fl-cream"><T>Пользовательское соглашение</T></a>
        <a href="/privacy" className="hover:text-fl-cream"><T>Персональные данные</T></a>
      </div>
    </footer>
  );
}
