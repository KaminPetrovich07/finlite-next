"use client";

import { Fragment, useMemo } from "react";
import { OKEI_SECTIONS, searchOkei, type OkeiSectionId, type OkeiUnit } from "@/lib/okei";

interface Props {
  query: string;
  section: OkeiSectionId | "all";
  /** выбор строки (в окне подбора); без него таблица только для просмотра */
  onPick?: (u: OkeiUnit) => void;
  /** выделить текущую единицу */
  current?: string | null;
  compact?: boolean;
}

const th = "px-2 py-2 text-left text-[11px] font-medium uppercase tracking-wide text-fl-cream/50";
const td = "px-2 py-1.5 align-top";

/** Таблица классификатора с разделами и группами, как в печатном ОКЕИ. */
export function OkeiTable({ query, section, onPick, current, compact }: Props) {
  const rows = useMemo(() => searchOkei(query, { section: section === "all" ? undefined : section }), [query, section]);
  const searching = query.trim().length > 0;

  if (!rows.length) return <p className="px-2 py-6 text-sm text-fl-cream/50">Ничего не найдено. Поиск идёт по коду, обозначению, наименованию и буквенному коду (КГ, KGM).</p>;

  const body: React.ReactNode[] = [];
  let sec = "", grp = "";
  rows.forEach((u) => {
    if (!searching && u.section !== sec) {
      sec = u.section; grp = "";
      body.push(<tr key={`s-${u.section}`}><td colSpan={compact ? 4 : 6} className="bg-fl-charcoal px-2 pb-1 pt-4 text-sm font-semibold text-fl-gold">{OKEI_SECTIONS.find((s) => s.id === u.section)?.title}</td></tr>);
    }
    if (!searching && u.group !== grp) {
      grp = u.group;
      body.push(<tr key={`g-${u.section}-${u.group}`}><td colSpan={compact ? 4 : 6} className="px-2 pb-1 pt-2 text-xs font-semibold text-fl-cream/80">{u.group}</td></tr>);
    }
    const active = current === u.code;
    body.push(
      <tr
        key={u.code}
        onClick={onPick ? () => onPick(u) : undefined}
        onKeyDown={onPick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(u); } } : undefined}
        tabIndex={onPick ? 0 : undefined}
        className={`border-t border-fl-line/60 text-sm ${onPick ? "cursor-pointer hover:bg-fl-gold/10 focus:bg-fl-gold/10 focus:outline-none" : ""} ${active ? "bg-fl-gold/15" : ""}`}
      >
        <td className={`${td} num w-14 text-fl-cream/70`}>{u.code}</td>
        <td className={`${td} text-fl-cream`}>
          {u.names.map((n, i) => <Fragment key={n}>{i > 0 && <br />}<span className={i ? "text-fl-cream/60" : ""}>{n}</span></Fragment>)}
          {searching && <span className="block text-[11px] text-fl-cream/40">{u.group}</span>}
        </td>
        <td className={`${td} text-fl-cream`}>{u.nat.join(", ")}</td>
        <td className={`${td} text-fl-cream/70`}>{u.intl.join(", ")}</td>
        {!compact && <td className={`${td} text-fl-cream/60`}>{u.natLetter.join(", ")}</td>}
        {!compact && <td className={`${td} text-fl-cream/60`}>{u.intlLetter.join(", ")}</td>}
      </tr>,
    );
  });

  return (
    <table className="w-full border-collapse">
      <thead className="sticky top-0 z-10 bg-fl-charcoal-2">
        <tr>
          <th className={th}>Код</th>
          <th className={th}>Наименование</th>
          <th className={th}>Обозначение</th>
          <th className={th}>Междунар.</th>
          {!compact && <th className={th}>Букв. код</th>}
          {!compact && <th className={th}>Букв. код (междунар.)</th>}
        </tr>
      </thead>
      <tbody>{body}</tbody>
    </table>
  );
}

export const SECTION_TABS: Array<{ id: OkeiSectionId | "all"; label: string }> = [
  { id: "all", label: "Все" },
  { id: "intl", label: "Международные (ЕСКК)" },
  { id: "nat", label: "Национальные (ЕСКК)" },
  { id: "nat4", label: "Четырёхзначные" },
  { id: "intlx", label: "Не включённые в ЕСКК" },
];
