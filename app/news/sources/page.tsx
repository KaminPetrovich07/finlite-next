"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ago } from "@/components/community/NewsCard";
import { POST_KIND, POST_KINDS, type PostKind } from "@/lib/news/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";

interface Source { id: string; name: string; url: string; type: string; kind: PostKind; filter: boolean; tags: string[]; enabled: boolean; lastRunAt: string | null; lastOk: boolean | null; lastCount: number; lastAdded: number; lastError: string | null }
interface Preview { ok: boolean; url: string; type: string; count?: number; error?: string; items?: Array<{ title: string; date: string | null; image: string | null; url: string; relevant: boolean }> }

export default function SourcesPage() {
  const [sources, setSources] = useState<Source[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [f, setF] = useState({ url: "", name: "", kind: "news" as PostKind, filter: false, tags: "" });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    const r = await fetch("/api/news/sources");
    const b = await r.json();
    if (r.ok) { setSources(b.sources); setError(null); } else setError(b.error);
  }, []);
  useEffect(() => { load(); }, [load]);

  async function call(method: string, body?: unknown, qs = "") {
    const r = await fetch(`/api/news/sources${qs}`, { method, headers: { "Content-Type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
    const b = await r.json();
    if (!r.ok) throw new Error(b.error ?? "Ошибка");
    return b;
  }

  async function test() {
    setBusy("test"); setPreview(null);
    try { setPreview(await call("POST", { url: f.url, test: true })); } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }
  async function add() {
    setBusy("add");
    try {
      const b = await call("POST", { ...f, tags: f.tags.split(/[,;#]+/).map((t) => t.trim()).filter(Boolean) });
      show(b.result?.ok ? `Источник добавлен, новых записей: ${b.result.added}` : `Источник добавлен, но не ответил: ${b.result?.error ?? ""}`, b.result?.ok ? undefined : "error");
      setF({ url: "", name: "", kind: "news", filter: false, tags: "" }); setPreview(null); load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }
  async function patch(s: Source, data: Partial<Source>) {
    try { await call("PATCH", { id: s.id, ...data }); load(); } catch (e: any) { show(e.message, "error"); }
  }
  async function remove(s: Source) {
    const withPosts = confirm(`Удалить источник «${s.name}»?\n\nOK — удалить вместе с собранными из него записями.\nОтмена — ничего не удалять.`);
    if (!withPosts) return;
    try { const b = await call("DELETE", undefined, `?id=${s.id}&posts=1`); show(`Удалено записей: ${b.removed}`); load(); } catch (e: any) { show(e.message, "error"); }
  }
  async function runAll() {
    setBusy("run");
    try {
      const r = await fetch("/api/news/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force: true }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      show(`Новых публикаций: ${b.added}`); load();
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <a href="/news" className="text-sm text-fl-cream/55 hover:text-fl-cream">← Новости и наука</a>
      <header className="mt-3 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream">Источники ленты</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            RSS/Atom-ленты сайтов и публичные Telegram-каналы. Лента обновляется раз в сутки, при открытии раздела (не чаще раза в 3 часа) и по кнопке.
            Источник, который не ответил, помечается красным и не мешает остальным.
          </p>
        </div>
        <button type="button" onClick={runAll} disabled={busy !== null} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy === "run" ? "Загружаю…" : "Обновить все сейчас"}</button>
      </header>

      {error && <p className="mt-5 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      <section className="mt-6 space-y-3">
        {sources?.length === 0 && <p className={`${card} p-4 text-sm text-fl-cream/60`}>Источников пока нет — нажмите «Обновить все сейчас», и добавятся источники по умолчанию.</p>}
        {sources?.map((s) => (
          <div key={s.id} className={`${card} p-4 ${s.enabled ? "" : "opacity-60"}`}>
            <div className="flex flex-wrap items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full ${s.lastOk === null ? "bg-fl-cream/25" : s.lastOk ? "bg-fl-green" : "bg-fl-red"}`} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-fl-cream">{s.name} <span className="ml-1 rounded bg-fl-surface-2 px-1.5 py-0.5 text-[11px] font-medium text-fl-cream/60">{s.type === "telegram" ? "Telegram" : "RSS"}</span></p>
                <a href={s.url} target="_blank" rel="noopener noreferrer" className="block truncate text-xs text-fl-gold/80 hover:underline">{s.url}</a>
                <p className="mt-1 text-xs text-fl-cream/55">
                  {s.lastRunAt ? <>загружен {ago(s.lastRunAt)} · {s.lastOk ? `в ленте ${s.lastCount}, новых ${s.lastAdded}` : <span className="text-fl-red">{s.lastError}</span>}</> : "ещё не загружался"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <select value={s.kind} onChange={(e) => patch(s, { kind: e.target.value as PostKind })} className={`${field} w-auto py-1`} title="Вид публикаций по умолчанию">
                  {POST_KINDS.map((k) => <option key={k} value={k}>{POST_KIND[k].plural}</option>)}
                </select>
                <label className="flex items-center gap-1.5 text-xs text-fl-cream/70" title="Брать только записи по темам раздела: налоги, учёт, банки, законы…">
                  <input type="checkbox" checked={s.filter} onChange={(e) => patch(s, { filter: e.target.checked })} className="h-4 w-4" /> только по темам
                </label>
                <button type="button" onClick={() => patch(s, { enabled: !s.enabled })} className="rounded-md border border-fl-line px-2.5 py-1 text-xs text-fl-cream/75 hover:border-fl-gold/50">{s.enabled ? "выключить" : "включить"}</button>
                <button type="button" onClick={() => remove(s)} className="px-1.5 py-1 text-xs text-fl-cream/45 hover:text-fl-red">удалить</button>
              </div>
            </div>
          </div>
        ))}
      </section>

      <section className={`${card} mt-8 p-4 sm:p-5`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Добавить источник</h2>
        <p className="mt-1 text-xs text-fl-cream/55">Адрес RSS/Atom-ленты сайта (часто <code>/feed/</code> или <code>/rss/</code>) или Telegram-канал: <code>@channel</code> или <code>t.me/channel</code>. Сначала проверьте — увидите, что придёт в ленту.</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">Адрес</span>
            <div className="flex gap-2">
              <input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://site.kg/feed/ или @channel" className={field} />
              <button type="button" onClick={test} disabled={!f.url.trim() || busy !== null} className="shrink-0 rounded-lg border border-fl-gold/50 px-3 text-sm text-fl-gold hover:bg-fl-gold/10 disabled:opacity-40">{busy === "test" ? "Проверяю…" : "Проверить"}</button>
            </div>
          </label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Название</span><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="ГНС при МЭФ КР" className={field} /></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Вид публикаций по умолчанию</span>
            <select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PostKind })} className={field}>{POST_KINDS.map((k) => <option key={k} value={k}>{POST_KIND[k].label}</option>)}</select></label>
          <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Темы для всех записей (через запятую)</span><input value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="налоги, ГНС" className={field} /></label>
          <label className="flex items-center gap-2 self-end pb-2 text-sm text-fl-cream/80"><input type="checkbox" checked={f.filter} onChange={(e) => setF({ ...f, filter: e.target.checked })} className="h-4 w-4" /> только записи по темам раздела (для общих новостных сайтов)</label>
        </div>

        {preview && (
          <div className={`mt-4 rounded-xl border p-3 text-sm ${preview.ok ? "border-fl-green/40 bg-fl-green/5" : "border-fl-red/40 bg-fl-red/5"}`}>
            {preview.ok ? (
              <>
                <p className="font-medium text-fl-cream">Работает: {preview.type === "telegram" ? "Telegram-канал" : "лента"}, записей {preview.count}</p>
                <ul className="mt-2 space-y-2">
                  {preview.items?.map((i) => (
                    <li key={i.url} className="flex gap-3">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      {i.image ? <img src={i.image} alt="" referrerPolicy="no-referrer" className="h-12 w-20 shrink-0 rounded object-cover" /> : <span className="h-12 w-20 shrink-0 rounded bg-fl-surface-2" />}
                      <span className="min-w-0">
                        <a href={i.url} target="_blank" rel="noopener noreferrer" className="line-clamp-2 text-fl-cream hover:underline">{i.title}</a>
                        <span className="text-xs text-fl-cream/50">{i.date ? ago(i.date) : "без даты"}{!i.relevant && f.filter ? " · отсеется фильтром тем" : ""}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              </>
            ) : <p className="text-fl-red">Не получилось: {preview.error}</p>}
          </div>
        )}
        <button type="button" onClick={add} disabled={!f.url.trim() || !f.name.trim() || busy !== null} className="mt-4 rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy === "add" ? "Добавляю…" : "Добавить и загрузить"}</button>
      </section>
    </main>
  );
}
