"use client";

// Charts and ratios on top of the statements. Everything comes from the same
// Statements object as the tables below it, so a chart can never disagree
// with the numbers it summarises.

import {
  Bar, BarChart, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis, LabelList, Area,
} from "recharts";
import type { Statements } from "@/lib/ledger/engine";
import { costStructure, ratios, ratioStatus, type Ratio } from "@/lib/ledger/analytics";
import { CHART, compactSom, monthShort } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";

const tick = { fill: CHART.axis, fontSize: 12 };

function Card({ title, sub, children, className = "" }: { title: string; sub?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5 ${className}`}>
      <h3 className="font-display text-[15px] font-semibold text-fl-cream">{title}</h3>
      {sub && <p className="mt-0.5 text-xs text-fl-cream/50">{sub}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Legend({ items }: { items: Array<{ color: string; label: string; line?: boolean }> }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-fl-cream/65">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span aria-hidden className={i.line ? "h-0.5 w-4 rounded" : "h-2.5 w-2.5 rounded-sm"} style={{ background: i.color }} />
          {i.label}
        </li>
      ))}
    </ul>
  );
}

function SomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div style={CHART.tooltip} className="px-3 py-2">
      <p className="mb-1 font-medium">{label}</p>
      {payload.map((p: any) => (
        <p key={p.dataKey} className="flex items-center gap-2">
          <span className="h-2 w-2 rounded-sm" style={{ background: p.color ?? p.stroke }} />
          <span className="opacity-70">{p.name}</span>
          <span className="num ml-auto pl-3 font-medium">{formatNumber(p.value, 0)}</span>
        </p>
      ))}
    </div>
  );
}

export function Dashboard({ s }: { s: Statements }) {
  const monthly = s.monthly.map((m) => ({ ...m, label: monthShort(m.month) }));
  const costs = costStructure(s).slice(0, 7);
  const r = ratios(s);
  const hasTrend = monthly.length >= 2;
  const cashStart = s.cashFlow.values[720] ?? 0;
  const cashSeries = [{ label: "начало", cashEnd: cashStart }, ...monthly.map((m) => ({ label: m.label, cashEnd: m.cashEnd }))];

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
      <Card
        title="Доходы, расходы и прибыль по месяцам"
        sub={hasTrend ? "Сом, по проводкам периода" : "Выберите квартал или год, чтобы увидеть динамику"}
        className="lg:col-span-7"
      >
        {hasTrend ? (
          <>
            <Legend items={[
              { color: CHART.s1, label: "Доходы" },
              { color: CHART.s2, label: "Расходы" },
              { color: CHART.s3, label: "Прибыль", line: true },
            ]} />
            <div className="mt-2 h-64">
              <ResponsiveContainer width="100%" height="100%">
                <ComposedChart data={monthly} barGap={2} barCategoryGap="28%" margin={{ top: 16, right: 40, left: 0, bottom: 0 }}>
                  <CartesianGrid vertical={false} stroke={CHART.grid} />
                  <XAxis dataKey="label" tick={tick} axisLine={{ stroke: CHART.grid }} tickLine={false} />
                  <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={compactSom} width={72} />
                  <Tooltip content={<SomTooltip />} cursor={{ fill: "rgb(var(--c-ink) / 0.04)" }} />
                  <Bar dataKey="revenue" name="Доходы" fill={CHART.s1} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Bar dataKey="expenses" name="Расходы" fill={CHART.s2} radius={[4, 4, 0, 0]} maxBarSize={24} />
                  <Line dataKey="netProfit" name="Прибыль" stroke={CHART.s3} strokeWidth={2} dot={{ r: 4, fill: CHART.s3, stroke: CHART.surface, strokeWidth: 2 }} activeDot={{ r: 5 }}>
                    <LabelList dataKey="netProfit" position="top" content={EndLabel(monthly.length - 1)} />
                  </Line>
                </ComposedChart>
              </ResponsiveContainer>
            </div>
          </>
        ) : (
          <div className="grid grid-cols-3 gap-3 py-6">
            <Mini label="Доходы" value={s.monthly[0]?.revenue ?? 0} />
            <Mini label="Расходы" value={s.monthly[0]?.expenses ?? 0} />
            <Mini label="Прибыль" value={s.monthly[0]?.netProfit ?? 0} />
          </div>
        )}
      </Card>

      <Card title="Остаток денег" sub="Касса и банк на конец месяца, сом" className="lg:col-span-5">
        <div className="h-64">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart data={cashSeries} margin={{ top: 16, right: 24, left: 0, bottom: 0 }}>
              <CartesianGrid vertical={false} stroke={CHART.grid} />
              <XAxis dataKey="label" tick={tick} axisLine={{ stroke: CHART.grid }} tickLine={false} />
              <YAxis tick={tick} axisLine={false} tickLine={false} tickFormatter={compactSom} width={64} domain={["auto", "auto"]} />
              <Tooltip content={<SomTooltip />} />
              <Area dataKey="cashEnd" name="Остаток" stroke="none" fill={CHART.s1Wash} />
              <Line dataKey="cashEnd" name="Остаток" stroke={CHART.s1} strokeWidth={2} dot={{ r: 4, fill: CHART.s1, stroke: CHART.surface, strokeWidth: 2 }}>
                <LabelList dataKey="cashEnd" position="top" content={EndLabel(cashSeries.length - 1)} />
              </Line>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
      </Card>

      <Card title="Структура расходов" sub="По элементам затрат, сом" className="lg:col-span-7">
        {costs.length === 0 ? (
          <p className="py-8 text-sm text-fl-cream/50">Расходов за период нет.</p>
        ) : (
          <div style={{ height: costs.length * 36 + 8 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={costs} layout="vertical" margin={{ top: 0, right: 96, left: 0, bottom: 0 }} barCategoryGap={8}>
                <XAxis type="number" hide />
                <YAxis type="category" dataKey="label" width={190} tick={{ ...tick, fill: "rgb(var(--c-ink) / 0.75)" }} axisLine={false} tickLine={false} />
                <Tooltip content={<SomTooltip />} cursor={{ fill: "rgb(var(--c-ink) / 0.04)" }} />
                <Bar dataKey="amount" name="Сумма" fill={CHART.s1} radius={[0, 4, 4, 0]} maxBarSize={20}>
                  <LabelList
                    dataKey="amount"
                    position="right"
                    content={(p: any) => (
                      <text x={p.x + p.width + 8} y={p.y + p.height / 2} dy={4} fontSize={12} fill="rgb(var(--c-ink) / 0.75)" className="num">
                        {compactSom(p.value)} · {costs[p.index]?.share.toLocaleString("ru-RU", { maximumFractionDigits: 1 })}%
                      </text>
                    )}
                  />
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </Card>

      <Card title="Ключевые коэффициенты" sub="На конец периода" className="lg:col-span-5">
        <RatioList items={r.filter((x) => ["current", "autonomy", "ros", "gross", "dso", "coverage"].includes(x.key))} />
      </Card>
    </div>
  );
}

function EndLabel(lastIndex: number) {
  // direct label only on the last point — never a number on every point
  return function Label(p: any) {
    if (p.index !== lastIndex || p.value === undefined) return null;
    return (
      <text x={p.x} y={p.y - 10} textAnchor="middle" fontSize={12} fontWeight={600} fill="rgb(var(--c-ink))">
        {compactSom(p.value)}
      </text>
    );
  };
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div>
      <p className="text-xs text-fl-cream/50">{label}</p>
      <p className="mt-1 text-lg font-semibold text-fl-cream">{formatNumber(value, 0)}</p>
    </div>
  );
}

const STATUS_STYLE = {
  good: "bg-fl-green/10 text-fl-green",
  watch: "bg-fl-amber/10 text-fl-amber",
  neutral: "bg-fl-surface-2 text-fl-cream/60",
} as const;
const STATUS_WORD = { good: "в норме", watch: "обратить внимание", neutral: "для справки" } as const;

export function formatRatio(r: Ratio): string {
  if (r.value === null) return "—";
  const v = r.value.toLocaleString("ru-RU", { maximumFractionDigits: r.unit === "x" ? 2 : 1 });
  return r.unit === "x" ? v : r.unit === "%" ? `${v}%` : `${v} ${r.unit}`;
}

export function RatioList({ items }: { items: Ratio[] }) {
  return (
    <ul className="divide-y divide-fl-line">
      {items.map((r) => {
        const st = ratioStatus(r);
        return (
          <li key={r.key} className="flex items-center gap-3 py-2.5" title={r.hint}>
            <span className="min-w-0 flex-1 text-sm text-fl-cream/80">{r.label}</span>
            <span className="num text-sm font-semibold text-fl-cream">{formatRatio(r)}</span>
            <span className={`hidden whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-medium sm:inline ${STATUS_STYLE[st]}`}>
              {STATUS_WORD[st]}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
