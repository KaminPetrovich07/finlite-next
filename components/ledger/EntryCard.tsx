"use client";

import { accountName } from "@/lib/ledger/accounts";
import { formatDate } from "@/lib/ledger/period";
import { SOURCE_LABEL, type LedgerEntry } from "@/lib/ledger/types";
import { formatNumber } from "@/lib/format";

const SOURCE_TONE: Record<string, string> = {
  opening: "border-fl-cream/20 text-fl-cream/60",
  manual: "border-fl-gold/30 text-fl-gold",
  bank: "border-sky-400/30 text-sky-300",
  tax: "border-fl-amber/40 text-fl-amber",
  demo: "border-fl-gold/30 text-fl-gold",
};

interface Props {
  entry: LedgerEntry;
  /** accounts to highlight (the ones the user drilled into) */
  highlight?: string[];
  onDelete?: (id: string) => void;
}

export function EntryCard({ entry, highlight = [], onDelete }: Props) {
  const total = entry.lines.reduce((s, l) => s + l.debit, 0);
  return (
    <article className="rounded-lg border border-fl-gold/10 bg-fl-charcoal/60 p-3.5">
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="min-w-0">
          <p className="text-sm text-fl-cream">{entry.description}</p>
          <p className="mt-0.5 text-xs text-fl-cream/45">
            {formatDate(entry.date)}
            <span className={`ml-2 inline-block rounded border px-1.5 py-px text-[11px] ${SOURCE_TONE[entry.source] ?? ""}`}>
              {SOURCE_LABEL[entry.source] ?? entry.source}
            </span>
          </p>
        </div>
        <div className="flex items-center gap-3">
          <span className="num text-sm text-fl-cream/80">{formatNumber(total, 2)}</span>
          {onDelete && entry.source !== "bank" && (
            <button
              onClick={() => onDelete(entry.id)}
              className="text-xs text-fl-cream/40 underline-offset-2 hover:text-fl-red hover:underline"
            >
              Удалить
            </button>
          )}
        </div>
      </header>
      <table className="mt-2.5 w-full text-xs">
        <tbody>
          {entry.lines.map((l, i) => {
            const hot = highlight.includes(l.account);
            return (
              <tr key={i} className={hot ? "text-fl-gold-bright" : "text-fl-cream/65"}>
                <td className="w-12 py-0.5 align-top num">{l.debit > 0 ? "Дт" : "Кт"}</td>
                <td className="w-14 py-0.5 align-top num">{l.account}</td>
                <td className="py-0.5 pr-2">
                  {accountName(l.account)}
                  {l.memo && <span className="text-fl-cream/40"> — {l.memo}</span>}
                </td>
                <td className="py-0.5 text-right num whitespace-nowrap">{formatNumber(l.debit || l.credit, 2)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </article>
  );
}
