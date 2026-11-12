"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useToast } from "@/components/Toast";
import { RichText } from "@/components/community/RichText";
import { author, getKey, keysOf, rememberAuthor, saveKey } from "@/components/community/keys";
import { AVAILABILITY, RELATION, WORK_FORMAT, type RatingPart } from "@/lib/talent/rating";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const ym = (s?: string) => (s ? `${s.slice(5, 7)}.${s.slice(0, 4)}` : "");

interface Spec {
  id: string; fullName: string; headline: string; city: string | null; experienceYears: number; specializations: string[]; skills: string[];
  workplaces: Array<{ org: string; position: string; from?: string; to?: string; current?: boolean; duties?: string; confirmed: boolean }>;
  education: Array<{ institution: string; degree?: string; year?: number | null }>;
  certificates: Array<{ name: string; issuer?: string; year?: number | null; number?: string; url?: string }>;
  about: string | null; availability: string; workFormat: string[]; rateFrom: number | null;
  phone?: string | null; email?: string | null; telegram?: string | null; contactsHidden?: boolean; mine: boolean; updatedAt: string; published: boolean;
}
interface Review { id: string; authorName: string; authorOrg: string; authorRole: string | null; relation: string; rating: number; text: string; reply: string | null; createdAt: string; mine: boolean }

