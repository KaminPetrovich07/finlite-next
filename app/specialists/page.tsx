"use client";

import { useCallback, useEffect, useState } from "react";
import { AVAILABILITY, SPECIALIZATIONS } from "@/lib/talent/rating";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 shadow-card";
const years = (n: number) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? "год" : [2, 3, 4].includes(n % 10) && ![12, 13, 14].includes(n % 100) ? "года" : "лет"}`;

interface Row {
  id: string; fullName: string; headline: string; city: string | null; experienceYears: number; specializations: string[]; availability: string;
  rateFrom: number | null; current: { org: string; position: string } | null; certificates: number; rating: number; reviewAvg: number | null; reviewCount: number;
}

export default function SpecialistsPage() {
  const [q, setQ] = useState(""), [spec, setSpec] = useState(""), [city, setCity] = useState(""), [av, setAv] = useState(""), [minExp, setMinExp] = useState("");
  const [list, setList] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try {
      const r = await fetch(`/api/specialists?${new URLSearchParams({ ...(q ? { q } : {}), ...(spec ? { spec } : {}), ...(city ? { city } : {}), ...(av ? { availability: av } : {}), ...(minExp ? { minExp } : {}) })}`);
      const b = await r.json(); if (!r.ok) throw new Error(b.error);
      setList(b.specialists); setError(null);
    } catch (e: any) { setError(e.message ?? "Не удалось загрузить"); }
  }, [q, spec, city, av, minExp]);
  useEffect(() => { const t = setTimeout(load, 250); return () => clearTimeout(t); }, [load]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Реестр специалистов</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
            Бухгалтеры, аудиторы, финансисты и преподаватели, которые сами разместили анкету: опыт, места работы, сертификаты,
            отзывы работодателей и рейтинг по открытой формуле. Анонимных отзывов и анкет «за других» здесь нет.
          </p>
        </div>
        <a href="/specialists/edit" className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">+ Разместить свою анкету</a>
      </header>

      <section className={`${card} mb-5 grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-5`}>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Имя, должность, навык" className={`${field} lg:col-span-2`} />
        <select value={spec} onChange={(e) => setSpec(e.target.value)} className={field}><option value="">Любая специализация</option>{SPECIALIZATIONS.map((s) => <option key={s}>{s}</option>)}</select>
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Город" className={field} />
        <div className="flex gap-2">
          <select value={av} onChange={(e) => setAv(e.target.value)} className={field}><option value="">Любой статус</option>{Object.entries(AVAILABILITY).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
          <select value={minExp} onChange={(e) => setMinExp(e.target.value)} className={`${field} w-28`} title="Опыт от"><option value="">опыт</option>{[1, 3, 5, 10].map((n) => <option key={n} value={n}>от {n}</option>)}</select>
        </div>
      </section>

      {error && <p className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}
      {list?.length === 0 && <p className={`${card} p-6 text-sm text-fl-cream/65`}>Анкет по этому запросу нет. Разместите свою — она появится здесь сразу.</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {list?.map((s) => (
          <a key={s.id} href={`/specialists/${s.id}`} className={`${card} flex gap-4 p-4 hover:border-fl-gold/40`}>
            <div className="flex h-14 w-14 flex-shrink-0 flex-col items-center justify-center rounded-full bg-fl-gold/15" title="Рейтинг из 100">
              <span className="num font-display text-lg font-bold leading-none text-fl-gold">{Math.round(s.rating)}</span>
              <span className="text-[9px] text-fl-cream/50">из 100</span>
            </div>
            <div className="min-w-0">
              <h2 className="font-display text-base font-semibold text-fl-cream">{s.fullName}</h2>
              <p className="text-sm text-fl-cream/80">{s.headline}</p>
              <p className="mt-0.5 text-xs text-fl-cream/55">
                {years(s.experienceYears)} опыта{s.city ? ` · ${s.city}` : ""}{s.current ? ` · ${s.current.position}, ${s.current.org}` : ""}
              </p>
              <p className="mt-1 text-xs text-fl-cream/55">
                <span className={s.availability === "open" ? "text-fl-green" : s.availability === "part" ? "text-fl-amber" : ""}>{AVAILABILITY[s.availability]}</span>
                {s.reviewCount > 0 && <> · ★ {s.reviewAvg} ({s.reviewCount})</>}
                {s.certificates > 0 && <> · сертификатов {s.certificates}</>}
                {s.rateFrom && <> · от {s.rateFrom.toLocaleString("ru-RU")} сом</>}
              </p>
              {s.specializations.length > 0 && <p className="mt-1.5 flex flex-wrap gap-1">{s.specializations.slice(0, 4).map((x) => <span key={x} className="rounded bg-fl-line/60 px-1.5 py-0.5 text-[11px] text-fl-cream/75">{x}</span>)}</p>}
            </div>
          </a>
        ))}
      </div>
    </main>
  );
}
