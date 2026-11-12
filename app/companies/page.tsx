"use client";

import { useCallback, useEffect, useState } from "react";
import { AUTH_ON } from "@/lib/auth/mode";
import { useToast } from "@/components/Toast";
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
  entries: number;
  access: "edit" | "view";
  own: boolean;
  manage: boolean;
  adminView?: boolean;
  owner: { email: string; name: string | null } | null;
}

const field = "mt-1 w-full rounded-lg border border-fl-line bg-fl-charcoal px-3 py-2 text-sm text-fl-cream focus:border-fl-info focus:outline-none";
const card = "rounded-2xl border border-fl-line bg-fl-charcoal-2 shadow-card";

function open(id: string, path: string) {
  try { localStorage.setItem("finlite:companyId", id); } catch { /* storage blocked */ }
  window.location.href = path;
}

export default function CompaniesPage() {
  const [list, setList] = useState<Company[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [welcome, setWelcome] = useState(false);
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    const res = await fetch("/api/companies");
    const body = await res.json().catch(() => null);
    if (!res.ok) { setError(body?.error ?? "Не удалось загрузить компании"); setList([]); return; }
    setList(body);
  }, []);

  useEffect(() => {
    fetch("/api/auth/me").then((r) => r.json()).then((b) => setSignedIn(!AUTH_ON || !!b?.user)).catch(() => setSignedIn(!AUTH_ON));
    load();
    const sp = new URLSearchParams(window.location.search);
    if (sp.get("new")) setCreating(true);
    if (sp.get("welcome")) setWelcome(true);
  }, [load]);

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
            Ваши компании и компании, к которым вам открыли доступ. Создайте свою или сделайте копию демо-компании, чтобы менять её данные.
          </p>
        </div>
        {signedIn !== false && <div className="flex flex-wrap gap-2">
            <button onClick={demoCopy} className="rounded-lg border border-fl-line bg-fl-charcoal-2 px-4 py-2.5 text-sm font-medium text-fl-cream shadow-card hover:border-fl-gold/40">
              Копия демо-компании
            </button>
            <button onClick={() => setCreating(true)} className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent shadow-card hover:bg-fl-accent-hover">
              + Новая компания
            </button>
        </div>}
      </header>

      {AUTH_ON && signedIn === false && (
        <div className="mb-5 rounded-xl border-l-4 border-fl-info bg-fl-info/[0.07] px-4 py-3 text-sm text-fl-cream/85">
          <p className="font-semibold">Вы смотрите демо без входа</p>
          <p className="mt-1">Чтобы вести свою компанию, <a href="/register" className="font-semibold text-fl-gold underline">зарегистрируйтесь</a> или <a href="/login" className="font-semibold text-fl-gold underline">войдите</a>. Данные каждой компании видят только её владелец и те, кому он открыл доступ.</p>
        </div>
      )}

      {welcome && (
        <div className="mb-5 rounded-xl border-l-4 border-fl-gold bg-fl-gold/[0.07] px-4 py-3 text-sm text-fl-cream/85">
          <p className="font-semibold text-fl-gold">Добро пожаловать в FinLite!</p>
          <p className="mt-1">
            Создайте свою компанию и начните с начальных остатков в журнале — или откройте демо-компанию «{DEMO_COMPANY.name}»,
            чтобы посмотреть готовую отчётность.
          </p>
        </div>
      )}

      {creating && <CreateForm onDone={(id) => { setCreating(false); if (id) { toast.show("Компания создана"); load(); } }} />}

      {error && <p className="mb-4 rounded-lg bg-fl-red/10 px-4 py-3 text-sm text-fl-red">{error}</p>}

      <div className="space-y-4">
        <DemoCard />
        {list === null && <p className="text-sm text-fl-cream/50">Загружаю…</p>}
        {list?.length === 0 && !error && signedIn && (
          <p className="rounded-xl border border-dashed border-fl-line px-5 py-8 text-center text-sm text-fl-cream/55">
            Своих компаний пока нет — создайте первую.
          </p>
        )}
        {list?.map((c) => <CompanyCard key={c.id} c={c} onChanged={load} toast={toast.show} />)}
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

