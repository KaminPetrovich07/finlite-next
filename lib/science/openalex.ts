// ════════════════════════════════════════════════════════════════════════
// lib/science/openalex.ts — мировая наука по учёту, аудиту и финансам из OpenAlex
// (openalex.org — открытый индекс ≈ 320 млн научных работ, CC0).
//
// Раз в неделю собирается «снимок» по каждой области (подобласти классификатора ASJC):
//   • самые цитируемые работы — за всё время и за последние 5 лет; самые цитируемые книги;
//   • ведущие журналы и сборники (по числу публикаций за 5 лет, h-индекс, средняя цитируемость);
//   • число публикаций по годам;
//   • мировые тренды — темы и ключевые слова, которые растут быстрее всего
//     (публикации за последние 3 полных года против трёх предыдущих);
//   • Центральная Азия — публикации авторов из Кыргызстана и соседних стран, самые цитируемые из них.
// Около 13 запросов на область; без ключа OpenAlex даёт ~1000 запросов в день.
// Разбор ответов — чистые функции (тесты на образцах ответов).
// ════════════════════════════════════════════════════════════════════════

export const API = "https://api.openalex.org";

export interface Scope { key: string; title: string; subfield: number; note: string }

/** Области: подобласти классификатора ASJC в OpenAlex. */
export const SCOPES: Scope[] = [
  { key: "accounting", title: "Бухгалтерский учёт и аудит", subfield: 1402, note: "Финансовая и управленческая отчётность, аудит, МСФО, раскрытие информации, ESG-отчётность, налоговый учёт" },
  { key: "finance", title: "Финансы", subfield: 2003, note: "Корпоративные финансы, банки, страхование, рынки капитала, финансовые риски" },
];

export const CENTRAL_ASIA: Record<string, string> = { KG: "Кыргызстан", KZ: "Казахстан", UZ: "Узбекистан", TJ: "Таджикистан", TM: "Туркменистан" };

export interface Work {
  id: string;
  title: string;
  titleRu?: string;
  year: number | null;
  cited: number;
  type: string;
  doi: string | null;
  url: string | null;
  oa: boolean;
  source: string | null;
  authors: string[];
  moreAuthors: number;
  countries: string[];
  topic: string | null;
  /** аннотация (из OpenAlex), если издатель её открыл */
  abstract?: string | null;
  abstractRu?: string;
  /** бесплатная легальная версия полного текста (открытый доступ: журнал, репозиторий, препринт) */
  oaPdf?: string | null;
  oaUrl?: string | null;
  /** лицензия открытой версии: cc-by, cc-by-nc … */
  license?: string | null;
  /** какая версия открыта: publishedVersion — как в журнале, acceptedVersion — принятая рукопись, submittedVersion — препринт */
  oaVersion?: string | null;
}

export interface Journal { id: string; name: string; works: number; hIndex: number | null; meanCited: number | null; oa: boolean; type: string | null; url: string | null }
/** approx — в раннем окне тема не вошла в 200 крупнейших: «было» — не больше указанного, рост — не меньше */
export interface Trend { id: string; name: string; nameRu?: string; before: number; after: number; growth: number; approx?: boolean }
export interface YearCount { year: number; count: number }

export interface ScopeSnapshot {
  key: string;
  title: string;
  note: string;
  subfield: number;
  /** окна для трендов: [from, to] включительно */
  windows: { before: [number, number]; after: [number, number]; recent: [number, number] };
  totalWorks: number;
  /** доля работ в открытом доступе за последние 5 лет, % */
  oaShare: number | null;
  byYear: YearCount[];
  topCited: Work[];
  topRecent: Work[];
  topBooks: Work[];
  journals: Journal[];
  topics: Trend[];
  keywords: Trend[];
  centralAsia: { byCountry: Array<{ code: string; name: string; count: number }>; works: Work[] };
  /** разделы, которые не загрузились в последний раз (показаны данные прошлой сводки) */
  errors?: string[];
  /** когда область обновлялась в последний раз */
  updatedAt?: string;
}

