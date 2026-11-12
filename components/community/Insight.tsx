"use client";

// «Разбор FinLite»: свои графики и выводы к новости — до ссылки на первоисточник.
import { Bar, BarChart, CartesianGrid, LabelList, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, LINE_SERIES } from "@/lib/chart-theme";
import { segments, type DataBlock, type FxStat } from "@/lib/news/insight";
import { RichText } from "./RichText";

export interface FxData { codes: string[]; days: number; series: Array<Record<string, number | string>>; stats: FxStat[] }
export interface InsightData {
  story: string[];
  fx: Record<string, FxData>;
  autoFx: string | null;
  actions: Array<{ label: string; href: string; why: string }>;
  laws: Array<{ slug: string; title: string; q?: string; loaded: boolean }>;
  related: Array<{ id: string; title: string; createdAt: string; sourceName: string | null }>;
}

const NAMES: Record<string, string> = { USD: "Доллар США", EUR: "Евро", RUB: "Рубль", KZT: "Тенге", CNY: "Юань", UZS: "Сум", GBP: "Фунт", TRY: "Лира" };
const nf = (n: number, d = 2) => n.toLocaleString("ru-RU", { minimumFractionDigits: d, maximumFractionDigits: d });
const day = (iso: string) => `${iso.slice(8, 10)}.${iso.slice(5, 7)}`;
const fxKey = (codes: string[], days: number) => `${codes.join(",")}|${days}`;

function Pct({ v }: { v: { pct: number } | null }) {
  if (!v) return <span className="text-fl-cream/35">—</span>;
  const tone = Math.abs(v.pct) < 0.05 ? "text-fl-cream/60" : v.pct > 0 ? "text-fl-red" : "text-fl-green";
  return <span className={`num ${tone}`}>{v.pct > 0 ? "+" : v.pct < 0 ? "−" : ""}{nf(Math.abs(v.pct))} %</span>;
}