function CompanyCard({ c, onChanged, toast }: {
  c: Company; onChanged: () => void; toast: (m: string, k?: "success" | "error" | "info") => void;
}) {
  const [editing, setEditing] = useState(false);
  const [sharing, setSharing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const regime = c.defaultRegime && c.defaultRegime in REGIME_INFO ? REGIME_INFO[c.defaultRegime as RegimeKey].short : "режим не выбран";

  return (
    <article className={`${card} px-5 py-4`}>
      <div className="flex flex-wrap items-start gap-4">
        <div className="min-w-[15rem] flex-1">
          <p className="font-display text-lg font-semibold text-fl-cream">
            {c.name}
            <span className={`ml-2 rounded-full px-2 py-0.5 align-middle text-[11px] font-medium ${c.own ? "bg-fl-gold/15 text-fl-gold" : "bg-fl-info/15 text-fl-info"}`}>
              {c.own ? "владелец" : c.adminView ? "администратор" : c.access === "edit" ? "доступ: изменение" : "доступ: просмотр"}
            </span>
          </p>
          {!c.own && <p className="mt-0.5 text-xs text-fl-cream/50">{c.owner ? `Владелец: ${c.owner.name ? `${c.owner.name} · ` : ""}${c.owner.email}` : "Владелец не назначен — назначьте его в разделе «Администрирование»"}</p>}
          <p className="mt-0.5 text-sm text-fl-cream/55">
            {[c.inn && `ИНН ${c.inn}`, regime, `${c.entries} ${c.entries % 10 === 1 && c.entries % 100 !== 11 ? "проводка" : c.entries % 10 >= 2 && c.entries % 10 <= 4 && (c.entries % 100 < 12 || c.entries % 100 > 14) ? "проводки" : "проводок"}`].filter(Boolean).join(" · ")}
          </p>
          {c.activity && <p className="mt-0.5 text-sm text-fl-cream/55">{c.activity}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => open(c.id, "/ledger")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">Журнал</button>
          <button onClick={() => open(c.id, "/reports")} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream hover:border-fl-gold/40">Отчётность</button>
          {c.access === "edit" && <button onClick={() => setEditing((v) => !v)} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Настройки</button>}
          {AUTH_ON && c.manage && <button onClick={() => setSharing((v) => !v)} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-cream/80 hover:text-fl-cream">Доступ</button>}
          {c.manage && <button onClick={() => setDeleting((v) => !v)} className="rounded-lg border border-fl-line px-3.5 py-2 text-sm text-fl-red/80 hover:text-fl-red">Удалить</button>}
        </div>
      </div>
      {editing && <EditForm c={c} onDone={(ok) => { setEditing(false); if (ok) { toast("Сохранено"); onChanged(); } }} />}
      {sharing && <AccessPanel companyId={c.id} toast={toast} />}
      {deleting && <DeletePanel c={c} onDone={(ok) => { setDeleting(false); if (ok) { toast("Компания удалена"); onChanged(); } }} />}
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

interface Grant { userId: string; email: string; name: string | null; level: "view" | "edit"; since: string }

/** Share the company with a registered user — e.g. an outside accountant or the director. */
function AccessPanel({ companyId, toast }: { companyId: string; toast: (m: string, k?: "success" | "error" | "info") => void }) {
  const [rows, setRows] = useState<Grant[] | null>(null);
  const [email, setEmail] = useState("");
  const [level, setLevel] = useState<"view" | "edit">("view");
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/companies/${companyId}/access`);
    setRows(res.ok ? await res.json() : []);
  }, [companyId]);
  useEffect(() => { load(); }, [load]);

  async function grant(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await fetch(`/api/companies/${companyId}/access`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ email, level }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось открыть доступ"); return; }
    setEmail("");
    toast("Доступ открыт");
    load();
  }
  async function revoke(userId: string) {
    await fetch(`/api/companies/${companyId}/access?userId=${encodeURIComponent(userId)}`, { method: "DELETE" });
    toast("Доступ закрыт");
    load();
  }

  return (
    <div className="mt-4 border-t border-fl-line pt-4">
      <p className="text-sm font-semibold text-fl-cream">Кто ещё видит компанию</p>
      <p className="mt-0.5 text-xs text-fl-cream/55">Пользователь должен быть зарегистрирован в FinLite. «Просмотр» — только отчёты и журнал; «изменение» — может вносить проводки и менять настройки, но не удалять компанию и не управлять доступом.</p>
      {rows === null ? <p className="mt-3 text-sm text-fl-cream/50">Загружаю…</p> : rows.length === 0 ? (
        <p className="mt-3 text-sm text-fl-cream/55">Доступ никому не открыт.</p>
      ) : (
        <ul className="mt-3 divide-y divide-fl-line rounded-lg border border-fl-line">
          {rows.map((r) => (
            <li key={r.userId} className="flex flex-wrap items-center gap-3 px-3 py-2 text-sm">
              <span className="min-w-[12rem] flex-1 text-fl-cream">{r.name ? `${r.name} · ` : ""}{r.email}</span>
              <span className="text-fl-cream/60">{r.level === "edit" ? "изменение" : "просмотр"}</span>
              <button onClick={() => revoke(r.userId)} className="text-fl-red/80 hover:text-fl-red">Закрыть доступ</button>
            </li>
          ))}
        </ul>
      )}
      <form onSubmit={grant} className="mt-3 flex flex-wrap items-end gap-2">
        <label className="min-w-[14rem] flex-1 text-xs text-fl-cream/60">E-mail пользователя<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="buh@example.kg" className={field} /></label>
        <label className="text-xs text-fl-cream/60">Уровень
          <select value={level} onChange={(e) => setLevel(e.target.value as "view" | "edit")} className={field}>
            <option value="view">просмотр</option>
            <option value="edit">изменение</option>
          </select>
        </label>
        <button type="submit" className="rounded-lg bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">Открыть доступ</button>
      </form>
      {error && <p className="mt-2 text-sm text-fl-red">{error}</p>}
    </div>
  );
}

function DeletePanel({ c, onDone }: { c: Company; onDone: (ok: boolean) => void }) {
  const [typed, setTyped] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function remove() {
    const res = await fetch(`/api/companies/${c.id}`, { method: "DELETE" });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) { setError(body.error ?? "Не удалось удалить"); return; }
    onDone(true);
  }
  return (
    <div className="mt-4 rounded-lg border border-fl-red/40 bg-fl-red/[0.06] p-4">
      <p className="text-sm font-semibold text-fl-red">Удаление нельзя отменить</p>
      <p className="mt-1 text-sm text-fl-cream/70">Будут удалены журнал проводок ({c.entries}), выписки, документы и настройки компании. Перед удалением можно выгрузить все данные на странице «Мой аккаунт». Для подтверждения введите название компании.</p>
      <input value={typed} onChange={(e) => setTyped(e.target.value)} placeholder={c.name} className={field} />
      {error && <p className="mt-2 text-sm text-fl-red">{error}</p>}
      <div className="mt-3 flex gap-2">
        <button disabled={typed.trim() !== c.name.trim()} onClick={remove} className="rounded-lg bg-fl-red px-4 py-2 text-sm font-semibold text-white disabled:opacity-40">Удалить навсегда</button>
        <button onClick={() => onDone(false)} className="rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/80">Отмена</button>
      </div>
    </div>
  );
}
