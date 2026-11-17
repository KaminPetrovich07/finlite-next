"use client";

// Отчётность предприятий: шаблон Excel → загрузка пачкой → портфель и диагностика без ведения проводок.
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { fmtDate, parseSheet, type ReportedCompany } from "@/lib/reported/reported";

const btn = "rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-lg bg-fl-accent px-5 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";

interface Listed { companyId: string; name: string; access: "view" | "edit"; periods: string[]; last: string }
interface Result { name: string; companyId: string | null; created: boolean; periods: number; error?: string }
type Parsed = ReportedCompany & { file: string; key: string; skip: boolean };

/** Все листы файла (кроме инструкции) — как таблицы; разбор в браузере, на сервер уходят только цифры. */
async function readBook(file: File): Promise<Array<{ sheet: string; grid: unknown[][] }>> {
  const XLSX = await import("xlsx");
  const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
  return wb.SheetNames.filter((n) => !/как заполнить/i.test(n)).map((n) => ({ sheet: n, grid: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" }) }));
}

export default function ReportedPage() {
  const t = useT();
  const [list, setList] = useState<Listed[] | null>(null);
  const [parsed, setParsed] = useState<Parsed[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState<Result[] | null>(null);

  const load = useCallback(() => {
    fetch("/api/reported").then(async (r) => { const b = await r.json(); if (!r.ok) throw new Error(b.error); setList(b.companies); }).catch((e) => setErr(e.message));
  }, []);
  useEffect(() => { load(); }, [load]);

  async function pick(files: FileList | null) {
    if (!files?.length) return;
    setErr(null); setDone(null);
    const out: Parsed[] = [];
    for (const f of Array.from(files)) {
      try {
        for (const s of await readBook(f)) {
          const c = parseSheet(s.grid, s.sheet);
          // пустые листы (без названия и периодов) не показываем
          if (!c.name && !c.periods.length) continue;
          out.push({ ...c, file: f.name, key: `${f.name}/${s.sheet}`, skip: c.errors.length > 0 });
        }
      } catch { out.push({ name: f.name, inn: "", segment: "", unit: "сом", mode: "за квартал", periods: [], warnings: [], errors: [{ text: "Не удалось прочитать файл — нужен Excel (.xlsx, .xls)" }], file: f.name, key: f.name, skip: true }); }
    }
    setParsed(out);
  }

  async function upload() {
    const go = parsed.filter((p) => !p.skip && !p.errors.length);
    if (!go.length) return;
    setBusy(true); setErr(null);
    try {
      const r = await fetch("/api/reported", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ file: [...new Set(go.map((p) => p.file))].join(", ").slice(0, 200), companies: go.map((p) => ({ name: p.name, inn: p.inn, segment: p.segment, periods: p.periods })) }),
      });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error);
      setDone(b.results); setParsed([]); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  async function remove(c: Listed) {
    if (!confirm(t("Удалить загруженную отчётность «{name}»? Компания и её журнал останутся.", { name: c.name }))) return;
    const r = await fetch("/api/reported", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId: c.companyId }) });
    if (!r.ok) { const b = await r.json().catch(() => ({})); setErr(b.error ?? t("Не удалось удалить")); return; }
    load();
  }

  const ready = parsed.filter((p) => !p.skip && !p.errors.length);
  return (
    <main className="mx-auto max-w-6xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Отчётность предприятий")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Для ведомства, которому подчинены предприятия: бухгалтерию в программе им вести не нужно. Предприятия присылают баланс, доходы и расходы и просроченную задолженность за квартал по шаблону, вы загружаете файлы — и портфель с баллом риска, финансовая диагностика и заключение готовы по каждому.")}</p>
      </header>

      <ol className="grid gap-3 md:grid-cols-3">
        <li className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <div className="text-xs font-semibold text-fl-gold">{t("Шаг 1")}</div>
          <h2 className="mt-1 font-semibold text-fl-cream">{t("Разошлите шаблон предприятиям")}</h2>
          <p className="mt-1 text-sm text-fl-cream/65">{t("Один лист — одно предприятие. Сом или тыс. сом, за квартал или нарастающим итогом — программа пересчитает. Итоги баланса считаются формулой, ошибку видно сразу.")}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <a className={btn} href="/api/reported/template" download>{t("Пустой шаблон")}</a>
            <a className={btn} href="/api/reported/template?example=1" download>{t("Пример: 4 предприятия (демо)")}</a>
          </div>
        </li>
        <li className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <div className="text-xs font-semibold text-fl-gold">{t("Шаг 2")}</div>
          <h2 className="mt-1 font-semibold text-fl-cream">{t("Загрузите файлы")}</h2>
          <p className="mt-1 text-sm text-fl-cream/65">{t("Можно сразу несколько. Файлы читаются здесь, в браузере; на сервер уходят только цифры. Перед загрузкой видно, что найдено и где не сходится.")}</p>
          <label className={`${primary} mt-3 inline-block cursor-pointer`}>
            {t("Выбрать файлы Excel")}
            <input type="file" multiple accept=".xlsx,.xls" className="hidden" onChange={(e) => { pick(e.target.files); e.target.value = ""; }} />
          </label>
        </li>
        <li className="rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <div className="text-xs font-semibold text-fl-gold">{t("Шаг 3")}</div>
          <h2 className="mt-1 font-semibold text-fl-cream">{t("Смотрите портфель")}</h2>
          <p className="mt-1 text-sm text-fl-cream/65">{t("Предприятие находится по ИНН или названию, новое создаётся само. Повторная загрузка того же квартала заменяет цифры.")}</p>
          <div className="mt-3 flex flex-wrap gap-2"><Link className={btn} href="/portfolio">{t("Портфель компаний")}</Link><Link className={btn} href="/diagnostics">{t("Финансовая диагностика")}</Link></div>
        </li>
      </ol>

      {err && <p className="mt-4 text-sm text-fl-red">{t(err)}</p>}

      {parsed.length > 0 && (
        <section className="mt-6 rounded-2xl border border-fl-gold/40 bg-fl-charcoal-2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h2 className="font-semibold text-fl-cream">{t("Найдено предприятий: {n}", { n: parsed.length })}</h2>
            <div className="flex gap-2">
              <button className={btn} onClick={() => setParsed([])}>{t("Отмена")}</button>
              <button className={primary} disabled={busy || !ready.length} onClick={upload}>{busy ? t("Загружаю…") : t("Загрузить: {n}", { n: ready.length })}</button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[720px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-2 font-normal" /><th className="py-1.5 pr-3 font-normal">{t("Предприятие")}</th><th className="py-1.5 pr-3 font-normal">{t("ИНН")}</th><th className="py-1.5 pr-3 font-normal">{t("Периоды")}</th><th className="py-1.5 pr-3 font-normal">{t("Единица")}</th><th className="py-1.5 font-normal">{t("Проверка")}</th></tr></thead>
              <tbody className="divide-y divide-fl-line">
                {parsed.map((p) => (
                  <tr key={p.key} className="align-top">
                    <td className="py-2 pr-2"><input type="checkbox" checked={!p.skip} disabled={p.errors.length > 0} onChange={() => setParsed((x) => x.map((y) => (y.key === p.key ? { ...y, skip: !y.skip } : y)))} aria-label={t("Загружать")} /></td>
                    <td className="py-2 pr-3"><div className="font-medium text-fl-cream">{p.name || "—"}</div><div className="text-xs text-fl-cream/45">{p.segment ? `${t(p.segment)} · ` : ""}{p.file}{p.sheet ? ` / ${p.sheet}` : ""}</div></td>
                    <td className="py-2 pr-3 tabular-nums text-fl-cream/75">{p.inn || "—"}</td>
                    <td className="py-2 pr-3 text-fl-cream/75">{p.periods.length ? `${fmtDate(p.periods[0].date)} — ${fmtDate(p.periods[p.periods.length - 1].date)} (${p.periods.length})` : "—"}</td>
                    <td className="py-2 pr-3 text-xs text-fl-cream/60">{t(p.unit)}, {t(p.mode)}</td>
                    <td className="py-2">
                      {p.errors.map((e, i) => <div key={i} className="text-fl-red">{t(e.text, e.vars)}</div>)}
                      {!p.errors.length && !p.warnings.length && <span className="text-fl-green">{t("Всё сходится")}</span>}
                      {p.warnings.length > 0 && (
                        <button className="text-left text-fl-amber" onClick={() => setOpen(open === p.key ? null : p.key)}>{t("Расхождений: {n}", { n: p.warnings.length })} {open === p.key ? "▴" : "▾"}</button>
                      )}
                      {open === p.key && <ul className="mt-1 space-y-0.5 text-xs text-fl-cream/70">{p.warnings.map((w, i) => <li key={i}>{t(w.text, w.vars)}</li>)}</ul>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-fl-cream/50">{t("Расхождения не мешают загрузке: это подсказки, что проверить в отчёте предприятия. Листы с ошибками не загружаются.")}</p>
        </section>
      )}

      {done && (
        <section className="mt-6 rounded-2xl border border-fl-green/40 bg-fl-green/[0.05] p-4 text-sm">
          <h2 className="font-semibold text-fl-cream">{t("Загружено: {n} предприятий, {p} периодов", { n: done.filter((d) => !d.error).length, p: done.reduce((s, d) => s + d.periods, 0) })}</h2>
          <ul className="mt-2 space-y-1">{done.map((d, i) => (
            <li key={i} className={d.error ? "text-fl-red" : "text-fl-cream/80"}>{d.name} — {d.error ? t(d.error) : d.created ? t("создано, периодов: {n}", { n: d.periods }) : t("обновлено, периодов: {n}", { n: d.periods })}</li>
          ))}</ul>
          <Link href="/portfolio" className={`${primary} mt-3 inline-block`}>{t("Открыть портфель")}</Link>
        </section>
      )}

      <section className="mt-6 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
        <h2 className="font-semibold text-fl-cream">{t("Загруженная отчётность")}</h2>
        {!list ? <p className="mt-2 text-sm text-fl-cream/50">{t("Загружаю…")}</p> : !list.length ? <p className="mt-2 text-sm text-fl-cream/55">{t("Пока ничего не загружено. Начните с примера: скачайте его и загрузите обратно.")}</p> : (
          <div className="mt-2 overflow-x-auto">
            <table className="w-full min-w-[560px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5 pr-3 font-normal">{t("Предприятие")}</th><th className="py-1.5 pr-3 font-normal">{t("Периоды")}</th><th className="py-1.5 pr-3 font-normal">{t("Последний")}</th><th className="py-1.5 font-normal" /></tr></thead>
              <tbody className="divide-y divide-fl-line">{list.map((c) => (
                <tr key={c.companyId}>
                  <td className="py-1.5 pr-3 text-fl-cream">{c.name}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-fl-cream/70">{c.periods.length}</td>
                  <td className="py-1.5 pr-3 tabular-nums text-fl-cream/70">{fmtDate(c.last)}</td>
                  <td className="py-1.5 text-right">{c.access === "edit" && <button className="text-xs text-fl-cream/50 hover:text-fl-red" onClick={() => remove(c)}>{t("удалить отчётность")}</button>}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        )}
      </section>
    </main>
  );
}
