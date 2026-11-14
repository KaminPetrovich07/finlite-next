"use client";

import { accountName } from "@/lib/ledger/accounts";
import { Info } from "@/components/Info";
import { accountTerm } from "@/lib/glossary";
import { formatDate } from "@/lib/ledger/period";
import { SOURCE_LABEL, type LedgerEntry } from "@/lib/ledger/types";
import { formatNumber } from "@/lib/format";
import { useAccountView } from "@/components/AccountView";
import { ifrsName } from "@/lib/ledger/ifrs";

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
  /** manual entries and opening balances can be edited in place */
  onEdit?: (entry: LedgerEntry) => void;
  onHistory?: (entry: LedgerEntry) => void;
  onAttachments?: (entry: LedgerEntry) => void;
  /** the entry's date is in a period closed for changes */
  locked?: boolean;
  /** checkbox for bulk actions */
  selected?: boolean;
  onSelect?: (id: string) => void;
}

const dt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

export function EntryCard({ entry, highlight = [], onDelete, onEdit, onHistory, onAttachments, locked = false, selected = false, onSelect }: Props) {
  const total = entry.lines.reduce((s, l) => s + l.debit, 0);
  const [view] = useAccountView();
  const ifrs = view === "ifrs";
  return (
    <article id={`e-${entry.id}`} className={`scroll-mt-24 rounded-lg border bg-fl-charcoal/60 p-3.5 transition-shadow ${selected ? "border-fl-gold/60 bg-fl-gold/5" : "border-fl-line"}`}>
      <header className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-start gap-2.5">
          {onSelect && (
            <input type="checkbox" checked={selected} disabled={locked} onChange={() => onSelect(entry.id)}
              aria-label={`Отметить проводку «${entry.description}»`} title={locked ? "Период закрыт для изменений" : "Отметить"}
              className="mt-1 h-4 w-4 shrink-0 accent-fl-gold disabled:opacity-30" />
          )}
          <div className="min-w-0">
          <p className="text-sm text-fl-cream">{entry.description}</p>
          <p className="mt-0.5 text-xs text-fl-cream/45">
            {formatDate(entry.date)}
            <span className={`ml-2 inline-block rounded border px-1.5 py-px text-[11px] ${SOURCE_TONE[entry.source] ?? ""}`}>
              {SOURCE_LABEL[entry.source] ?? entry.source}
            </span>
            {entry.sourceRef?.startsWith("rec:") && <span className="ml-1.5 inline-block rounded border border-fl-line px-1.5 py-px text-[11px] text-fl-cream/55">↻ регулярная</span>}
            {(entry.createdByName || entry.updatedAt) && (
              <span className="ml-2 text-[11px] text-fl-cream/40">
                {entry.createdByName && <>ввёл {entry.createdByName}</>}
                {entry.updatedAt && <>{entry.createdByName ? " · " : ""}изменил{entry.updatedByName ? ` ${entry.updatedByName}` : ""} {dt(entry.updatedAt)}</>}
              </span>
            )}
          </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          <span className="num text-sm text-fl-cream/80">{formatNumber(total, 2)}</span>
          {locked && <span title="Период закрыт для изменений" className="rounded border border-fl-line px-1.5 py-px text-[11px] text-fl-cream/50">🔒 период закрыт</span>}
          {onAttachments && (
            <button onClick={() => onAttachments(entry)} title="Документы проводки" className={`text-xs underline-offset-2 hover:underline ${entry.attachments ? "text-fl-gold" : "text-fl-cream/45 hover:text-fl-cream"}`}>
              📎{entry.attachments ? ` ${entry.attachments}` : ""}
            </button>
          )}
          {onHistory && (
            <button onClick={() => onHistory(entry)} className="text-xs text-fl-cream/45 underline-offset-2 hover:text-fl-cream hover:underline">История</button>
          )}
          {onEdit && !locked && (
            <button onClick={() => onEdit(entry)} className="text-xs text-fl-cream/45 underline-offset-2 hover:text-fl-gold hover:underline">Изменить</button>
          )}
          {onDelete && !locked && (
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
                {!ifrs && <td className="w-14 py-0.5 align-top num">{l.account}</td>}
                <td className="py-0.5 pr-2">
                  {ifrs ? ifrsName(l.account) : accountName(l.account)}<Info t={accountTerm(l.account)} label={ifrs ? ifrsName(l.account) : accountName(l.account)} />
                  {l.memo && <span className="text-fl-cream/40"> — {l.memo}</span>}
                  {l.party && <span className="text-fl-gold/80"> · {l.party}</span>}
                  {l.item && <span className="text-fl-cream/55"> · {l.item}{l.qty ? `, ${String(l.qty).replace(".", ",")} ${l.unit ?? ""}` : ""}</span>}
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
