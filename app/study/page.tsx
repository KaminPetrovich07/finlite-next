"use client";

// Учебный режим: преподаватель создаёт группу и задания, студенты решают их на своей копии компании,
// программа сама проверяет обороты по счетам и ведёт ведомость.
import { Fragment, useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { card, field, ghostBtn } from "@/components/auth/ui";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import type { CheckResult } from "@/lib/study/check";

interface AssignmentRow { id: string; title: string; text: string; preset: string | null; periodFrom: string; periodTo: string; showAnswers: boolean; dueAt: string | null; createdAt: string; _count?: { submissions: number }; mine?: { id: string; companyId: string; score: number | null; checks: number; checkedAt: string | null } | null }
interface Teaching { id: string; name: string; code: string; _count: { members: number }; assignments: AssignmentRow[] }
interface Learning { id: string; name: string; teacher: string; assignments: AssignmentRow[] }
interface Data { teaching: Teaching[]; learning: Learning[]; companies: Array<{ id: string; name: string }>; presets: Array<{ key: string; title: string; periodFrom: string; periodTo: string }> }

const accName = (code: string) => ACCOUNTS.find((a) => a.code === code)?.name ?? "";
const money = (n: number) => (Number.isFinite(n) ? n.toLocaleString("ru-RU", { maximumFractionDigits: 2 }) : "—");
const dmy = (s: string | null) => (s ? new Date(s).toLocaleDateString("ru-RU") : "—");
const period = (a: { periodFrom: string; periodTo: string }) => `${a.periodFrom.split("-").reverse().join(".")} – ${a.periodTo.split("-").reverse().join(".")}`;
function openCompany(id: string, path = "/ledger") { try { localStorage.setItem("finlite:companyId", id); } catch { /* приватный режим */ } window.location.href = path; }
async function post(url: string, body: unknown) {
  const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const b = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(b.error ?? "Не получилось");
  return b;
}
const scoreTone = (s: number | null | undefined) => (s == null ? "text-fl-cream/45" : s === 100 ? "text-fl-green" : s >= 70 ? "text-fl-amber" : "text-fl-red");

export default function StudyPage() {
  const toast = useToast();
  const [data, setData] = useState<Data | null>(null);
  const [need, setNeed] = useState<string | null>(null);
  const [tab, setTab] = useState<"student" | "teacher">("student");
  const load = useCallback(async () => {
    const r = await fetch("/api/study");
    const b = await r.json().catch(() => ({}));
    if (r.status === 401) { setNeed("login"); return; }
    if (!r.ok) { setNeed(b.error ?? "Не удалось загрузить"); return; }
    setData(b);
  }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { if (data && !data.learning.length && data.teaching.length) setTab("teacher"); }, [data]);

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Учебный режим</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">Преподаватель создаёт группу и задание, студенты вступают по коду и решают его на своей копии компании. Программа сравнивает обороты по счетам с эталоном и сама выставляет процент выполнения.</p>
      </header>
      {need === "login" ? (
        <div className={`${card} p-5 text-sm text-fl-cream/80`}>Учебный режим работает с учётными записями: преподавателю и студентам нужно <a href="/login" className="font-semibold text-fl-gold underline">войти</a> или <a href="/register" className="font-semibold text-fl-gold underline">зарегистрироваться</a>.</div>
      ) : need ? <p className="text-sm text-fl-red">{need}</p> : !data ? <p className="text-sm text-fl-cream/50">Загружаю…</p> : (
        <>
          <div role="tablist" className="mb-5 flex gap-1 border-b border-fl-line">
            {([["student", "Я студент"], ["teacher", "Я преподаватель"]] as const).map(([k, l]) => (
              <button key={k} role="tab" aria-selected={tab === k} onClick={() => setTab(k)} className={`-mb-px border-b-2 px-4 py-2 text-sm ${tab === k ? "border-fl-gold font-semibold text-fl-cream" : "border-transparent text-fl-cream/60 hover:text-fl-cream"}`}>{l}</button>
            ))}
          </div>
          {tab === "student" ? <Student data={data} reload={load} toast={toast.show} /> : <Teacher data={data} reload={load} toast={toast.show} />}
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

type Toast = (m: string, k?: "success" | "error") => void;

// ── Студент ───────────────────────────────────────────────────────────────
function Student({ data, reload, toast }: { data: Data; reload: () => void; toast: Toast }) {
  const [code, setCode] = useState("");
  async function join(e: React.FormEvent) {
    e.preventDefault();
    try { const b = await post("/api/study/join", { code }); toast(`Вы в группе «${b.name}»`); setCode(""); reload(); } catch (err) { toast((err as Error).message, "error"); }
  }
  return (
    <div className="space-y-5">
      <form onSubmit={join} className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <label className="min-w-[12rem] flex-1 text-sm text-fl-cream/75">Код группы от преподавателя
          <input value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} maxLength={8} placeholder="Например, K7Q2MX" className={`${field} font-mono uppercase tracking-widest`} />
        </label>
        <button className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Вступить</button>
      </form>
      {data.learning.length === 0 && <p className="text-sm text-fl-cream/55">Вы пока не состоите ни в одной группе. Попросите у преподавателя код и введите его выше.</p>}
      {data.learning.map((g) => (
        <section key={g.id} className="space-y-3">
          <h2 className="font-display text-lg font-semibold text-fl-cream">{g.name} <span className="text-sm font-normal text-fl-cream/50">· преподаватель {g.teacher}</span></h2>
          {g.assignments.length === 0 && <p className="text-sm text-fl-cream/55">Заданий пока нет.</p>}
          {g.assignments.map((a) => <StudentAssignment key={a.id} a={a} reload={reload} toast={toast} />)}
        </section>
      ))}
    </div>
  );
}

function StudentAssignment({ a, reload, toast }: { a: AssignmentRow; reload: () => void; toast: Toast }) {
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<CheckResult | null>(null);
  const [showText, setShowText] = useState(!a.mine);
  async function start() {
    setBusy(true);
    try { const b = await post(`/api/study/assignments/${a.id}/start`, {}); toast("Ваша компания для задания создана"); openCompany(b.companyId); } catch (e) { toast((e as Error).message, "error"); setBusy(false); }
  }
  async function check() {
    setBusy(true);
    try { const b = await post(`/api/study/assignments/${a.id}/check`, {}); setResult(b.result); reload(); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  useEffect(() => { if (a.mine?.checkedAt) fetch(`/api/study/assignments/${a.id}`).then((r) => r.json()).then((b) => b.submission?.result && setResult(b.submission.result)).catch(() => undefined); }, [a.id, a.mine?.checkedAt]);
  const late = a.dueAt && new Date(a.dueAt) < new Date();
  return (
    <article className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="font-semibold text-fl-cream">{a.title}</h3>
          <p className="text-xs text-fl-cream/55">Проверяется период {period(a)}{a.dueAt && <> · срок <span className={late ? "text-fl-red" : ""}>{dmy(a.dueAt)}</span></>}</p>
        </div>
        <div className="text-right">
          {a.mine ? <p className={`text-2xl font-bold ${scoreTone(a.mine.score)}`}>{a.mine.score == null ? "—" : `${money(a.mine.score)} %`}</p> : <p className="text-sm text-fl-cream/50">не начато</p>}
          {a.mine && <p className="text-[11px] text-fl-cream/45">проверок: {a.mine.checks}</p>}
        </div>
      </div>
      <button className="mt-2 text-xs text-fl-gold underline" onClick={() => setShowText((v) => !v)}>{showText ? "скрыть условие" : "показать условие"}</button>
      {showText && <div className="mt-2 whitespace-pre-line rounded-lg bg-fl-surface-2 p-3 text-sm leading-relaxed text-fl-cream/80">{a.text}</div>}
      <div className="mt-3 flex flex-wrap gap-2">
        {!a.mine ? <button disabled={busy} onClick={start} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy ? "Создаю компанию…" : "Начать"}</button> : <>
          <button onClick={() => openCompany(a.mine!.companyId)} className={ghostBtn}>Открыть мою компанию</button>
          <button disabled={busy} onClick={check} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy ? "Проверяю…" : "Проверить"}</button>
        </>}
      </div>
      {result && <ResultTable r={result} />}
    </article>
  );
}

function ResultTable({ r }: { r: CheckResult }) {
  const answers = r.rows.some((x) => x.expected && Number.isFinite(x.expected.d));
  return (
    <div className="mt-4">
      <p className={`text-sm font-semibold ${r.score === 100 ? "text-fl-green" : "text-fl-cream"}`}>{r.verdict}</p>
      <div className="mt-2 overflow-x-auto">
        <table className="w-full min-w-[520px] text-sm">
          <thead><tr className="text-left text-[11px] uppercase tracking-wide text-fl-cream/45">
            <th className="py-1.5">Счёт</th>{answers && <><th className="py-1.5 text-right">Нужно Дт / Кт</th></>}<th className="py-1.5 text-right">У вас Дт / Кт</th><th className="py-1.5">Итог</th>
          </tr></thead>
          <tbody>{r.rows.map((x) => (
            <tr key={x.account} className="border-t border-fl-line align-top">
              <td className="py-1.5"><span className="num mr-1.5 text-fl-cream/60">{x.account}</span><span className="text-fl-cream/80">{accName(x.account)}</span></td>
              {answers && <td className="num py-1.5 text-right text-fl-cream/60">{x.expected ? `${money(x.expected.d)} / ${money(x.expected.c)}` : "—"}</td>}
              <td className="num py-1.5 text-right text-fl-cream">{money(x.actual.d)} / {money(x.actual.c)}</td>
              <td className={`py-1.5 pl-3 ${x.ok ? "text-fl-green" : "text-fl-red"}`}>{x.ok ? "✓" : `✗ ${x.hint}`}</td>
            </tr>
          ))}</tbody>
        </table>
      </div>
      {!answers && r.score < 100 && <p className="mt-2 text-xs text-fl-cream/50">Эталонные суммы скрыты преподавателем. Найдите ошибку по подсказке: какой счёт и в какую сторону расходится.</p>}
    </div>
  );
}

// ── Преподаватель ─────────────────────────────────────────────────────────
function Teacher({ data, reload, toast }: { data: Data; reload: () => void; toast: Toast }) {
  const [name, setName] = useState("");
  async function create(e: React.FormEvent) {
    e.preventDefault();
    try { await post("/api/study/groups", { name }); setName(""); toast("Группа создана — раздайте студентам код"); reload(); } catch (err) { toast((err as Error).message, "error"); }
  }
  return (
    <div className="space-y-5">
      <form onSubmit={create} className={`${card} flex flex-wrap items-end gap-3 p-4`}>
        <label className="min-w-[12rem] flex-1 text-sm text-fl-cream/75">Новая группа
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Например, БиА-2-24, бухгалтерское дело" className={field} />
        </label>
        <button className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Создать</button>
      </form>
      {data.teaching.length === 0 && <p className="text-sm text-fl-cream/55">Создайте группу, затем добавьте в неё задание: готовое из пособия или своё по эталонной компании.</p>}
      {data.teaching.map((g) => <GroupCard key={g.id} g={g} data={data} reload={reload} toast={toast} />)}
    </div>
  );
}

function GroupCard({ g, data, reload, toast }: { g: Teaching; data: Data; reload: () => void; toast: Toast }) {
  const [adding, setAdding] = useState(false);
  const [members, setMembers] = useState<Array<{ id: string; name: string | null; email: string }> | null>(null);
  async function act(body: object, ok: string) { try { await post(`/api/study/groups/${g.id}`, body); toast(ok); reload(); } catch (e) { toast((e as Error).message, "error"); } }
  return (
    <section className={`${card} p-4`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-lg font-semibold text-fl-cream">{g.name}</h2>
          <p className="text-sm text-fl-cream/60">Студентов: {g._count.members} · <button className="text-fl-gold underline" onClick={() => members ? setMembers(null) : fetch(`/api/study/groups/${g.id}`).then((r) => r.json()).then((b) => setMembers(b.members))}>{members ? "скрыть список" : "список"}</button></p>
        </div>
        <div className="text-right">
          <p className="text-[11px] uppercase tracking-wide text-fl-cream/45">Код для студентов</p>
          <button title="Скопировать" onClick={() => { navigator.clipboard?.writeText(g.code); toast("Код скопирован"); }} className="font-mono text-2xl font-bold tracking-[0.2em] text-fl-gold">{g.code}</button>
        </div>
      </div>
      {members && (
        <ul className="mt-2 flex flex-wrap gap-2 text-sm">
          {members.length === 0 && <li className="text-fl-cream/50">Пока никто не вступил.</li>}
          {members.map((m) => <li key={m.id} className="rounded-full border border-fl-line px-3 py-1 text-fl-cream/80">{m.name || m.email} <button aria-label={`Исключить ${m.name || m.email}`} className="ml-1 text-fl-cream/45 hover:text-fl-red" onClick={() => act({ removeMember: m.id }, "Студент исключён").then(() => setMembers((x) => x?.filter((y) => y.id !== m.id) ?? null))}>×</button></li>)}
        </ul>
      )}
      <div className="mt-4 space-y-3">
        {g.assignments.map((a) => <TeacherAssignment key={a.id} a={a} groupId={g.id} companies={data.companies} reload={reload} toast={toast} />)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setAdding((v) => !v)} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{adding ? "Отмена" : "+ Задание"}</button>
        <button onClick={() => { if (confirm(`Удалить группу «${g.name}» со всеми заданиями и результатами? Компании студентов останутся у них.`)) act({ deleteGroup: true }, "Группа удалена"); }} className="rounded-lg px-3 py-2 text-sm text-fl-cream/50 hover:text-fl-red">Удалить группу</button>
      </div>
      {adding && <NewAssignment groupId={g.id} data={data} onDone={() => { setAdding(false); reload(); }} toast={toast} />}
    </section>
  );
}

function NewAssignment({ groupId, data, onDone, toast }: { groupId: string; data: Data; onDone: () => void; toast: Toast }) {
  const [mode, setMode] = useState<"preset" | "own">("preset");
  const [f, setF] = useState({ preset: data.presets[0]?.key ?? "", title: "", text: "", baseCompanyId: "", referenceCompanyId: "", periodFrom: "", periodTo: "", dueAt: "", showAnswers: false });
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.type === "checkbox" ? (e.target as HTMLInputElement).checked : e.target.value });
  async function save(e: React.FormEvent) {
    e.preventDefault();
    const assignment = mode === "preset" ? { preset: f.preset, dueAt: f.dueAt, showAnswers: f.showAnswers } : { ...f, preset: undefined };
    try { await post(`/api/study/groups/${groupId}`, { assignment }); toast("Задание добавлено"); onDone(); } catch (err) { toast((err as Error).message, "error"); }
  }
  return (
    <form onSubmit={save} className="mt-3 space-y-3 rounded-xl border border-fl-line p-4">
      <div className="flex flex-wrap gap-4 text-sm text-fl-cream/80">
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "preset"} onChange={() => setMode("preset")} /> Готовое из пособия</label>
        <label className="flex items-center gap-2"><input type="radio" checked={mode === "own"} onChange={() => setMode("own")} /> Своё задание</label>
      </div>
      {mode === "preset" ? (
        <label className="block text-sm text-fl-cream/75">Задание
          <select value={f.preset} onChange={set("preset")} className={field}>{data.presets.map((p) => <option key={p.key} value={p.key}>{p.title}</option>)}</select>
        </label>
      ) : (
        <>
          <label className="block text-sm text-fl-cream/75">Название<input value={f.title} onChange={set("title")} className={field} placeholder="Например, Операции ноября" /></label>
          <label className="block text-sm text-fl-cream/75">Условие для студентов<textarea rows={6} value={f.text} onChange={set("text")} className={field} placeholder="Список операций с датами и суммами, что нужно сделать в программе" /></label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-sm text-fl-cream/75">С какой компании начинают студенты
              <select value={f.baseCompanyId} onChange={set("baseCompanyId")} className={field}><option value="">Копия демо-компании ОсОО «Белес»</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block text-sm text-fl-cream/75">Эталон — ваша компания с решением
              <select value={f.referenceCompanyId} onChange={set("referenceCompanyId")} className={field}><option value="">Выберите…</option>{data.companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
            </label>
            <label className="block text-sm text-fl-cream/75">Проверять период с<input type="date" value={f.periodFrom} onChange={set("periodFrom")} className={field} /></label>
            <label className="block text-sm text-fl-cream/75">по<input type="date" value={f.periodTo} onChange={set("periodTo")} className={field} /></label>
          </div>
          <p className="text-xs leading-relaxed text-fl-cream/50">Как подготовить эталон: сделайте копию стартовой компании, решите в ней задание сами и выберите её здесь. Программа запомнит обороты по счетам за период и будет сравнивать с ними работы студентов. Закрытие периода, начисление налогов, переоценка и амортизация в сравнении не участвуют.</p>
        </>
      )}
      <div className="flex flex-wrap items-end gap-4">
        <label className="text-sm text-fl-cream/75">Срок сдачи (необязательно)<input type="date" value={f.dueAt} onChange={set("dueAt")} className={field} /></label>
        <label className="flex items-center gap-2 pb-2.5 text-sm text-fl-cream/75"><input type="checkbox" checked={f.showAnswers} onChange={set("showAnswers")} /> показывать студентам эталонные суммы</label>
      </div>
      <button className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Добавить задание</button>
    </form>
  );
}

interface TRow { user: { id: string; name: string | null; email: string }; submission: { companyId: string; score: number | null; checks: number; checkedAt: string | null; result: CheckResult | null } | null }

function TeacherAssignment({ a, groupId, companies, reload, toast }: { a: AssignmentRow; groupId: string; companies: Data["companies"]; reload: () => void; toast: Toast }) {
  const [rows, setRows] = useState<TRow[] | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [ref, setRef] = useState("");
  const load = useCallback(() => fetch(`/api/study/assignments/${a.id}`).then((r) => r.json()).then((b) => setRows(b.rows)), [a.id]);
  async function check(userId: string) {
    setBusy(true);
    try { await post(`/api/study/assignments/${a.id}/check`, { userId }); await load(); toast(userId === "all" ? "Все работы проверены" : "Проверено"); } catch (e) { toast((e as Error).message, "error"); } finally { setBusy(false); }
  }
  const started = rows?.filter((r) => r.submission).length ?? 0;
  const avg = rows && started ? rows.reduce((s, r) => s + (r.submission?.score ?? 0), 0) / started : null;
  return (
    <article className="rounded-xl border border-fl-line p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <h3 className="font-semibold text-fl-cream">{a.title}</h3>
          <p className="text-xs text-fl-cream/55">Период {period(a)} · начали {a._count?.submissions ?? 0}{a.dueAt && ` · срок ${dmy(a.dueAt)}`}{a.showAnswers ? " · эталон виден студентам" : ""}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => (rows ? setRows(null) : load())} className={ghostBtn}>{rows ? "Скрыть результаты" : "Результаты"}</button>
          <a href={`/api/study/assignments/${a.id}/grades`} className={ghostBtn}>Ведомость CSV</a>
        </div>
      </div>
      {rows && (
        <div className="mt-3">
          <div className="mb-2 flex flex-wrap items-center gap-3 text-sm">
            <button disabled={busy || !started} onClick={() => check("all")} className="rounded-lg bg-fl-accent px-3 py-1.5 font-semibold text-fl-on-accent disabled:opacity-50">{busy ? "Проверяю…" : "Проверить всех"}</button>
            <span className="text-fl-cream/60">Начали {started} из {rows.length}{avg != null && ` · средний балл ${money(Math.round(avg * 10) / 10)} %`}</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-[11px] uppercase tracking-wide text-fl-cream/45"><th className="py-1.5">Студент</th><th className="py-1.5 text-right">Балл</th><th className="py-1.5 text-right">Проверок</th><th className="py-1.5">Последняя</th><th /></tr></thead>
              <tbody>{rows.map((r) => (
                <Fragment key={r.user.id}>
                  <tr className="border-t border-fl-line">
                    <td className="py-1.5 text-fl-cream">{r.user.name || r.user.email}<span className="block text-xs text-fl-cream/45">{r.user.email}</span></td>
                    <td className={`py-1.5 text-right font-semibold ${scoreTone(r.submission?.score)}`}>{r.submission ? (r.submission.score == null ? "—" : `${money(r.submission.score)} %`) : <span className="font-normal text-fl-cream/45">не начато</span>}</td>
                    <td className="py-1.5 text-right text-fl-cream/70">{r.submission?.checks ?? 0}</td>
                    <td className="py-1.5 text-fl-cream/60">{dmy(r.submission?.checkedAt ?? null)}</td>
                    <td className="py-1.5 text-right">{r.submission && <span className="flex justify-end gap-2 text-xs">
                      <button disabled={busy} className="text-fl-gold underline" onClick={() => check(r.user.id)}>проверить</button>
                      {r.submission.result && <button className="text-fl-gold underline" onClick={() => setDetail(detail === r.user.id ? null : r.user.id)}>подробно</button>}
                      <button className="text-fl-gold underline" onClick={() => openCompany(r.submission!.companyId)}>журнал</button>
                    </span>}</td>
                  </tr>
                  {detail === r.user.id && r.submission?.result && <tr><td colSpan={5}><ResultTable r={r.submission.result} /></td></tr>}
                </Fragment>
              ))}</tbody>
            </table>
          </div>
          {!a.preset && (
            <div className="mt-3 flex flex-wrap items-end gap-2 border-t border-fl-line pt-3 text-sm">
              <label className="text-fl-cream/70">Обновить эталон из компании
                <select value={ref} onChange={(e) => setRef(e.target.value)} className={field}><option value="">Выберите…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>
              </label>
              <button disabled={!ref} onClick={() => post(`/api/study/groups/${groupId}`, { refreshKey: a.id, referenceCompanyId: ref }).then((b) => toast(`Эталон обновлён: ${b.accounts} счетов`)).catch((e) => toast(e.message, "error"))} className={ghostBtn}>Обновить</button>
            </div>
          )}
          <button onClick={() => { if (confirm(`Удалить задание «${a.title}» и результаты? Компании студентов останутся у них.`)) post(`/api/study/groups/${groupId}`, { deleteAssignment: a.id }).then(() => { toast("Задание удалено"); reload(); }); }} className="mt-2 text-xs text-fl-cream/45 hover:text-fl-red">Удалить задание</button>
        </div>
      )}
    </article>
  );
}
