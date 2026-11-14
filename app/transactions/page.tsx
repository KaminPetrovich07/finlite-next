"use client";

import { useEffect, useState } from "react";
import { ALL_CATEGORIES } from "@/lib/categories";
import { formatNumber } from "@/lib/format";

interface Company { id: string; name: string }
interface Txn {
  id: string; txDate: string; amount: number; description: string;
  category: string; categorySource: string; importBatch: string; bank: string;
}
const BANKS: Record<string, string> = { mbank: "МБанк", bakai: "Бакай Банк", eldik: "Элдик Банк", other: "Другой банк" };
/** «mbank-1731567890123» → «МБанк, загружена 14.11.2026 13:11» */
function batchLabel(b: string, rows: Txn[]) {
  const ms = Number(b.split("-").pop());
  const when = Number.isFinite(ms) && ms > 1e12 ? new Date(ms).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek", day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "";
  return `${BANKS[rows[0]?.bank] ?? rows[0]?.bank ?? "Выписка"}${when ? `, загружена ${when}` : ""} — ${rows.length} стр.`;
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
  const [reloadKey, setReloadKey] = useState(0);
  const [batch, setBatch] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [edit, setEdit] = useState<{ id: string; txDate: string; amount: string; description: string } | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/companies").then((r) => r.json()).then((data) => {
      const list: Company[] = Array.isArray(data) ? data : [];
      setCompanies(list);
      let saved: string | null = null;
      try { saved = localStorage.getItem("finlite:companyId"); } catch { /* storage blocked */ }
      setCompanyId(list.find((c) => c.id === saved)?.id ?? list[0]?.id ?? "");
    }).catch(() => setCompanies([]));
  }, []);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/transactions?companyId=${companyId}`).then((r) => r.json())
      .then((d) => setTransactions(Array.isArray(d) ? d : [])).catch(() => setTransactions([]));
  }, [companyId, uploadResult, reloadKey]);
  useEffect(() => { setPicked(new Set()); setEdit(null); setBatch(""); }, [companyId]);

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

  async function removeRows(body: { ids: string[] } | { importBatch: string }, what: string) {
    if (!confirm(`Удалить ${what}? Проводки по этим операциям тоже удалятся — их можно будет восстановить в журнале, в разделе «Удалённые».`)) return;
    const res = await fetch("/api/transactions", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setNote(b.error ?? "Не удалось удалить"); return; }
    setNote(`Удалено строк выписки: ${b.deleted}`);
    setPicked(new Set()); setBatch(""); if ("importBatch" in body) setUploadResult(null);
    setReloadKey((k) => k + 1);
  }

  async function saveEdit() {
    if (!edit) return;
    const amount = Number(edit.amount.replace(/\s/g, "").replace(",", "."));
    if (!Number.isFinite(amount) || amount === 0) { setNote("Сумма: число, приход со знаком «+», расход — «−»"); return; }
    const res = await fetch("/api/transactions", { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id: edit.id, txDate: edit.txDate, amount, description: edit.description }) });
    const b = await res.json().catch(() => ({}));
    if (!res.ok) { setNote(b.error ?? "Изменения не сохранены"); return; }
    setNote("Операция изменена — проводка в журнале пересчитана");
    setEdit(null);
    setReloadKey((k) => k + 1);
  }

  const batches = [...new Set(transactions.map((t) => t.importBatch))];
  const shown = batch ? transactions.filter((t) => t.importBatch === batch) : transactions;
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });
  const allPicked = shown.length > 0 && shown.every((t) => picked.has(t.id));

  const income = transactions.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0);
  const expense = transactions.filter((t) => t.amount < 0).reduce((s, t) => s + Math.abs(t.amount), 0);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8 sm:px-6 sm:py-10">
      <header className="mb-8">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">
          Банковские выписки
        </h1>
        <p className="mt-1 text-sm text-fl-cream/60">Импорт и автоматическая категоризация операций</p>
      </header>

      <section className="mb-6 rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label>
            <span className="text-sm text-fl-cream/70">Компания</span>
            <select value={companyId} onChange={(e) => {
                if (e.target.value === "__new") { window.location.href = "/companies?new=1"; return; }
                setCompanyId(e.target.value);
                try { localStorage.setItem("finlite:companyId", e.target.value); } catch { /* storage blocked */ }
              }}
              className="mt-1 w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2.5 text-fl-cream">
              {companies.length === 0 && <option value="">Сначала создайте компанию</option>}
              {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              <option value="__new">+ Добавить компанию…</option>
            </select>
          </label>
          <label>
            <span className="text-sm text-fl-cream/70">Банк</span>
            <select value={bank} onChange={(e) => setBank(e.target.value)}
              className="mt-1 w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2.5 text-fl-cream">
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
              className="mt-1 w-full text-sm text-fl-cream/80 file:mr-3 file:rounded-md file:border-0 file:bg-fl-accent file:px-3 file:py-2 file:text-fl-on-accent"
            />
          </label>
        </div>
        <button
          onClick={handleUpload}
          disabled={!file || !companyId || uploading}
          className="mt-4 rounded-md bg-fl-accent px-5 py-2.5 font-medium text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50"
        >
          {uploading ? "Обрабатываю…" : "Загрузить и категоризировать"}
        </button>

        {uploadError && <p className="mt-3 text-sm text-fl-red">{uploadError}</p>}

        {uploadResult && (
          <div className="mt-4 rounded-lg border border-fl-line bg-fl-charcoal p-3 text-sm">
            <p className="text-fl-cream">Загружено транзакций: {uploadResult.count}</p>
            <p className="mt-1 text-fl-cream/70">
              Проведено в журнал: {uploadResult.posted ?? 0}.{" "}
              <a href="/reports" className="text-fl-gold underline-offset-4 hover:underline">Посмотреть в отчётности</a>
            </p>
            {uploadResult.importBatch && (
              <button onClick={() => removeRows({ importBatch: uploadResult.importBatch }, `всю эту загрузку (${uploadResult.count} стр.)`)} className="mt-2 text-xs text-fl-red underline-offset-2 hover:underline">
                Отменить эту загрузку — удалить её строки и проводки
              </button>
            )}
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

          <section className="overflow-x-auto rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 sm:p-5">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-display text-lg font-semibold text-fl-cream">Операции</h2>
              {batches.length > 0 && (
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <select value={batch} onChange={(e) => { setBatch(e.target.value); setPicked(new Set()); }} className="rounded border border-fl-line bg-fl-charcoal px-2 py-1.5 text-fl-cream/85">
                    <option value="">Все загрузки ({transactions.length})</option>
                    {batches.map((b) => <option key={b} value={b}>{batchLabel(b, transactions.filter((t) => t.importBatch === b))}</option>)}
                  </select>
                  {batch && <button onClick={() => removeRows({ importBatch: batch }, "всю эту загрузку")} className="text-fl-red underline-offset-2 hover:underline">Удалить загрузку</button>}
                </div>
              )}
            </div>
            {(picked.size > 0 || note) && (
              <div className="mb-3 flex flex-wrap items-center gap-3 text-sm">
                {picked.size > 0 && <>
                  <span className="text-fl-cream/75">Отмечено: {picked.size}</span>
                  <button onClick={() => removeRows({ ids: [...picked] }, `отмеченные операции (${picked.size})`)} className="rounded-md border border-fl-red/50 px-3 py-1 text-xs text-fl-red hover:bg-fl-red/10">Удалить отмеченные</button>
                  <button onClick={() => setPicked(new Set())} className="text-xs text-fl-cream/60 hover:underline">снять отметки</button>
                </>}
                {note && <span className="text-xs text-fl-cream/65">{note}</span>}
              </div>
            )}
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-fl-cream/50">
                  <th className="w-7 py-2"><input type="checkbox" aria-label="Отметить все" checked={allPicked} onChange={() => setPicked(allPicked ? new Set() : new Set(shown.map((t) => t.id)))} className="accent-fl-gold" /></th>
                  <th className="py-2 pr-3">Дата</th>
                  <th className="py-2 pr-3">Описание</th>
                  <th className="py-2 pr-3 text-right">Сумма</th>
                  <th className="py-2 pr-3">Категория</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {shown.map((t) => edit?.id === t.id ? (
                  <tr key={t.id} className="border-t border-fl-line align-top bg-fl-gold/5">
                    <td />
                    <td className="py-2 pr-2"><input type="date" value={edit.txDate} onChange={(e) => setEdit({ ...edit, txDate: e.target.value })} className="w-36 rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-xs text-fl-cream" /></td>
                    <td className="py-2 pr-2"><input value={edit.description} onChange={(e) => setEdit({ ...edit, description: e.target.value })} className="w-full rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-xs text-fl-cream" /></td>
                    <td className="py-2 pr-2"><input inputMode="decimal" value={edit.amount} onChange={(e) => setEdit({ ...edit, amount: e.target.value })} className="w-32 rounded border border-fl-line bg-fl-charcoal px-2 py-1 text-right font-mono text-xs text-fl-cream" title="Приход — плюс, расход — минус" /></td>
                    <td className="py-2 pr-2 text-xs text-fl-cream/55">{t.category}</td>
                    <td className="whitespace-nowrap py-2 text-right text-xs">
                      <button onClick={saveEdit} className="font-semibold text-fl-gold hover:underline">Сохранить</button>
                      <button onClick={() => setEdit(null)} className="ml-2 text-fl-cream/55 hover:underline">Отмена</button>
                    </td>
                  </tr>
                ) : (
                  <tr key={t.id} className="border-t border-fl-line align-top">
                    <td className="py-2"><input type="checkbox" aria-label="Отметить операцию" checked={picked.has(t.id)} onChange={() => toggle(t.id)} className="accent-fl-gold" /></td>
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
                          t.categorySource === "manual" ? "border-fl-gold text-fl-gold" : "border-fl-line text-fl-cream/70"
                        } bg-fl-charcoal`}
                      >
                        {ALL_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </td>
                    <td className="whitespace-nowrap py-2 text-right text-xs">
                      <button onClick={() => setEdit({ id: t.id, txDate: t.txDate.slice(0, 10), amount: String(t.amount).replace(".", ","), description: t.description })} className="text-fl-cream/50 hover:text-fl-gold hover:underline">Изменить</button>
                      <button onClick={() => removeRows({ ids: [t.id] }, "эту операцию")} className="ml-2 text-fl-cream/40 hover:text-fl-red hover:underline">Удалить</button>
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
