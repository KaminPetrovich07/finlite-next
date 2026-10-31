"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { PeriodPicker } from "@/components/ledger/PeriodPicker";
import { Info } from "@/components/Info";
import { useToast } from "@/components/Toast";
import { downloadGet } from "@/components/download";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { DEMO_PERIOD } from "@/lib/ledger/demo";
import { monthPeriod } from "@/lib/ledger/period";
import { formatNumber } from "@/lib/format";
import { parseRows, type Cell, type ParseResult } from "@/lib/import1c/parse";
import { accountsOf, buildEntries, postable, type AccountUse } from "@/lib/import1c/map";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-1.5 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const TARGETS = ACCOUNTS.filter((a) => !a.header);
const HOW = { exact: "совпадает", parent: "по родительскому счёту", rf: "план счетов РФ — проверьте", none: "" } as const;
const CHUNK = 500;
const d = (iso: string) => iso.split("-").reverse().join(".");

/** Reads an Excel / CSV file in the browser: big 1С journals never leave the computer until committed. */
async function readSheets(file: File): Promise<Array<{ name: string; rows: Cell[][] }>> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  let wb;
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1251").decode(buf); // 1С часто сохраняет CSV в 1251
    wb = XLSX.read(text, { type: "string", cellDates: true, raw: false });
  } else {
    wb = XLSX.read(buf, { type: "array", cellDates: true });
  }
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }) }));
}

