"use client";

import { useMemo, useState } from "react";
import { OKEI, OKEI_SECTIONS, searchOkei, type OkeiSectionId } from "@/lib/okei";
import { OkeiTable, SECTION_TABS } from "@/components/okei/OkeiTable";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";

function csv(): string {
  const q = (s: string) => `"${s.replace(/"/g, '""')}"`;
  const head = ["Раздел", "Группа", "Код", "Наименование", "Условное обозначение (национальное)", "Условное обозначение (международное)", "Кодовое буквенное обозначение (национальное)", "Кодовое буквенное обозначение (международное)"];
  const rows = OKEI.map((u) => [OKEI_SECTIONS.find((s) => s.id === u.section)?.title ?? "", u.group, u.code, u.names.join("; "), u.nat.join("; "), u.intl.join("; "), u.natLetter.join("; "), u.intlLetter.join("; ")]);
  return "﻿" + [head, ...rows].map((r) => r.map(q).join(";")).join("\r\n");
}

export default function OkeiPage() {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<OkeiSectionId | "all">("all");
  const found = useMemo(() => searchOkei(q, { section: section === "all" ? undefined : section }).length, [q, section]);

  function download() {
    const href = URL.createObjectURL(new Blob([csv()], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = href; a.download = "ОКЕИ_ОК_015-94.csv";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(href), 2000);
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Классификатор единиц измерения</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          ОКЕИ — ОК 015-94 (МК 002-97), дата введения 1 января 1996 г., в ред. Изменений 1/97–8/2013.
          Единицы из этого справочника подставляются в поле «Ед. изм.» журнала проводок, калькуляции и первичных документов;
          в накладных и описях рядом с обозначением печатается код по ОКЕИ.
        </p>
      </header>

      <div className={`${card} mb-4 space-y-3 p-4`}>
        <div className="flex flex-wrap items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Найти: код, обозначение, наименование, КГ, KGM"
            aria-label="Поиск по классификатору"
            className="min-w-0 flex-1 rounded-md border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
          />
          <button type="button" onClick={download} className="rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/80 hover:border-fl-gold hover:text-fl-gold">
            Скачать (CSV для Excel)
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {SECTION_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setSection(t.id)}
              className={`rounded-full border px-3 py-1 text-xs ${section === t.id ? "border-fl-gold bg-fl-gold/15 text-fl-gold" : "border-fl-line text-fl-cream/60 hover:text-fl-cream"}`}>
              {t.label}
            </button>
          ))}
          <span className="ml-auto text-xs text-fl-cream/45">Единиц: {found} из {OKEI.length}</span>
        </div>
      </div>

      <div className={`${card} max-h-[70vh] overflow-auto`}>
        <OkeiTable query={q} section={section} />
      </div>
    </main>
  );
}
