"use client";

import { useState } from "react";
import { findOnline } from "@/lib/law/catalog";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";

/** Загрузка полного текста: ссылкой на официальную страницу или файлом. */
export function LoadPanel({ slug, title, sourceUrl, onDone, show }: { slug: string; title: string; sourceUrl: string | null; onDone: () => void; show: (m: string, k?: "error") => void }) {
  const [url, setUrl] = useState(sourceUrl ?? "");
  const [busy, setBusy] = useState<"url" | "file" | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function done(r: Response) {
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
    show(b.status === "same" ? "Текст не изменился — это та же редакция" : b.status === "changed" ? `Новая редакция сохранена. ${b.summary ?? ""}` : `Документ загружен: ${b.chars.toLocaleString("ru-RU")} знаков`);
    onDone();
  }
  async function byUrl() {
    setBusy("url"); setErr(null);
    try { await done(await fetch(`/api/law/${slug}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url }) })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }
  async function byFile(f: File) {
    setBusy("file"); setErr(null);
    const form = new FormData(); form.append("file", f);
    try { await done(await fetch(`/api/law/${slug}`, { method: "POST", body: form })); }
    catch (e: any) { setErr(e.message); } finally { setBusy(null); }
  }

  return (
    <div className="space-y-4 text-sm">
      <div>
        <p className="mb-1.5 font-medium text-fl-cream">По ссылке — тогда новая редакция будет проверяться каждую ночь</p>
        <div className="flex flex-col gap-2 sm:flex-row">
          <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://cbd.minjust.gov.kg/… — адрес страницы документа" className={field} />
          <button type="button" onClick={byUrl} disabled={!url.trim() || busy !== null} className="shrink-0 rounded-lg bg-fl-accent px-4 py-2 font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === "url" ? "Загружаю…" : "Загрузить"}</button>
        </div>
        <p className="mt-1.5 text-xs text-fl-cream/50">
          <a href={findOnline(title)} target="_blank" rel="noopener noreferrer" className="text-fl-gold hover:underline">Найти документ в Централизованной базе Минюста ↗</a> — откройте его там и скопируйте адрес из строки браузера.
        </p>
      </div>
      <div>
        <p className="mb-1.5 font-medium text-fl-cream">Или файлом — DOCX, PDF, HTML, TXT</p>
        <label className={`flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-fl-line px-4 py-5 text-center hover:border-fl-gold/60 ${busy ? "pointer-events-none opacity-60" : ""}`}>
          <span className="text-fl-cream/75">{busy === "file" ? "Читаю файл…" : "Выберите файл документа"}</span>
          <input type="file" accept=".docx,.pdf,.html,.htm,.txt" className="hidden" onChange={(e) => e.target.files?.[0] && byFile(e.target.files[0])} />
        </label>
        <p className="mt-1.5 text-xs text-fl-cream/50">Если сайт показывает документ только в своём окне, нажмите на нём «Скачать» и загрузите файл сюда. Сканы без текстового слоя не читаются.</p>
      </div>
      {err && <p className="rounded-lg border border-fl-red/40 bg-fl-red/10 px-3 py-2 text-fl-red">{err}</p>}
    </div>
  );
}