export default function Import1cPage() {
  const { companies, companyId, setCompanyId, company, loaded, readOnly } = useCompanies();
  const [fileName, setFileName] = useState("");
  const [parsed, setParsed] = useState<ParseResult | null>(null);
  const [accounts, setAccounts] = useState<AccountUse[]>([]);
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [saved, setSaved] = useState<Record<string, string>>({});
  const [osvSide, setOsvSide] = useState<"open" | "close">("open");
  const [osvDate, setOsvDate] = useState("");
  const [replaceOpening, setReplaceOpening] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [outcome, setOutcome] = useState<{ created: number; skipped: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [period, setPeriodState] = useState<{ from: string; to: string } | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const { show, ToastContainer } = useToast();

  const setPeriod = useCallback((p: { from: string; to: string }) => {
    setPeriodState((cur) => (cur && cur.from === p.from && cur.to === p.to ? cur : p));
  }, []);
  useEffect(() => {
    if (!loaded || period) return;
    const now = new Date();
    setPeriod(company?.demo ? DEMO_PERIOD : monthPeriod(now.getFullYear(), now.getMonth() + 1));
    setPickerKey((k) => k + 1);
  }, [loaded, company, period, setPeriod]);

  useEffect(() => {
    if (!companyId) return;
    fetch(`/api/import1c/mapping?companyId=${encodeURIComponent(companyId)}`).then((r) => r.json()).then((b) => setSaved(b.mapping ?? {})).catch(() => setSaved({}));
  }, [companyId]);

  async function onFile(f: File | undefined) {
    if (!f) return;
    setError(null); setOutcome(null); setParsed(null); setFileName(f.name);
    if (/\.mxl$/i.test(f.name)) { setError("Формат MXL открывается только в 1С. Откройте отчёт в 1С и сохраните его как «Лист Excel (.xlsx)»."); return; }
    setBusy("parse");
    try {
      const sheets = await readSheets(f);
      const results = sheets.map((s) => parseRows(s.rows));
      const best = results.reduce((a, b) => (b.pairs.length + b.osv.length > a.pairs.length + a.osv.length ? b : a), results[0]);
      if (!best || (!best.pairs.length && !best.osv.length)) { setError(best?.warnings.join(" ") || "В файле не найдено данных."); return; }
      const acc = accountsOf(best);
      setParsed(best);
      setAccounts(acc);
      setMapping(Object.fromEntries(acc.map((a) => [a.code, saved[a.code] && postable(saved[a.code]) ? saved[a.code] : a.suggest.target])));
      setOsvDate("");
    } catch (e: any) {
      setError(`Не удалось прочитать файл: ${e?.message ?? e}`);
    } finally { setBusy(null); }
  }

  const built = useMemo(() => (parsed ? buildEntries(parsed, { mapping, osvSide, osvDate: osvDate || undefined }) : null), [parsed, mapping, osvSide, osvDate]);
  const stats = useMemo(() => {
    if (!built) return null;
    const dates = built.entries.map((e) => e.date).sort();
    const parties = new Set(built.entries.flatMap((e) => e.lines.map((l) => l.party ?? "")).filter(Boolean));
    const total = built.entries.reduce((s, e) => s + e.lines.reduce((x, l) => x + l.debit, 0), 0);
    return { from: dates[0], to: dates[dates.length - 1], parties: parties.size, total };
  }, [built]);
  const osvDefaultDate = parsed?.kind === "osv" ? built?.entries[0]?.date ?? "" : "";

  async function commit() {
    if (!built || !built.entries.length || built.unmapped.length) return;
    setBusy("commit"); setOutcome(null);
    let created = 0, skipped = 0;
    try {
      for (let i = 0; i < built.entries.length; i += CHUNK) {
        setProgress({ done: i, total: built.entries.length });
        const r = await fetch("/api/import1c/commit", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, entries: built.entries.slice(i, i + CHUNK), replaceOpening }) });
        const b = await r.json();
        if (!r.ok) throw new Error(b.error ?? "Не удалось записать");
        created += b.created; skipped += b.skipped;
      }
      setProgress(null);
      setOutcome({ created, skipped });
      fetch("/api/import1c/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, mapping }) }).catch(() => {});
      setSaved((s) => ({ ...s, ...mapping }));
      show(`Записано проводок: ${created}${skipped ? `, пропущено уже загруженных: ${skipped}` : ""}`);
    } catch (e: any) {
      setProgress(null);
      show(`${e.message}${created ? ` (до ошибки записано ${created})` : ""}`, "error");
    } finally { setBusy(null); }
  }

  async function exportXlsx() {
    if (!period) return;
    setBusy("export");
    try { await downloadGet(`/api/import1c/export?companyId=${encodeURIComponent(companyId)}&from=${period.from}&to=${period.to}`, "Журнал для 1С.xlsx"); }
    catch (e: any) { show(e.message, "error"); } finally { setBusy(null); }
  }

  const kindLabel = parsed?.kind === "osv" ? "Оборотно-сальдовая ведомость" : "Журнал проводок / карточка счёта";

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <ToastContainer />
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Обмен с 1С</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Загрузите отчёт из 1С — журнал проводок, карточку счёта или оборотно-сальдовую ведомость, — и операции окажутся в
          журнале FinLite вместе с контрагентами. Дальше отчётность, первичка, акты сверки и анализ строятся без ручного
          переноса. Обратно — журнал за период в раскладке 1С.
        </p>
      </header>

      <div className="mb-5 flex flex-wrap items-end gap-3">
        <label className="block">
          <span className="mb-1 block text-xs text-fl-cream/55">Компания</span>
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} min-w-[240px] py-2`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
      </div>
      {error && <div className="mb-4 rounded-lg border border-fl-red/40 bg-fl-red/10 p-3 text-sm text-fl-red">{error}</div>}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[1fr_330px]">
        <section className={`${card} min-w-0`}>
          <h2 className="mb-1 font-display text-[15px] font-semibold text-fl-cream">Загрузка из 1С</h2>
          <p className="mb-3 text-xs text-fl-cream/55">В 1С откройте отчёт, сформируйте за нужный период и нажмите «Сохранить как» → «Лист Excel (.xlsx)». Файл разбирается прямо в браузере; в базу попадает только то, что вы подтвердите.</p>
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); onFile(e.dataTransfer.files[0]); }}
            onClick={() => fileRef.current?.click()}
            className="cursor-pointer rounded-lg border border-dashed border-fl-line p-5 text-center hover:border-fl-gold"
          >
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv,.txt,.mxl" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
            <p className="text-sm text-fl-cream">{busy === "parse" ? "Читаю файл…" : fileName ? `Файл: ${fileName} — выбрать другой` : "Перетащите файл сюда или нажмите, чтобы выбрать"}</p>
            <p className="mt-1 text-xs text-fl-cream/50">.xlsx, .xls, .csv · журнал проводок, отчёт по проводкам, карточка счёта, ОСВ (в т.ч. по счёту с контрагентами)</p>
          </div>

          {parsed && built && stats && (
            <div className="mt-5">
              <div className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat label="Распознано" v={kindLabel} />
                <Stat label={parsed.kind === "osv" ? "Строк остатков" : "Проводок"} v={parsed.kind === "osv" ? String(built.entries[0]?.lines.length ?? 0) : formatNumber(built.entries.length)} sub={parsed.kind === "osv" ? undefined : `${formatNumber(parsed.pairs.length)} строк 1С`} />
                <Stat label="Сумма" v={formatNumber(stats.total)} sub={stats.from ? `${d(stats.from)}${stats.to !== stats.from ? ` – ${d(stats.to)}` : ""}` : ""} />
                <Stat label="Контрагентов" v={String(stats.parties)} sub={built.closing ? `закрытие месяца: ${built.closing}` : undefined} />
              </div>
              {[...parsed.warnings, ...built.warnings].map((w, i) => <p key={i} className="mb-2 rounded-md border border-fl-amber/40 bg-fl-amber/10 px-3 py-2 text-xs text-fl-cream">{w}</p>)}
              {built.closing > 0 && <p className="mb-2 rounded-md border border-fl-line bg-fl-gold/5 px-3 py-2 text-xs text-fl-cream/80">Проводки закрытия месяца из 1С ({built.closing}) записываются как «закрытие периода» — отчёт о прибылях и убытках не обнулится.</p>}

              {parsed.kind === "osv" && (
                <div className="mb-4 grid grid-cols-1 gap-3 rounded-lg border border-fl-line p-3 sm:grid-cols-3">
                  <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Какие остатки взять</span>
                    <select className={field} value={osvSide} onChange={(e) => { setOsvSide(e.target.value as "open" | "close"); setOsvDate(""); }}>
                      <option value="open">Сальдо на начало периода</option>
                      <option value="close">Сальдо на конец (на следующий день)</option>
                    </select>
                  </label>
                  <label className="block"><span className="mb-1 block text-xs text-fl-cream/60">Дата остатков</span><input type="date" className={field} value={osvDate || osvDefaultDate} onChange={(e) => setOsvDate(e.target.value)} /></label>
                  <label className="flex items-end gap-2 pb-1.5 text-sm text-fl-cream"><input type="checkbox" checked={replaceOpening} onChange={(e) => setReplaceOpening(e.target.checked)} /> Заменить начальные остатки в журнале</label>
                </div>
              )}

              <h3 className="mb-1 font-display text-[14px] font-semibold text-fl-cream">Сопоставление счетов<Info t={{ what: "Счёт из 1С → счёт плана счетов КР (ПП № 231), на который пойдут суммы.", how: "Если код совпадает — подставлен он; субсчёт 1210.01 идёт на 1210; для российского плана счетов 1С предложены соответствия — проверьте их. Выбор запоминается для следующих загрузок." }} /></h3>
              {built.unmapped.length > 0 && <p className="mb-2 text-xs text-fl-red">Укажите счёт для: {built.unmapped.join(", ")}</p>}
              <div className="-mx-1 max-h-[420px] overflow-auto">
                <table className="w-full min-w-[560px] text-sm">
                  <thead className="sticky top-0 bg-fl-charcoal-2"><tr className="border-b border-fl-line text-left text-xs text-fl-cream/55"><th className="px-1 py-1.5 font-medium">Счёт 1С</th><th className="px-1 py-1.5 text-right font-medium">Строк</th><th className="px-1 py-1.5 font-medium">Счёт FinLite</th></tr></thead>
                  <tbody>
                    {accounts.map((a) => {
                      const bad = !mapping[a.code] || !postable(mapping[a.code]);
                      return (
                        <tr key={a.code} className="border-b border-fl-line/50">
                          <td className="px-1 py-1.5"><span className="num font-medium text-fl-cream">{a.code}</span>{a.name && <span className="ml-1.5 text-xs text-fl-cream/50">{a.name}</span>}{a.suggest.how !== "exact" && a.suggest.how !== "none" && mapping[a.code] === a.suggest.target && <span className="ml-1.5 text-[11px] text-fl-amber">{HOW[a.suggest.how]}</span>}</td>
                          <td className="num px-1 py-1.5 text-right text-fl-cream/60">{a.rows}</td>
                          <td className="px-1 py-1.5">
                            <select className={`${field} ${bad ? "border-fl-red/60" : ""}`} value={mapping[a.code] ?? ""} onChange={(e) => setMapping((m) => ({ ...m, [a.code]: e.target.value }))}>
                              <option value="">— выберите счёт —</option>
                              {TARGETS.map((t) => <option key={t.code} value={t.code}>{t.code} {t.name}</option>)}
                            </select>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <h3 className="mb-1 mt-5 font-display text-[14px] font-semibold text-fl-cream">Как запишется в журнал{built.entries.length > 8 ? ` · первые 8 из ${formatNumber(built.entries.length)}` : ""}</h3>
              <ul className="divide-y divide-fl-line/60">
                {built.entries.slice(0, 8).map((e, i) => (
                  <li key={i} className="py-2">
                    <p className="text-sm text-fl-cream/90"><span className="num mr-2 text-fl-cream/50">{d(e.date)}</span>{e.description}{e.source !== "import1c" && <span className="ml-2 rounded bg-fl-gold/15 px-1.5 py-0.5 text-[10px] text-fl-gold">{e.source === "opening" ? "остатки" : "закрытие"}</span>}</p>
                    <table className="mt-1 w-full text-xs text-fl-cream/65"><tbody>
                      {e.lines.slice(0, 12).map((l, j) => (
                        <tr key={j}><td className="w-8 num">{l.debit ? "Дт" : "Кт"}</td><td className="w-14 num">{l.account || "?"}</td><td className="pr-2">{l.party ? <span className="text-fl-gold/80">{l.party}</span> : null}{l.memo ? <span className="text-fl-cream/40"> {l.memo}</span> : null}</td><td className="num text-right">{formatNumber(l.debit || l.credit, 2)}</td></tr>
                      ))}
                      {e.lines.length > 12 && <tr><td colSpan={4} className="text-fl-cream/45">… ещё {e.lines.length - 12} строк</td></tr>}
                    </tbody></table>
                  </li>
                ))}
              </ul>

              <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-fl-line pt-4">
                <button type="button" onClick={commit} disabled={readOnly || busy !== null || !built.entries.length || built.unmapped.length > 0}
                  className="rounded-lg bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-40">
                  {busy === "commit" ? (progress ? `Записываю… ${formatNumber(progress.done)} / ${formatNumber(progress.total)}` : "Записываю…") : `Записать в журнал${parsed.kind === "osv" ? " как начальные остатки" : ""}`}
                </button>
                {readOnly && <span className="text-xs text-fl-cream/55">Демо открыто только для просмотра — выберите свою компанию или копию демо.</span>}
                {outcome && <span className="text-sm text-fl-green">✓ Записано {formatNumber(outcome.created)}{outcome.skipped ? `, уже были в журнале — ${formatNumber(outcome.skipped)}` : ""}. <a href="/ledger" className="text-fl-gold underline">Открыть журнал</a> · <a href="/counterparties" className="text-fl-gold underline">Контрагенты</a></span>}
              </div>
            </div>
          )}
        </section>

        <aside className="flex flex-col gap-4">
          <section className={card}>
            <h2 className="mb-1 font-display text-[15px] font-semibold text-fl-cream">Выгрузка для 1С</h2>
            <p className="mb-3 text-xs text-fl-cream/55">Журнал проводок за период в раскладке 1С: дата, содержание, счета Дт и Кт, контрагенты в колонках субконто, сумма. Второй лист — использованные счета.</p>
            {period && <PeriodPicker key={pickerKey} from={period.from} to={period.to} onChange={setPeriod} />}
            <button type="button" onClick={exportXlsx} disabled={busy !== null || !companyId} className="mt-3 w-full rounded-lg border border-fl-line px-3 py-2 text-sm text-fl-cream hover:border-fl-gold disabled:opacity-40">{busy === "export" ? "Готовлю…" : "Скачать .xlsx"}</button>
            <p className="mt-2 text-[11px] leading-relaxed text-fl-cream/45">В 1С такой файл загружают через «Загрузку данных из табличного документа» в документ «Операция (бухгалтерская)» — колонки подписаны так, как их называет 1С.</p>
          </section>
          <section className={card}>
            <h2 className="mb-2 font-display text-[15px] font-semibold text-fl-cream">Что откуда брать</h2>
            <ul className="flex flex-col gap-2 text-xs leading-relaxed text-fl-cream/70">
              <li><b className="text-fl-cream">Начать учёт в FinLite</b> — ОСВ на дату начала с детализацией расчётных счетов по контрагентам → «сальдо на начало». Потом журнал проводок за период.</li>
              <li><b className="text-fl-cream">Регулярно</b> — журнал проводок за месяц. Повторная загрузка того же периода не задвоит операции.</li>
              <li><b className="text-fl-cream">Один счёт</b> — карточка счёта (например, 1210 для банка). Не смешивайте карточки разных счетов с журналом: операция между ними попадёт в обе.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}

function Stat({ label, v, sub }: { label: string; v: string; sub?: string }) {
  return (
    <div className="rounded-lg border border-fl-line p-2.5">
      <p className="text-[11px] text-fl-cream/55">{label}</p>
      <p className="mt-0.5 text-sm font-semibold text-fl-cream">{v}</p>
      {sub && <p className="text-[11px] text-fl-cream/50">{sub}</p>}
    </div>
  );
}
