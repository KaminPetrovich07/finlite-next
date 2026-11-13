"use client";

// Бланки: все формы альбома унифицированных форм первичной учётной документации КР.
// Выбрать бланк → реквизиты компании подставятся сами → заполнить поля и строки → Word или PDF.
// Черновик каждого бланка хранится в этом браузере.
import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import { ABSENT_FORMS, FORMS, FORM_BY_ID } from "@/lib/forms";
import { fieldKey } from "@/lib/forms/render";
import { SECTIONS, type FillValues, type FormDef, type FormValues, type Part } from "@/lib/forms/types";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const cell = "w-full min-w-[84px] bg-transparent px-1.5 py-1 text-xs text-fl-cream focus:bg-fl-surface-2 focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";

const draftKey = (formId: string, companyId: string) => `finlite:form:${companyId || "-"}:${formId}`;
function loadDraft(formId: string, companyId: string): FormValues {
  try { return JSON.parse(localStorage.getItem(draftKey(formId, companyId)) ?? "{}") as FormValues; } catch { return {}; }
}
function saveDraft(formId: string, companyId: string, v: FormValues) {
  try { localStorage.setItem(draftKey(formId, companyId), JSON.stringify(v)); } catch { /* хранилище недоступно — черновик живёт до перезагрузки */ }
}

const norm = (s: string) => s.toLowerCase().replace(/ё/g, "е").replace(/[-\s]/g, "");

