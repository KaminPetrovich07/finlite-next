"use client";

import { useEffect, useRef, useState } from "react";
import { Drawer } from "@/components/ledger/Drawer";
import { findUnit, type OkeiSectionId, type OkeiUnit } from "@/lib/okei";
import { OkeiTable, SECTION_TABS } from "./OkeiTable";

interface Props {
  open: boolean;
  /** что сейчас написано в поле — подсветить и подставить в поиск */
  value?: string;
  onPick: (u: OkeiUnit) => void;
  onClose: () => void;
}

/** Окно подбора единицы из классификатора ОКЕИ: поиск, разделы, выбор щелчком или Enter. */
export function OkeiPicker({ open, value, onPick, onClose }: Props) {
  const [q, setQ] = useState("");
  const [section, setSection] = useState<OkeiSectionId | "all">("all");
  const input = useRef<HTMLInputElement>(null);
  const current = findUnit(value)?.code ?? null;

  useEffect(() => {
    if (!open) return;
    setQ(current ? "" : (value ?? "").trim());
    const t = setTimeout(() => input.current?.focus(), 50);
    return () => clearTimeout(t);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <Drawer open={open} title="Классификатор ОКЕИ" subtitle="ОК 015-94 (МК 002-97). Выберите единицу — в поле попадёт её обозначение" onClose={onClose}>
      <div className="sticky top-0 z-20 -mx-5 -mt-4 space-y-2 border-b border-fl-line bg-fl-charcoal-2 px-5 pb-3 pt-4">
        <input
          ref={input}
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Код, обозначение или наименование: 166, кг, штука, KGM"
          aria-label="Поиск по классификатору ОКЕИ"
          className="w-full rounded-md border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none"
        />
        <div className="flex flex-wrap gap-1.5">
          {SECTION_TABS.map((t) => (
            <button key={t.id} type="button" onClick={() => setSection(t.id)}
              className={`rounded-full border px-2.5 py-1 text-xs ${section === t.id ? "border-fl-gold bg-fl-gold/15 text-fl-gold" : "border-fl-line text-fl-cream/60 hover:text-fl-cream"}`}>
              {t.label}
            </button>
          ))}
        </div>
      </div>
      <OkeiTable query={q} section={section} current={current} compact onPick={(u) => { onPick(u); onClose(); }} />
    </Drawer>
  );
}
