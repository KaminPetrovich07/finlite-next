"use client";

// Waterfall bridge (выручка → прибыль, цена → маржа): every bar carries its
// value; colours follow the light/dark theme through CSS variables.
import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART, compactSom } from "@/lib/chart-theme";
import { formatNumber } from "@/lib/format";
import type { WaterfallBar } from "@/lib/executive";

const FILL: Record<WaterfallBar["color"], string> = { gold: CHART.s1, red: CHART.neg, green: CHART.pos }; // «gold» = totals, drawn in series blue

export function Waterfall({ bars, unit = "сом", height = 340 }: { bars: WaterfallBar[]; unit?: string; height?: number }) {
  if (!bars.length) return null;
  return (
    <div style={{ height }} role="img" aria-label={`Водопад: ${bars.map((b) => `${b.label} ${formatNumber(b.value)}`).join("; ")}`}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={bars} margin={{ top: 24, right: 8, left: 0, bottom: 0 }} barCategoryGap="18%">
          <CartesianGrid stroke={CHART.grid} vertical={false} />
          <XAxis dataKey="label" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }}
            interval={0} angle={-20} textAnchor="end" height={70} />
          <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickFormatter={compactSom} tickLine={false} axisLine={false} width={64} />
          <Tooltip
            cursor={{ fill: CHART.s1Wash }}
            contentStyle={CHART.tooltip}
            labelStyle={{ color: CHART.ink, fontWeight: 600, marginBottom: 2 }}
            itemStyle={{ color: CHART.ink }}
            formatter={(_v: number, _n: string, p: { payload?: WaterfallBar }) => [`${formatNumber(p.payload?.value ?? 0)} ${unit}`, "Сумма"]}
          />
          <Bar dataKey="base" stackId="wf" fill="transparent" isAnimationActive={false} />
          <Bar dataKey="bar" stackId="wf" radius={[3, 3, 0, 0]} isAnimationActive={false}>
            {bars.map((b, i) => <Cell key={i} fill={FILL[b.color]} />)}
            <LabelList dataKey="value" position="top" formatter={(v: number) => compactSom(v)} style={{ fill: CHART.ink, fontSize: 11, fontWeight: 600 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
