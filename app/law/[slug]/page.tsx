"use client";

import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { ago } from "@/components/community/NewsCard";
import { LoadPanel } from "@/components/law/LoadPanel";
import type { TocItem } from "@/lib/law/text";

const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const dt = (iso: string) => new Date(iso).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" });

interface Doc { id: string; slug: string; title: string; category: string; kind: string; sourceUrl: string | null; requisites: string | null; amendedAt: string | null; text: string | null; toc: TocItem[] | null; chars: number; origin: string | null; autoUpdate: boolean; loadedAt: string | null; checkedAt: string | null; changedAt: string | null; lastError: string | null }
interface Edition { id: string; createdAt: string; amendedAt: string | null; summary: string | null }
interface Section { anchor: string | null; level: number; head: string | null; lines: string[] }

/** The text cut into sections at every heading, so each article has its own block and anchor. */
function sections(text: string, toc: TocItem[]): Section[] {
  const lines = text.split("\n");
  const out: Section[] = [];
  let cur: Section = { anchor: null, level: 0, head: null, lines: [] };
  const at = new Map(toc.map((t) => [t.line, t]));
  lines.forEach((l, i) => {
    const t = at.get(i);
    if (t) { if (cur.head || cur.lines.length) out.push(cur); cur = { anchor: t.anchor, level: t.level, head: l, lines: [] }; }
    else cur.lines.push(l);
  });
  out.push(cur);
  return out;
}

const LinkIcon = () => <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path fill="currentColor" d="M6.9 9.1a.75.75 0 0 1 0-1.06l3.2-3.2a2.25 2.25 0 1 1 3.18 3.18l-1.6 1.6-1.06-1.06 1.6-1.6a.75.75 0 0 0-1.06-1.06l-3.2 3.2a.75.75 0 0 1-1.06 0ZM9.1 6.9a.75.75 0 0 1 0 1.06l-3.2 3.2a2.25 2.25 0 1 1-3.18-3.18l1.6-1.6 1.06 1.06-1.6 1.6a.75.75 0 0 0 1.06 1.06l3.2-3.2a.75.75 0 0 1 1.06 0Z" /></svg>;

/** Тяжёлый текст не перерисовывается при поиске и открытии панелей. */
const Body = memo(function Body({ secs, onCopy }: { secs: Section[]; onCopy: (a: string) => void }) {
  return (
    <div className="law-text text-[15px] leading-relaxed text-fl-cream/90">
      {secs.map((s, i) => (
        <section key={i} id={s.anchor ?? undefined} className="scroll-mt-24 [content-visibility:auto] [contain-intrinsic-size:auto_400px]">
          {s.head && (
            s.level === 3 ? (
              <h3 className="group mt-6 flex items-start gap-2 font-semibold text-fl-cream">
                <span>{s.head}</span>
                <button type="button" onClick={() => onCopy(s.anchor!)} className="mt-1 text-fl-cream/30 opacity-0 transition hover:text-fl-gold group-hover:opacity-100" title="Скопировать ссылку на статью"><LinkIcon /></button>
              </h3>
            ) : <h2 className={`mt-10 text-center font-display font-bold uppercase tracking-wide text-fl-cream ${s.level === 1 ? "text-lg" : "text-base"}`}>{s.head}</h2>
          )}
          {s.lines.map((l, k) => <p key={k} className={`mt-2 ${s.level < 3 && k === 0 && s.head ? "text-center font-semibold" : ""}`}>{l}</p>)}
        </section>
      ))}
    </div>
  );
});

