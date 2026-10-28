"use client";

import { useCallback, useEffect, useState } from "react";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

export interface CompanyOption {
  id: string;
  name: string;
  defaultRegime: string | null;
  patentAmount: number;
  demo?: boolean;
  /** "edit" — can post entries and change settings; "view" — read-only */
  access?: "edit" | "view";
  own?: boolean;
}

/** Value of the «+ Добавить компанию…» option in company selects. */
export const NEW_COMPANY = "__new";

const KEY = "finlite:companyId";

/** Companies from the database plus the built-in read-only demo company. */
export function useCompanies() {
  const [companies, setCompanies] = useState<CompanyOption[]>([]);
  const [companyId, setCompanyIdState] = useState<string>("");
  const [loaded, setLoaded] = useState(false);

  const reload = useCallback(async (selectId?: string) => {
    let list: CompanyOption[] = [];
    try {
      const res = await fetch("/api/companies");
      const data = res.ok ? await res.json() : [];
      list = Array.isArray(data) ? data.map((c: any) => ({ ...c, patentAmount: c.patentAmount ?? 0 })) : [];
    } catch { /* offline / no DB — demo still works */ }
    const all = [
      ...list,
      { id: DEMO_COMPANY.id, name: DEMO_COMPANY.name, defaultRegime: DEMO_COMPANY.regime, patentAmount: 0, demo: true, access: "view" as const },
    ];
    setCompanies(all);
    let saved: string | null = null;
    try { saved = localStorage.getItem(KEY); } catch { /* storage blocked */ }
    const wanted = selectId ?? saved;
    setCompanyIdState(all.some((c) => c.id === wanted) ? wanted! : all[0].id);
    setLoaded(true);
  }, []);

  useEffect(() => { reload(); }, [reload]);

  const setCompanyId = (id: string) => {
    if (id === NEW_COMPANY) { window.location.href = "/companies?new=1"; return; }
    setCompanyIdState(id);
    try { localStorage.setItem(KEY, id); } catch { /* storage blocked */ }
  };

  const company = companies.find((c) => c.id === companyId) ?? null;
  const readOnly = !company || company.demo || company.access === "view";
  return { companies, companyId, setCompanyId, company, loaded, reload, readOnly };
}
