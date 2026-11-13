// Поиск по мировой литературе через OpenAlex: запрос + область + годы + «только открытый доступ».
// Поиск стоит дороже простого запроса (без ключа OpenAlex — около 100 поисков в день), поэтому
// одинаковые запросы берутся из кэша на сутки, а с одного адреса — не больше 30 поисков в час.
import { API, parseWork, SCOPES, type Work } from "./openalex";

export interface SearchParams {
  q: string;
  scope: "accounting" | "finance" | "both" | "all";
  oa: boolean;
  from?: number | null;
  to?: number | null;
  sort: "relevance" | "cited" | "new";
  page: number;
}

export interface SearchResult { total: number; page: number; perPage: number; works: Work[] }

export const PER_PAGE = 20;
const FIELDS = "id,doi,display_name,publication_year,cited_by_count,type,open_access,best_oa_location,primary_location,authorships,primary_topic,abstract_inverted_index";

export function normalizeParams(raw: Record<string, string | null | undefined>): SearchParams | null {
  const q = (raw.q ?? "").replace(/\s+/g, " ").trim().slice(0, 200);
  if (q.length < 2) return null;
  const scope = (["accounting", "finance", "both", "all"] as const).find((s) => s === raw.scope) ?? "both";
  const year = (v: string | null | undefined) => { const n = Number(v); return Number.isInteger(n) && n >= 1900 && n <= 2100 ? n : null; };
  const sort = (["relevance", "cited", "new"] as const).find((s) => s === raw.sort) ?? "relevance";
  const page = Math.min(10, Math.max(1, Number(raw.page) || 1));
  return { q, scope, oa: raw.oa === "1" || raw.oa === "true", from: year(raw.from), to: year(raw.to), sort, page };
}

export function searchUrl(p: SearchParams, apiKey?: string): string {
  const filters: string[] = ["type:article|review|book|book-chapter"];
  const sub = p.scope === "both" ? SCOPES.map((s) => s.subfield).join("|") : p.scope === "all" ? null : String(SCOPES.find((s) => s.key === p.scope)!.subfield);
  if (sub) filters.push(`primary_topic.subfield.id:${sub}`);
  if (p.oa) filters.push("open_access.is_oa:true");
  if (p.from || p.to) filters.push(`publication_year:${p.from ?? 1900}-${p.to ?? 2100}`);
  const q = new URLSearchParams({
    search: p.q, filter: filters.join(","), per_page: String(PER_PAGE), page: String(p.page), select: FIELDS,
    sort: p.sort === "cited" ? "cited_by_count:desc" : p.sort === "new" ? "publication_date:desc" : "relevance_score:desc",
  });
  if (apiKey) q.set("api_key", apiKey);
  return `${API}/works?${q.toString()}`;
}

export function parseSearch(body: unknown, page: number): SearchResult {
  const b = body as { meta?: { count?: number }; results?: unknown[] };
  return { total: Number(b?.meta?.count ?? 0) || 0, page, perPage: PER_PAGE, works: (Array.isArray(b?.results) ? b.results : []).map(parseWork) };
}

/** The same query in Russian-language and other free libraries — opened by the reader. */
export function externalSearches(q: string): Array<{ label: string; href: string; note: string }> {
  const e = encodeURIComponent(q);
  return [
    { label: "КиберЛенинка", href: `https://cyberleninka.ru/search?q=${e}`, note: "научные статьи на русском, полный текст бесплатно" },
    { label: "eLIBRARY.RU", href: `https://www.elibrary.ru/querybox.asp?ftext=${e}`, note: "РИНЦ: журналы России и СНГ, часть — бесплатно после входа" },
    { label: "Google Академия", href: `https://scholar.google.com/scholar?q=${e}`, note: "все источники, ссылки на бесплатные версии" },
    { label: "DOAJ", href: `https://doaj.org/search/articles?ref=homepage-box&source=${encodeURIComponent(JSON.stringify({ query: { query_string: { query: q, default_operator: "AND" } } }))}`, note: "журналы открытого доступа" },
  ];
}

/** Small LRU-ish cache and per-key hourly counter, in the memory of one server instance. */
export class TtlCache<T> {
  private m = new Map<string, { at: number; v: T }>();
  constructor(private ttlMs: number, private max = 500) {}
  get(k: string, now = Date.now()): T | undefined {
    const x = this.m.get(k);
    if (!x) return undefined;
    if (now - x.at > this.ttlMs) { this.m.delete(k); return undefined; }
    return x.v;
  }
  set(k: string, v: T, now = Date.now()) {
    if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value as string);
    this.m.set(k, { at: now, v });
  }
}

export function makeLimiter(max: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string, now = Date.now()): boolean => {
    const xs = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (xs.length >= max) { hits.set(key, xs); return false; }
    xs.push(now); hits.set(key, xs);
    if (hits.size > 5000) hits.delete(hits.keys().next().value as string);
    return true;
  };
}
