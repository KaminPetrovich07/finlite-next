"use client";

import { useEffect, useState } from "react";

interface Company { id: string; name: string }
interface ReportSummary { id: string; periodLabel: string; regimeName: string; balanceSheet: any; cashFlow: any }

export function useReportPicker() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [reports, setReports] = useState<ReportSummary[]>([]);
  const [reportId, setReportId] = useState("");

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((data) => {
      setCompanies(data);
      if (data[0]) setCompanyId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/reports?companyId=${companyId}`).then((r) => r.json()).then((data) => {
      setReports(data);
      if (data[0]) setReportId(data[0].id);
      else setReportId("");
    });
  }, [companyId]);

  return { companies, companyId, setCompanyId, reports, reportId, setReportId };
}

export function ReportPickerBar({
  companies, companyId, setCompanyId, reports, reportId, setReportId,
}: ReturnType<typeof useReportPicker>) {
  return (
    <section className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:grid-cols-2 sm:p-5">
      <label>
        <span className="text-sm text-fl-cream/70">Компания</span>
        <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
          className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
          {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label>
        <span className="text-sm text-fl-cream/70">Отчёт (период)</span>
        <select value={reportId} onChange={(e) => setReportId(e.target.value)}
          className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
          {reports.length === 0 && <option value="">— сначала создайте отчёт в Калькуляторе —</option>}
          {reports.map((r) => <option key={r.id} value={r.id}>{r.periodLabel} · {r.regimeName}</option>)}
        </select>
      </label>
    </section>
  );
}