export interface ScienceSnapshot {
  source: "OpenAlex";
  updatedAt: string;
  scopes: ScopeSnapshot[];
  errors: string[];
  /** original text → Russian, reused between updates */
  translations: Record<string, string>;
}

// ── parsing (pure) ──────────────────────────────────────────────────────

type J = any; // eslint-disable-line @typescript-eslint/no-explicit-any
const shortId = (id: string | null | undefined) => (id ?? "").replace(/^https?:\/\/openalex\.org\//, "");

/** OpenAlex stores abstracts as an inverted index (word → positions); put the words back in order. */
export function abstractFromIndex(idx: unknown): string | null {
  if (!idx || typeof idx !== "object") return null;
  const words: string[] = [];
  for (const [word, positions] of Object.entries(idx as Record<string, unknown>)) {
    if (!Array.isArray(positions)) continue;
    for (const p of positions) if (Number.isInteger(p) && p >= 0 && p < 5000) words[p as number] = word;
  }
  const text = words.filter((x) => x !== undefined).join(" ").replace(/\s+([,.;:!?)])/g, "$1").replace(/\(\s+/g, "(").trim();
  return text.length >= 40 ? text : null;
}

export function parseWork(w: J): Work {
  const auth: J[] = Array.isArray(w?.authorships) ? w.authorships : [];
  const countries = new Set<string>();
  for (const a of auth) {
    for (const c of a?.countries ?? []) if (typeof c === "string") countries.add(c.toUpperCase());
    for (const i of a?.institutions ?? []) if (i?.country_code) countries.add(String(i.country_code).toUpperCase());
  }
  const doi = typeof w?.doi === "string" && w.doi ? w.doi : null;
  const src = w?.primary_location?.source ?? null;
  return {
    id: shortId(w?.id),
    title: String(w?.display_name ?? w?.title ?? "").replace(/<[^>]+>/g, "").trim() || "Без названия",
    year: typeof w?.publication_year === "number" ? w.publication_year : null,
    cited: Number(w?.cited_by_count ?? 0) || 0,
    type: String(w?.type ?? "article"),
    doi,
    url: doi ?? w?.primary_location?.landing_page_url ?? (w?.id ? String(w.id) : null),
    oa: !!w?.open_access?.is_oa,
    source: src?.display_name ?? null,
    authors: auth.slice(0, 3).map((a) => a?.author?.display_name).filter(Boolean),
    moreAuthors: Math.max(0, auth.length - 3),
    countries: [...countries],
    topic: w?.primary_topic?.display_name ?? null,
    abstract: abstractFromIndex(w?.abstract_inverted_index),
    oaPdf: w?.best_oa_location?.pdf_url ?? null,
    oaUrl: w?.best_oa_location?.landing_page_url ?? w?.open_access?.oa_url ?? null,
    license: w?.best_oa_location?.license ?? null,
    oaVersion: w?.best_oa_location?.version ?? null,
  };
}

/** Where to read or find the work: the free version, the publisher, Scopus (with the reader's own access), Google Scholar. */
export function workLinks(w: Pick<Work, "doi" | "title" | "oaPdf" | "oaUrl" | "url">): Array<{ kind: "pdf" | "oa" | "publisher" | "scopus" | "scholar"; label: string; href: string }> {
  const out: Array<{ kind: "pdf" | "oa" | "publisher" | "scopus" | "scholar"; label: string; href: string }> = [];
  const safe = (u: string | null | undefined) => (u && /^https?:\/\//i.test(u) ? u : null);
  const doi = w.doi ? w.doi.replace(/^https?:\/\/(dx\.)?doi\.org\//i, "") : null;
  if (safe(w.oaPdf)) out.push({ kind: "pdf", label: "Читать бесплатно (PDF)", href: w.oaPdf! });
  if (safe(w.oaUrl) && w.oaUrl !== w.oaPdf) out.push({ kind: "oa", label: out.length ? "Открытая версия" : "Читать бесплатно", href: w.oaUrl! });
  if (doi) out.push({ kind: "publisher", label: "У издателя (DOI)", href: `https://doi.org/${doi}` });
  else if (safe(w.url)) out.push({ kind: "publisher", label: "Источник", href: w.url! });
  if (doi) out.push({ kind: "scopus", label: "В Scopus", href: `https://www.scopus.com/results/results.uri?src=s&sot=b&sdt=b&s=${encodeURIComponent(`DOI(${doi})`)}` });
  out.push({ kind: "scholar", label: "Google Академия", href: `https://scholar.google.com/scholar?q=${encodeURIComponent(doi ? doi : `"${w.title}"`)}` });
  return out;
}

export function parseGroups(body: J): Array<{ key: string; name: string; count: number }> {
  const g: J[] = Array.isArray(body?.group_by) ? body.group_by : [];
  return g.map((x) => ({ key: shortId(String(x?.key ?? "")), name: String(x?.key_display_name ?? x?.key ?? ""), count: Number(x?.count ?? 0) || 0 }))
    .filter((x) => x.key && x.key !== "unknown" && x.key !== "null");
}

export function parseJournal(s: J, works: number): Journal {
  const st = s?.summary_stats ?? {};
  return {
    id: shortId(s?.id), name: String(s?.display_name ?? ""), works,
    hIndex: typeof st.h_index === "number" ? st.h_index : null,
    meanCited: typeof st["2yr_mean_citedness"] === "number" ? Math.round(st["2yr_mean_citedness"] * 100) / 100 : null,
    oa: !!s?.is_oa, type: s?.type ?? null, url: s?.homepage_url ?? null,
  };
}

/**
 * Fastest-growing items between two equal windows. Small items are noise: an item needs at least
 * `minAfter` works in the later window; growth is relative, sorted by growth, then by size.
 */
export function trends(before: Array<{ key: string; name: string; count: number }>, after: Array<{ key: string; name: string; count: number }>, minAfter: number, limit: number): Trend[] {
  const b = new Map(before.map((x) => [x.key, x.count]));
  // OpenAlex returns the 200 largest groups: an item missing from the earlier window had at most its smallest count
  const floor = before.length >= 200 ? Math.min(...before.map((x) => x.count)) : 0;
  return after
    .filter((x) => x.count >= minAfter)
    .map((x) => {
      const known = b.has(x.key);
      const prev = known ? b.get(x.key)! : floor;
      const growth = prev > 0 ? Math.round(((x.count - prev) / prev) * 1000) / 10 : 999;
      return { id: x.key, name: x.name, before: prev, after: x.count, growth, ...(known ? {} : { approx: true }) };
    })
    .filter((x) => x.growth > 0) // тренды — только растущие
    .sort((p, q) => q.growth - p.growth || q.after - p.after)
    .slice(0, limit);
}

/** Windows for the trends: the last three complete years against the three before. */
export function windowsFor(now: Date): ScopeSnapshot["windows"] {
  const y = now.getUTCFullYear() - 1; // текущий год ещё не закончен и индексируется с опозданием
  return { before: [y - 5, y - 3], after: [y - 2, y], recent: [y - 4, y] };
}

// ── requests ────────────────────────────────────────────────────────────

export type Fetcher = (url: string) => Promise<J>;

const WORK_FIELDS = "id,doi,display_name,publication_year,cited_by_count,type,open_access,best_oa_location,primary_location,authorships,primary_topic,abstract_inverted_index";
const PAPERS = "type:article|review";

export function url(path: string, params: Record<string, string | number>, apiKey?: string): string {
  const q = new URLSearchParams(Object.entries(params).map(([k, v]) => [k, String(v)]));
  if (apiKey) q.set("api_key", apiKey);
  return `${API}${path}?${q.toString()}`;
}

/** Runs async jobs with at most `n` in flight (OpenAlex allows 10 requests a second without a key). */
export async function pool<T>(jobs: Array<() => Promise<T>>, n: number): Promise<T[]> {
  const out: T[] = new Array(jobs.length);
  let next = 0;
  const worker = async () => { while (next < jobs.length) { const i = next++; out[i] = await jobs[i](); } };
  await Promise.all(Array.from({ length: Math.min(n, jobs.length) }, worker));
  return out;
}

const SECTION: Record<string, string> = {
  topCited: "самые цитируемые", topRecent: "цитируемые за 5 лет", topBooks: "книги", byYear: "публикации по годам",
  total: "число работ", oa: "открытый доступ", journals: "журналы", topics: "тренды тем", keywords: "тренды ключевых слов", ca: "Центральная Азия",
};

/**
 * One scope: ~14 requests, 4 at a time. Every section is independent: a request that fails leaves that
 * section from the previous snapshot (or empty) and is listed in `errors`, the rest is still collected.
 */
export async function fetchScope(scope: Scope, get: Fetcher, now = new Date(), apiKey?: string, previous?: ScopeSnapshot | null): Promise<ScopeSnapshot> {
  const w = windowsFor(now);
  const sf = `primary_topic.subfield.id:${scope.subfield}`;
  const yr = (a: [number, number]) => `publication_year:${a[0]}-${a[1]}`;
  const works = async (filter: string, n: number) => {
    const b = await get(url("/works", { filter, sort: "cited_by_count:desc", per_page: n, select: WORK_FIELDS }, apiKey));
    return (Array.isArray(b?.results) ? b.results : []).map(parseWork);
  };
  const groups = async (filter: string, by: string) => parseGroups(await get(url("/works", { filter, group_by: by }, apiKey)));
  const ca = Object.keys(CENTRAL_ASIA).join("|");
  const firstYear = w.after[1] - 24;

  const errors: string[] = [];
  type Res = { ok: true; v: unknown } | { ok: false };
  const job = (key: string, fn: () => Promise<unknown>) => async (): Promise<Res> => {
    try { return { ok: true, v: await fn() }; }
    catch (e) { errors.push(`${SECTION[key] ?? key}: ${e instanceof Error ? e.message : String(e)}`); return { ok: false }; }
  };
  const keys = ["topCited", "topRecent", "topBooks", "byYear", "total", "oa", "sources", "topicsBefore", "topicsAfter", "kwBefore", "kwAfter", "caGroups", "caWorks"] as const;
  const res = await pool([
    job("topCited", () => works(`${sf},${PAPERS}`, 15)),
    job("topRecent", () => works(`${sf},${PAPERS},${yr(w.recent)}`, 15)),
    job("topBooks", () => works(`${sf},type:book`, 10)),
    job("byYear", () => groups(`${sf},publication_year:${firstYear}-${w.after[1]}`, "publication_year")),
    job("total", async () => (await get(url("/works", { filter: sf, per_page: 1, select: "id" }, apiKey)))?.meta?.count ?? 0),
    job("oa", () => groups(`${sf},${yr(w.recent)}`, "open_access.is_oa")),
    job("journals", () => groups(`${sf},${yr(w.recent)}`, "primary_location.source.id")),
    job("topics", () => groups(`${sf},${yr(w.before)}`, "primary_topic.id")),
    job("topics", () => groups(`${sf},${yr(w.after)}`, "primary_topic.id")),
    job("keywords", () => groups(`${sf},${yr(w.before)}`, "keywords.id")),
    job("keywords", () => groups(`${sf},${yr(w.after)}`, "keywords.id")),
    job("ca", () => groups(`${sf},${yr(w.recent)},authorships.institutions.country_code:${ca}`, "authorships.institutions.country_code")),
    job("ca", () => works(`${sf},authorships.institutions.country_code:${ca}`, 10)),
  ], 4);
  if (res.every((x) => !x.ok)) throw new Error(errors[0] ?? "OpenAlex не ответил");
  const r = Object.fromEntries(keys.map((k, i) => [k, res[i]])) as Record<(typeof keys)[number], Res>;
  const val = <T,>(x: Res): T | undefined => (x.ok ? (x.v as T) : undefined);
  type G = Array<{ key: string; name: string; count: number }>;

  // journals: names and counts from the grouping; h-index and citedness from /sources — optional
  let journals: Journal[] | undefined;
  const src = val<G>(r.sources)?.slice(0, 12);
  if (src) {
    journals = src.map((g) => ({ id: g.key, name: g.name, works: g.count, hIndex: null, meanCited: null, oa: false, type: null, url: null }));
    if (src.length) {
      try {
        const b = await get(url("/sources", { filter: `openalex:${src.map((x) => x.key).join("|")}`, per_page: src.length, select: "id,display_name,summary_stats,is_oa,type,homepage_url" }, apiKey));
        const info = new Map<string, J>((Array.isArray(b?.results) ? b.results : []).map((x: J) => [shortId(x.id), x]));
        journals = src.map((g) => (info.has(g.key) ? parseJournal(info.get(g.key), g.count) : journals!.find((j) => j.id === g.key)!));
      } catch (e) { errors.push(`h-индекс журналов: ${e instanceof Error ? e.message : String(e)}`); }
    }
  }

  const oaG = val<G>(r.oa);
  const oaTrue = oaG?.find((g) => g.key === "true")?.count ?? 0, oaAll = oaG?.reduce((x, g) => x + g.count, 0) ?? 0;
  const tB = val<G>(r.topicsBefore), tA = val<G>(r.topicsAfter), kB = val<G>(r.kwBefore), kA = val<G>(r.kwAfter);
  const scale = Math.max(1, Math.round((tA ?? []).reduce((x, g) => x + g.count, 0) / 2000));
  const caG = val<G>(r.caGroups);
  const p = previous ?? null;

  return {
    key: scope.key, title: scope.title, note: scope.note, subfield: scope.subfield, windows: w,
    totalWorks: val<number>(r.total) ?? p?.totalWorks ?? 0,
    oaShare: oaG ? (oaAll ? Math.round((oaTrue / oaAll) * 1000) / 10 : null) : p?.oaShare ?? null,
    byYear: val<G>(r.byYear)?.map((x) => ({ year: Number(x.key), count: x.count })).filter((x) => Number.isFinite(x.year)).sort((a2, b2) => a2.year - b2.year) ?? p?.byYear ?? [],
    topCited: val<Work[]>(r.topCited) ?? p?.topCited ?? [],
    topRecent: val<Work[]>(r.topRecent) ?? p?.topRecent ?? [],
    topBooks: val<Work[]>(r.topBooks) ?? p?.topBooks ?? [],
    journals: journals ?? p?.journals ?? [],
    topics: tB && tA ? trends(tB, tA, 20 * scale, 12) : p?.topics ?? [],
    keywords: kB && kA ? trends(kB, kA, 30 * scale, 20) : p?.keywords ?? [],
    centralAsia: {
      byCountry: caG ? Object.entries(CENTRAL_ASIA).map(([code, name]) => ({ code, name, count: caG.find((g) => g.key.toUpperCase() === code)?.count ?? 0 })).sort((a2, b2) => b2.count - a2.count) : p?.centralAsia.byCountry ?? [],
      works: val<Work[]>(r.caWorks) ?? p?.centralAsia.works ?? [],
    },
    errors: [...new Set(errors)],
    updatedAt: now.toISOString(),
  };
}

/** Strings worth translating into Russian (titles, topics, keywords) that are not translated yet. */
export function untranslated(snap: ScienceSnapshot): string[] {
  const out = new Set<string>();
  for (const s of snap.scopes) {
    for (const w of [...s.topCited, ...s.topRecent, ...s.topBooks, ...s.centralAsia.works]) out.add(w.title);
    for (const t of [...s.topics, ...s.keywords]) out.add(t.name);
  }
  return [...out].filter((t) => t && !snap.translations[t] && !/[а-яё]/i.test(t));
}

/** Puts the known translations onto the snapshot items. */
export function applyTranslations(snap: ScienceSnapshot): ScienceSnapshot {
  const tr = snap.translations;
  const w = (x: Work): Work => (tr[x.title] ? { ...x, titleRu: tr[x.title] } : x);
  const t = (x: Trend): Trend => (tr[x.name] ? { ...x, nameRu: tr[x.name] } : x);
  return {
    ...snap,
    scopes: snap.scopes.map((s) => ({
      ...s, topCited: s.topCited.map(w), topRecent: s.topRecent.map(w), topBooks: s.topBooks.map(w),
      topics: s.topics.map(t), keywords: s.keywords.map(t), centralAsia: { ...s.centralAsia, works: s.centralAsia.works.map(w) },
    })),
  };
}