export default function FormsPage() {
  const { companies, companyId, setCompanyId } = useCompanies();
  const [q, setQ] = useState("");
  const [id, setId] = useState<string>("");
  const [fills, setFills] = useState<FillValues>({});
  const [values, setValues] = useState<FormValues>({});
  const [busy, setBusy] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  useEffect(() => {
    const want = new URLSearchParams(location.search).get("form");
    setId(want && FORM_BY_ID[want] ? want : FORMS[0].id);
  }, []);
  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/forms?companyId=${encodeURIComponent(companyId)}`).then((r) => (r.ok ? r.json() : {})).then(setFills).catch(() => setFills({}));
  }, [companyId]);
  useEffect(() => { if (id) setValues(loadDraft(id, companyId)); }, [id, companyId]);

  const def = id ? FORM_BY_ID[id] : null;
  const list = useMemo(() => {
    const n = norm(q);
    return FORMS.filter((f) => !n || norm(`${f.code} ${f.title} ${f.use}`).includes(n));
  }, [q]);

  function pick(fid: string) {
    setId(fid);
    history.replaceState(null, "", `?form=${fid}`);
    // на телефоне список идёт над бланком — прокручиваем к бланку
    requestAnimationFrame(() => document.getElementById("form-editor")?.scrollIntoView({ behavior: "smooth", block: "start" }));
  }
  function update(next: FormValues) { setValues(next); if (def) saveDraft(def.id, companyId, next); }
  const setF = (k: string, v: string) => update({ ...values, f: { ...values.f, [k]: v } });
  const setT = (tid: string, rows: string[][]) => update({ ...values, t: { ...values.t, [tid]: rows } });

  async function download(format: "pdf" | "docx", blank: boolean) {
    if (!def) return;
    setBusy(`${format}${blank}`);
    try {
      await downloadPost(`/api/forms/export?format=${format}`, { formId: def.id, companyId: blank ? undefined : companyId, blank, values: blank ? undefined : values }, `${def.code || def.title}.${format}`);
    } catch (e) { show((e as Error).message, "error"); }
    setBusy(null);
  }

  return (
    <main className="mx-auto max-w-7xl px-4 py-6">
      <ToastContainer />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-fl-cream">Бланки первичных документов</h1>
          <p className="mt-1 max-w-3xl text-sm text-fl-cream/65">
            Все формы альбома унифицированных форм первичной учётной документации Кыргызской Республики, всего {FORMS.length}: графы, номера граф и подписи как в альбоме.
            Реквизиты компании и подписантов из учётной политики подставляются сами.
          </p>
        </div>
        <label className="text-sm text-fl-cream/70">Компания
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[240px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-[340px_1fr]">
        <aside className={`${card} h-fit lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:overflow-auto`}>
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Код или название: ИНВ-3, табель, доверенность…" className={field} aria-label="Поиск бланка" />
          <p className="mt-2 text-xs text-fl-cream/50">Найдено: {list.length}</p>
          {SECTIONS.map((s) => {
            const items = list.filter((f) => f.section === s.key);
            if (!items.length) return null;
            return (
              <div key={s.key} className="mt-4">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-fl-gold/80">{s.title}</h2>
                <ul className="mt-1 space-y-0.5">
                  {items.map((f) => (
                    <li key={f.id}>
                      <button onClick={() => pick(f.id)} className={`w-full rounded-md px-2 py-1.5 text-left text-sm ${f.id === id ? "bg-fl-accent/15 text-fl-cream" : "text-fl-cream/75 hover:bg-fl-surface-2"}`}>
                        <span className="mr-1.5 inline-block min-w-[3.2rem] font-mono text-xs text-fl-gold">{f.code || `№ ${f.n}`}</span>{f.title}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
          {!q && (
            <p className="mt-4 text-xs text-fl-cream/45">
              В альбоме отмечены как отсутствующие: {ABSENT_FORMS.map(([c]) => c).join(", ")}. Отчёт экспедитора дан неунифицированной формой.
            </p>
          )}
        </aside>

        {def && (
          <section id="form-editor" className="min-w-0 scroll-mt-4 space-y-4">
            <div className={card}>
              <p className="font-mono text-xs text-fl-gold">{def.unified ? `Форма № ${def.code}` : "Неунифицированная форма"} · № {def.n} по альбому</p>
              <h2 className="mt-1 text-xl font-semibold text-fl-cream">{def.title}</h2>
              <p className="mt-1 text-sm text-fl-cream/70">{def.use}</p>
              {def.approvedBy && <p className="mt-1 text-xs text-fl-cream/50">{def.approvedBy}</p>}
              {def.journal && <Link href={def.journal.href} className="mt-2 inline-block text-sm text-fl-gold underline">{def.journal.label}</Link>}
              <div className="mt-4 flex flex-wrap gap-2">
                <button disabled={!!busy} onClick={() => download("docx", false)} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy === "docxfalse" ? "Готовлю…" : "Заполненный — Word"}</button>
                <button disabled={!!busy} onClick={() => download("pdf", false)} className="rounded-lg border border-fl-gold/60 px-4 py-2 text-sm font-semibold text-fl-cream hover:bg-fl-surface-2 disabled:opacity-50">{busy === "pdffalse" ? "Готовлю…" : "Заполненный — PDF"}</button>
                <button disabled={!!busy} onClick={() => download("docx", true)} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80 hover:text-fl-cream disabled:opacity-50">Чистый бланк — Word</button>
                <button disabled={!!busy} onClick={() => download("pdf", true)} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80 hover:text-fl-cream disabled:opacity-50">Чистый бланк — PDF</button>
                <button onClick={() => update({})} className="ml-auto rounded-lg px-3 py-2 text-sm text-fl-cream/50 hover:text-fl-cream">Очистить</button>
              </div>
              <p className="mt-2 text-xs text-fl-cream/45">Пустые поля печатаются линией для заполнения от руки. Черновик сохраняется в этом браузере.</p>
            </div>
            <FormEditor def={def} values={values} fills={fills} setF={setF} setT={setT} />
          </section>
        )}
      </div>
    </main>
  );
}

function FormEditor({ def, values, fills, setF, setT }: { def: FormDef; values: FormValues; fills: FillValues; setF: (k: string, v: string) => void; setT: (id: string, rows: string[][]) => void }) {
  const f = values.f ?? {};
  const input = (k: string, label: string, placeholder = "") => (
    <label key={k} className="block text-sm text-fl-cream/75">{label}
      <input value={f[k] ?? ""} onChange={(e) => setF(k, e.target.value)} placeholder={placeholder} className={`${field} mt-1`} />
    </label>
  );
  return (
    <div className={`${card} space-y-4`}>
      {!def.noOrg && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="text-sm text-fl-cream/75">Наименование субъекта<p className="mt-1 rounded-md border border-fl-line/60 px-3 py-2 text-fl-cream/80">{fills.org ? `${fills.org}${fills.inn ? `, ИНН ${fills.inn}` : ""}` : "—"}</p></div>
          {input("org.dept", "Структурное подразделение")}
          {input("org.okpo", "Код по ОКПО")}
        </div>
      )}
      {def.parts.map((p, pi) => <PartEditor key={pi} p={p} pi={pi} f={f} fills={fills} input={input} rows={values.t} setT={setT} />)}
    </div>
  );
}

function PartEditor({ p, pi, f, fills, input, rows, setT }: {
  p: Part; pi: number; f: Record<string, string>; fills: FillValues;
  input: (k: string, label: string, placeholder?: string) => React.ReactNode; rows?: Record<string, string[][]>; setT: (id: string, rows: string[][]) => void;
}) {
  switch (p.t) {
    case "approve":
      return <p className="text-right text-xs text-fl-cream/55">УТВЕРЖДАЮ: {fills.directorTitle || p.who || "Руководитель"} {fills.director || "________"}</p>;
    case "title":
      return (
        <div className="border-t border-fl-line/60 pt-3">
          <h3 className="text-center text-base font-semibold uppercase tracking-wide text-fl-cream">{p.text}{p.no ? " № …" : ""}</h3>
          {p.sub && <p className="text-center text-sm text-fl-cream/65">{p.sub}</p>}
          {(p.no || p.date) && <div className="mx-auto mt-2 grid max-w-md gap-3 sm:grid-cols-2">{p.no && input(`${pi}.no`, "Номер документа")}{p.date && input(`${pi}.date`, "Дата составления", "«___» ______ 20__ г.")}</div>}
        </div>
      );
    case "fields":
      return <div className="grid gap-3 sm:grid-cols-2">{p.items.map((it, ii) => input(fieldKey(pi, ii), it.label || "…", it.fill ? fills[it.fill] ?? "" : ""))}</div>;
    case "text":
      return <p className={`text-sm text-fl-cream/75 ${p.bold ? "font-semibold" : ""} ${p.center ? "text-center" : ""}`}>{p.text}</p>;
    case "h":
      return <h4 className="font-semibold text-fl-cream">{p.text}</h4>;
    case "note":
      return <p className="text-xs italic text-fl-cream/50">{p.text}</p>;
    case "back":
      return <p className="border-t border-dashed border-fl-line pt-3 text-xs uppercase tracking-wide text-fl-cream/45">{p.text}</p>;
    case "sign":
      return (
        <div className="grid gap-3 sm:grid-cols-2">
          {p.items.map((s, ii) => input(fieldKey(pi, ii), `${s.role || "Подпись"} — расшифровка подписи`, s.fill ? fills[s.fill] ?? "" : ""))}
        </div>
      );
    case "table":
      return <TableEditor p={p} data={rows?.[p.id]} onChange={(r) => setT(p.id, r)} />;
  }
}

function TableEditor({ p, data, onChange }: { p: Extract<Part, { t: "table" }>; data?: string[][]; onChange: (rows: string[][]) => void }) {
  const n = p.cols.length;
  const rows = data?.length ? data : [Array(n).fill("")];
  const labels = p.cols.map((c) => c.h.split("|").map((s) => s.trim()).filter(Boolean).join(" · "));
  const set = (r: number, c: number, v: string) => onChange(rows.map((row, i) => (i === r ? Array.from({ length: n }, (_, j) => (j === c ? v : row[j] ?? "")) : row)));
  return (
    <div>
      {p.title && <p className="mb-1 text-sm font-semibold text-fl-cream/85">{p.title}</p>}
      {p.fixed?.length ? <p className="mb-1 text-xs text-fl-cream/50">Строки бланка: {p.fixed.map((r) => r[0]).filter(Boolean).join("; ")}. Ниже — дополнительные строки.</p> : null}
      <div className="overflow-x-auto rounded-lg border border-fl-line">
        <table className="min-w-full text-xs">
          <thead className="bg-fl-surface-2 text-fl-cream/70">
            <tr>{labels.map((l, i) => <th key={i} className="border-b border-r border-fl-line/60 px-1.5 py-1 text-left align-bottom font-normal">{l || "—"}</th>)}<th className="border-b border-fl-line/60" /></tr>
          </thead>
          <tbody>
            {rows.map((row, r) => (
              <tr key={r} className="border-b border-fl-line/40">
                {Array.from({ length: n }, (_, c) => (
                  <td key={c} className="border-r border-fl-line/40"><input value={row[c] ?? ""} onChange={(e) => set(r, c, e.target.value)} className={cell} aria-label={labels[c]} /></td>
                ))}
                <td className="px-1"><button onClick={() => onChange(rows.filter((_, i) => i !== r))} className="text-fl-cream/40 hover:text-fl-red" aria-label="Удалить строку">×</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <button onClick={() => onChange([...rows, Array(n).fill("")])} className="mt-1.5 text-xs text-fl-gold hover:underline">+ строка</button>
      {p.totals?.length ? <span className="ml-3 text-xs text-fl-cream/45">Итоговые строки ({p.totals.join(", ")}) программа посчитает сама по графам с суммами.</span> : null}
    </div>
  );
}
