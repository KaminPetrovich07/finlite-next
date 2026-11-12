"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { ago } from "@/components/community/NewsCard";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";

interface Doc { id: string; slug: string; title: string; category: string; kind: string; sourceUrl: string | null; requisites: string | null; amendedAt: string | null; chars: number; origin: string | null; autoUpdate: boolean; loadedAt: string | null; checkedAt: string | null; changedAt: string | null; lastError: string | null }
interface Result { slug: string; title: string; total: number; hits: Array<{ anchor: string | null; where: string | null; text: string }> }

const KIND: Record<string, string> = { code: "Кодекс", law: "Закон", decree: "Постановление", nbkr: "Акт НБКР", standard: "Стандарт", other: "Документ" };
const SearchIcon = () => <svg aria-hidden viewBox="0 0 20 20" className="h-4 w-4"><path fill="currentColor" d="M8.5 2a6.5 6.5 0 0 1 5.18 10.43l4.2 4.2-1.06 1.06-4.2-4.2A6.5 6.5 0 1 1 8.5 2Zm0 1.5a5 5 0 1 0 0 10 5 5 0 0 0 0-10Z" /></svg>;

function Mark({ text, q }: { text: string; q: string }) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || !q) return <>{text}</>;
  return <>{text.slice(0, i)}<mark className="rounded bg-fl-gold/30 px-0.5 text-fl-cream">{text.slice(i, i + q.length)}</mark>{text.slice(i + q.length)}</>;
}

export default function LawPage() {
  const [docs, setDocs] = useState<Doc[] | null>(null);
  const [cats, setCats] = useState<string[]>([]);
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Result[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [f, setF] = useState({ title: "", category: "Постановления и разъяснения", kind: "decree", url: "" });
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/law${q.trim().length >= 2 ? `?q=${encodeURIComponent(q.trim())}` : ""}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDocs(b.docs); setCats(b.categories); setResults(b.results ?? null); setError(null);
    } catch (e: any) { setError(e.message); }
  }, [q]);
  useEffect(() => { const t = setTimeout(load, q ? 350 : 0); return () => clearTimeout(t); }, [load, q]);

  async function add() {
    const r = await fetch("/api/law", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const b = await r.json();
    if (!r.ok) { show(b.error, "error"); return; }
    window.location.href = `/law/${b.doc.slug}`;
  }

  const loaded = docs?.filter((d) => d.chars > 0).length ?? 0;
  const lastCheck = docs?.map((d) => d.checkedAt).filter(Boolean).sort().pop() ?? null;

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Правовая база</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            Полные тексты кодексов, законов и постановлений с оглавлением и ссылками на статьи. Каждую ночь документы сверяются
            с источником: новая редакция сохраняется, прежняя остаётся в истории, а изменённые статьи попадают в «Новости и наука».
          </p>
        </div>
        <button type="button" onClick={() => setAdding((v) => !v)} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream hover:border-fl-gold/50">{adding ? "Закрыть" : "+ Добавить документ"}</button>
      </header>

      {adding && (
        <section className={`${card} mt-5 p-4 sm:p-5`}>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">Полное название</span><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Постановление Кабинета Министров КР «Об утверждении …»" className={field} /></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Раздел</span><select value={f.category} onChange={(e) => setF({ ...f, category: e.target.value })} className={field}>{cats.map((c) => <option key={c}>{c}</option>)}</select></label>
            <label className="block"><span className="mb-1 block text-xs text-fl-cream/55">Вид</span><select value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value })} className={field}>{Object.entries(KIND).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
            <label className="block sm:col-span-2"><span className="mb-1 block text-xs text-fl-cream/55">Ссылка на документ (можно добавить потом)</span><input value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} placeholder="https://cbd.minjust.gov.kg/…" className={field} /></label>
          </div>
          <button type="button" onClick={add} disabled={f.title.trim().length < 5} className="mt-3 rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">Добавить и перейти к загрузке</button>
        </section>
      )}

      <label className="relative mt-6 block">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-fl-cream/40"><SearchIcon /></span>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Поиск по всем текстам: «необлагаемый минимум», «счет-фактура», «отпуск»…" className="w-full rounded-2xl border border-fl-line bg-fl-charcoal-2 py-3.5 pl-11 pr-4 text-[15px] text-fl-cream shadow-card placeholder:text-fl-cream/35 focus:border-fl-gold focus:outline-none" />
      </label>
      {docs && <p className="mt-2 text-xs text-fl-cream/50">Загружено документов: {loaded} из {docs.length}{lastCheck ? ` · последняя сверка с источниками ${ago(lastCheck)}` : ""}</p>}

      {error && <p className="mt-5 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      {results && (
        <section className="mt-6 space-y-3">
          {results.length === 0 && <p className={`${card} p-4 text-sm text-fl-cream/60`}>В загруженных текстах «{q}» не встречается.</p>}
          {results.map((r) => (
            <div key={r.slug} className={`${card} p-4`}>
              <a href={`/law/${r.slug}`} className="font-display font-semibold text-fl-cream hover:text-fl-gold">{r.title}</a>
              <span className="ml-2 text-xs text-fl-cream/50">совпадений: {r.total}</span>
              <ul className="mt-2 space-y-2">
                {r.hits.map((h, i) => (
                  <li key={i}>
                    <a href={`/law/${r.slug}?q=${encodeURIComponent(q)}${h.anchor ? `#${h.anchor}` : ""}`} className="block rounded-lg px-2 py-1.5 text-sm hover:bg-fl-surface-2">
                      {h.where && <span className="mr-2 font-medium text-fl-gold">{h.where}</span>}
                      <span className="text-fl-cream/75"><Mark text={h.text} q={q} /></span>
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      )}

      {!results && docs && cats.filter((c) => docs.some((d) => d.category === c)).map((c) => (
        <section key={c} className="mt-8">
          <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-fl-cream/50">{c}</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            {docs.filter((d) => d.category === c).map((d) => (
              <a key={d.id} href={`/law/${d.slug}`} className={`${card} group flex flex-col p-4 transition hover:border-fl-gold/50`}>
                <span className="text-[11px] font-semibold uppercase tracking-wide text-fl-cream/45">{KIND[d.kind] ?? "Документ"}</span>
                <span className="mt-1 font-display font-semibold leading-snug text-fl-cream group-hover:text-fl-gold">{d.title}</span>
                {d.requisites && <span className="mt-0.5 text-xs text-fl-cream/55">{d.requisites}</span>}
                <span className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                  {d.chars > 0 ? (
                    <>
                      <span className="inline-flex items-center gap-1.5 text-fl-green"><span className="h-1.5 w-1.5 rounded-full bg-fl-green" />полный текст</span>
                      {d.amendedAt && <span className="text-fl-cream/55">ред. от {d.amendedAt}</span>}
                      {d.changedAt && <span className="rounded bg-fl-amber/15 px-1.5 py-0.5 text-fl-amber">изменён {ago(d.changedAt)}</span>}
                      <span className="text-fl-cream/40">{d.sourceUrl && d.autoUpdate ? "сверяется каждую ночь" : "загружен файлом"}</span>
                    </>
                  ) : <span className="inline-flex items-center gap-1.5 text-fl-cream/50"><span className="h-1.5 w-1.5 rounded-full bg-fl-cream/30" />не загружен — открыть и загрузить</span>}
                  {d.lastError && <span className="text-fl-red">сверка не удалась</span>}
                </span>
              </a>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
