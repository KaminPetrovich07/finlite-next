"use client";

import { useCallback, useEffect, useState } from "react";
import { useToast } from "@/components/Toast";
import { useMe } from "@/components/auth/useMe";
import { REGIME_INFO, REGIMES, type RegimeKey } from "@/lib/tax-engine";
import { DEMO_COMPANY } from "@/lib/ledger/demo";

interface Company {
  id: string;
  name: string;
  inn: string | null;
  activity: string | null;
  defaultRegime: string | null;
  patentAmount: number;
  createdAt: string;
  own: boolean;
  access: "edit" | "view";
  entries: number;
  owner: { name: string | null; email: string } | null;
}

interface Share {
  level: "view" | "edit";
  user: { id: string; name: string | null; email: string; role: string };
}

const field = "mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";

function open(id: string, path: string) {
  try { localStorage.setItem("finlite:companyId", id); } catch { /* storage blocked */ }
  window.location.href = path;
}

export default function CompaniesPage() {
  const { me } = useMe();
  const [list, setList] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/companies");
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error ?? "Не удалось загрузить компании"); setList([]); return; }
    setList(body);
  }, []);

  useEffect(() => {
    load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("new")) setCreating(true);
    if (sp.get("welcome")) setWelcome(true);
  }, [load]);

  const limited = me?.role === "limited";

  async function demoCopy() {
    const res = await fetch("/api/demo", { method: "POST" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast.show(body.error ?? "Не удалось создать копию", "error"); return; }
    toast.show("Создана копия демо-компании — её можно менять");
    load();
  }

  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Компании</h1>
          <p className="mt-1 max-w-2xl text-sm text-fl-cream/60">
            {me?.public ? "Все компании системы. Создайте свою или откройте демо." : me?.role === "admin"
              ? "Как администратор вы видите все компании системы."
              : "Ваши компании и те, к которым вам открыли доступ. Владелец может открыть доступ другим пользователям."}
          </p>
        </div>
        {!limited && (
          <div className="flex flex-wrap gap-2">
            <button onClick={demoCopy} className="rounded-lg border border-fl-line bg-fl-charcoal-2 px-4 py-2.5 text-sm font-medium text-fl-cream shadow-card hover:border-fl-gold/40">
              Копия демо-компании
            </button>
            <button onClick={() => setCreating(true)} className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent shadow-card hover:bg-fl-accent-hover">
              + Новая компания
            </button>
          </div>
        )}
      </header>

      {welcome && (
        <div className="mb-5 rounded-xl border-l-4 border-fl-gold bg-fl-gold/[0.07] px-4 py-3 text-sm text-fl-cream/85">
          <p className="font-semibold text-fl-gold">Добро пожаловать в FinLite!</p>
          <p className="mt-1">
            Создайте свою компанию и начните с начальных остатков в журнале — или откройте демо-компанию «{DEMO_COMPANY.name}»,
            чтобы посмотреть готовую отчётность.
          </p>
        </div>
      )}

      {limited && (
        <div className="mb-5 rounded-xl border border-fl-line bg-fl-info/5 px-4 py-3 text-sm text-fl-cream/70">
          У вас ограниченный доступ: можно смотреть, анализировать и скачивать отчёты компаний, которые вам открыли. Создавать и менять данные нельзя.
        </div>
      )}

      {creating && !limited && <CreateForm onDone={(id) => { setCreating(false); if (id) { toast.show("Компания создана"); load(); } }} />}

      {error && <p className="mb-4 rounded-lg bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      <div className="space-y-4">
        <DemoCard />
        {list === null && <p className="text-sm text-fl-cream/50">Загружаю…</p>}
        {list?.length === 0 && !error && (
          <p className="rounded-xl border border-dashed border-fl-line px-5 py-8 text-center text-sm text-fl-cream/55">
            {limited ? "Вам пока не открыли доступ ни к одной компании." : "Своих компаний пока нет — создайте первую."}
          </p>
        )}
        {list?.map((c) => <CompanyCard key={c.id} c={c} isAdmin={me?.role === "admin"} meId={me?.id} onChanged={load} toast={toast.show} />)}
      </div>
      <toast.ToastContainer />
    </main>
  );
}