/** Курсы НБКР: линии «индекс, первый день = 100» и таблица с точными курсами. */
export function FxChart({ data }: { data: FxData }) {
  const codes = data.codes.filter((c) => data.stats.some((s) => s.code === c));
  if (!codes.length) return <p className="rounded-lg bg-fl-surface-2 p-3 text-sm text-fl-cream/60">Курсов за этот период в базе пока нет — они загружаются каждый день, график появится сам.</p>;
  const enough = data.series.length >= 3;
  return (
    <figure className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-3 sm:p-4">
      <figcaption className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-fl-cream">Курсы НБКР за {data.days} дней, первый день = 100</span>
        <span className="text-xs text-fl-cream/50">источник данных — НБКР, график FinLite</span>
      </figcaption>
      {enough ? (
        <div className="mt-3 h-60" role="img" aria-label={`Изменение курсов ${codes.join(", ")} за ${data.days} дней`}>
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={data.series} margin={{ top: 8, right: 12, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="date" tickFormatter={day} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} minTickGap={24} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={(v: number) => nf(v, 1)} />
              <Tooltip contentStyle={CHART.tooltip} labelFormatter={(d: string) => `${day(d)}.${d.slice(0, 4)}`}
                formatter={(v: number, k: string, p: { payload?: Record<string, number> }) => { const c = k.replace("_i", ""); return [`${nf(p.payload?.[c] ?? 0, 4)} сом · ${nf(v)}`, NAMES[c] ?? c]; }} />
              {codes.map((c, i) => <Line key={c} type="monotone" dataKey={`${c}_i`} name={c} stroke={LINE_SERIES[i % LINE_SERIES.length]} strokeWidth={2} dot={false} connectNulls isAnimationActive={false} />)}
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : <p className="mt-2 text-xs text-fl-cream/50">Для линии нужно хотя бы три дня курсов — пока в базе {data.series.length}. Ниже — то, что уже есть.</p>}
      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[480px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-fl-cream/45">
            <th className="py-1.5 font-semibold">Валюта</th><th className="py-1.5 text-right font-semibold">Курс, сом</th>
            <th className="py-1.5 text-right font-semibold">День</th><th className="py-1.5 text-right font-semibold">Месяц</th><th className="py-1.5 text-right font-semibold">С начала года</th>
          </tr></thead>
          <tbody>
            {codes.map((c, i) => { const s = data.stats.find((x) => x.code === c)!; return (
              <tr key={c} className="border-t border-fl-line">
                <td className="py-1.5"><span className="mr-2 inline-block h-2.5 w-2.5 rounded-full align-middle" style={{ background: LINE_SERIES[i % LINE_SERIES.length] }} />{NAMES[c] ?? c} <span className="text-fl-cream/45">{c}</span></td>
                <td className="num py-1.5 text-right text-fl-cream">{nf(s.rate, 4)}</td>
                <td className="py-1.5 text-right"><Pct v={s.day} /></td><td className="py-1.5 text-right"><Pct v={s.month} /></td><td className="py-1.5 text-right"><Pct v={s.ytd} /></td>
              </tr>); })}
          </tbody>
        </table>
        <p className="mt-1.5 text-[11px] text-fl-cream/45">Рост курса (красный) — валюта дорожает, сом слабеет; снижение (зелёный) — сом крепнет.</p>
      </div>
    </figure>
  );
}

/** График редакции из чисел в тексте: {{график …}} — столбцы, {{линия …}} — линия. */
export function DataChart({ block }: { block: DataBlock }) {
  const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });
  return (
    <figure className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-3 sm:p-4">
      {block.title && <figcaption className="text-sm font-semibold text-fl-cream">{block.title}</figcaption>}
      <div className="mt-3 h-56" role="img" aria-label={`${block.title}: ${block.points.map((p) => `${p.label} — ${fmt(p.value)}`).join("; ")}`}>
        <ResponsiveContainer width="100%" height="100%">
          {block.type === "line" ? (
            <LineChart data={block.points} margin={{ top: 20, right: 16, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} />
              <YAxis domain={["auto", "auto"]} tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={fmt} />
              <Tooltip contentStyle={CHART.tooltip} formatter={(v: number) => [fmt(v), block.title || "Значение"]} />
              <Line type="monotone" dataKey="value" stroke={CHART.s1} strokeWidth={2} dot={{ r: 3 }} isAnimationActive={false}>
                <LabelList dataKey="value" position="top" formatter={fmt} style={{ fill: CHART.ink, fontSize: 11 }} />
              </Line>
            </LineChart>
          ) : (
            <BarChart data={block.points} margin={{ top: 20, right: 8, left: 0, bottom: 0 }} barCategoryGap="22%">
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} interval={0} />
              <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={44} tickFormatter={fmt} />
              <Tooltip cursor={{ fill: CHART.s1Wash }} contentStyle={CHART.tooltip} formatter={(v: number) => [fmt(v), block.title || "Значение"]} />
              <Bar dataKey="value" fill={CHART.s1} radius={[3, 3, 0, 0]} isAnimationActive={false}>
                <LabelList dataKey="value" position="top" formatter={fmt} style={{ fill: CHART.ink, fontSize: 11, fontWeight: 600 }} />
              </Bar>
            </BarChart>
          )}
        </ResponsiveContainer>
      </div>
    </figure>
  );
}

/** Текст с блоками-графиками. */
export function ArticleBody({ text, insight, className = "" }: { text: string; insight: InsightData | null; className?: string }) {
  return (
    <div className={`space-y-4 ${className}`}>
      {segments(text).map((s, i) => {
        if (s.type === "text") return <RichText key={i} text={s.text.trim()} />;
        if (s.type === "fx") { const d = insight?.fx[fxKey(s.codes, s.days)]; return d ? <FxChart key={i} data={d} /> : null; }
        return <DataChart key={i} block={s} />;
      })}
    </div>
  );
}

/** Практическая часть: что сделать в программе и где это в законе. */
export function NextSteps({ insight }: { insight: InsightData }) {
  if (!insight.actions.length && !insight.laws.length) return null;
  return (
    <section className="rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
      <h2 className="font-display text-lg font-semibold text-fl-cream">Что это значит и что сделать</h2>
      {insight.actions.length > 0 && (
        <ul className="mt-3 grid gap-2 sm:grid-cols-2">
          {insight.actions.map((a) => (
            <li key={a.href}>
              <a href={a.href} className="block h-full rounded-lg border border-fl-line p-3 hover:border-fl-gold/60 hover:bg-fl-gold/5">
                <span className="text-sm font-semibold text-fl-gold">{a.label} →</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-fl-cream/65">{a.why}</span>
              </a>
            </li>
          ))}
        </ul>
      )}
      {insight.laws.length > 0 && (
        <p className="mt-3 text-sm text-fl-cream/70">
          В законе:{" "}
          {insight.laws.map((l, i) => (
            <span key={l.slug}>{i > 0 && ", "}<a href={`/law/${l.slug}${l.q ? `?q=${encodeURIComponent(l.q)}` : ""}`} className="text-fl-gold underline underline-offset-2">{l.title}</a>{!l.loaded && <span className="text-fl-cream/40"> (текст ещё не загружен)</span>}</span>
          ))}
        </p>
      )}
    </section>
  );
}
