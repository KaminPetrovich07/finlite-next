// Renders a format-neutral ReportDoc (lib/reports/model) as a readable web
// document: the same blocks that go to PDF / Word / Excel, so what the user
// reads on screen is exactly what they download.
import { cellText, type Block, type ReportDoc, type TableBlock } from "@/lib/reports/model";

export function sectionId(i: number) {
  return `sec-${i + 1}`;
}

export function ReportView({ doc }: { doc: ReportDoc }) {
  return (
    <article className="space-y-6">
      {doc.sections.map((s, i) => (
        <section
          key={s.title}
          id={sectionId(i)}
          className="scroll-mt-24 rounded-2xl border border-fl-line bg-fl-charcoal-2 px-5 py-6 shadow-card sm:px-8 sm:py-8"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-fl-gold">{String(i + 1).padStart(2, "0")}</p>
          <h2 className="mt-1 font-display text-2xl font-bold text-fl-cream sm:text-[1.7rem]">{s.title}</h2>
          <div className="mt-4 space-y-3">
            {s.blocks.map((b, k) => <BlockView key={k} b={b} />)}
          </div>
        </section>
      ))}
    </article>
  );
}

const CALLOUT = {
  key: { box: "border-fl-gold bg-fl-gold/[0.07]", title: "text-fl-gold" },
  info: { box: "border-fl-info bg-fl-info/[0.07]", title: "text-fl-info" },
  warn: { box: "border-fl-amber bg-fl-amber/[0.08]", title: "text-fl-amber" },
} as const;

function BlockView({ b }: { b: Block }) {
  switch (b.type) {
    case "h2":
      return <h3 className="pt-4 font-display text-lg font-semibold text-fl-cream">{b.text}</h3>;
    case "h3":
      return <h4 className="pt-2 text-[15px] font-semibold text-fl-cream">{b.text}</h4>;
    case "p":
      return <p className="max-w-[72ch] text-[15px] leading-relaxed text-fl-cream/85">{b.text}</p>;
    case "note":
      return <p className="rounded-lg border-l-4 border-fl-amber bg-fl-amber/[0.08] px-4 py-3 text-sm text-fl-cream/85">{b.text}</p>;
    case "list":
      return (
        <ul className="max-w-[72ch] list-disc space-y-1 pl-5 text-[15px] leading-relaxed text-fl-cream/85 marker:text-fl-gold">
          {b.items.map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      );
    case "callout": {
      const tone = CALLOUT[b.tone ?? "info"];
      return (
        <div className={`rounded-lg border-l-4 px-4 py-3 ${tone.box}`}>
          {b.title && <p className={`mb-1 text-sm font-semibold ${tone.title}`}>{b.title}</p>}
          <p className="text-[15px] leading-relaxed text-fl-cream/90">{b.text}</p>
        </div>
      );
    }
    case "kpis":
      return (
        <div className="grid grid-cols-2 gap-3 py-1 lg:grid-cols-4">
          {b.items.map((i) => (
            <div key={i.label} className="rounded-xl border border-fl-line bg-fl-charcoal px-4 py-3">
              <p className="text-xs text-fl-cream/55">{i.label}</p>
              <p className="mt-1 font-display text-xl font-bold text-fl-cream">{i.value}</p>
              {i.note && <p className="mt-0.5 text-xs text-fl-cream/50">{i.note}</p>}
            </div>
          ))}
        </div>
      );
    case "bars": {
      const max = Math.max(1e-9, ...b.items.map((i) => i.value));
      return (
        <figure className="py-2">
          <figcaption className="mb-2 text-sm font-semibold text-fl-cream">{b.title}</figcaption>
          <ul className="space-y-1.5">
            {b.items.map((i) => (
              <li key={i.label} className="grid grid-cols-[minmax(0,10rem)_1fr] items-center gap-3 text-sm sm:grid-cols-[minmax(0,15rem)_1fr]">
                <span className="truncate text-fl-cream/75" title={i.label}>{i.label}</span>
                <span className="flex items-center gap-2">
                  <span className="h-3 rounded-sm" style={{ width: `${Math.max(1, (i.value / max) * 70)}%`, background: "rgb(var(--c-s1))" }} />
                  <span className="num whitespace-nowrap text-xs text-fl-cream/60">{i.display}</span>
                </span>
              </li>
            ))}
          </ul>
        </figure>
      );
    }
    case "checks":
      return (
        <ul className="divide-y divide-fl-line text-sm">
          {b.items.map((c) => (
            <li key={c.title} className="flex gap-3 py-2">
              <span className={c.status === "ok" ? "text-fl-green" : c.status === "warn" ? "text-fl-amber" : "text-fl-red"}>
                {c.status === "ok" ? "сходится" : c.status === "warn" ? "внимание" : "не сходится"}
              </span>
              <span className="text-fl-cream/85">{c.title}<span className="block text-xs text-fl-cream/50">{c.detail}</span></span>
            </li>
          ))}
        </ul>
      );
    case "table":
      return <TableView b={b} />;
    case "pagebreak":
      return null;
  }
}

function TableView({ b }: { b: TableBlock }) {
  const right = (k?: string) => k === "money" || k === "num" || k === "pct";
  return (
    <figure className="py-2">
      {b.title && <figcaption className="mb-2 text-sm font-semibold text-fl-cream">{b.title}</figcaption>}
      <div className="-mx-5 overflow-x-auto px-5 sm:mx-0 sm:px-0">
        <table className="w-full min-w-[560px] border-collapse text-sm">
          <thead>
            <tr className="bg-fl-surface-2 text-left text-xs text-fl-cream/60">
              {b.columns.map((c, i) => (
                <th key={i} className={`px-3 py-2 font-medium ${right(c.kind) ? "text-right" : ""}`}>{c.label}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {b.rows.map((r, ri) => {
              const st = r.style ?? "normal";
              const cls =
                st === "total" ? "bg-fl-gold/[0.10] font-semibold text-fl-cream border-y border-fl-cream/20"
                : st === "subtotal" ? "font-semibold text-fl-cream"
                : st === "section" ? "font-semibold text-fl-gold"
                : st === "sub" ? "text-fl-cream/65"
                : "text-fl-cream/85";
              return (
                <tr key={ri} className={`border-b border-fl-line align-top ${cls}`}>
                  {b.columns.map((c, i) => (
                    <td
                      key={i}
                      className={`px-3 py-2 ${right(c.kind) ? "num whitespace-nowrap text-right" : ""} ${st === "sub" && i === 0 ? "pl-7" : ""}`}
                    >
                      {cellText(r.cells[i] ?? null, c.kind)}
                    </td>
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {b.footnotes && b.footnotes.length > 0 && (
        <ol className="mt-2 space-y-0.5 text-xs leading-relaxed text-fl-cream/55">
          {b.footnotes.map((f, i) => (
            <li key={i}><span className="mr-1 font-semibold">{i + 1}.</span>{f}</li>
          ))}
        </ol>
      )}
      {b.note && <p className="mt-1 text-xs italic text-fl-cream/55">{b.note}</p>}
    </figure>
  );
}
