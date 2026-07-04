"use client";

import { useEffect, useState } from "react";
import { ALL_CATEGORIES } from "@/lib/categories";
import { formatNumber } from "@/lib/format";

interface Company { id: string; name: string }
interface Txn {
  id: string; txDate: string; amount: number; description: string;
  category: string; categorySource: string;
}

export default function TransactionsPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [companyId, setCompanyId] = useState("");
  const [bank, setBank] = useState("mbank");
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [transactions, setTransactions] = useState<Txn[]>([]);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((data) => {
      setCompanies(data);
      if (data[0]) setCompanyId(data[0].id);
    });
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/transactions?companyId=${companyId}`).then((r) => r.json()).then(setTransactions);
  }, [companyId, uploadResult]);

  async function handleUpload() {
    if (!file || !companyId) return;
    setUploading(true);
    setUploadError(null);
    setUploadResult(null);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("companyId", companyId);
      fd.append("bank", bank);
      const res = await fetch("/api/transactions/import", { method: "POST", body: fd });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Ошибка загрузки");
      setUploadResult(data);
      setFile(null);
    } catch (e: any) {
      setUploadError(e.message);
    } finally {
      setUploading(false);
    }
  }

  async function updateCategory(id: string, category: string) {
    setTransactions((ts) => ts.map((t) => (t.id === id ? { ...t, category, categorySource: "manual" } : t)));
    await fetch("/api/transactions", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, category }),
    });
  }

  const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-gold-bright sm:text-4xl">
          Банковские выписки
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">Импорт и автоматическая категоризация операций</p>
      </header>

      <section className="mb-6 rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label>
            <span className="text-sm text-fl-cream/70">Компания</span>
            <select value={companyId} onChange={(e) => setCompanyId(e.target.value)}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </label>
          <label>
            <span className="text-sm text-fl-cream/70">Банк</span>
            <select value={bank} onChange={(e) => setBank(e.target.value)}
              className="mt-1 w-full rounded-md border border-fl-gold/30 bg-fl-charcoal px-3 py-2.5 text-fl-cream">
              <option value="mbank">МБанк</option>
              <option value="bakai">Бакай Банк</option>
              <option value="eldik">Элдик Банк</option>
              <option value="other">Другой</option>
            </select>
          </label>
          <label>
            <span className="text-sm text-fl-cream/70">Файл выписки (.xlsx, .csv, .txt)</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv,.txt"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="mt-1 w-full text-sm text-fl-cream/80 file:mr-3 file:rounded-md file:border-0 file:bg-fl-gold file:px-3 file:py-2 file:text-fl-charcoal"
            />
          </label>
        </div>
        <button
          onClick={handleUpload}
          disabled={!file || !companyId || uploading}
          className="mt-4 rounded-md bg-fl-gold px-5 py-2.5 font-medium text-fl-charcoal hover:bg-fl-gold-bright disabled:opacity-50"
        >
          {uploading ? "Обрабатываю…" : "📤 Загрузить и категоризировать"}
        </button>

        {uploadError && <p className="mt-3 text-sm text-fl-red">❌ {uploadError}</p>}

        {uploadResult && (
          <div className="mt-4 rounded-lg border border-fl-gold/10 bg-fl-charcoal p-3 text-sm">
            <p className="text-fl-cream">✅ Загружено транзакций: {uploadResult.count}</p>
            {uploadResult.warnings?.length > 0 && (
              <ul className="mt-2 list-inside list-disc text-fl-gold-bright/90">
                {uploadResult.warnings.map((w: string) => <li key={w}>{w}</li>)}
              </ul>
            )}
          </div>
        )}
      </section>

      {transactions.length > 0 && (
        <>
          <section className="mb-6 grid grid-cols-2 gap-4">
            <div className="rounded-lg border border-fl-green/30 bg-fl-charcoal-2 p-3">
              <div className="text-xs text-fl-cream/50">Приход</div>
              <div className="mt-1 font-mono text-lg font-semibold text-fl-green">{formatNumber(income)}</div>
            </div>
            <div className="rounded-lg border border-fl-red/30 bg-fl-charcoal-2 p-3">
              <div className="text-xs text-fl-cream/50">Расход</div>
              <div className="mt-1 font-mono text-lg font-semibold text-fl-red">{formatNumber(expense)}</div>
            </div>
          </section>

          <section className="overflow-x-auto rounded-xl border border-fl-gold/20 bg-fl-charcoal-2 p-4 sm:p-5">
            <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Операции</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="py-2 pr-3">Дата</th>
                  <th className="py-2 pr-3">Описание</th>
                  <th className="py-2 pr-3 text-right">Сумма</th>
                  <th className="py-2 pr-3">Категория</th>
                </tr>
              </thead>
              <tbody>
                {transactions.map((t) => (
                  <tr key={t.id} className="border-t border-fl-gold/10 align-top">
                    <td className="py-2 pr-3 whitespace-nowrap text-fl-cream/70">
                      {new Date(t.txDate).toLocaleDateString("ru-RU")}
                    </td>
                    <td className="py-2 pr-3 text-fl-cream/80">{t.description || "—"}</td>
                    <td className={`py-2 pr-3 text-right font-mono tabular-nums ${t.amount >= 0 ? "text-fl-green" : "text-fl-red"}`}>
                      {formatNumber(t.amount)}
                    </td>
                    <td className="py-2 pr-3">
                      <select
                        value={t.category}
                        onChange={(e) => updateCategory(t.id, e.target.value)}
                        className={`rounded border px-2 py-1 text-xs ${
                          t.categorySource === "manual" ? "border-fl-gold text-fl-gold" : "border-fl-gold/20 text-fl-cream/70"
                        } bg-fl-charcoal`}
                      >
                        {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}