function DemoCard() {
  return (
    <article className={`${card} flex flex-wrap items-center gap-4 px-5 py-4`}>
      <div className="min-w-[15rem] flex-1">
        <p className="font-display text-lg font-semibold text-fl-cream">{DEMO_COMPANY.name}</p>
        <p className="text-sm text-fl-cream/55">{DEMO_COMPANY.activity} · 3 квартал 2026 · только просмотр</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <button onClick={() => open(DEMO_COMPANY.id, "/reports")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">Отчётность</button>
        <button onClick={() => open(DEMO_COMPANY.id, "/esg")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">ESG</button>
      </div>
    </article>
  );
}

function CreateForm({ onDone }: { onDone: (id?: string) => void }) {
  const [name, setName] = useState("");
  const [inn, setInn] = useState("");
  const [activity, setActivity] = useState("");
  const [regime, setRegime] = useState<RegimeKey | "">("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const res = await fetch("/api/companies", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, inn, activity, defaultRegime: regime }),
    });
    const body = await res.json().catch(() => ({}));
    setBusy(false);
    if (!res.ok) { setError(body.error ?? "Не удалось создать компанию"); return; }
    onDone(body.id);
  }

  return (
    <form onSubmit={submit} className={`${card} mb-6 p-5 sm:p-6`}>
      <h2 className="font-display text-lg font-semibold text-fl-cream">Новая компания</h2>
      <div className="mt-4 grid gap-4 sm:grid-cols-2">
        <label className="text-xs text-fl-cream/60 sm:col-span-2">
          Название *
          <input required autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="ОсОО «Ала-Тоо Трейд»" className={field} />
        </label>
        <label className="text-xs text-fl-cream/60">
          ИНН
          <input inputMode="numeric" value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, ""))} placeholder="14 цифр" className={field} />
        </label>
        <label className="text-xs text-fl-cream/60">
          Налоговый режим
          <select value={regime} onChange={(e) => setRegime(e.target.value as RegimeKey)} className={field}>
            <option value="">выбрать позже</option>
            {(Object.keys(REGIMES) as RegimeKey[]).map((k) => <option key={k} value={k}>{REGIME_INFO[k].name}</option>)}
          </select>
        </label>
        <label className="text-xs text-fl-cream/60 sm:col-span-2">
          Вид деятельности
          <input value={activity} onChange={(e) => setActivity(e.target.value)} placeholder="Оптовая торговля стройматериалами, Бишкек" className={field} />
        </label>
      </div>
      {error && <p className="mt-3 text-sm text-fl-red">{error}</p>}
      <div className="mt-5 flex gap-2">
        <button type="submit" disabled={busy} className="rounded-lg bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">
          {busy ? "Создаю…" : "Создать компанию"}
        </button>
        <button type="button" onClick={() => onDone()} className="rounded-lg border border-fl-line px-4 py-2.5 text-sm text-fl-cream/80">Отмена</button>
      </div>
    </form>
  );
}

