// Default feeds of «Новости и наука». The list is stored in the FeedSource
// table on first run and is edited on /news/sources afterwards; a source that
// stops answering shows its error there and does not stop the others.
import type { PostKind } from "./types";

export interface SourceInput { name: string; url: string; type: "rss" | "telegram"; kind: PostKind; filter: boolean; tags: string[] }

export const DEFAULT_SOURCES: SourceInput[] = [
  // ссылку на канал даёт сам сайт НБКР (раздел новостей)
  { name: "Национальный банк КР", url: "https://t.me/s/NBKR_news", type: "telegram", kind: "news", filter: false, tags: ["НБКР"] },
  { name: "Economist.kg", url: "https://economist.kg/feed/", type: "rss", kind: "news", filter: true, tags: [] },
  { name: "24.kg", url: "https://24.kg/rss/", type: "rss", kind: "news", filter: true, tags: [] },
];

/** «@channel», «t.me/channel», «https://t.me/s/channel» → https://t.me/s/channel; other URLs as they are. */
export function normalizeSource(raw: string): { url: string; type: "rss" | "telegram" } | null {
  const s = raw.trim();
  const tg = s.match(/^(?:@|(?:https?:\/\/)?(?:t\.me|telegram\.me)\/(?:s\/)?)([A-Za-z][A-Za-z0-9_]{3,31})\/?$/);
  if (tg) return { url: `https://t.me/s/${tg[1]}`, type: "telegram" };
  try {
    const u = new URL(s);
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    return { url: u.toString(), type: "rss" };
  } catch { return null; }
}
