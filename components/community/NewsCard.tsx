"use client";

import { useState } from "react";
import { POST_KIND, type PostKind } from "@/lib/news/types";
import type { PostRow } from "@/components/community/PostEditor";

/** Цвет метки по виду публикации — чтобы закон не терялся среди новостей. */
export const KIND_TONE: Record<PostKind, string> = {
  news: "bg-fl-info/10 text-fl-info",
  law: "bg-fl-red/10 text-fl-red",
  regulation: "bg-fl-amber/15 text-fl-amber",
  collection: "bg-fl-green/10 text-fl-green",
  article: "bg-fl-green/10 text-fl-green",
  research: "bg-fl-green/10 text-fl-green",
  event: "bg-fl-gold/15 text-fl-gold",
  opinion: "bg-fl-line/70 text-fl-cream/75",
};

export function KindBadge({ kind }: { kind: PostKind }) {
  return <span className={`inline-flex items-center rounded-md px-1.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${KIND_TONE[kind] ?? KIND_TONE.news}`}>{POST_KIND[kind]?.label ?? kind}</span>;
}

/** «только что», «5 мин назад», «3 ч назад», «вчера», «12 нояб.» */
export function ago(iso: string | null | undefined, now = Date.now()): string {
  if (!iso) return "";
  const t = Date.parse(iso), m = Math.round((now - t) / 60e3);
  if (m < 1) return "только что";
  if (m < 60) return `${m} мин назад`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} ч назад`;
  const d = new Date(t), y = new Date(now - 864e5);
  if (d.toDateString() === y.toDateString()) return "вчера";
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(d.getFullYear() !== new Date(now).getFullYear() ? { year: "numeric" } : {}) });
}

export const host = (u: string | null) => { try { return u ? new URL(u).hostname.replace(/^www\./, "") : ""; } catch { return ""; } };

/** Превью: картинка источника или спокойная заглушка с названием источника. */
export function Thumb({ src, label, kind, className = "" }: { src: string | null; label: string; kind: PostKind; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (src && !failed) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" loading="lazy" decoding="async" referrerPolicy="no-referrer" onError={() => setFailed(true)} className={`h-full w-full object-cover ${className}`} />;
  }
  return (
    <div className={`flex h-full w-full flex-col justify-end bg-gradient-to-br from-fl-surface-2 to-fl-charcoal p-3 ${className}`}>
      <span className={`self-start rounded px-1.5 py-0.5 text-[11px] font-semibold ${KIND_TONE[kind] ?? KIND_TONE.news}`}>{POST_KIND[kind]?.plural}</span>
      <span className="mt-1 line-clamp-1 font-display text-sm font-semibold text-fl-cream/70">{label}</span>
    </div>
  );
}

const ExternalIcon = () => <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path fill="currentColor" d="M9 2h5v5h-1.5V4.56L7.53 9.53 6.47 8.47l4.97-4.97H9V2ZM3 4h4v1.5H3.5v7h7V9H12v4a1 1 0 0 1-1 1H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1Z" /></svg>;
const CommentIcon = () => <svg aria-hidden viewBox="0 0 16 16" className="h-3.5 w-3.5"><path fill="currentColor" d="M2 3.5A1.5 1.5 0 0 1 3.5 2h9A1.5 1.5 0 0 1 14 3.5v6A1.5 1.5 0 0 1 12.5 11H6l-3.2 2.6A.5.5 0 0 1 2 13.2V3.5Zm1.5 0v8.15L5.47 10H12.5v-6.5h-9Z" /></svg>;

type Post = PostRow & { imageUrl?: string | null; auto?: boolean };

/** Карточка ленты: вся карточка ведёт к обсуждению, ссылка «источник» — на оригинал. */
export function NewsCard({ p, lead, onTag }: { p: Post; lead?: boolean; onTag: (t: string) => void }) {
  const source = p.sourceName || host(p.sourceUrl) || p.authorName;
  const when = ago(p.docDate ?? p.createdAt);
  return (
    <article className={`group relative flex overflow-hidden rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card transition hover:border-fl-gold/50 ${lead ? "flex-col md:flex-row" : "flex-col"} ${p.status === "hidden" ? "opacity-50" : ""}`}>
      {p.imageUrl ? (
        <div className={`relative shrink-0 overflow-hidden bg-fl-surface-2 ${lead ? "aspect-[16/9] md:aspect-auto md:w-[58%]" : "aspect-[16/9]"}`}>
          <Thumb src={p.imageUrl} label={source} kind={p.kind} className="transition duration-300 group-hover:scale-[1.02]" />
          {p.pinned && <span className="absolute left-3 top-3 rounded-md bg-fl-charcoal/85 px-2 py-0.5 text-[11px] font-semibold text-fl-gold backdrop-blur">закреплено</span>}
        </div>
      ) : <div aria-hidden className={`h-1 shrink-0 ${KIND_TONE[p.kind]?.split(" ")[0] ?? "bg-fl-line"}`} />}
      <div className={`flex min-w-0 flex-1 flex-col ${lead ? "p-5 md:p-6" : "p-4"}`}>
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fl-cream/55">
          {p.pinned && !p.imageUrl && <span className="font-semibold text-fl-gold">закреплено ·</span>}
          <KindBadge kind={p.kind} />
          <span className="truncate font-medium text-fl-cream/75">{source}</span>
          {when && <span aria-hidden>·</span>}
          {when && <time dateTime={p.docDate ?? p.createdAt}>{when}</time>}
        </div>
        <h2 className={`mt-2 font-display font-semibold leading-snug text-fl-cream ${lead ? "text-xl md:text-2xl" : "line-clamp-3 text-[17px]"}`}>
          <a href={`/news/${p.id}`} className="after:absolute after:inset-0 after:content-[''] focus:outline-none focus-visible:underline">{p.title}</a>
        </h2>
        {p.summary && <p className={`mt-2 text-sm leading-relaxed text-fl-cream/70 ${lead ? "line-clamp-4" : p.imageUrl ? "line-clamp-3" : "line-clamp-5"}`}>{p.summary}</p>}
        {p.tags.length > 0 && (
          <div className="relative z-10 mt-3 flex flex-wrap gap-1.5">
            {p.tags.slice(0, lead ? 6 : 4).map((t) => (
              <button key={t} type="button" onClick={() => onTag(t)} className="rounded-full bg-fl-gold/10 px-2 py-0.5 text-xs text-fl-gold hover:bg-fl-gold/20">#{t}</button>
            ))}
          </div>
        )}
        <div className="relative z-10 mt-auto flex items-center gap-3 pt-3 text-xs text-fl-cream/55">
          <a href={`/news/${p.id}#discussion`} className="inline-flex items-center gap-1 hover:text-fl-cream"><CommentIcon />{p.comments}</a>
          {p.useful > 0 && <span>полезно {p.useful}</span>}
          {p.sourceUrl && (
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-md px-1.5 py-1 font-medium text-fl-gold hover:bg-fl-gold/10">
              {host(p.sourceUrl) || "источник"} <ExternalIcon />
            </a>
          )}
        </div>
      </div>
    </article>
  );
}

export { ExternalIcon };
