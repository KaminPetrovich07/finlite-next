import { REVIEW_EVERY_MONTHS, TAX_RULES, TAX_RULES_HISTORY, taxParameters } from "@/lib/tax-rules";

export const metadata = { title: "Налоговые правила — FinLite KG" };

export default function TaxRulesPage() {
  const params = taxParameters();
  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-fl-cream">Налоговые правила</h1>
      <p className="mt-2 text-sm text-fl-cream/65">
        Расчёты выполняются по редакции: <span className="text-fl-cream">{TAX_RULES.law}</span>.
        Ставки сверяются с действующей редакцией Кодекса не реже чем раз в {REVIEW_EVERY_MONTHS} месяца и при каждом изменении законодательства;
        последняя сверка — {TAX_RULES.reviewed.split("-").reverse().join(".")}.
      </p>
      <div className="mt-6 overflow-x-auto rounded-2xl border border-fl-line bg-fl-charcoal-2">
        <table className="w-full min-w-[600px] text-sm">
          <thead><tr className="text-left text-xs text-fl-cream/55"><th className="px-4 py-2.5 font-medium">Параметр</th><th className="px-4 font-medium">Значение</th><th className="px-4 font-medium">Основание</th></tr></thead>
          <tbody>
            {params.map((p) => (
              <tr key={p.name} className="border-t border-fl-line">
                <td className="px-4 py-2 text-fl-cream">{p.name}</td>
                <td className="num px-4 text-fl-cream">{p.value}</td>
                <td className="px-4 text-fl-cream/65">{p.article}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2 className="mt-8 font-display text-xl font-semibold text-fl-cream">История изменений</h2>
      <ul className="mt-3 space-y-4">
        {TAX_RULES_HISTORY.map((v) => (
          <li key={v.version} className="rounded-xl border border-fl-line p-4">
            <p className="font-semibold text-fl-cream">{v.version.split("-").reverse().join(".")} — {v.law}</p>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-fl-cream/75">{v.changes.map((c) => <li key={c}>{c}</li>)}</ul>
          </li>
        ))}
      </ul>
      <p className="mt-6 text-sm text-fl-cream/55">Расчёты Сервиса — инструмент для подготовки отчётности и не заменяют консультацию бухгалтера или налогового консультанта. Нашли расхождение с Кодексом — сообщите через кнопку «Отзыв».</p>
    </main>
  );
}
