"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { RichText } from "@/components/community/RichText";
import { Editor, type PostRow } from "@/components/community/PostEditor";
import { author, clientId, getKey, keysOf, rememberAuthor, saveKey } from "@/components/community/keys";
import { ago, ExternalIcon, host, KindBadge, Thumb } from "@/components/community/NewsCard";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const dt = (iso: string) => new Date(iso).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

interface Comment { id: string; parentId: string | null; authorName: string; authorOrg: string | null; body: string; createdAt: string; status: string; mine: boolean }

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const [data, setData] = useState<{ post: PostRow & { body: string; mine: boolean; imageUrl?: string | null; auto?: boolean }; comments: Comment[]; admin: boolean } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [reply, setReply] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    const r = await fetch(`/api/news/${id}?key=${encodeURIComponent(getKey("post", id) ?? "")}&keys=${encodeURIComponent(keysOf("comment").join(","))}`);
    const b = await r.json();
    if (r.ok) setData(b); else setError(b.error ?? "Публикация не найдена");
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function useful() {
    const r = await fetch(`/api/news/${id}/useful`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ clientId: clientId() }) });
    const b = await r.json();
    if (r.ok && data) setData({ ...data, post: { ...data.post, useful: b.useful } });
  }
  async function del() {
    if (!confirm("Удалить публикацию вместе с комментариями?")) return;
    const r = await fetch(`/api/news/${id}?key=${encodeURIComponent(getKey("post", id) ?? "")}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/news"; else show((await r.json()).error, "error");
  }
  async function admin(patch: Record<string, unknown>) {
    const r = await fetch(`/api/news/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    if (r.ok) load(); else show((await r.json()).error, "error");
  }
  async function delComment(c: Comment) {
    const r = await fetch(`/api/news/${id}/comments?commentId=${c.id}&key=${encodeURIComponent(getKey("comment", c.id) ?? "")}`, { method: "DELETE" });
    if (r.ok) load(); else show((await r.json()).error, "error");
  }

  if (error) return <main className="mx-auto max-w-3xl px-4 py-10 text-fl-cream/70">{error}. <a href="/news" className="text-fl-gold underline">Все публикации</a></main>;
  if (!data) return <main className="mx-auto max-w-3xl px-4 py-10 text-fl-cream/50">Загрузка…</main>;
  const p = data.post;
  const top = data.comments.filter((c) => !c.parentId);
  const kids = (cid: string) => data.comments.filter((c) => c.parentId === cid);

  const CommentView = ({ c, nested }: { c: Comment; nested?: boolean }) => (
    <li className={`${nested ? "ml-6 border-l border-fl-line pl-4" : ""} ${c.status === "hidden" ? "opacity-50" : ""}`}>
      <p className="text-xs text-fl-cream/50"><b className="text-fl-cream/85">{c.authorName}</b>{c.authorOrg ? `, ${c.authorOrg}` : ""} · {dt(c.createdAt)}</p>
      <RichText text={c.body} className="mt-1 text-sm text-fl-cream/85" />
      <div className="mt-1 flex gap-3 text-xs">
        {!nested && <button type="button" onClick={() => setReply(reply === c.id ? null : c.id)} className="text-fl-cream/50 hover:text-fl-gold">ответить</button>}
        {(c.mine || data.admin) && <button type="button" onClick={() => delComment(c)} className="text-fl-cream/40 hover:text-fl-red">{data.admin && !c.mine ? "скрыть" : "удалить"}</button>}
      </div>
      {reply === c.id && <CommentForm postId={id} parentId={c.id} onDone={() => { setReply(null); load(); }} />}
      {!nested && kids(c.id).length > 0 && <ul className="mt-3 space-y-3">{kids(c.id).map((k) => <CommentView key={k.id} c={k} nested />)}</ul>}
    </li>
  );

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <a href="/news" className="text-sm text-fl-cream/55 hover:text-fl-cream">← Новости и наука</a>
      {editing ? (
        <div className="mt-4"><Editor initial={p} postId={id} editKey={getKey("post", id) ?? undefined} onDone={(x) => { setEditing(false); if (x) { show("Сохранено"); load(); } }} /></div>
      ) : (
        <article className="mt-4">
          {p.imageUrl && (
            <div className="mb-5 aspect-[16/9] overflow-hidden rounded-2xl border border-fl-line bg-fl-surface-2">
              <Thumb src={p.imageUrl} label={p.sourceName || p.authorName} kind={p.kind} />
            </div>
          )}
          <div className="flex flex-wrap items-center gap-2 text-xs text-fl-cream/55">
            <KindBadge kind={p.kind} />
            <span className="font-medium text-fl-cream/75">{p.sourceName || host(p.sourceUrl) || p.authorName}</span>
            <span aria-hidden>·</span>
            <span title={dt(p.docDate ?? p.createdAt)}>{ago(p.docDate ?? p.createdAt)}</span>
            {p.status === "hidden" && <span className="text-fl-red">скрыто</span>}
          </div>
          <h1 className="mt-2 font-display text-2xl font-bold leading-tight text-fl-cream sm:text-3xl">{p.title}</h1>
          {p.auto ? (
            p.summary ? <p className="mt-3 text-base leading-relaxed text-fl-cream/80">{p.summary}</p> : null
          ) : (
            <>
              {p.summary && <p className="mt-2 text-base text-fl-cream/75">{p.summary}</p>}
              <p className="mt-3 text-xs text-fl-cream/50">{p.authorName}{p.authorOrg ? `, ${p.authorOrg}` : ""} · опубликовано {dt(p.createdAt)} · просмотров {p.views}</p>
              <RichText text={p.body} className="mt-5 text-[15px] leading-relaxed text-fl-cream/90" />
            </>
          )}
          {p.sourceUrl && (
            <a href={p.sourceUrl} target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex items-center gap-2 rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">
              {p.auto ? "Читать полностью" : "Открыть источник"} на {host(p.sourceUrl)} <ExternalIcon />
            </a>
          )}
          {p.auto && <p className="mt-2 text-xs text-fl-cream/45">Анонс собран автоматически из ленты «{p.sourceName}». Полный текст и права на него — у источника.</p>}
          {p.tags.length > 0 && <p className="mt-4 flex flex-wrap gap-1.5 text-xs">{p.tags.map((t) => <a key={t} href={`/news?tag=${encodeURIComponent(t)}`} className="rounded-full bg-fl-gold/10 px-2 py-0.5 text-fl-gold hover:bg-fl-gold/20">#{t}</a>)}</p>}
          <div className="mt-5 flex flex-wrap items-center gap-2">
            <button type="button" onClick={useful} className="rounded-lg border border-fl-line px-3 py-1.5 text-sm text-fl-cream hover:border-fl-gold">Полезно · {p.useful}</button>
            {(p.mine || data.admin) && <>
              <button type="button" onClick={() => setEditing(true)} className="rounded-lg px-3 py-1.5 text-sm text-fl-cream/60 hover:text-fl-cream">изменить</button>
              <button type="button" onClick={del} className="rounded-lg px-3 py-1.5 text-sm text-fl-cream/50 hover:text-fl-red">удалить</button>
            </>}
            {data.admin && <>
              <button type="button" onClick={() => admin({ pinned: !p.pinned })} className="rounded-lg px-3 py-1.5 text-sm text-fl-cream/60 hover:text-fl-gold">{p.pinned ? "открепить" : "закрепить"}</button>
              <button type="button" onClick={() => admin({ status: p.status === "hidden" ? "published" : "hidden" })} className="rounded-lg px-3 py-1.5 text-sm text-fl-cream/60 hover:text-fl-red">{p.status === "hidden" ? "показать" : "скрыть"}</button>
            </>}
          </div>
        </article>
      )}

      <section id="discussion" className={`${card} mt-8 scroll-mt-6 p-4 sm:p-5`}>
        <h2 className="font-display text-lg font-semibold text-fl-cream">Обсуждение · {data.comments.length}</h2>
        <CommentForm postId={id} onDone={load} />
        {top.length > 0 && <ul className="mt-5 space-y-5">{top.map((c) => <CommentView key={c.id} c={c} />)}</ul>}
      </section>
    </main>
  );
}

function CommentForm({ postId, parentId, onDone }: { postId: string; parentId?: string; onDone: () => void }) {
  const me = author();
  const [name, setName] = useState(me.name);
  const [org, setOrg] = useState(me.org);
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setBusy(true); setErr(null);
    try {
      const r = await fetch(`/api/news/${postId}/comments`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ authorName: name, authorOrg: org, body, parentId }) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      saveKey("comment", b.id, b.key); rememberAuthor(name, org); setBody(""); onDone();
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }
  return (
    <div className="mt-3 space-y-2">
      <textarea rows={parentId ? 2 : 3} value={body} onChange={(e) => setBody(e.target.value)} placeholder={parentId ? "Ваш ответ" : "Ваше мнение, вопрос, дополнение"} className={field} />
      <div className="flex flex-wrap gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Имя и фамилия" className={`${field} max-w-[220px]`} />
        <input value={org} onChange={(e) => setOrg(e.target.value)} placeholder="Организация (необязательно)" className={`${field} max-w-[240px]`} />
        <button type="button" onClick={send} disabled={busy || !body.trim()} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "…" : "Отправить"}</button>
      </div>
      {err && <p className="text-sm text-fl-red">{err}</p>}
    </div>
  );
}