function CompanyCard({ c, isAdmin, meId, onChanged, toast }: {
  c: Company; isAdmin: boolean; meId?: string; onChanged: () => void; toast: (m: string, k?: "success" | "error" | "info") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const { me } = useMe();
  const canManage = !me?.public && (isAdmin || c.own);
  const regime = c.defaultRegime && c.defaultRegime in REGIME_INFO ? REGIME_INFO[c.defaultRegime as RegimeKey].short : "режим не выбран";

  return (
    <article className={`${card} px-5 py-4`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[15rem] flex-1">
          <p className="font-display text-lg font-semibold text-fl-cream">
            {c.name}
            <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-medium ${c.access === "edit" ? "bg-fl-green/15 text-fl-green" : "bg-fl-info/15 text-fl-info"}`}>
              {me?.public ? "редактирование" : c.own ? "владелец" : c.access === "edit" ? "редактирование" : "просмотр"}
            </span>
          </p>
          <p className="mt-0.5 text-sm text-fl-cream/55">
            {[c.inn && `ИНН ${c.inn}`, regime, `${c.entries} ${c.entries % 10 === 1 && c.entries % 100 !== 11 ? "проводка" : c.entries % 10 >= 2 && c.entries % 10 <= 4 && (c.entries % 100 < 12 || c.entries % 100 > 14) ? "проводки" : "проводок"}`].filter(Boolean).join(" · ")}
          </p>
          {c.activity && <p className="mt-0.5 text-sm text-fl-cream/55">{c.activity}</p>}
          {isAdmin && c.owner && c.owner.email && meId && !c.own && (
            <p className="mt-1 text-xs text-fl-cream/45">Владелец: {c.owner.name ?? ""} {c.owner.email}</p>
          )}
          {isAdmin && !c.owner && <p className="mt-1 text-xs text-fl-amber">Без владельца — назначьте в админ-панели</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open(c.id, "/ledger")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">Журнал</button>
          <button onClick={() => open(c.id, "/reports")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">Отчётность</button>
          {c.access === "edit" && <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Настройки</button>}
          {canManage && <button onClick={() => setSharing((v) => !v)} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Доступ</button>}
        </div>
      </div>
      {editing && <EditForm c={c} onDone={(ok) => { setEditing(false); if (ok) { toast("Сохранено"); onChanged(); } }} />}
      {sharing && <SharePanel companyId={c.id} toast={toast} />}
    </article>
  );
}

function EditForm({ c, onDone }: { c: Company; onDone: (ok: boolean) => void }) {
  const [name, setName] = useState(c.name);
  const [inn, setInn] = useState(c.inn ?? "");
  const [activity, setActivity] = useState(c.activity ?? "");
  const [regime, setRegime] = useState(c.defaultRegime ?? "");
  const [patent, setPatent] = useState(String(c.patentAmount ?? 0));
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setError(null);
    const res = await fetch(`/api/companies/${c.id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, inn, activity, ...(regime ? { defaultRegime: regime } : {}), patentAmount: Number(patent) || 0 }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось сохранить"); return; }
    onDone(true);
  }

  return (
    <div className="mt-4 grid gap-3 border-t border-fl-line pt-4 sm:grid-cols-2">
      <label className="text-xs text-fl-cream/60">Название<input value={name} onChange={(e) => setName(e.target.value)} className={field} /></label>
      <label className="text-xs text-fl-cream/60">ИНН<input value={inn} onChange={(e) => setInn(e.target.value.replace(/\D/g, ""))} className={field} /></label>
      <label className="text-xs text-fl-cream/60">
        Налоговый режим
        <select value={regime} onChange={(e) => setRegime(e.target.value)} className={field}>
          <option value="" disabled>не выбран</option>
          {(Object.keys(REGIMES) as RegimeKey[]).map((k) => <option key={k} value={k}>{REGIME_INFO[k].name}</option>)}
        </select>
      </label>
      <label className="text-xs text-fl-cream/60">Патент, сом в месяц<input inputMode="decimal" value={patent} onChange={(e) => setPatent(e.target.value)} className={field} /></label>
      <label className="text-xs text-fl-cream/60 sm:col-span-2">Вид деятельности<input value={activity} onChange={(e) => setActivity(e.target.value)} className={field} /></label>
      {error && <p className="text-sm text-fl-red sm:col-span-2">{error}</p>}
      <div className="flex gap-2 sm:col-span-2">
        <button onClick={save} className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Сохранить</button>
        <button onClick={() => onDone(false)} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80">Отмена</button>
      </div>
    </div>
  );
}

function SharePanel({ companyId, toast }: { companyId: string; toast: (m: string, k?: "success" | "error" | "info") => void }) {
  const [rows, setRows] = useState<Share[] | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"view" | "edit">("view");

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}/access`);
    setRows(res.ok ? await res.json() : []);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/companies/${companyId}/access`, {
      method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, level }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { toast(body.error ?? "Не удалось открыть доступ", "error"); return; }
    toast(body.note ?? "Доступ открыт");
    setEmail("");
    load();
  }

  async function revoke(userId: string) {
    await fetch(`/api/companies/${companyId}/access?userId=${userId}`, { method: "DELETE" });
    load();
  }

  return (
    <div className="mt-4 border-t border-fl-line pt-4">
      <p className="text-sm font-semibold text-fl-cream">Кому открыт доступ</p>
      {rows === null ? <p className="mt-2 text-sm text-fl-cream/50">Загружаю…</p> : rows.length === 0 ? (
        <p className="mt-2 text-sm text-fl-cream/55">Только вам.</p>
      ) : (
        <ul className="mt-2 divide-y divide-fl-line text-sm">
          {rows.map((r) => (
            <li key={r.user.id} className="flex flex-wrap items-center gap-3 py-2">
              <span className="min-w-0 flex-1 text-fl-cream/85">{r.user.name ?? r.user.email} <span className="text-fl-cream/45">{r.user.email}</span></span>
              <span className="text-xs text-fl-cream/60">{r.level === "edit" ? "редактирование" : "просмотр"}</span>
              <button onClick={() => revoke(r.user.id)} className="text-xs text-fl-red hover:underline">закрыть доступ</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={grant} className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="email зарегистрированного пользователя"
          className="min-w-0 flex-1 rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none" />
        <select value={level} onChange={(e) => setLevel(e.target.value as "view" | "edit")} className="rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream">
          <option value="view">просмотр и анализ</option>
          <option value="edit">редактирование</option>
        </select>
        <button type="submit" className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Открыть доступ</button>
      </form>
    </div>
  );
}
