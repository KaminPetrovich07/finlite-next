"use client";

// Расчётные листки за месяц — по одному на страницу при печати (Ctrl+P → «Сохранить как PDF»).
import { useEffect, useState } from "react";
import type { Employee, PayRow } from "@/lib/hr/payroll";

const money = (n: number) => n.toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

export default function Payslips() {
  const [d, setD] = useState<{ month: string; norm: number; rows: PayRow[]; employees: Employee[] } | null>(null);
  const [company, setCompany] = useState("");
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    const sp = new URLSearchParams(location.search);
    const id = sp.get("companyId") ?? "", month = sp.get("month") ?? "";
    fetch(`/api/hr/payrun?companyId=${id}&month=${month}`).then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setD(b); }).catch((e) => setErr(e.message));
    fetch("/api/companies").then((r) => r.json()).then((list) => setCompany((Array.isArray(list) ? list : []).find((c: { id: string }) => c.id === id)?.name ?? "")).catch(() => undefined);
  }, []);
  if (err) return <main className="p-8 text-fl-red">{err}</main>;
  if (!d) return <main className="p-8 text-fl-cream/60">Загружаю…</main>;
  const title = new Date(`${d.month}-15`).toLocaleDateString("ru-RU", { month: "long", year: "numeric" });
  return (
    <main className="mx-auto max-w-3xl px-4 py-6 print:max-w-none print:p-0">
      <div className="no-print mb-4 flex items-center justify-between">
        <p className="text-sm text-fl-cream/70">Расчётные листки за {title}: {d.rows.length}</p>
        <button onClick={() => window.print()} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent">Печать / PDF</button>
      </div>
      {d.rows.map((r) => {
        const e = d.employees.find((x) => x.id === r.employeeId);
        const line = (l: string, v: number) => v ? <tr><td className="py-1 pr-4">{l}</td><td className="num py-1 text-right">{money(v)}</td></tr> : null;
        return (
          <section key={r.employeeId} className="mb-6 break-after-page rounded-xl border border-fl-line bg-white p-6 text-[13px] text-black print:mb-0 print:rounded-none print:border-0">
            <p className="text-xs text-neutral-500">{company}</p>
            <h2 className="mt-1 text-lg font-bold">Расчётный листок за {title}</h2>
            <p className="mt-1">{r.name}{e?.position ? `, ${e.position}` : ""}{e?.pin ? ` · ПИН ${e.pin}` : ""}</p>
            <p className="text-neutral-600">Отработано {r.worked} из {r.norm} рабочих дней · оклад {money(e?.salary ?? 0)}</p>
            <div className="mt-4 grid gap-6 sm:grid-cols-2 print:grid-cols-2">
              <table className="w-full"><thead><tr><th className="border-b pb-1 text-left" colSpan={2}>Начислено</th></tr></thead><tbody>
                {line("Оклад за отработанное время", r.salaryPart)}{line("Отпускные", r.vacationPay)}{line("Больничный (за счёт работодателя)", r.sickPay)}{line("Премия", r.bonus)}{line("Прочие начисления", r.other)}
                <tr className="border-t font-semibold"><td className="py-1">Всего начислено</td><td className="num py-1 text-right">{money(r.gross)}</td></tr>
              </tbody></table>
              <table className="w-full"><thead><tr><th className="border-b pb-1 text-left" colSpan={2}>Удержано</th></tr></thead><tbody>
                {line("Страховые взносы работника", r.employeeSocial)}{line("Подоходный налог", r.pit)}
                <tr className="border-t font-semibold"><td className="py-1">Всего удержано</td><td className="num py-1 text-right">{money(r.employeeSocial + r.pit)}</td></tr>
              </tbody></table>
            </div>
            <p className="mt-4 text-base font-bold">К выплате: {money(r.net)} сом</p>
            <p className="mt-2 text-xs text-neutral-500">Справочно: взносы работодателя {money(r.employerSocial)} сом (не удерживаются из зарплаты).</p>
          </section>
        );
      })}
    </main>
  );
}
