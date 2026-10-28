// Two-column sign-in layout: the form on one side, what FinLite does on the other.
export function AuthShell({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_1fr]">
      <section className="relative hidden overflow-hidden bg-fl-cream px-12 py-14 text-fl-charcoal lg:flex lg:flex-col">
        <a href="/login" className="flex items-center gap-2.5">
          <svg width="30" height="30" viewBox="0 0 26 26" aria-hidden>
            <rect x="1" y="1" width="24" height="24" rx="6" fill="rgb(var(--c-bg))" />
            <rect x="6" y="7" width="9" height="2" rx="1" fill="rgb(var(--c-ink))" opacity="0.75" />
            <rect x="6" y="11" width="12" height="2" rx="1" fill="rgb(var(--c-ink))" opacity="0.75" />
            <rect x="6" y="15" width="7" height="2" rx="1" fill="rgb(var(--c-ink))" opacity="0.75" />
            <rect x="6" y="19" width="14" height="2.5" rx="1.25" fill="rgb(var(--c-gold-fill))" />
          </svg>
          <span className="font-display text-lg font-semibold">FinLite <span className="text-fl-gold-bright">KG</span></span>
        </a>
        <div className="mt-auto max-w-md">
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-fl-charcoal/55">Учёт · налоги · отчётность</p>
          <h2 className="mt-3 font-display text-4xl font-bold leading-tight">Один журнал проводок — вся отчётность компании.</h2>
          <ul className="mt-8 space-y-3 text-[15px] text-fl-charcoal/80">
            {[
              "План счетов по постановлению № 231, налоги по НК КР",
              "Баланс, ОПиУ, ОДДС и капитал сверяются автоматически",
              "ESG-отчёт по GRI и IFRS S2 с методикой каждого показателя",
              "Выгрузка в PDF, Word и Excel",
            ].map((t) => (
              <li key={t} className="flex gap-3"><span className="mt-2 h-1.5 w-1.5 flex-shrink-0 rounded-full bg-fl-gold-bright" />{t}</li>
            ))}
          </ul>
        </div>
        <p className="mt-12 text-xs text-fl-charcoal/45">Для бизнеса в Кыргызстане</p>
      </section>
      <section className="flex items-center justify-center px-4 py-12 sm:px-8">
        <div className="w-full max-w-sm">
          <h1 className="font-display text-3xl font-bold text-fl-cream">{title}</h1>
          <p className="mt-2 text-sm text-fl-cream/60">{subtitle}</p>
          <div className="mt-8">{children}</div>
        </div>
      </section>
    </main>
  );
}

export const authField = "mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal-2 px-3.5 py-2.5 text-[15px] text-fl-cream shadow-card focus:border-fl-info focus:outline-none";
export const authButton = "w-full rounded-lg bg-fl-accent px-4 py-3 text-[15px] font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
