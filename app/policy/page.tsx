"use client";

import { useCallback, useEffect, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { Info } from "@/components/Info";
import { useToast } from "@/components/Toast";
import { downloadPost } from "@/components/download";
import {
  ACTIVITY, CASH_COUNT, COST_FORMULA, COSTING_METHOD, DEP_METHOD, FRAMEWORK, hasProduction, ORG_FORM, OVERHEAD_BASE,
  type Activity, type PolicyInput,
} from "@/lib/policy/types";
import type { PolicyCheck } from "@/lib/policy/checks";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";

interface Loaded {
  policy: PolicyInput;
  saved: boolean;
  company: { name: string; regime: string | null; demo: boolean };
  checks: PolicyCheck[];
  chart: Array<{ code: string; name: string; used: boolean }>;
  schedule: string[][];
}

export default function PolicyPage() {
  const { companies, companyId, setCompanyId, loaded } = useCompanies();
  const [data, setData] = useState<Loaded | null>(null);
  const [p, setP] = useState<PolicyInput | null>(null);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { show, ToastContainer } = useToast();

  const load = useCallback(async (id: string) => {
    setError(null);
    try {
      const res = await fetch(`/api/policy?companyId=${encodeURIComponent(id)}`);
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Не удалось загрузить");
      setData(body); setP(body.policy); setDirty(false);
    } catch (e: any) { setError(e.message); setData(null); setP(null); }
  }, []);

  useEffect(() => { if (loaded && companyId) load(companyId); }, [loaded, companyId, load]);

  const set = <K extends keyof PolicyInput>(k: K, v: PolicyInput[K]) => { setP((cur) => (cur ? { ...cur, [k]: v } : cur)); setDirty(true); };
  const readOnly = !!data?.company.demo;

  async function save() {
    if (!p) return;
    setBusy("save");
    try {
      const res = await fetch("/api/policy", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, data: p }) });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Не удалось сохранить");
      setData((d) => (d ? { ...d, saved: true, checks: body.checks, chart: body.chart, schedule: body.schedule } : d));
      setP(body.policy); setDirty(false);
      show("Учётная политика сохранена");
    } catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  async function download(format: "pdf" | "docx") {
    if (!p) return;
    setBusy(format);
    try { await downloadPost(`/api/policy/export?format=${format}`, { companyId, data: p }, `Учётная политика.${format}`); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const toggleActivity = (a: Activity) => {
    if (!p) return;
    const has = p.activities.includes(a);
    const next = has ? p.activities.filter((x) => x !== a) : [...p.activities, a];
    if (next.length) set("activities", next);
  };

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Учётная политика</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Ответьте на вопросы — и получите приказ, учётную политику и четыре приложения: рабочий план счетов, график
          документооборота, перечень форм первичных документов и лиц с правом подписи. Каждый пункт опирается на
          ПП № 231, № 609, № 281 и МСФО для МСП. Справа — проверка политики по вашему журналу проводок.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[260px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        {data && (
          <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${data.saved ? "bg-fl-green/15 text-fl-green" : "bg-fl-amber/15 text-fl-amber"}`}>
            {readOnly ? "Демо: можно настроить и скачать, сохранить нельзя" : data.saved ? (dirty ? "Есть несохранённые изменения" : "Сохранена") : "Предложена по данным компании — проверьте и сохраните"}
          </span>
        )}
      </div>

      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      {p && data && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_340px]">
          <div className="flex flex-col gap-5">
            <Section n={1} title="Реквизиты приказа">
              <Grid>
                <Text label="Организационно-правовая форма" v={p.legalForm} on={(v) => set("legalForm", v)} />
                <Text label="ИНН" v={p.inn} on={(v) => set("inn", v)} />
                <Text label="Руководитель (Ф.И.О.)" v={p.director} on={(v) => set("director", v)} />
                <Text label="Должность руководителя" v={p.directorTitle} on={(v) => set("directorTitle", v)} />
                <Text label="Главный бухгалтер / бухгалтер" v={p.chiefAccountant} on={(v) => set("chiefAccountant", v)} />
                <Text label="Населённый пункт" v={p.city} on={(v) => set("city", v)} />
                <Text label="Номер приказа" v={p.orderNumber} on={(v) => set("orderNumber", v)} />
                <DateField label="Дата приказа" v={p.orderDate} on={(v) => set("orderDate", v)} />
                <DateField label="Политика действует с" v={p.effectiveFrom} on={(v) => set("effectiveFrom", v)} />
              </Grid>
            </Section>

            <Section n={2} title="Основа учёта и организация">
              <p className="mb-2 text-xs text-fl-cream/55">По каким правилам ведётся учёт и составляется отчётность</p>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                {(Object.keys(FRAMEWORK) as Array<keyof typeof FRAMEWORK>).map((k) => (
                  <button key={k} type="button" onClick={() => set("framework", k)}
                    className={`rounded-lg border p-3 text-left text-sm transition-colors ${p.framework === k ? "border-fl-gold bg-fl-gold/10" : "border-fl-line hover:border-fl-gold/50"}`}>
                    <span className="block font-medium text-fl-cream">{FRAMEWORK[k].label}</span>
                    <span className="mt-1 block text-xs text-fl-cream/55">{FRAMEWORK[k].hint}</span>
                  </button>
                ))}
              </div>
              <Grid>
                <Select label="Кто ведёт учёт" v={p.orgForm} opts={ORG_FORM} on={(v) => set("orgForm", v)} info="ПП № 609, п. 4: бухгалтерская служба, штатный бухгалтер, специализированная организация по договору или руководитель лично." />
                <Check label="Компания — плательщик НДС" v={p.vatPayer} on={(v) => set("vatPayer", v)} />
              </Grid>
              <p className="mb-2 mt-4 text-xs text-fl-cream/55">Виды деятельности — от них зависят разделы политики, рабочий план счетов и формы документов</p>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
                  <button key={a} type="button" onClick={() => toggleActivity(a)}
                    className={`rounded-full border px-3 py-1.5 text-sm ${p.activities.includes(a) ? "border-fl-gold bg-fl-gold/15 text-fl-cream" : "border-fl-line text-fl-cream/60 hover:border-fl-gold/50"}`}>
                    {ACTIVITY[a]}
                  </button>
                ))}
              </div>
            </Section>

            <Section n={3} title="Основные средства и нематериальные активы">
              <Grid>
                <Num label="Порог основного средства, сом" v={p.ppeThreshold} on={(v) => set("ppeThreshold", v)} info="Предметы дешевле порога учитываются как МБП (запасы). Закон КР порога не устанавливает — его определяет компания исходя из существенности." />
                <Select label="Метод амортизации" v={p.depMethod} opts={DEP_METHOD} on={(v) => set("depMethod", v)} info="ПП № 609, п. 25: равномерный метод; по выбору — по нормам налогового законодательства, тогда меньше расхождений бухгалтерского и налогового учёта." />
                <Select label="Оценка после признания" v={p.ppeModel} opts={{ cost: "по первоначальной стоимости", revaluation: "модель переоценки (здания)" }} on={(v) => set("ppeModel", v)} />
              </Grid>
              <p className="mb-2 mt-4 text-xs text-fl-cream/55">Сроки полезного использования, лет</p>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Num label="Здания" v={p.lifeBuildings} on={(v) => set("lifeBuildings", v)} />
                <Num label="Оборудование" v={p.lifeEquipment} on={(v) => set("lifeEquipment", v)} />
                <Num label="Компьютеры" v={p.lifeComputers} on={(v) => set("lifeComputers", v)} />
                <Num label="Мебель" v={p.lifeFurniture} on={(v) => set("lifeFurniture", v)} />
                <Num label="Транспорт" v={p.lifeVehicles} on={(v) => set("lifeVehicles", v)} />
                <Num label="НМА" v={p.lifeIntangibles} on={(v) => set("lifeIntangibles", v)} />
              </div>
            </Section>

            <Section n={4} title="Запасы">
              <Grid>
                <Select label="Себестоимость при списании" v={p.costFormula} opts={COST_FORMULA} on={(v) => set("costFormula", v)} info="ПП № 609, п. 22 и раздел 13 МСФО для МСП: ФИФО или средневзвешенная; индивидуальная — для уникальных предметов. ЛИФО запрещён." />
                <Num label="Порог МБП, сом за единицу" v={p.lowValueThreshold} on={(v) => set("lowValueThreshold", v)} info="Предметы дешевле порога списываются на расходы при передаче в эксплуатацию, учёт — в количестве (карточка МБ-2)." />
                <Check label="Доставка включается в себестоимость" v={p.transportInCost} on={(v) => set("transportInCost", v)} />
              </Grid>
            </Section>

            {hasProduction(p) && (
              <Section n={5} title="Производство и калькуляция">
                <Grid>
                  <Select label="Метод калькуляции" v={p.costingMethod} opts={COSTING_METHOD} on={(v) => set("costingMethod", v)} info="Позаказный — мебель и ремонт под заказ; попередельный — непрерывное производство; нормативный — серийный выпуск с нормами расхода." />
                  <Select label="База распределения ОПР" v={p.overheadBase} opts={OVERHEAD_BASE} on={(v) => set("overheadBase", v)} info="Общепроизводственные расходы (аренда цеха, электроэнергия, амортизация) распределяются между изделиями пропорционально выбранной базе." />
                </Grid>
              </Section>
            )}

            <Section n={hasProduction(p) ? 6 : 5} title="Дебиторская задолженность, резервы, существенность">
              <Grid>
                <Select label="Резерв по сомнительным долгам" v={p.allowanceMethod} opts={{ aging: "по срокам просрочки", specific: "по каждому должнику", none: "не создаётся" }} on={(v) => set("allowanceMethod", v)} />
                {p.allowanceMethod === "aging" && (
                  <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                    <Num label="> 90 дней, %" v={p.allowance90} on={(v) => set("allowance90", v)} />
                    <Num label="> 180 дней, %" v={p.allowance180} on={(v) => set("allowance180", v)} />
                    <Num label="> 365 дней, %" v={p.allowance365} on={(v) => set("allowance365", v)} />
                  </div>
                )}
                <Check label="Резерв на оплату отпусков" v={p.vacationProvision} on={(v) => set("vacationProvision", v)} />
                <Num label="Существенность, % валюты баланса" v={p.materialityPct} on={(v) => set("materialityPct", v)} info="Ошибки больше этого порога исправляются ретроспективно (раздел 10 МСФО для МСП), меньше — в текущем периоде." />
              </Grid>
            </Section>

            <Section n={hasProduction(p) ? 7 : 6} title="Касса и инвентаризация">
              <Grid>
                <Check label="Кассовая книга в электронном виде" v={p.cashBookElectronic} on={(v) => set("cashBookElectronic", v)} info="ПП № 281, п. 18: допускается с согласия руководителя и кассира, указывается в договоре о материальной ответственности." />
                <Select label="Отчёт кассира" v={p.cashReport} opts={{ daily: "ежедневно", every3to5: "раз в 3–5 рабочих дней (≤ 20 операций в день)" }} on={(v) => set("cashReport", v)} />
                <Select label="Инвентаризация кассы" v={p.cashCount} opts={CASH_COUNT} on={(v) => set("cashCount", v)} />
                <Text label="Дата годовой инвентаризации (ДД.ММ)" v={p.inventoryDate} on={(v) => set("inventoryDate", v)} info="ПП № 609, п. 27: не реже раза в год, на дату, близкую к отчётной, начиная с 1 октября." />
              </Grid>
            </Section>

            <Section n={hasProduction(p) ? 8 : 7} title="Лица с правом подписи">
              <div className="flex flex-col gap-3">
                {p.signatories.map((s, i) => (
                  <div key={i} className="grid grid-cols-1 gap-2 rounded-lg border border-fl-line p-3 sm:grid-cols-[1fr_1fr_auto]">
                    <input className={field} value={s.role} placeholder="Должность" onChange={(e) => set("signatories", p.signatories.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))} />
                    <input className={field} value={s.name} placeholder="Ф.И.О." onChange={(e) => set("signatories", p.signatories.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} />
                    <button type="button" className="text-xs text-fl-red hover:underline" onClick={() => set("signatories", p.signatories.filter((_, j) => j !== i))}>Убрать</button>
                    <input className={`${field} sm:col-span-3`} value={s.scope} placeholder="Какие документы подписывает" onChange={(e) => set("signatories", p.signatories.map((x, j) => (j === i ? { ...x, scope: e.target.value } : x)))} />
                  </div>
                ))}
                <button type="button" className="self-start text-sm text-fl-gold hover:underline" onClick={() => set("signatories", [...p.signatories, { role: "", name: "", scope: "" }])}>+ Добавить</button>
              </div>
            </Section>

            <details className={card}>
              <summary className="cursor-pointer font-display text-[15px] font-semibold text-fl-cream">Рабочий план счетов — {data.chart.length} счетов</summary>
              <p className="mt-2 text-xs text-fl-cream/55">Счета из журнала проводок и типовые для выбранных видов деятельности. Отмеченные ● уже используются.</p>
              <div className="mt-3 grid grid-cols-1 gap-x-6 gap-y-1 text-sm sm:grid-cols-2">
                {data.chart.map((a) => (
                  <div key={a.code} className="flex gap-2"><span className="num w-12 text-fl-cream/55">{a.code}</span><span className="text-fl-cream/85">{a.name}</span>{a.used && <span className="text-fl-gold" title="есть в журнале">●</span>}</div>
                ))}
              </div>
            </details>

            <details className={card}>
              <summary className="cursor-pointer font-display text-[15px] font-semibold text-fl-cream">График документооборота — {data.schedule.length} документов</summary>
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[640px] text-left text-sm">
                  <thead><tr className="text-xs text-fl-cream/55"><th className="py-1.5 pr-3">Документ</th><th className="pr-3">Форма</th><th className="pr-3">Кто составляет</th><th className="pr-3">Срок в бухгалтерию</th></tr></thead>
                  <tbody>{data.schedule.map((r) => <tr key={r[0]} className="border-t border-fl-line"><td className="py-1.5 pr-3 text-fl-cream/90">{r[0]}</td><td className="pr-3 text-fl-cream/60">{r[1]}</td><td className="pr-3 text-fl-cream/75">{r[2]}</td><td className="pr-3 text-fl-cream/75">{r[3]}</td></tr>)}</tbody>
                </table>
              </div>
              <p className="mt-2 text-xs text-fl-cream/50">Сроки — рекомендуемые; после сохранения график войдёт в приказ как приложение 3 (ПП № 231, п. 8).</p>
            </details>
          </div>

          <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
            <div className={card}>
              <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream">Документ</h2>
              <div className="flex flex-col gap-2">
                <button type="button" onClick={save} disabled={readOnly || busy !== null || (!dirty && data.saved)}
                  className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
                  {busy === "save" ? "Сохраняю…" : data.saved && !dirty ? "Сохранено" : "Сохранить политику"}
                </button>
                <div className="grid grid-cols-2 gap-2">
                  <button type="button" onClick={() => download("pdf")} disabled={busy !== null} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "pdf" ? "…" : "PDF"}</button>
                  <button type="button" onClick={() => download("docx")} disabled={busy !== null} className="rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "docx" ? "…" : "Word"}</button>
                </div>
                <p className="text-xs text-fl-cream/50">Приказ, учётная политика и 4 приложения. Word можно отредактировать перед подписью.</p>
              </div>
            </div>

            <div className={card}>
              <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream">Проверка по журналу{dirty && <span className="ml-2 text-xs font-normal text-fl-cream/45">обновится после сохранения</span>}</h2>
              <ul className="flex flex-col gap-3">
                {data.checks.map((c, i) => (
                  <li key={i} className={`border-l-4 pl-3 ${c.level === "error" ? "border-fl-red" : c.level === "warn" ? "border-fl-amber" : "border-fl-info"}`}>
                    <p className="text-sm font-medium text-fl-cream">
                      <span className="mr-1.5 text-xs uppercase tracking-wide text-fl-cream/50">{c.level === "error" ? "Ошибка" : c.level === "warn" ? "Внимание" : "Совет"}</span>
                      {c.title}
                    </p>
                    <p className="mt-0.5 text-xs leading-relaxed text-fl-cream/65">{c.detail}</p>
                  </li>
                ))}
              </ul>
            </div>
          </aside>
        </div>
      )}
      {!p && !error && <p className="text-sm text-fl-cream/55">Загрузка…</p>}
    </main>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section className={card}>
      <h2 className="mb-3 font-display text-[15px] font-semibold text-fl-cream"><span className="mr-2 text-fl-gold">{n}</span>{title}</h2>
      {children}
    </section>
  );
}

function Grid({ children }: { children: React.ReactNode }) {
  return <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">{children}</div>;
}

function Label({ text, info }: { text: string; info?: string }) {
  return <span className="mb-1 block text-xs text-fl-cream/60">{text}{info && <Info t={{ what: info }} />}</span>;
}

function Text({ label, v, on, info }: { label: string; v: string; on: (v: string) => void; info?: string }) {
  return <label className="block"><Label text={label} info={info} /><input className={field} value={v} onChange={(e) => on(e.target.value)} /></label>;
}

function DateField({ label, v, on }: { label: string; v: string; on: (v: string) => void }) {
  return <label className="block"><Label text={label} /><input type="date" className={field} value={v} onChange={(e) => e.target.value && on(e.target.value)} /></label>;
}

function Num({ label, v, on, info }: { label: string; v: number; on: (v: number) => void; info?: string }) {
  return (
    <label className="block">
      <Label text={label} info={info} />
      <input type="number" min={0} className={`${field} num`} value={Number.isFinite(v) ? v : 0} onChange={(e) => on(Math.max(0, Number(e.target.value) || 0))} />
    </label>
  );
}

function Select<T extends string>({ label, v, opts, on, info }: { label: string; v: T; opts: Record<T, string>; on: (v: T) => void; info?: string }) {
  return (
    <label className="block">
      <Label text={label} info={info} />
      <select className={field} value={v} onChange={(e) => on(e.target.value as T)}>
        {(Object.keys(opts) as T[]).map((k) => <option key={k} value={k}>{opts[k]}</option>)}
      </select>
    </label>
  );
}

function Check({ label, v, on, info }: { label: string; v: boolean; on: (v: boolean) => void; info?: string }) {
  return (
    <label className="flex items-center gap-2 self-end pb-2 text-sm text-fl-cream/85">
      <input type="checkbox" checked={v} onChange={(e) => on(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-accent))]" />
      {label}{info && <Info t={{ what: info }} />}
    </label>
  );
}
