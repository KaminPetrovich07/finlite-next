"use client";

// Мастер подключения клиента: компания и режим → откуда данные (1С, остатки, с нуля) → банк → готово.
// Сам ничего не дублирует: на каждом шаге — короткая инструкция и кнопка в нужный раздел, а мастер
// показывает, что уже сделано (по данным компании), и ведёт дальше.
import { useCallback, useEffect, useState } from "react";
import { useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { REGIMES } from "@/lib/tax-engine";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-6";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-4 py-2.5 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-md bg-fl-accent px-5 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";

const ACTS: Array<[string, string, string]> = [
  ["trade", "торговля", "Торговля (опт, розница)"],
  ["production", "производство", "Производство"],
  ["build", "строительство", "Строительство, ремонт"],
  ["services", "услуги", "Услуги"],
];
type Source = "1c" | "balances" | "zero";
interface Status { demo: boolean; company?: { name: string; inn: string | null; activity: string | null; defaultRegime: string | null }; opening?: number; import1c?: number; entries?: number; catalog?: number; bank?: number; policy?: boolean; closed?: boolean }
const STEPS = ["Компания", "Откуда данные", "Банк", "Готово"];

export default function StartPage() {
  const { companies, companyId, setCompanyId, company, loaded, reload } = useCompanies();
  const toast = useToast();
  const [step, setStep] = useState(0);
  const [mode, setMode] = useState<"new" | "existing">("new");
  const [form, setForm] = useState({ name: "", inn: "", regime: "", acts: [] as string[] });
  const [source, setSource] = useState<Source>("1c");
  const [st, setSt] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async (id: string) => {
    if (!id) return;
    const r = await fetch(`/api/start?companyId=${id}`);
    setSt(r.ok ? await r.json() : null);
  }, []);
  useEffect(() => { if (loaded && companyId && mode === "existing") load(companyId); }, [loaded, companyId, mode, load]);
  useEffect(() => {
    if (mode !== "existing" || !st?.company) return;
    const act = (st.company.activity ?? "").toLowerCase();
    setForm({ name: st.company.name, inn: st.company.inn ?? "", regime: st.company.defaultRegime ?? "", acts: ACTS.filter(([, word]) => act.includes(word.slice(0, 6))).map(([k]) => k) });
  }, [mode, st?.company]); // eslint-disable-line react-hooks/exhaustive-deps

  const activityText = () => ACTS.filter(([k]) => form.acts.includes(k)).map(([, w]) => w).join(", ");

  async function saveCompany() {
    if (!form.name.trim()) { toast.show("Укажите название компании", "error"); return; }
    if (form.inn && !/^\d{10,14}$/.test(form.inn)) { toast.show("ИНН — 10–14 цифр", "error"); return; }
    setBusy(true);
    const body = { name: form.name.trim(), inn: form.inn, activity: activityText(), ...(form.regime ? { defaultRegime: form.regime } : {}) };
    const r = mode === "existing" && companyId && !company?.demo
      ? await fetch(`/api/companies/${companyId}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
      : await fetch("/api/companies", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(b.error ?? "Компания не сохранена", "error"); return; }
    const id = b.id ?? b.company?.id ?? companyId;
    if (id) { await reload(id); setCompanyId(id); setMode("existing"); await load(id); }
    toast.show(mode === "existing" ? "Данные компании сохранены" : "Компания создана");
    setStep(1);
  }

  const done = {
    company: !!st?.company?.defaultRegime,
    data: (st?.opening ?? 0) + (st?.import1c ?? 0) > 0,
    bank: (st?.bank ?? 0) > 0,
  };
  const has = (k: string) => form.acts.includes(k);

  return (
    <main className="mx-auto max-w-3xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Подключить клиента</h1>
        <p className="mt-1 text-sm text-fl-cream/60">Четыре шага — и компания готова к работе: реквизиты и налоговый режим, перенос данных из 1С или начальные остатки, банк, первые отчёты.</p>
      </header>

      <ol className="mb-5 grid grid-cols-4 gap-2 text-xs">
        {STEPS.map((s, i) => (
          <li key={s}><button onClick={() => (i === 0 || st?.company) && setStep(i)} className={`w-full rounded-lg border px-2 py-2 text-left ${i === step ? "border-fl-gold bg-fl-gold/10 text-fl-cream" : "border-fl-line text-fl-cream/55 hover:text-fl-cream"}`}>
            <span className="block text-[11px] text-fl-cream/45">Шаг {i + 1}</span>{s}
            {[done.company, done.data, done.bank, false][i] && <span className="ml-1 text-fl-green">✓</span>}
          </button></li>
        ))}
      </ol>

      {step === 0 && (
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">Компания и налоговый режим</h2>
          {companies.some((c) => !c.demo) && (
            <div className="mt-3 flex flex-wrap gap-4 text-sm">
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "new"} onChange={() => { setMode("new"); setSt(null); setForm({ name: "", inn: "", regime: "", acts: [] }); }} className="accent-fl-gold" /> новая компания</label>
              <label className="flex items-center gap-2"><input type="radio" checked={mode === "existing"} onChange={() => setMode("existing")} className="accent-fl-gold" /> уже есть в FinLite</label>
              {mode === "existing" && <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} w-auto min-w-[240px]`}>{companies.filter((c) => !c.demo).map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select>}
            </div>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <label className="text-xs text-fl-cream/55 sm:col-span-2">Название<input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ОсОО «…» или ИП …" className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">ИНН<input inputMode="numeric" value={form.inn} onChange={(e) => setForm({ ...form, inn: e.target.value.replace(/\D/g, "").slice(0, 14) })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55 sm:col-span-3">Налоговый режим<select value={form.regime} onChange={(e) => setForm({ ...form, regime: e.target.value })} className={`${field} mt-1`}><option value="">— выберите —</option>{Object.entries(REGIMES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
          </div>
          <p className="mt-4 text-xs text-fl-cream/55">Чем занимается компания — от этого зависят учётная политика, план счетов и нужные разделы</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {ACTS.map(([k, , label]) => (
              <button key={k} onClick={() => setForm({ ...form, acts: has(k) ? form.acts.filter((x) => x !== k) : [...form.acts, k] })} className={`rounded-full border px-3 py-1.5 text-sm ${has(k) ? "border-fl-gold bg-fl-gold/15 text-fl-cream" : "border-fl-line text-fl-cream/65 hover:text-fl-cream"}`}>{has(k) ? "✓ " : ""}{label}</button>
            ))}
          </div>
          <div className="mt-6 flex justify-end"><button onClick={saveCompany} disabled={busy} className={primary}>{busy ? "Сохраняю…" : mode === "existing" ? "Сохранить и дальше →" : "Создать и дальше →"}</button></div>
        </section>
      )}

      {step === 1 && (
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">Откуда берём данные</h2>
          <div className="mt-3 grid gap-2 sm:grid-cols-3">
            {([["1c", "Перехожу с 1С", "остатки, номенклатура и проводки — из отчётов 1С"], ["balances", "Есть остатки", "в Excel, на бумаге, в другой программе"], ["zero", "Начинаю с нуля", "новая компания, остатков нет"]] as Array<[Source, string, string]>).map(([k, t, d]) => (
              <button key={k} onClick={() => setSource(k)} className={`rounded-lg border p-3 text-left ${source === k ? "border-fl-gold bg-fl-gold/10" : "border-fl-line hover:border-fl-gold/40"}`}>
                <span className="block text-sm font-semibold text-fl-cream">{t}</span><span className="text-xs text-fl-cream/55">{d}</span>
              </button>
            ))}
          </div>

          {source === "1c" && (
            <ol className="mt-5 space-y-3 text-sm">
              <Todo n={1} done={(st?.import1c ?? 0) + (st?.opening ?? 0) > 0} title="Остатки — оборотно-сальдовая ведомость" href="/import1c" cta="Загрузить ОСВ">
                В 1С: «Отчёты» → «Оборотно-сальдовая ведомость» на дату начала учёта в FinLite (обычно конец прошлого месяца или года) → «Сохранить как» → «Лист Excel (.xlsx)». В FinLite файл загружается в «Обмене с 1С», счета 1С сопоставляются с планом счетов КР один раз.
              </Todo>
              {(has("trade") || has("production") || has("build")) && (
                <Todo n={2} done={(st?.catalog ?? 0) > 0} title="Номенклатура — товары и материалы" href="/nomenclature" cta="Загрузить номенклатуру">
                  В 1С: «Номенклатура» → «Ещё» → «Вывести список…» → колонки «Наименование», «Артикул», «Единица», «Вид номенклатуры», «Цена» → «Сохранить» → «Лист Excel». {st?.catalog ? `Уже загружено позиций: ${st.catalog}.` : ""}
                </Todo>
              )}
              <Todo n={has("trade") || has("production") || has("build") ? 3 : 2} done={(st?.import1c ?? 0) > 1} title="Проводки текущего периода — если месяц уже начат в 1С" href="/import1c" cta="Загрузить журнал">
                В 1С: «Отчёты» → «Журнал проводок» (или «Карточка счёта») за дни после даты остатков → «Лист Excel». Повторная загрузка того же файла не задваивает проводки.
              </Todo>
              <li className="rounded-lg border border-fl-line bg-fl-charcoal p-3 text-xs text-fl-cream/65">После загрузки сравните итоги: <a href="/reconcile" className="text-fl-gold hover:underline">«Сверка с 1С»</a> покажет расхождения по счетам, контрагентам и товарам, если они есть.</li>
            </ol>
          )}
          {source === "balances" && (
            <ol className="mt-5 space-y-3 text-sm">
              <Todo n={1} done={(st?.opening ?? 0) > 0} title="Начальные остатки" href="/ledger" cta="Ввести остатки">
                В журнале проводок — «Начальные остатки»: деньги в кассе и банке, долги покупателей и поставщикам, запасы, основные средства, капитал на дату начала учёта. Баланс должен сойтись — программа подскажет разницу.
              </Todo>
              {(has("trade") || has("production") || has("build")) && (
                <Todo n={2} done={(st?.catalog ?? 0) > 0} title="Номенклатура" href="/nomenclature" cta="Открыть номенклатуру">
                  Список товаров и материалов из Excel или прайс-листа — кнопкой «Загрузить из 1С / Excel».
                </Todo>
              )}
            </ol>
          )}
          {source === "zero" && <p className="mt-5 rounded-lg border border-fl-line bg-fl-charcoal p-3 text-sm text-fl-cream/75">Остатков нет — переходите к банку. Первые операции вводятся шаблонами в журнале или документами «Продажи и закупки».</p>}
          <div className="mt-6 flex justify-between"><button onClick={() => setStep(0)} className={btn}>← Назад</button><button onClick={() => { if (companyId) load(companyId); setStep(2); }} className={primary}>Дальше →</button></div>
        </section>
      )}

      {step === 2 && (
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">Банк</h2>
          <ol className="mt-4 space-y-3 text-sm">
            <Todo n={1} done={done.bank} title="Банковская выписка" href="/transactions" cta="Загрузить выписку">
              Выгрузите выписку из интернет-банка в Excel или 1С-формате за период после даты остатков. Операции разнесутся по счетам сами — вы проверяете только непонятные. {st?.bank ? `Уже загружено строк: ${st.bank}.` : ""}
            </Todo>
            <Todo n={2} done={false} title="Напоминания о сроках" href="/calendar" cta="Настроить">
              Налоговый календарь по всем компаниям: сроки отчётов и уплаты — в Telegram и на почту.
            </Todo>
          </ol>
          <div className="mt-6 flex justify-between"><button onClick={() => setStep(1)} className={btn}>← Назад</button><button onClick={() => { if (companyId) load(companyId); setStep(3); }} className={primary}>Дальше →</button></div>
        </section>
      )}

      {step === 3 && (
        <section className={card}>
          <h2 className="font-display text-xl font-semibold text-fl-cream">Готово — с чего начать работу</h2>
          <ul className="mt-3 space-y-1 text-sm text-fl-cream/80">
            <li>{done.company ? "✓" : "○"} Компания и налоговый режим{st?.company ? `: ${st.company.name}` : ""}</li>
            <li>{done.data ? "✓" : "○"} Остатки и данные{st?.entries ? ` — проводок в журнале: ${st.entries}` : ""}</li>
            <li>{done.bank ? "✓" : "○"} Банковская выписка</li>
          </ul>
          <div className="mt-5 grid gap-2 sm:grid-cols-2">
            {has("trade") && <Go href="/trade" t="Продажи и закупки" d="накладные, счета, М-4 — проводки и себестоимость сами" />}
            {has("build") && <Go href="/build" t="Стройка" d="объект, смета, списание материалов, КС-2 и КС-3" />}
            {has("production") && <Go href="/costing" t="Калькуляция" d="себестоимость изделий по нормам" />}
            <Go href="/ledger?new=1" t="Первая операция" d="шаблоны: продажа, покупка, оплата, зарплата" />
            <Go href="/reports" t="Отчётность" d="баланс, ОПиУ, ОДДС, налоги" />
            <Go href="/policy" t="Учётная политика" d="приказ и политика по видам деятельности — проверьте и сохраните" />
            <Go href="/mgmt" t="Управленческий учёт" d="прибыль по подразделениям, объектам, направлениям" />
          </div>
          <div className="mt-6 flex justify-between"><button onClick={() => setStep(2)} className={btn}>← Назад</button><a href="/" className={primary}>На рабочий стол</a></div>
        </section>
      )}
      <toast.ToastContainer />
    </main>
  );
}

function Todo({ n, done, title, href, cta, children }: { n: number; done: boolean; title: string; href: string; cta: string; children: React.ReactNode }) {
  return (
    <li className={`flex gap-3 rounded-lg border p-3 ${done ? "border-fl-green/40 bg-fl-green/5" : "border-fl-line"}`}>
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${done ? "bg-fl-green text-white" : "bg-fl-surface-2 text-fl-cream/70"}`}>{done ? "✓" : n}</span>
      <div className="min-w-0 flex-1">
        <p className="font-semibold text-fl-cream">{title}</p>
        <p className="mt-0.5 text-xs leading-relaxed text-fl-cream/65">{children}</p>
      </div>
      <a href={href} target="_blank" rel="noopener" className="h-fit shrink-0 rounded-md border border-fl-gold/40 px-3 py-1.5 text-xs text-fl-gold-bright hover:bg-fl-gold/10">{cta} ↗</a>
    </li>
  );
}
function Go({ href, t, d }: { href: string; t: string; d: string }) {
  return <a href={href} className="rounded-lg border border-fl-line p-3 hover:border-fl-gold/50"><span className="block text-sm font-semibold text-fl-cream">{t} →</span><span className="text-xs text-fl-cream/55">{d}</span></a>;
}
