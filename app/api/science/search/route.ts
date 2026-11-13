import { NextRequest, NextResponse } from "next/server";
import { HttpError, route } from "@/lib/auth/server";
import { clientIp } from "@/lib/auth/session";
import { openAlexFetch } from "@/lib/science/server";
import { externalSearches, makeLimiter, normalizeParams, parseSearch, searchUrl, TtlCache, type SearchResult } from "@/lib/science/search";

export const runtime = "nodejs";

const cache = new TtlCache<SearchResult>(24 * 3600e3);
const perIp = makeLimiter(30, 3600e3);

/** GET /api/science/search?q=…&scope=accounting|finance|both|all&oa=1&from=&to=&sort=relevance|cited|new&page= */
export const GET = route(async (req: NextRequest) => {
  const sp = req.nextUrl.searchParams;
  const p = normalizeParams(Object.fromEntries(sp.entries()));
  if (!p) throw new HttpError(400, "Введите запрос — хотя бы два символа");
  const key = JSON.stringify(p);
  let result = cache.get(key);
  if (!result) {
    if (!perIp(await clientIp())) throw new HttpError(429, "Слишком много поисков с вашего адреса — подождите немного");
    try {
      result = parseSearch(await openAlexFetch(searchUrl(p, process.env.OPENALEX_API_KEY || undefined)), p.page);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      throw new HttpError(503, /429|не ответил/.test(msg) ? "Дневной лимит поиска в OpenAlex исчерпан — попробуйте завтра или воспользуйтесь ссылками на другие библиотеки ниже" : "Поиск временно недоступен — попробуйте позже");
    }
    cache.set(key, result);
  }
  return NextResponse.json({ ...result, external: externalSearches(p.q) });
});
