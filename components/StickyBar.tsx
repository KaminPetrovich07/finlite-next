"use client";

import { formatNumber, formatPercent } from "@/lib/format";

interface StickyBarProps {
  netProfit: number;
  profitability: number;
  regimeName: string;
  visible: boolean;
}

export function StickyBar({ netProfit, profitability, regimeName, visible }: StickyBarProps) {
  const positive = netProfit >= 0;

  return (
    <div
      className={`
        fixed bottom-0 left-0 right-0 z-40
        border-t border-fl-line bg-fl-charcoal/95 backdrop-blur-md
        transition-transform duration-300 ease-out
        ${visible ? "translate-y-0" : "translate-y-full"}
      `}
    >
      <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
        {/* Left: label */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3">
          <span className="text-xs font-medium text-fl-cream/55">
            Чистая прибыль
          </span>
          <span className="text-xs text-fl-cream/30 hidden sm:inline">·</span>
          <span className="text-xs text-fl-cream/40 hidden sm:inline">{regimeName}</span>
        </div>

        {/* Right: value */}
        <div className="flex items-center gap-4">
          <div className="flex items-baseline gap-2">
            <span className={`font-mono text-xl font-bold tabular-nums ${positive ? "text-fl-green" : "text-fl-red"}`}>
              {formatNumber(netProfit)}
            </span>
            <span className="text-sm text-fl-cream/50">сом</span>
          </div>
          <div className={`hidden sm:flex items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium
            ${positive
              ? "bg-fl-green/15 text-fl-green border border-fl-green/30"
              : "bg-fl-red/15 text-fl-red border border-fl-red/30"}`}
          >
            <span>{positive ? "▲" : "▼"}</span>
            <span>{formatPercent(Math.abs(profitability))}</span>
          </div>
        </div>
      </div>
    </div>
  );
}
