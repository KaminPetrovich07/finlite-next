"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useToast } from "@/components/Toast";
import { Editor, type PostRow } from "@/components/community/PostEditor";
import { ago, NewsCard } from "@/components/community/NewsCard";
import type { PostKind } from "@/lib/news/types";

const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";

/** Разделы ленты: «Наука» объединяет статьи, исследования и сборники. */
const SECTIONS: Array<{ key: string; label: string; kinds: PostKind[] }> = [
  { key: "", label: "Всё", kinds: [] },
  { key: "news", label: "Новости", kinds: ["news"] },
  { key: "law", label: "Законодательство", kinds: ["law"] },
  { key: "regulation", label: "Постановления", kinds: ["regulation"] },
  { key: "science", label: "Наука", kinds: ["article", "research", "collection"] },
  { key: "event", label: "События", kinds: ["event"] },
  { key: "opinion", label: "Мнения", kinds: ["opinion"] },
];

type Post = PostRow & { imageUrl: string | null; auto: boolean };
interface Data { posts: Post[]; tags: Array<{ tag: string; n: number }>; admin: boolean; lastRunAt: string | null; stale: boolean }
interface Source { id: string; name: string; type: string; enabled: boolean; lastOk: boolean | null; lastRunAt: string | null; lastAdded: number }

const SearchIcon = () => <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4"><path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.06 1.06-4.2-4.2A6.5 6.5 0 1 1 8.5 2Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>;
const RefreshIcon = ({ spin }: { spin: boolean }) => <svg aria-hidden viewBox="0 0 20 20" className={`h-4 w-4 ${spin ? "animate-spin" : ""}`}><path fill="currentColor" d="M10 3a7 7 0 0 1 6.32 4H14v1.5h4.5V4H17v1.86A8.5 8.5 0 0 0 1.5 10H3a7 7 0 0 1 7-7Zm7 7a7 7 0 0 1-13.32 3H6v-1.5H1.5V16H3v-1.86A8.5 8.5 0 0 0 18.5 10H17Z" /></svg>;

