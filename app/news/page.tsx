"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { Editor } from "@/components/community/PostEditor";
import { POST_KIND, POST_KINDS, type PostKind } from "@/lib/news/types";
import type { PostRow } from "@/components/community/PostEditor";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const d = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("ru-RU") : "");


export default function NewsPage() {
  const [kind, setKind] = useState<PostKind | "">("");
  const [q, setQ] = useState("");
  const [tag, setTag] = useState("");
  const [data, setData] = useState<{ posts: PostRow[]; tags: Array<{ tag: string; n: number }>; admin: boolean } | null>(null);
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();
  useEffect(() => { const t = new URLSearchParams(window.location.search).get("tag"); if (t) setTag(t); }, []);

  const load = useCallback(async () => {
    setError(null);
    try {
      const r = await fetch(`/api/news?${new URLSearchParams({ ...(kind ? { kind } : {}), ...(q ? { q } : {}), ...(tag ? { tag } : {}) })}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось загрузить");
      setData(b);
    } catch (e: any) { setError(e.message); }
  }, [kind, q, tag]);
  useEffect(() => { const t = setTimeout(load, q ? 300 : 0); return () => clearTimeout(t); }, [load, q]);

  async function seed() {
    const r = await fetch("/api/news/seed", { method: "POST" });
    const b = await r.json();
    if (r.ok) { show(`Добавлено публикаций: ${b.added}`); load(); } else show(b.error, "error");
  }

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Новости и наука</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
            Изменения законодательства, постановления и разъяснения, сборники, статьи, исследования и события — с источниками.
            Каждый может опубликовать материал или высказаться в комментариях; анонимных публикаций нет.
          </p>
        </div>
        <button type="button" onClick={() => setWriting((v) => !v)} className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{writing ? "Закрыть" : "+ Опубликовать"}</button>
      </header>

      {writing && <Editor onDone={(id) => { setWriting(false); if (id) window.location.href = `/news/${id}`; }} />}

      <div className="mb-4 flex flex-wrap gap-1.5">
        <button type="button" onClick={() => setKind("")} className={`rounded-full px-3 py-1.5 text-sm ${!kind ? "bg-fl-gold/20 font-semibold text-fl-gold" : "border border-fl-line text-fl-cream/70 hover:text-fl-cream"}`}>Всё</button>
        {POST_KINDS.map((k) => (
          <button key={k} type="button" onClick={() => setKind(k)} className={`rounded-full px-3 py-1.5 text-sm ${kind === k ? "bg-fl-gold/20 font-semibold text-fl-gold" : "border border-fl-line text-fl-cream/70 hover:text-fl-cream"}`}>{POST_KIND[k].plural}</button>
        ))}
      </div>
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по заголовку и тексту" className={`${field} max-w-md`} />
        {tag && <button type="button" onClick={() => setTag("")} className="rounded-full bg-fl-gold/15 px-3 py-1 text-xs text-fl-gold">#{tag} ×</button>}
      </div>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      <div className="grid gap-5 lg:grid-cols-[1fr_260px]">
        <div className="space-y-3">
          {data?.posts.length === 0 && (
            <div className={`${card} p-6 text-sm text-fl-cream/70`}>
              <p>Публикаций {kind || q || tag ? "по этому фильтру " : ""}пока нет.</p>
              {!kind && !q && !tag && <button type="button" onClick={seed} className="mt-3 rounded-lg border border-fl-gold/50 px-3 py-2 text-fl-gold hover:bg-fl-gold/10">Добавить подборку редакции (7 проверенных материалов)</button>}
            </div>
          )}
          {data?.posts.map((p) => (
            <a key={p.id} href={`/news/${p.id}`} className={`${card} block p-4 hover:border-fl-gold/40 ${p.status === "hidden" ? "opacity-50" : ""}`}>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                {p.pinned && <span className="rounded bg-fl-gold/20 px-1.5 py-0.5 font-semibold text-fl-gold">закреплено</span>}
                <span className="rounded bg-fl-line/60 px-1.5 py-0.5 text-fl-cream/75">{POST_KIND[p.kind]?.label}</span>
                {p.docDate && <span className="text-fl-cream/50">{d(p.docDate)}</span>}
                {p.sourceName && <span className="text-fl-cream/50">· {p.sourceName}</span>}
                {p.status === "hidden" && <span className="text-fl-red">скрыто</span>}
              </div>
              <h2 className="mt-1.5 font-display text-lg font-semibold leading-snug text-fl-cream">{p.title}</h2>
              {p.summary && <p className="mt-1 text-sm text-fl-cream/70">{p.summary}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-fl-cream/50">
                <span>{p.authorName}{p.authorOrg ? `, ${p.authorOrg}` : ""}</span>
                <span>комментариев {p.comments}</span>
                <span>полезно {p.useful}</span>
                <span>просмотров {p.views}</span>
                {p.tags.map((t) => <span key={t} className="text-fl-gold/80">#{t}</span>)}
              </div>
            </a>
          ))}
        </div>
        <aside className="space-y-4">
          {data && data.tags.length > 0 && (
            <section className={`${card} p-4`}>
              <h2 className="mb-2 text-sm font-semibold text-fl-cream">Темы</h2>
              <div className="flex flex-wrap gap-1.5">
                {data.tags.map((t) => <button key={t.tag} type="button" onClick={() => setTag(t.tag)} className={`rounded-full px-2.5 py-1 text-xs ${tag === t.tag ? "bg-fl-gold/20 text-fl-gold" : "border border-fl-line text-fl-cream/70 hover:text-fl-cream"}`}>#{t.tag} <span className="text-fl-cream/40">{t.n}</span></button>)}
              </div>
            </section>
          )}
          <section className={`${card} p-4 text-xs text-fl-cream/60`}>
            <p className="font-semibold text-fl-cream/80">Правила</p>
            <ul className="mt-1.5 list-disc space-y-1 pl-4">
              <li>Публикуйте под своим именем и давайте ссылку на источник.</li>
              <li>Не размещайте персональные данные третьих лиц и чужие тексты целиком — пересказ и ссылка.</li>
              <li>Править и удалять можно со своего устройства — ключ сохраняется в браузере.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
