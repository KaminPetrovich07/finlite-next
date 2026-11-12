"use client";

import { useEffect, useState } from "react";
import { getKey, saveKey } from "@/components/community/keys";
import { AVAILABILITY, CONSENT_TEXT, SPECIALIZATIONS, WORK_FORMAT } from "@/lib/talent/rating";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";

type W = { org: string; position: string; from: string; to: string; current: boolean; duties: string };
type E = { institution: string; degree: string; year: string };
type C = { name: string; issuer: string; year: string; number: string; url: string };

const emptyW = (): W => ({ org: "", position: "", from: "", to: "", current: false, duties: "" });
const emptyE = (): E => ({ institution: "", degree: "", year: "" });
const emptyC = (): C => ({ name: "", issuer: "", year: "", number: "", url: "" });

export default function EditSpecialist() {
  const [id, setId] = useState<string | null>(null);
  const [key, setKey] = useState("");
  const [f, setF] = useState({
    fullName: "", headline: "", city: "Бишкек", experienceYears: "", specializations: [] as string[], skills: "", about: "",
    availability: "open", workFormat: [] as string[], rateFrom: "", phone: "", email: "", telegram: "", published: true,
  });
  const [work, setWork] = useState<W[]>([emptyW()]);
  const [edu, setEdu] = useState<E[]>([emptyE()]);
  const [certs, setCerts] = useState<C[]>([]);
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [created, setCreated] = useState<{ id: string; key: string } | null>(null);

  useEffect(() => {
    const pid = new URLSearchParams(window.location.search).get("id");
    if (!pid) return;
    setId(pid);
    const k = getKey("spec", pid) ?? "";
    setKey(k);
    fetch(`/api/specialists/${pid}?key=${encodeURIComponent(k)}`).then((r) => r.json()).then((b) => {
      const s = b.specialist; if (!s) return;
      setF({ fullName: s.fullName, headline: s.headline, city: s.city ?? "", experienceYears: String(s.experienceYears), specializations: s.specializations, skills: s.skills.join(", "), about: s.about ?? "",
        availability: s.availability, workFormat: s.workFormat, rateFrom: s.rateFrom ? String(s.rateFrom) : "", phone: s.phone ?? "", email: s.email ?? "", telegram: s.telegram ?? "", published: s.published });
      setWork(s.workplaces.length ? s.workplaces.map((w: any) => ({ org: w.org, position: w.position, from: w.from ?? "", to: w.to ?? "", current: !!w.current, duties: w.duties ?? "" })) : [emptyW()]);
      setEdu(s.education.length ? s.education.map((e: any) => ({ institution: e.institution, degree: e.degree ?? "", year: e.year ? String(e.year) : "" })) : [emptyE()]);
      setCerts(s.certificates.map((c: any) => ({ name: c.name, issuer: c.issuer ?? "", year: c.year ? String(c.year) : "", number: c.number ?? "", url: c.url ?? "" })));
      setConsent(true);
    });
  }, []);

  async function save() {
    setBusy(true); setErr(null);
    const body = { ...f, skills: f.skills.split(",").map((x) => x.trim()).filter(Boolean), experienceYears: Number(f.experienceYears) || 0, rateFrom: Number(f.rateFrom) || null,
      workplaces: work, education: edu.map((e) => ({ ...e, year: Number(e.year) || null })), certificates: certs.map((c) => ({ ...c, year: Number(c.year) || null })), consent, ...(id ? { key } : {}) };
    try {
      const r = await fetch(id ? `/api/specialists/${id}` : "/api/specialists", { method: id ? "PUT" : "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      if (id) { if (key) saveKey("spec", id, key); window.location.href = `/specialists/${id}`; }
      else { saveKey("spec", b.id, b.key); setCreated(b); }
    } catch (e: any) { setErr(e.message); } finally { setBusy(false); }
  }

  if (created) return (
    <main className="mx-auto max-w-2xl px-4 py-10">
      <section className={`${card} p-6`}>
        <h1 className="font-display text-2xl font-bold text-fl-cream">Анкета опубликована</h1>
        <p className="mt-2 text-sm text-fl-cream/75">Этот браузер запомнил ключ — отсюда анкету можно править и удалить. Чтобы править с другого устройства, сохраните ключ:</p>
        <p className="mt-3 select-all break-all rounded-lg bg-fl-charcoal px-3 py-2 font-mono text-xs text-fl-gold">{created.key}</p>
        <a href={`/specialists/${created.id}`} className="mt-5 inline-block rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent">Открыть анкету</a>
      </section>
    </main>
  );

  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const L = (t: string, el: React.ReactNode, cls = "") => <label className={`block ${cls}`}><span className="mb-1 block text-xs text-fl-cream/55">{t}</span>{el}</label>;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <a href="/specialists" className="text-sm text-fl-cream/55 hover:text-fl-cream">← Реестр специалистов</a>
      <h1 className="mt-3 font-display text-3xl font-bold text-fl-cream">{id ? "Моя анкета" : "Разместить анкету"}</h1>
      <p className="mt-1 text-sm text-fl-cream/60">Заполняйте о себе. Чем подробнее места работы и сертификаты (с номером или ссылкой), тем выше рейтинг — формула открыта в анкете.</p>

      {id && !getKey("spec", id) && (
        <section className={`${card} mt-4 p-4`}>{L("Ключ редактирования (выдан при публикации)", <input value={key} onChange={(e) => setKey(e.target.value)} className={`${field} font-mono`} />)}</section>
      )}

      <section className={`${card} mt-4 grid gap-3 p-4 sm:grid-cols-2`}>
        {L("Фамилия и имя", <input value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} className={field} />)}
        {L("Должность / специализация", <input value={f.headline} onChange={(e) => setF({ ...f, headline: e.target.value })} placeholder="Главный бухгалтер, аудитор, финансовый аналитик" className={field} />)}
        {L("Город", <input value={f.city} onChange={(e) => setF({ ...f, city: e.target.value })} className={field} />)}
        {L("Опыт, лет", <input inputMode="numeric" value={f.experienceYears} onChange={(e) => setF({ ...f, experienceYears: e.target.value })} className={field} />)}
        {L("Статус", <select value={f.availability} onChange={(e) => setF({ ...f, availability: e.target.value })} className={field}>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>)}
        {L("Ожидаемая оплата от, сом/мес.", <input inputMode="numeric" value={f.rateFrom} onChange={(e) => setF({ ...f, rateFrom: e.target.value })} className={field} />)}
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs text-fl-cream/55">Формат работы</span>
          <div className="flex flex-wrap gap-3 text-sm text-fl-cream/85">{Object.entries(WORK_FORMAT).map(([k, v]) => <label key={k} className="flex items-center gap-1.5"><input type="checkbox" checked={f.workFormat.includes(k)} onChange={() => setF({ ...f, workFormat: toggle(f.workFormat, k) })} />{v}</label>)}</div>
        </div>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs text-fl-cream/55">Специализации</span>
          <div className="flex flex-wrap gap-1.5">{SPECIALIZATIONS.map((s) => <button key={s} type="button" onClick={() => setF({ ...f, specializations: toggle(f.specializations, s) })} className={`rounded-full px-2.5 py-1 text-xs ${f.specializations.includes(s) ? "bg-fl-gold/25 text-fl-gold" : "border border-fl-line text-fl-cream/70"}`}>{s}</button>)}</div>
        </div>
        {L("Навыки через запятую", <input value={f.skills} onChange={(e) => setF({ ...f, skills: e.target.value })} placeholder="1С:Бухгалтерия, Excel, IFRS 17, налоговые проверки" className={field} />, "sm:col-span-2")}
        {L("О себе", <textarea rows={4} value={f.about} onChange={(e) => setF({ ...f, about: e.target.value })} className={field} />, "sm:col-span-2")}
      </section>

      <section className={`${card} mt-4 p-4`}>
        <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Места работы</h2>
        {work.map((w, i) => (
          <div key={i} className="mb-3 grid gap-2 border-b border-fl-line/60 pb-3 sm:grid-cols-4">
            <input value={w.org} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, org: e.target.value } : x)))} placeholder="Организация" className={`${field} sm:col-span-2`} />
            <input value={w.position} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, position: e.target.value } : x)))} placeholder="Должность" className={`${field} sm:col-span-2`} />
            <input type="month" value={w.from} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, from: e.target.value } : x)))} className={field} />
            <input type="month" value={w.to} disabled={w.current} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, to: e.target.value } : x)))} className={`${field} disabled:opacity-40`} />
            <label className="flex items-center gap-1.5 text-sm text-fl-cream/80"><input type="checkbox" checked={w.current} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, current: e.target.checked } : x)))} />работаю сейчас</label>
            <button type="button" onClick={() => setWork(work.filter((_, j) => j !== i))} className="text-left text-xs text-fl-cream/40 hover:text-fl-red">удалить</button>
            <textarea rows={2} value={w.duties} onChange={(e) => setWork(work.map((x, j) => (j === i ? { ...x, duties: e.target.value } : x)))} placeholder="Чем занимались: участки учёта, отчётность, проекты" className={`${field} sm:col-span-4`} />
          </div>
        ))}
        <button type="button" onClick={() => setWork([...work, emptyW()])} className="text-sm text-fl-gold">+ место работы</button>
      </section>

      <section className={`${card} mt-4 grid gap-5 p-4 md:grid-cols-2`}>
        <div>
          <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Образование</h2>
          {edu.map((e, i) => (
            <div key={i} className="mb-2 grid grid-cols-[1fr_80px] gap-2">
              <input value={e.institution} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, institution: ev.target.value } : x)))} placeholder="Вуз, колледж" className={field} />
              <input value={e.year} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, year: ev.target.value } : x)))} placeholder="Год" className={field} />
              <input value={e.degree} onChange={(ev) => setEdu(edu.map((x, j) => (j === i ? { ...x, degree: ev.target.value } : x)))} placeholder="Специальность, степень" className={`${field} col-span-2`} />
            </div>
          ))}
          <button type="button" onClick={() => setEdu([...edu, emptyE()])} className="text-sm text-fl-gold">+ образование</button>
        </div>
        <div>
          <h2 className="mb-2 font-display text-lg font-semibold text-fl-cream">Сертификаты</h2>
          {certs.map((c, i) => (
            <div key={i} className="mb-3 grid grid-cols-2 gap-2 border-b border-fl-line/60 pb-2">
              <input value={c.name} onChange={(e) => setCerts(certs.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} placeholder="Название (CAP, ДипИФР, ACCA…)" className={`${field} col-span-2`} />
              <input value={c.issuer} onChange={(e) => setCerts(certs.map((x, j) => (j === i ? { ...x, issuer: e.target.value } : x)))} placeholder="Кем выдан" className={field} />
              <input value={c.year} onChange={(e) => setCerts(certs.map((x, j) => (j === i ? { ...x, year: e.target.value } : x)))} placeholder="Год" className={field} />
              <input value={c.number} onChange={(e) => setCerts(certs.map((x, j) => (j === i ? { ...x, number: e.target.value } : x)))} placeholder="Номер" className={field} />
              <input value={c.url} onChange={(e) => setCerts(certs.map((x, j) => (j === i ? { ...x, url: e.target.value } : x)))} placeholder="Ссылка для проверки" className={field} />
            </div>
          ))}
          <button type="button" onClick={() => setCerts([...certs, emptyC()])} className="text-sm text-fl-gold">+ сертификат</button>
        </div>
      </section>

      <section className={`${card} mt-4 grid gap-3 p-4 sm:grid-cols-3`}>
        {L("Телефон", <input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} className={field} />)}
        {L("E-mail", <input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} className={field} />)}
        {L("Telegram", <input value={f.telegram} onChange={(e) => setF({ ...f, telegram: e.target.value })} placeholder="@username" className={field} />)}
        <label className="flex items-center gap-2 text-sm text-fl-cream/80 sm:col-span-3"><input type="checkbox" checked={f.published} onChange={(e) => setF({ ...f, published: e.target.checked })} />Показывать анкету в реестре</label>
      </section>

      <label className="mt-4 flex gap-3 rounded-xl border border-fl-gold/40 bg-fl-gold/5 p-4 text-sm text-fl-cream/85">
        <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} className="mt-1 h-4 w-4 flex-shrink-0" />
        <span>{CONSENT_TEXT}</span>
      </label>
      {err && <p className="mt-3 text-sm text-fl-red">{err}</p>}
      <button type="button" onClick={save} disabled={busy || !consent} className="mt-4 rounded-lg bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">{busy ? "Сохраняю…" : id ? "Сохранить" : "Опубликовать анкету"}</button>
    </main>
  );
}
