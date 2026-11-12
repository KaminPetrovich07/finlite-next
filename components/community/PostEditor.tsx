"use client";

import { useState } from "react";
import { author, rememberAuthor, saveKey } from "@/components/community/keys";
import { POST_KIND, POST_KINDS, type PostKind } from "@/lib/news/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";

export interface PostRow {
  id: string; kind: PostKind; title: string; summary: string | null; sourceUrl: string | null; sourceName: string | null; docDate: string | null;
  imageUrl?: string | null; auto?: boolean; tags: string[]; authorName: string; authorOrg: string | null; pinned: boolean; views: number; useful: number; createdAt: string; comments: number; status: string;
}

export function Editor({ initial, postId, editKey, onDone }: { initial?: Partial<PostRow & { body: string }>; postId?: string; editKey?: string; onDone: (id: string | null) => void }) {
  const me = author();
  const [f, setF] = useState({
    kind: (initial?.kind ?? "news") as PostKind, title: initial?.title ?? "", summary: initial?.summary ?? "", body: initial?.body ?? "",
    sourceUrl: initial?.sourceUrl ?? "", sourceName: initial?.sourceName ?? "", imageUrl: initial?.imageUrl ?? "", docDate: initial?.docDate?.slice(0, 10) ?? "",
    tags: (initial?.tags ?? []).join(", "), authorName: initial?.authorName ?? me.name, authorOrg: initial?.authorOrg ?? me.org,
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function submit() {
    setBusy(true); setErr(null);
    try {
      const body = { ...f, tags: f.tags.split(/[,;#]+/).map((t) => t.trim()).filter(Boolean), ...(postId ? { key: editKey } : {}) };
      const r = await fetch(postId ? `/api/news/${postId}` : "/api/news", { method: postId ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      rememberAuthor(f.authorName, f.authorOrg);
      if (!postId) saveKey("post", b.id, b.key);
      onDone(postId ?? b.id);
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  const L = ({ t, children, wide }: { t: string; children: React.ReactNode; wide?: boolean }) => <label className={`block ${wide ? "sm:col-span-2" : ""}`}><span className="mb-1 block text-xs text-fl-cream/55">{t}</span>{children}</label>;
  return (
    <section className={`${card} mb-5 p-4 sm:p-5`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">{postId ? "Правка публикации" : "Новая публикация"}</h2>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {L({ t: "Вид", children: <select className={field} value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as PostKind })}>{POST_KINDS.map((k) => <option key={k} value={k}>{POST_KIND[k].label}</option>)}</select> })}
        {L({ t: "Дата документа или события", children: <input type="date" className={field} value={f.docDate} onChange={(e) => setF({ ...f, docDate: e.target.value })} /> })}
        {L({ t: "Заголовок", wide: true, children: <input className={field} value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder="Коротко и по существу" /> })}
        {L({ t: "Главное в одной-двух фразах", wide: true, children: <input className={field} value={f.summary} onChange={(e) => setF({ ...f, summary: e.target.value })} /> })}
        {L({ t: "Текст", wide: true, children: <textarea rows={8} className={field} value={f.body} onChange={(e) => setF({ ...f, body: e.target.value })} placeholder="Что изменилось, для кого, с какой даты, что делать. Пустая строка — новый абзац; ссылки станут кликабельными." /> })}
        {L({ t: "Ссылка на источник", children: <input className={field} value={f.sourceUrl} onChange={(e) => setF({ ...f, sourceUrl: e.target.value })} placeholder="https://…" /> })}
        {L({ t: "Источник", children: <input className={field} value={f.sourceName} onChange={(e) => setF({ ...f, sourceName: e.target.value })} placeholder="Минюст КР, ГНС, журнал «…»" /> })}
        {L({ t: "Картинка — ссылка на изображение (необязательно)", wide: true, children: <input className={field} value={f.imageUrl ?? ""} onChange={(e) => setF({ ...f, imageUrl: e.target.value })} placeholder="https://…/image.jpg — своя или с разрешения автора" /> })}
        {L({ t: "Темы через запятую", wide: true, children: <input className={field} value={f.tags} onChange={(e) => setF({ ...f, tags: e.target.value })} placeholder="НДС, МСФО, страхование" /> })}
        {L({ t: "Автор", children: <input className={field} value={f.authorName} onChange={(e) => setF({ ...f, authorName: e.target.value })} placeholder="Фамилия Имя" /> })}
        {L({ t: "Организация", children: <input className={field} value={f.authorOrg} onChange={(e) => setF({ ...f, authorOrg: e.target.value })} placeholder="КРСУ, ОсОО «…»" /> })}
      </div>
      <p className="mt-2 text-xs text-fl-cream/45">{POST_KIND[f.kind].hint}</p>
      {err && <p className="mt-2 text-sm text-fl-red">{err}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={submit} disabled={busy} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Публикую…" : postId ? "Сохранить" : "Опубликовать"}</button>
        <button type="button" onClick={() => onDone(null)} className="px-3 py-2 text-sm text-fl-cream/60 hover:text-fl-cream">Отмена</button>
      </div>
    </section>
  );
}