export default function LawDocPage() {
  const { slug } = useParams<{ slug: string }>();
  const [doc, setDoc] = useState<Doc | null>(null);
  const [editions, setEditions] = useState<Edition[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [tocOpen, setTocOpen] = useState(false);
  const [manage, setManage] = useState(false);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    const r = await fetch(`/api/law/${slug}`);
    const b = await r.json();
    if (!r.ok) { setError(b.error); return; }
    setDoc(b.doc); setEditions(b.editions); setCanEdit(!!b.canEdit || false);
  }, [slug]);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { const s = new URLSearchParams(window.location.search).get("q"); if (s) setQ(s); }, []);

  // после загрузки текста — к статье из адреса (#st-125)
  useEffect(() => {
    if (!doc?.text || !window.location.hash) return;
    const t = setTimeout(() => document.getElementById(window.location.hash.slice(1))?.scrollIntoView(), 50);
    return () => clearTimeout(t);
  }, [doc?.text]);

  const toc = useMemo(() => doc?.toc ?? [], [doc?.toc]);
  const secs = useMemo(() => (doc?.text ? sections(doc.text, toc) : []), [doc?.text, toc]);
  const hits = useMemo(() => {
    const n = q.trim().toLowerCase();
    if (n.length < 2) return null;
    return secs.filter((s) => (s.head ?? "").toLowerCase().includes(n) || s.lines.some((l) => l.toLowerCase().includes(n)))
      .slice(0, 80).map((s) => {
        const line = s.lines.find((l) => l.toLowerCase().includes(n)) ?? s.head ?? "";
        const i = line.toLowerCase().indexOf(n);
        return { anchor: s.anchor, head: s.head, text: `${i > 60 ? "…" : ""}${line.slice(Math.max(0, i - 60), i + n.length + 90)}${i + n.length + 90 < line.length ? "…" : ""}` };
      });
  }, [q, secs]);

  const go = (a: string | null) => {
    if (!a) return;
    const el = document.getElementById(a);
    if (!el) return;
    el.scrollIntoView({ behavior: "smooth", block: "start" });
    history.replaceState(null, "", `#${a}`);
    el.classList.add("bg-fl-gold/10"); setTimeout(() => el.classList.remove("bg-fl-gold/10"), 1600);
    setTocOpen(false);
  };
  const copy = useCallback((a: string) => {
    const u = `${window.location.origin}/law/${slug}#${a}`;
    navigator.clipboard?.writeText(u).then(() => show("Ссылка на статью скопирована"), () => show(u));
  }, [slug, show]);

  async function patch(data: Record<string, unknown>) {
    const r = await fetch(`/api/law/${slug}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
    if (r.ok) load(); else show((await r.json()).error, "error");
  }

  if (error) return <main className="mx-auto max-w-3xl px-4 py-10 text-fl-cream/70">{error}. <a href="/law" className="text-fl-gold underline">Правовая база</a></main>;
  if (!doc) return <main className="mx-auto max-w-3xl px-4 py-10 text-fl-cream/50">Загрузка…</main>;

  const Toc = (
    <nav aria-label="Оглавление" className="space-y-0.5 text-sm">
      {toc.length === 0 && <p className="text-xs text-fl-cream/50">В тексте нет разделов, глав и статей.</p>}
      {toc.map((t) => (
        <button key={t.anchor} type="button" onClick={() => go(t.anchor)} className={`block w-full truncate rounded-md px-2 py-1 text-left hover:bg-fl-surface-2 hover:text-fl-cream ${t.level === 1 ? "mt-2 font-semibold text-fl-cream" : t.level === 2 ? "font-medium text-fl-cream/80" : "pl-4 text-fl-cream/60"}`} title={t.label}>{t.label}</button>
      ))}
    </nav>
  );

  return (
    <main className="mx-auto max-w-7xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <a href="/law" className="text-sm text-fl-cream/55 hover:text-fl-cream">← Правовая база</a>
      <header className="mt-3 max-w-4xl">
        <p className="text-xs font-semibold uppercase tracking-wider text-fl-cream/45">{doc.category}</p>
        <h1 className="mt-1 font-display text-2xl font-bold leading-tight text-fl-cream sm:text-3xl">{doc.title}</h1>
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-fl-cream/60">
          {doc.requisites && <span>{doc.requisites}</span>}
          {doc.amendedAt && <span className="rounded bg-fl-surface-2 px-1.5 py-0.5 text-xs">редакция от {doc.amendedAt}</span>}
          {doc.checkedAt && <span className="text-xs">сверено с источником {ago(doc.checkedAt)}</span>}
          {doc.sourceUrl && <a href={doc.sourceUrl} target="_blank" rel="noopener noreferrer" className="text-xs text-fl-gold hover:underline">официальный источник ↗</a>}
          {doc.text && canEdit && <button type="button" onClick={() => setManage((v) => !v)} className="text-xs text-fl-cream/50 underline-offset-2 hover:text-fl-cream hover:underline">{manage ? "скрыть управление" : "обновить или заменить текст"}</button>}
        </div>
        {doc.lastError && <p className="mt-2 rounded-lg border border-fl-red/40 bg-fl-red/10 px-3 py-2 text-xs text-fl-red">Последняя сверка с источником не удалась: {doc.lastError}</p>}
      </header>

      {(!doc.text || manage) && (
        <section className={`${card} mt-6 max-w-3xl p-4 sm:p-5`}>
          {!doc.text && <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Документ ещё не загружен</h2>}
          {canEdit || !doc.text ? <LoadPanel slug={doc.slug} title={doc.title} sourceUrl={doc.sourceUrl} show={show} onDone={() => { setManage(false); load(); }} /> : null}
          {doc.text && canEdit && (
            <div className="mt-4 flex flex-wrap gap-3 border-t border-fl-line pt-3 text-sm">
              <label className="flex items-center gap-2 text-fl-cream/75"><input type="checkbox" checked={doc.autoUpdate} onChange={(e) => patch({ autoUpdate: e.target.checked })} className="h-4 w-4" /> сверять с источником каждую ночь</label>
            </div>
          )}
        </section>
      )}

      {doc.text && (
        <div className="mt-6 grid gap-8 lg:grid-cols-[300px_minmax(0,1fr)]">
          <aside className="lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
            <div className="space-y-3">
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск в документе" className="w-full rounded-full border border-fl-line bg-fl-charcoal-2 px-4 py-2 text-sm text-fl-cream placeholder:text-fl-cream/35 focus:border-fl-gold focus:outline-none" />
              {hits && (
                <div className={`${card} max-h-80 overflow-y-auto p-2`}>
                  <p className="px-2 pb-1 text-xs text-fl-cream/50">{hits.length ? `Найдено в ${hits.length}${hits.length === 80 ? "+" : ""} местах` : "Не найдено"}</p>
                  {hits.map((h, i) => (
                    <button key={i} type="button" onClick={() => go(h.anchor)} className="block w-full rounded-lg px-2 py-1.5 text-left text-xs hover:bg-fl-surface-2">
                      <span className="block font-medium text-fl-gold">{h.head?.split(".")[0] ?? "Преамбула"}</span>
                      <span className="text-fl-cream/65">{h.text}</span>
                    </button>
                  ))}
                </div>
              )}
              <button type="button" onClick={() => setTocOpen((v) => !v)} className="w-full rounded-lg border border-fl-line px-3 py-2 text-left text-sm text-fl-cream lg:hidden">{tocOpen ? "Скрыть оглавление" : `Оглавление · ${toc.length}`}</button>
              <div className={`${tocOpen ? "block" : "hidden"} ${card} max-h-[60vh] overflow-y-auto p-2 lg:block lg:max-h-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none`}>{Toc}</div>
              {editions.length > 0 && (
                <div className={`${card} p-3 text-xs`}>
                  <p className="mb-1.5 font-semibold text-fl-cream/80">Прежние редакции</p>
                  <ul className="space-y-2">
                    {editions.map((e) => (
                      <li key={e.id} className="text-fl-cream/60">
                        <span className="text-fl-cream/80">{e.amendedAt ? `ред. от ${e.amendedAt}` : "редакция"}</span> · заменена {dt(e.createdAt)}
                        {e.summary && <span className="block text-fl-cream/50">{e.summary}</span>}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          </aside>
          <article className="min-w-0 max-w-3xl">
            <Body secs={secs} onCopy={copy} />
          </article>
        </div>
      )}
    </main>
  );
}