export default function SpecialistPage() {
  const { id } = useParams<{ id: string }>();
  const [d, setD] = useState<{ specialist: Spec; rating: { total: number; parts: RatingPart[]; reviewAvg: number | null; reviewCount: number }; reviews: Review[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const { show, ToastContainer } = useToast();

  const load = useCallback(async () => {
    const r = await fetch(`/api/specialists/${id}?key=${encodeURIComponent(getKey("spec", id) ?? "")}&keys=${encodeURIComponent(keysOf("review").join(","))}`);
    const b = await r.json();
    if (r.ok) setD(b); else setError(b.error ?? "Анкета не найдена");
  }, [id]);
  useEffect(() => { load(); }, [load]);

  async function removeProfile() {
    if (!confirm("Удалить анкету полностью вместе с отзывами? Это отзыв согласия на размещение данных, восстановить будет нельзя.")) return;
    const r = await fetch(`/api/specialists/${id}?key=${encodeURIComponent(getKey("spec", id) ?? "")}`, { method: "DELETE" });
    if (r.ok) window.location.href = "/specialists"; else show((await r.json()).error, "error");
  }
  async function sendReply(reviewId: string) {
    const r = await fetch(`/api/specialists/${id}/reviews`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ reviewId, reply: replyText, key: getKey("spec", id) }) });
    if (r.ok) { setReplyTo(null); load(); } else show((await r.json()).error, "error");
  }
  async function withdraw(reviewId: string) {
    const r = await fetch(`/api/specialists/${id}/reviews?reviewId=${reviewId}&key=${encodeURIComponent(getKey("review", reviewId) ?? "")}`, { method: "DELETE" });
    if (r.ok) load(); else show((await r.json()).error, "error");
  }

  if (error) return <main className="mx-auto max-w-4xl px-4 py-10 text-fl-cream/70">{error}. <a href="/specialists" className="text-fl-gold underline">Реестр</a></main>;
  if (!d) return <main className="mx-auto max-w-4xl px-4 py-10 text-fl-cream/50">Загрузка…</main>;
  const s = d.specialist;

  return (
    <main className="mx-auto max-w-5xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <a href="/specialists" className="text-sm text-fl-cream/55 hover:text-fl-cream">← Реестр специалистов</a>
      <div className="mt-4 grid gap-5 lg:grid-cols-[1fr_300px]">
        <div className="space-y-5">
          <section className={`${card} p-5`}>
            <h1 className="font-display text-2xl font-bold text-fl-cream sm:text-3xl">{s.fullName}</h1>
            <p className="mt-1 text-base text-fl-cream/85">{s.headline}</p>
            <p className="mt-1 text-sm text-fl-cream/55">
              Опыт {s.experienceYears} лет{s.city ? ` · ${s.city}` : ""} · <span className={s.availability === "open" ? "text-fl-green" : s.availability === "part" ? "text-fl-amber" : ""}>{AVAILABILITY[s.availability]}</span>
              {s.workFormat.length > 0 && ` · ${s.workFormat.map((w) => WORK_FORMAT[w]).join(", ")}`}{s.rateFrom ? ` · от ${s.rateFrom.toLocaleString("ru-RU")} сом/мес.` : ""}
            </p>
            {s.specializations.length > 0 && <p className="mt-3 flex flex-wrap gap-1.5">{s.specializations.map((x) => <span key={x} className="rounded bg-fl-gold/15 px-2 py-0.5 text-xs text-fl-cream">{x}</span>)}</p>}
            {s.skills.length > 0 && <p className="mt-2 text-xs text-fl-cream/60">Навыки: {s.skills.join(", ")}</p>}
            {s.about && <RichText text={s.about} className="mt-4 text-sm text-fl-cream/85" />}
            {s.mine && <div className="mt-4 flex gap-3 border-t border-fl-line pt-3 text-sm">
              <a href={`/specialists/edit?id=${s.id}`} className="text-fl-gold hover:underline">Изменить анкету</a>
              <button type="button" onClick={removeProfile} className="text-fl-cream/50 hover:text-fl-red">Удалить анкету</button>
              {!s.published && <span className="text-fl-amber">скрыта от поиска</span>}
            </div>}
          </section>

          {s.workplaces.length > 0 && (
            <section className={`${card} p-5`}>
              <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">Места работы</h2>
              <ol className="space-y-3">
                {s.workplaces.map((w, i) => (
                  <li key={i} className="border-l-2 border-fl-gold/40 pl-3">
                    <p className="text-sm font-medium text-fl-cream">{w.position} · {w.org}{w.confirmed && <span className="ml-2 rounded bg-fl-green/15 px-1.5 py-0.5 text-[11px] text-fl-green" title="Есть отзыв работодателя из этой организации">подтверждено отзывом</span>}</p>
                    <p className="text-xs text-fl-cream/50">{ym(w.from)}{w.from || w.to || w.current ? " — " : ""}{w.current ? "по настоящее время" : ym(w.to)}</p>
                    {w.duties && <p className="mt-1 text-sm text-fl-cream/75">{w.duties}</p>}
                  </li>
                ))}
              </ol>
            </section>
          )}

          {(s.education.length > 0 || s.certificates.length > 0) && (
            <section className={`${card} grid gap-5 p-5 sm:grid-cols-2`}>
              {s.education.length > 0 && <div>
                <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Образование</h2>
                <ul className="space-y-1.5 text-sm text-fl-cream/85">{s.education.map((e, i) => <li key={i}>{e.institution}{e.degree ? `, ${e.degree}` : ""}{e.year ? `, ${e.year}` : ""}</li>)}</ul>
              </div>}
              {s.certificates.length > 0 && <div>
                <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Сертификаты</h2>
                <ul className="space-y-1.5 text-sm text-fl-cream/85">{s.certificates.map((c, i) => (
                  <li key={i}>{c.url ? <a href={c.url} target="_blank" rel="noopener noreferrer nofollow" className="text-fl-gold underline">{c.name}</a> : c.name}
                    <span className="text-xs text-fl-cream/50">{[c.issuer, c.year, c.number ? `№ ${c.number}` : ""].filter(Boolean).join(", ") ? ` · ${[c.issuer, c.year, c.number ? `№ ${c.number}` : ""].filter(Boolean).join(", ")}` : ""}</span></li>
                ))}</ul>
              </div>}
            </section>
          )}

          <section className={`${card} p-5`}>
            <h2 className="font-display text-lg font-semibold text-fl-cream">Отзывы · {d.reviews.length}</h2>
            {d.reviews.length === 0 && <p className="mt-2 text-sm text-fl-cream/60">Отзывов пока нет.</p>}
            <ul className="mt-3 space-y-4">
              {d.reviews.map((r) => (
                <li key={r.id} className="border-t border-fl-line/60 pt-3">
                  <p className="text-sm"><span className="text-fl-gold">{"★".repeat(r.rating)}<span className="text-fl-cream/25">{"★".repeat(5 - r.rating)}</span></span> <b className="text-fl-cream">{r.authorName}</b><span className="text-fl-cream/60">, {r.authorRole ? `${r.authorRole}, ` : ""}{r.authorOrg} · {RELATION[r.relation]?.toLowerCase()} · {new Date(r.createdAt).toLocaleDateString("ru-RU")}</span></p>
                  <RichText text={r.text} className="mt-1 text-sm text-fl-cream/85" />
                  {r.reply && <div className="ml-4 mt-2 border-l-2 border-fl-line pl-3 text-sm text-fl-cream/75"><span className="text-xs text-fl-cream/50">Ответ специалиста:</span> {r.reply}</div>}
                  <div className="mt-1 flex gap-3 text-xs">
                    {s.mine && <button type="button" onClick={() => { setReplyTo(r.id); setReplyText(r.reply ?? ""); }} className="text-fl-cream/50 hover:text-fl-gold">{r.reply ? "изменить ответ" : "ответить"}</button>}
                    {r.mine && <button type="button" onClick={() => withdraw(r.id)} className="text-fl-cream/40 hover:text-fl-red">отозвать свой отзыв</button>}
                  </div>
                  {replyTo === r.id && <div className="mt-2 flex gap-2"><input value={replyText} onChange={(e) => setReplyText(e.target.value)} className={field} /><button type="button" onClick={() => sendReply(r.id)} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent">OK</button></div>}
                </li>
              ))}
            </ul>
            {!s.mine && <ReviewForm specialistId={s.id} onDone={load} />}
          </section>
        </div>

        <aside className="space-y-4">
          <section className={`${card} p-4`}>
            <p className="text-xs text-fl-cream/55">Рейтинг</p>
            <p className="num font-display text-4xl font-bold text-fl-gold">{Math.round(d.rating.total)}<span className="text-base text-fl-cream/50"> / 100</span></p>
            <ul className="mt-3 space-y-2">
              {d.rating.parts.map((p) => (
                <li key={p.key}>
                  <div className="flex justify-between text-xs"><span className="text-fl-cream/80">{p.label}</span><span className="num text-fl-cream">{p.points} / {p.max}</span></div>
                  <div className="mt-1 h-1.5 rounded-full bg-fl-line"><div className="h-1.5 rounded-full bg-fl-gold" style={{ width: `${(p.points / p.max) * 100}%` }} /></div>
                  <p className="mt-0.5 text-[11px] text-fl-cream/45">{p.note}</p>
                </li>
              ))}
            </ul>
          </section>
          <section className={`${card} p-4 text-sm`}>
            <p className="mb-2 text-xs text-fl-cream/55">Контакты</p>
            {s.contactsHidden ? <p className="text-fl-cream/60">Контакты видны на тарифе «Макс» и выше.</p> : (
              <ul className="space-y-1 text-fl-cream/85">
                {s.phone && <li><a href={`tel:${s.phone}`} className="hover:text-fl-gold">{s.phone}</a></li>}
                {s.email && <li><a href={`mailto:${s.email}`} className="hover:text-fl-gold">{s.email}</a></li>}
                {s.telegram && <li><a href={`https://t.me/${s.telegram.replace(/^@/, "")}`} target="_blank" rel="noreferrer" className="hover:text-fl-gold">{s.telegram}</a></li>}
                {!s.phone && !s.email && !s.telegram && <li className="text-fl-cream/50">не указаны</li>}
              </ul>
            )}
            <p className="mt-3 text-[11px] text-fl-cream/40">Анкета обновлена {new Date(s.updatedAt).toLocaleDateString("ru-RU")}. Специалист разместил её сам и может удалить в любой момент.</p>
          </section>
        </aside>
      </div>
    </main>
  );
}

