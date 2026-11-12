import type { ReactNode } from "react";

export function LegalPage({ title, meta, children }: { title: string; meta: string; children: ReactNode }) {
  return (
    <main className="mx-auto max-w-3xl px-4 pb-24 pt-8 sm:px-6">
      <h1 className="font-display text-3xl font-bold text-fl-cream">{title}</h1>
      <p className="mt-1 text-sm text-fl-cream/55">{meta}</p>
      <article className="legal mt-6 space-y-4 text-[15px] leading-relaxed text-fl-cream/85 [&_h2]:mt-8 [&_h2]:font-display [&_h2]:text-lg [&_h2]:font-semibold [&_h2]:text-fl-cream [&_li]:ml-5 [&_li]:list-disc [&_ul]:space-y-1.5">
        {children}
      </article>
    </main>
  );
}
