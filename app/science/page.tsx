"use client";

// Наука: самые цитируемые работы, книги и журналы, мировые тренды по учёту, аудиту и финансам —
// недельная сводка из OpenAlex (открытый индекс научных публикаций).
import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { CHART } from "@/lib/chart-theme";
import { workLinks, type ScienceSnapshot, type ScopeSnapshot, type Trend, type Work } from "@/lib/science/openalex";
import { externalSearches, type SearchResult } from "@/lib/science/search";

const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const n0 = (n: number) => Math.round(n).toLocaleString("ru-RU");
const TYPE: Record<string, string> = { article: "статья", review: "обзор", book: "книга", "book-chapter": "глава книги" };

export default function SciencePage() {
  const [snap, setSnap] = useState<ScienceSnapshot | null | undefined>(undefined);
  const [scopeKey, setScopeKey] = useState("accounting");
  const [list, setList] = useState<"cited" | "recent" | "books">("cited");
  const [admin, setAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = () => fetch("/api/science").then((r) => r.json()).then(setSnap).catch(() => setSnap(null));
  useEffect(() => {
    load();
    fetch("/api/auth/me").then((r) => r.json()).then((b) => setAdmin(b?.user?.role === "admin")).catch(() => {});
  }, []);

  async function refresh() {
    setBusy(true); setMsg(null);
    try {
      const r = await fetch("/api/science/refresh", { method: "POST" });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Не удалось обновить");
      setMsg(b.errors?.length ? `Обновлено частично: ${b.errors.join("; ")}` : "Сводка обновлена");
      await load();
    } catch (e: any) { setMsg(e.message); } finally { setBusy(false); }
  }

  const scope = snap?.scopes.find((s) => s.key === scopeKey) ?? snap?.scopes[0];
  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Наука: цитируемость и мировые тренды</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Самые цитируемые статьи, книги и журналы по бухгалтерскому учёту, аудиту и финансам и темы, которые растут быстрее всего.
          Данные — <a href="https://openalex.org" target="_blank" rel="noreferrer" className="text-fl-gold underline-offset-2 hover:underline">OpenAlex</a>,
          открытый индекс научных публикаций мира (более 300 млн работ); сводка обновляется раз в неделю.
        </p>
        {snap && <p className="mt-1 text-xs text-fl-cream/45">Обновлено {new Date(snap.updatedAt).toLocaleDateString("ru-RU", { day: "numeric", month: "long", year: "numeric" })}{snap.errors.length ? ` · часть данных из прошлой сводки: ${snap.errors.join("; ")}` : ""}</p>}
        {admin && (
          <div className="mt-2 flex items-center gap-3">
            <button onClick={refresh} disabled={busy} className="rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream/80 hover:border-fl-gold disabled:opacity-50">{busy ? "Загружаю из OpenAlex… (до минуты)" : "Обновить сейчас"}</button>
            {msg && <span className="text-xs text-fl-cream/60">{msg}</span>}
          </div>
        )}
      </header>

      {snap === undefined ? <p className="text-sm text-fl-cream/50">Загрузка…</p>
        : !snap || !scope ? (
          <p className={card}>Сводка ещё не собрана: она загрузится из OpenAlex при ближайшем ежедневном обновлении.{admin ? " Или нажмите «Обновить сейчас»." : ""}</p>
        ) : (
          <div className="space-y-5">
            <div className="flex gap-1 overflow-x-auto rounded-xl bg-fl-surface-2 p-1 text-sm sm:inline-flex">
              {snap.scopes.map((s) => (
                <button key={s.key} onClick={() => setScopeKey(s.key)} className={`shrink-0 rounded-lg px-3 py-1.5 ${scope.key === s.key ? "bg-fl-charcoal-2 font-semibold text-fl-cream shadow-card" : "text-fl-cream/60 hover:text-fl-cream"}`}>{s.title}</button>
              ))}
            </div>
            <p className="-mt-2 text-xs text-fl-cream/50">{scope.note}</p>

            <Search />

            <Overview s={scope} />

            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-fl-cream">Мировые тренды</h2>
              <p className="mt-0.5 text-sm text-fl-cream/60">Темы и ключевые слова, по которым публикуют всё больше: {scope.windows.after[0]}–{scope.windows.after[1]} против {scope.windows.before[0]}–{scope.windows.before[1]}.</p>
              <div className="mt-4 grid gap-6 lg:grid-cols-2">
                <TrendList title="Растущие темы" items={scope.topics} />
                <TrendList title="Растущие ключевые слова" items={scope.keywords} />
              </div>
            </section>

            <section className={card}>
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h2 className="font-display text-lg font-semibold text-fl-cream">Самые цитируемые</h2>
                <div className="flex gap-1 text-sm">
                  {([["cited", "за всё время"], ["recent", `за ${scope.windows.recent[0]}–${scope.windows.recent[1]}`], ["books", "книги"]] as const).map(([k, l]) => (
                    <button key={k} onClick={() => setList(k)} className={`rounded-full border px-3 py-1 ${list === k ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/65 hover:text-fl-cream"}`}>{l}</button>
                  ))}
                </div>
              </div>
              <WorkList works={list === "cited" ? scope.topCited : list === "recent" ? scope.topRecent : scope.topBooks} />
            </section>

            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-fl-cream">Ведущие журналы и сборники</h2>
              <p className="mt-0.5 text-sm text-fl-cream/60">Больше всего публикаций по теме за {scope.windows.recent[0]}–{scope.windows.recent[1]}. h-индекс — сколько статей журнала процитированы хотя бы столько же раз; средняя цитируемость — за два года после выхода (аналог импакт-фактора).</p>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[620px] text-sm">
                  <thead><tr className="text-xs text-fl-cream/50">{["Журнал или сборник", "Работ за 5 лет", "h-индекс", "Ср. цитируемость", ""].map((h, i) => <th key={i} className={`py-1.5 font-medium ${i && i < 4 ? "text-right" : "text-left"}`}>{h}</th>)}</tr></thead>
                  <tbody>{scope.journals.map((j) => (
                    <tr key={j.id} className="border-t border-fl-line/60 text-fl-cream/85">
                      <td className="py-1.5 pr-3">{j.url ? <a href={j.url} target="_blank" rel="noreferrer" className="hover:text-fl-gold">{j.name}</a> : j.name}{j.type && j.type !== "journal" && <span className="ml-1.5 text-xs text-fl-cream/45">{j.type === "conference" ? "конференция" : j.type === "book series" ? "серия книг" : j.type}</span>}</td>
                      <td className="num py-1.5 text-right">{n0(j.works)}</td>
                      <td className="num py-1.5 text-right">{j.hIndex ?? "—"}</td>
                      <td className="num py-1.5 text-right">{j.meanCited !== null ? j.meanCited.toLocaleString("ru-RU") : "—"}</td>
                      <td className="py-1.5 pl-3 text-xs text-fl-green">{j.oa ? "открытый доступ" : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            </section>

            <section className={card}>
              <h2 className="font-display text-lg font-semibold text-fl-cream">Центральная Азия в мировой науке</h2>
              <p className="mt-0.5 text-sm text-fl-cream/60">Работы с авторами из организаций региона за {scope.windows.recent[0]}–{scope.windows.recent[1]}.</p>
              <ul className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
                {scope.centralAsia.byCountry.map((c) => (
                  <li key={c.code} className={`rounded-xl border p-3 ${c.code === "KG" ? "border-fl-gold/50 bg-fl-gold/[0.06]" : "border-fl-line"}`}>
                    <p className="text-xs text-fl-cream/55">{c.name}</p>
                    <p className="num font-display text-xl font-semibold text-fl-cream">{n0(c.count)}</p>
                  </li>
                ))}
              </ul>
              {scope.centralAsia.works.length > 0 && (
                <>
                  <h3 className="mt-4 text-sm font-semibold text-fl-cream">Самые цитируемые работы авторов из региона</h3>
                  <WorkList works={scope.centralAsia.works} />
                </>
              )}
            </section>

            <p className="text-xs text-fl-cream/45">Цитирования и классификация тем — по OpenAlex (CC0); числа могут отличаться от Scopus и Web of Science, где учитывается другой набор журналов. Темы назначены работам автоматически по их тексту. Русские названия — машинный перевод, оригинал указан рядом.</p>
          </div>
        )}
    </main>
  );
}

function Overview({ s }: { s: ScopeSnapshot }) {
  const last = s.byYear.find((x) => x.year === s.windows.after[1])?.count ?? 0;
  const prev = s.byYear.find((x) => x.year === s.windows.after[1] - 1)?.count ?? 0;
  const growth = prev ? Math.round(((last - prev) / prev) * 1000) / 10 : null;
  return (
    <section className={card}>
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        <div><p className="text-xs text-fl-cream/55">Всего работ в области</p><p className="num font-display text-2xl font-semibold text-fl-cream">{n0(s.totalWorks)}</p></div>
        <div><p className="text-xs text-fl-cream/55">Опубликовано в {s.windows.after[1]}</p><p className="num font-display text-2xl font-semibold text-fl-cream">{n0(last)}</p></div>
        <div><p className="text-xs text-fl-cream/55">В открытом доступе</p><p className="num font-display text-2xl font-semibold text-fl-cream">{s.oaShare === null || s.oaShare === undefined ? "—" : `${s.oaShare.toLocaleString("ru-RU")} %`}</p><p className="text-[11px] text-fl-cream/45">работ за {s.windows.recent[0]}–{s.windows.recent[1]}</p></div>
        <div><p className="text-xs text-fl-cream/55">К {s.windows.after[1] - 1} году</p><p className={`num font-display text-2xl font-semibold ${growth === null ? "text-fl-cream" : growth >= 0 ? "text-fl-green" : "text-fl-red"}`}>{growth === null ? "—" : `${growth > 0 ? "+" : ""}${growth.toLocaleString("ru-RU")} %`}</p></div>
      </div>
      {s.byYear.length > 1 && (
        <div className="mt-4 h-52" role="img" aria-label={`Публикации по годам: ${s.byYear.map((x) => `${x.year} — ${x.count}`).join(", ")}`}>
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={s.byYear} margin={{ top: 4, right: 4, left: 0, bottom: 0 }} barCategoryGap={2}>
              <CartesianGrid stroke={CHART.grid} vertical={false} />
              <XAxis dataKey="year" tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={{ stroke: CHART.grid }} interval="preserveStartEnd" />
              <YAxis tick={{ fill: CHART.axis, fontSize: 11 }} tickLine={false} axisLine={false} width={60} tickFormatter={(v: number) => (v >= 1000 ? `${Math.round(v / 1000)} тыс.` : String(v))} />
              <Tooltip cursor={{ fill: CHART.s1Wash }} contentStyle={CHART.tooltip} formatter={(v: number) => [n0(v), "Публикаций"]} labelFormatter={(y) => `${y} год`} />
              <Bar dataKey="count" fill={CHART.s1} radius={[4, 4, 0, 0]} isAnimationActive={false} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}
      <p className="mt-1 text-xs text-fl-cream/45">Публикаций по годам; последний год может быть неполным — работы попадают в индекс с задержкой.</p>
    </section>
  );
}

function TrendList({ title, items }: { title: string; items: Trend[] }) {
  if (!items.length) return <div><h3 className="text-sm font-semibold text-fl-cream">{title}</h3><p className="mt-1 text-sm text-fl-cream/50">Нет данных.</p></div>;
  const max = Math.max(...items.map((x) => Math.min(x.growth, 500)), 1);
  return (
    <div>
      <h3 className="text-sm font-semibold text-fl-cream">{title}</h3>
      <ol className="mt-2 space-y-2">
        {items.map((t) => (
          <li key={t.id}>
            <div className="flex items-baseline justify-between gap-3 text-sm">
              <span className="min-w-0 text-fl-cream/90">{t.nameRu ?? t.name}{t.nameRu && t.nameRu !== t.name && <span className="block text-[11px] text-fl-cream/45">{t.name}</span>}</span>
              <span className="num shrink-0 text-fl-cream">{t.growth >= 999 ? "новая" : `${t.approx ? "≥ " : ""}${t.growth > 0 ? "+" : ""}${t.growth.toLocaleString("ru-RU")} %`}</span>
            </div>
            <div className="mt-1 flex items-center gap-2">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-fl-line/50"><div className="h-full rounded-full" style={{ width: `${Math.max(2, (Math.min(t.growth, 500) / max) * 100)}%`, background: CHART.s1 }} /></div>
              <span className="num w-28 shrink-0 text-right text-[11px] text-fl-cream/50">{t.approx ? "≤ " : ""}{n0(t.before)} → {n0(t.after)}</span>
            </div>
          </li>
        ))}
      </ol>
    </div>
  );
}

function WorkList({ works }: { works: Work[] }) {
  if (!works.length) return <p className="mt-3 text-sm text-fl-cream/50">Нет данных.</p>;
  return <ol className="mt-3 divide-y divide-fl-line/60">{works.map((w, i) => <WorkItem key={w.id} w={w} n={i + 1} />)}</ol>;
}

const LICENSE: Record<string, string> = { "cc-by": "CC BY — можно читать, копировать и цитировать со ссылкой", "cc-by-sa": "CC BY-SA", "cc-by-nc": "CC BY-NC — некоммерческое использование", "cc-by-nc-nd": "CC BY-NC-ND", "cc-by-nd": "CC BY-ND", "cc0": "CC0 — общественное достояние", "public-domain": "общественное достояние" };
const VERSION: Record<string, string> = { publishedVersion: "версия как в журнале", acceptedVersion: "принятая рукопись (текст как в журнале, без вёрстки)", submittedVersion: "препринт — до рецензирования" };

function WorkItem({ w, n }: { w: Work; n: number }) {
  const [open, setOpen] = useState(false);
  const links = workLinks(w);
  const free = links.find((l) => l.kind === "pdf" || l.kind === "oa");
  return (
    <li className="flex gap-3 py-2.5">
      <span className="num w-6 shrink-0 pt-0.5 text-right text-sm text-fl-cream/40">{n}</span>
      <div className="min-w-0 flex-1">
        <button onClick={() => setOpen((v) => !v)} className="text-left text-sm font-medium text-fl-cream hover:text-fl-gold">{w.title}</button>
        {w.titleRu && w.titleRu !== w.title && <p className="text-[13px] text-fl-cream/60">{w.titleRu}</p>}
        <p className="mt-0.5 text-xs text-fl-cream/50">
          {w.authors.join(", ")}{w.moreAuthors ? ` и ещё ${w.moreAuthors}` : ""}{w.year ? ` · ${w.year}` : ""}{w.source ? ` · ${w.source}` : ""} · {TYPE[w.type] ?? w.type}
        </p>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs">
          {free ? <a href={free.href} target="_blank" rel="noreferrer" className="font-semibold text-fl-green hover:underline">{free.label} ↗</a> : <span className="text-fl-cream/40">полный текст — у издателя</span>}
          <button onClick={() => setOpen((v) => !v)} className="text-fl-gold hover:underline">{open ? "Скрыть" : w.abstract ? "Аннотация и ссылки" : "Ссылки"}</button>
        </div>
        {open && (
          <div className="mt-2 rounded-lg bg-fl-surface-2 p-3 text-sm">
            {w.abstract ? <p className="whitespace-pre-line leading-relaxed text-fl-cream/85">{w.abstract}</p> : <p className="text-fl-cream/55">Аннотация в открытых данных не опубликована — она есть на странице издателя.</p>}
            {free && (
              <p className="mt-2 text-xs text-fl-cream/60">
                Бесплатная версия{w.oaVersion && VERSION[w.oaVersion] ? ` — ${VERSION[w.oaVersion]}` : ""}{w.license ? `; лицензия ${LICENSE[w.license] ?? w.license.toUpperCase()}` : ""}.
                {" "}<a href={`https://translate.google.com/translate?sl=auto&tl=ru&u=${encodeURIComponent(free.href)}`} target="_blank" rel="noreferrer" className="text-fl-gold hover:underline">Открыть в переводе на русский ↗</a>
              </p>
            )}
            <div className="mt-2 flex flex-wrap gap-2">
              {links.map((l) => (
                <a key={l.kind} href={l.href} target="_blank" rel="noreferrer" className={`rounded-md border px-2.5 py-1 text-xs ${l.kind === "pdf" || l.kind === "oa" ? "border-fl-green/50 text-fl-green" : "border-fl-line text-fl-cream/75 hover:border-fl-gold"}`}>{l.label} ↗</a>
              ))}
            </div>
            {links.some((l) => l.kind === "scopus") && <p className="mt-1.5 text-[11px] text-fl-cream/45">Scopus откроется, если у вас есть доступ (обычно через вуз или библиотеку).</p>}
          </div>
        )}
      </div>
      <div className="shrink-0 text-right">
        <p className="num text-sm font-semibold text-fl-cream">{n0(w.cited)}</p>
        <p className="text-[11px] text-fl-cream/45">цитирований</p>
      </div>
    </li>
  );
}

/** Поиск по мировой литературе: OpenAlex + ссылки на русскоязычные и открытые библиотеки. */
function Search() {
  const [q, setQ] = useState("");
  const [scope, setScope] = useState<"both" | "accounting" | "finance" | "all">("both");
  const [oa, setOa] = useState(true);
  const [sort, setSort] = useState<"relevance" | "cited" | "new">("relevance");
  const [from, setFrom] = useState("");
  const [page, setPage] = useState(1);
  const [res, setRes] = useState<(SearchResult & { query: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [asked, setAsked] = useState("");

  async function run(p = 1) {
    const query = q.trim();
    if (query.length < 2) return;
    setBusy(true); setErr(null); setAsked(query);
    const params = new URLSearchParams({ q: query, scope, oa: oa ? "1" : "0", sort, page: String(p), ...(from ? { from } : {}) });
    try {
      const r = await fetch(`/api/science/search?${params}`);
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Поиск не удался");
      setRes({ ...b, query }); setPage(p);
    } catch (e: any) { setErr(e.message); setRes(null); } finally { setBusy(false); }
  }
  const pages = res ? Math.min(10, Math.ceil(res.total / res.perPage)) : 0;
  const sel = "rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1.5 text-sm text-fl-cream";
  return (
    <section className={card}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Поиск по мировой литературе</h2>
      <p className="mt-0.5 text-sm text-fl-cream/60">По названиям, аннотациям и полным текстам. С отметкой «только открытый доступ» — работы, которые можно прочитать бесплатно и легально.</p>
      <form onSubmit={(e) => { e.preventDefault(); run(1); }} className="mt-3 flex flex-wrap gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Например: IFRS 16 leases, audit quality, ESG disclosure, Islamic finance" className="min-w-[240px] flex-1 rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none" />
        <button disabled={busy || q.trim().length < 2} className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Ищу…" : "Найти"}</button>
      </form>
      <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-fl-cream/60">
        <select value={scope} onChange={(e) => setScope(e.target.value as typeof scope)} className={sel}>
          <option value="both">Учёт, аудит и финансы</option><option value="accounting">Только учёт и аудит</option><option value="finance">Только финансы</option><option value="all">Вся наука</option>
        </select>
        <select value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} className={sel}>
          <option value="relevance">Сначала подходящие</option><option value="cited">Сначала цитируемые</option><option value="new">Сначала новые</option>
        </select>
        <label className="flex items-center gap-1">с года <input inputMode="numeric" value={from} onChange={(e) => setFrom(e.target.value.replace(/\D/g, "").slice(0, 4))} placeholder="2015" className={`${sel} w-20`} /></label>
        <label className="flex items-center gap-1.5 text-sm text-fl-cream/80"><input type="checkbox" checked={oa} onChange={(e) => setOa(e.target.checked)} className="h-4 w-4" /> только открытый доступ</label>
      </div>
      {err && <p className="mt-3 text-sm text-fl-red">{err}</p>}
      {res && (
        <>
          <p className="mt-3 text-xs text-fl-cream/55">Найдено: {n0(res.total)}{res.total > res.perPage ? ` · страница ${res.page} из ${pages}` : ""}</p>
          <WorkList works={res.works} />
          {pages > 1 && (
            <div className="mt-2 flex gap-2 text-sm">
              <button disabled={busy || page <= 1} onClick={() => run(page - 1)} className="rounded-md border border-fl-line px-3 py-1 disabled:opacity-40">← Назад</button>
              <button disabled={busy || page >= pages} onClick={() => run(page + 1)} className="rounded-md border border-fl-line px-3 py-1 disabled:opacity-40">Дальше →</button>
            </div>
          )}
        </>
      )}
      {asked && (
        <div className="mt-4 border-t border-fl-line pt-3">
          <p className="text-xs text-fl-cream/55">Тот же запрос в других библиотеках — в том числе на русском языке:</p>
          <div className="mt-1.5 flex flex-wrap gap-2">
            {externalSearches(asked).map((x) => <a key={x.label} href={x.href} target="_blank" rel="noreferrer" title={x.note} className="rounded-md border border-fl-line px-2.5 py-1 text-xs text-fl-cream/80 hover:border-fl-gold">{x.label} ↗</a>)}
          </div>
        </div>
      )}
    </section>
  );
}