function ReviewForm({ specialistId, onDone }: { specialistId: string; onDone: () => void }) {
  const me = author();
  const [f, setF] = useState({ authorName: me.name, authorOrg: me.org, authorRole: "", relation: "employer", rating: 5, text: "" });
  const [open, setOpen] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  async function send() {
    setErr(null);
    const r = await fetch(`/api/specialists/${specialistId}/reviews`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(f) });
    const b = await r.json();
    if (!r.ok) { setErr(b.error); return; }
    saveKey("review", b.id, b.key); rememberAuthor(f.authorName, f.authorOrg); setOpen(false); onDone();
  }
  if (!open) return <button type="button" onClick={() => setOpen(true)} className="mt-4 rounded-lg border border-fl-gold/50 px-3 py-2 text-sm text-fl-gold hover:bg-fl-gold/10">Оставить отзыв</button>;
  return (
    <div className="mt-4 space-y-2 border-t border-fl-line pt-4">
      <p className="text-xs text-fl-cream/55">Отзыв публикуется с вашим именем и организацией. Пишите о работе: что делал специалист, качество, сроки.</p>
      <div className="grid gap-2 sm:grid-cols-2">
        <input value={f.authorName} onChange={(e) => setF({ ...f, authorName: e.target.value })} placeholder="Ваше имя и фамилия" className={field} />
        <input value={f.authorOrg} onChange={(e) => setF({ ...f, authorOrg: e.target.value })} placeholder="Организация" className={field} />
        <input value={f.authorRole} onChange={(e) => setF({ ...f, authorRole: e.target.value })} placeholder="Ваша должность" className={field} />
        <div className="flex gap-2">
          <select value={f.relation} onChange={(e) => setF({ ...f, relation: e.target.value })} className={field}>{Object.entries(RELATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={f.rating} onChange={(e) => setF({ ...f, rating: Number(e.target.value) })} className={`${field} w-24`}>{[5, 4, 3, 2, 1].map((n) => <option key={n} value={n}>{"★".repeat(n)}</option>)}</select>
        </div>
      </div>
      <textarea rows={3} value={f.text} onChange={(e) => setF({ ...f, text: e.target.value })} className={field} placeholder="Какие задачи вёл, как справлялся" />
      {err && <p className="text-sm text-fl-red">{err}</p>}
      <div className="flex gap-2"><button type="button" onClick={send} className="rounded-lg bg-fl-accent px-3 py-2 text-sm font-semibold text-fl-on-accent">Опубликовать отзыв</button><button type="button" onClick={() => setOpen(false)} className="px-3 py-2 text-sm text-fl-cream/60">Отмена</button></div>
    </div>
  );
}
