"use client";

import { Info } from "@/components/Info";

interface KpiCardProps {
  label: string;
  value: string;
  sub?: string;
  trend?: "up" | "down" | "neutral";
  plan?: string; // plan value for comparison
  highlight?: boolean;
  /** glossary key for the «i» explanation */
  info?: string;
}

export function KpiCard({ label, value, sub, trend, plan, highlight, info }: KpiCardProps) {
  const trendColor = trend === "up" ? "text-fl-green" : trend === "down" ? "text-fl-red" : "text-fl-cream/50";
  const trendIcon = trend === "up" ? "▲" : trend === "down" ? "▼" : null;

  return (
    <div className={`rounded-xl border p-4 transition-colors
      ${highlight
        ? "border-fl-gold/40 bg-fl-gold/5"
        : "border-fl-line bg-fl-charcoal-2"}`}
    >
      <p className="text-xs font-medium text-fl-cream/55 mb-1">{label}{info && <Info k={info} label={label} />}</p>
      <div className="flex items-baseline gap-2">
        <span className={`font-mono text-xl font-semibold tabular-nums leading-none
          ${highlight ? "text-fl-gold" : "text-fl-cream"}`}>
          {value}
        </span>
        {trendIcon && (
          <span className={`text-xs font-medium ${trendColor}`}>{trendIcon}</span>
        )}
      </div>
      {sub && <p className="mt-0.5 text-xs text-fl-cream/40">{sub}</p>}
      {plan && (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-px flex-1 bg-fl-gold/10" />
          <span className="text-[10px] text-fl-cream/30">план {plan}</span>
        </div>
      )}
    </div>
  );
}