export default function NewsPage() {
  const [section, setSection] = useState("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [take, setTake] = useState(30);
  const [data, setData] = useState<Data | null>(null);
  const [sources, setSources] = useState<Source[]>([]);
  const [writing, setWriting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const autoTried = useRef(false);
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("tag")) setTag(sp.get("tag")!);
    if (sp.get("s")) setSection(sp.get("s")!);
  }, []);

  const load = useCallback(async () => {
    setError(null);
    const kinds = SECTIONS.find((s) => s.key === section)?.kinds ?? [];
    try {
      const r = await fetch(`/api/news?${new URLSearchParams({ take: String(take), ...(kinds.length ? { kind: kinds.join(",") } : {}), ...(q ? { q } : {}), ...(tag ? { tag } : {}) })}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
      setData(b);
    } catch (e: any) { setError(e.message); }
  }, [section, q, tag, take]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  const loadSources = useCallback(() => {
    fetch("/api/news/sources").then((r) => (r.ok ? r.json() : { sources: [] })).then((b) => setSources(b.sources ?? [])).catch(() => {});
  }, []);
  useEffect(loadSources, [loadSources]);

  const refresh = useCallback(async (force: boolean) => {
    setRefreshing(true);
    try {
      const r = await fetch("/api/news/refresh", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ force }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      if (force) {
        const failed = (b.results ?? []).filter((x: any) => !x.ok).length;
        show(b.ran ? `Новых публикаций: ${b.added}${failed ? `; не ответили источники: ${failed}` : ""}` : "Лента уже свежая");
      }
      if (b.added) await load();
      loadSources();
    } catch (e: any) { if (force) show(e.message, "error"); } finally { setRefreshing(false); }
  }, [load, loadSources, show]);

  // лента подтягивается сама, если её давно не обновляли
  useEffect(() => {
    if (data?.stale && !autoTried.current) { autoTried.current = true; refresh(false); }
  }, [data?.stale, refresh]);

  async function seed() {
    const r = await fetch("/api/news/seed", { method: "POST" });
    const b = await r.json();
    if (r.ok) { show(`Добавлено публикаций: ${b.added}`); load(); } else show(b.error, "error");
  }

  const pickSection = (k: string) => { setSection(k); setTake(30); };
  const pickTag = (t: string) => { setTag(t); setTake(30); window.scrollTo({ top: 0, behavior: "smooth" }); };
  const filtered = !!(section || q || tag);
  const posts = data?.posts ?? [];
  const lead = !filtered ? posts.find((p) => p.imageUrl && !p.pinned) ?? null : null;
  const rest = lead ? posts.filter((p) => p.id !== lead.id) : posts;

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Новости и наука</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            Новости ведомств и рынка, законы и постановления, статьи и события — с прямой ссылкой на источник и обсуждением.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => refresh(true)} disabled={refreshing} className="inline-flex items-center gap-2 rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream/80 hover:border-fl-gold/50 hover:text-fl-cream disabled:opacity-60" title="Загрузить свежие записи из источников">
            <RefreshIcon spin={refreshing} />
            <span>{refreshing ? "Обновляю…" : data?.lastRunAt ? `Обновлено ${ago(data.lastRunAt)}` : "Обновить ленту"}</span>
          </button>
          <button type="button" onClick={() => setWriting((v) => !v)} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{writing ? "Закрыть" : "+ Опубликовать"}</button>
        </div>
      </header>

      {writing && <div className="mt-5"><Editor onDone={(id) => { setWriting(false); if (id) window.location.href = `/news/${id}`; }} /></div>}

      <div className="sticky top-0 z-20 -mx-4 mt-5 border-b border-fl-line/60 bg-fl-charcoal/90 px-4 py-3 backdrop-blur sm:-mx-6 sm:px-6">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
          <div className="-mx-1 flex gap-1.5 overflow-x-auto px-1 pb-0.5 [scrollbar-width:none] lg:flex-1">
            {SECTIONS.map((s) => (
              <button key={s.key} type="button" onClick={() => pickSection(s.key)} className={`shrink-0 rounded-full px-3.5 py-1.5 text-sm transition ${section === s.key ? "bg-fl-cream font-semibold text-fl-charcoal" : "border border-fl-line text-fl-cream/70 hover:border-fl-gold/40 hover:text-fl-cream"}`}>{s.label}</button>
            ))}
          </div>
          <label className="relative block lg:w-80">
            <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-fl-cream/40"><SearchIcon /></span>
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск: НДС, ЭСФ, учетная ставка…" className="w-full rounded-full border border-fl-line bg-fl-charcoal-2 py-2 pl-9 pr-3 text-sm text-fl-cream placeholder:text-fl-cream/35 focus:border-fl-gold focus:outline-none" />
          </label>
        </div>
        {tag && (
          <div className="mt-2 flex items-center gap-2 text-sm">
            <span className="text-fl-cream/55">Тема:</span>
            <button type="button" onClick={() => setTag("")} className="rounded-full bg-fl-gold/15 px-3 py-1 font-medium text-fl-gold hover:bg-fl-gold/25">#{tag} ✕</button>
          </div>
        )}
      </div>

      {error && <p className="mt-5 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="min-w-0">
          {!data && !error && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i) => <div key={i} className={`${card} h-80 animate-pulse`} />)}
            </div>
          )}
          {data && posts.length === 0 && (
            <div className={`${card} p-6 text-sm text-fl-cream/70`}>
              <p className="font-medium text-fl-cream">Публикаций {filtered ? "по этому фильтру " : ""}пока нет.</p>
              {!filtered && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <button type="button" onClick={() => refresh(true)} disabled={refreshing} className="rounded-lg bg-fl-accent px-3 py-2 font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">Загрузить свежие новости</button>
                  <button type="button" onClick={seed} className="rounded-lg border border-fl-gold/50 px-3 py-2 text-fl-gold hover:bg-fl-gold/10">Подборка редакции</button>
                </div>
              )}
            </div>
          )}
          {lead && <div className="mb-5"><NewsCard p={lead} lead onTag={pickTag} /></div>}
          {rest.length > 0 && (
            <div className="grid gap-5 sm:grid-cols-2 xl:grid-cols-3">
              {rest.map((p) => <NewsCard key={p.id} p={p} onTag={pickTag} />)}
            </div>
          )}
          {posts.length >= take && (
            <div className="mt-6 text-center">
              <button type="button" onClick={() => setTake(take + 30)} className="rounded-lg border border-fl-line px-5 py-2.5 text-sm text-fl-cream hover:border-fl-gold/50">Показать ещё</button>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          {data && data.tags.length > 0 && (
            <section className={`${card} p-4`}>
              <h2 className="mb-2.5 text-sm font-semibold text-fl-cream">Темы</h2>
              <div className="flex flex-wrap gap-1.5">
                {data.tags.map((t) => (
                  <button key={t.tag} type="button" onClick={() => pickTag(t.tag)} className={`rounded-full px-2.5 py-1 text-xs transition ${tag === t.tag ? "bg-fl-gold/25 font-semibold text-fl-gold" : "bg-fl-surface-2 text-fl-cream/75 hover:text-fl-gold"}`}>#{t.tag} <span className="text-fl-cream/40">{t.n}</span></button>
                ))}
              </div>
            </section>
          )}
          <section className={`${card} p-4`}>
            <div className="mb-2.5 flex items-center justify-between">
              <h2 className="text-sm font-semibold text-fl-cream">Источники</h2>
              <a href="/news/sources" className="text-xs text-fl-gold hover:underline">настроить</a>
            </div>
            {sources.length === 0 ? (
              <p className="text-xs text-fl-cream/55">Источники появятся после первого обновления ленты.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {sources.filter((s) => s.enabled).map((s) => (
                  <li key={s.id} className="flex items-center gap-2">
                    <span className={`h-2 w-2 shrink-0 rounded-full ${s.lastOk === null ? "bg-fl-cream/25" : s.lastOk ? "bg-fl-green" : "bg-fl-red"}`} title={s.lastOk === null ? "ещё не загружался" : s.lastOk ? "работает" : "не ответил при последней загрузке"} />
                    <span className="min-w-0 flex-1 truncate text-fl-cream/80">{s.name}</span>
                    <span className="text-xs text-fl-cream/40">{s.type === "telegram" ? "Telegram" : "RSS"}</span>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <section className={`${card} p-4 text-xs text-fl-cream/60`}>
            <p className="font-semibold text-fl-cream/80">Как устроена лента</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Записи источников собираются автоматически: заголовок, короткий анонс, картинка и ссылка на оригинал. Полный текст — на сайте источника.</li>
              <li>Публикуйте под своим именем и давайте ссылку на источник; чужие тексты — пересказом.</li>
              <li>Править и удалять свою публикацию можно с того же устройства.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
