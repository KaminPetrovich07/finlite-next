"use client";

// Отчёт предприятия в сборе: заполнить онлайн или загрузить Excel, сдать; ведомство — принять или вернуть.
import { use, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useT } from "@/components/i18n";
import { LINES, SECTIONS, cellNumber, fmtDate, parseSheet, type LineKey, type Msg, type Values } from "@/lib/reported/reported";
import { STATUS_LABEL, STATUS_TONE, blockingIssues, daysLeft, withControls, type RowStatus } from "@/lib/collect/collect";

const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2 py-1.5 text-right text-sm tabular-nums text-fl-cream focus:border-fl-gold focus:outline-none";
const text = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-3 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-lg border border-fl-line px-4 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const primary = "rounded-lg bg-fl-accent px-5 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50";
const money = (n: number | null | undefined) => (n == null ? "" : Math.round(n).toLocaleString("ru-RU"));

interface Report {
  campaign: { id: string; title: string; segment: string; periodEnd: string; deadline: string; note: string | null; closedAt: string | null };
  company: { id: string; name: string; inn: string | null } | null;
  organizer: boolean; status: RowStatus; values: Values; signerName: string; signerTitle: string;
  submittedAt: string | null; returnReason: string | null; previous: { date: string; values: Values } | null;
  canFill: boolean; canReview: boolean;
}

export default function ReportFormPage({ params }: { params: Promise<{ id: string; companyId: string }> }) {
  const { id, companyId } = use(params);
  const t = useT();
  const [r, setR] = useState<Report | null>(null);
  const [inputs, setInputs] = useState<Partial<Record<LineKey, string>>>({});
  const [signer, setSigner] = useState({ name: "", title: "" });
  const [err, setErr] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [serverIssues, setServerIssues] = useState<Msg[]>([]);
  const [reason, setReason] = useState("");

  const load = useCallback(() => {
    fetch(`/api/collect/${id}/${companyId}`).then(async (x) => {
      const b = await x.json(); if (!x.ok) throw new Error(b.error);
      setR(b);
      setInputs(Object.fromEntries(Object.entries(b.values as Values).map(([k, v]) => [k, (v as number).toLocaleString("ru-RU")])));
      setSigner({ name: b.signerName ?? "", title: b.signerTitle ?? "" });
    }).catch((e) => setErr(e.message));
  }, [id, companyId]);
  useEffect(() => { load(); }, [load]);

  const values: Values = useMemo(() => {
    const v: Values = {};
    for (const [k, s] of Object.entries(inputs)) { const n = cellNumber(s); if (n != null) v[k as LineKey] = n; }
    return v;
  }, [inputs]);
  const shown = useMemo(() => withControls(values), [values]);
  const issues = useMemo(() => (r ? blockingIssues(values, r.campaign.periodEnd) : []), [values, r]);

  async function fromExcel(file: File | undefined) {
    if (!file || !r) return;
    setErr(null); setNote(null);
    try {
      const XLSX = await import("xlsx");
      const wb = XLSX.read(await file.arrayBuffer(), { type: "array", cellDates: false });
      // лист этого предприятия: по ИНН, затем по названию, иначе первый
      const sheets = wb.SheetNames.filter((n) => !/как заполнить/i.test(n)).map((n) => parseSheet(XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[n], { header: 1, raw: true, defval: "" }), n));
      const key = (x: string) => x.toLowerCase().replace(/[«»"'\s]/g, "");
      const c = sheets.find((x) => r.company?.inn && x.inn === r.company.inn) ?? sheets.find((x) => r.company && key(x.name) === key(r.company.name)) ?? sheets[0];
      if (!c) throw new Error("В файле нет листа с отчётом");
      const p = c.periods.find((x) => x.date === r.campaign.periodEnd) ?? c.periods[c.periods.length - 1];
      if (!p) throw new Error("В файле не найдено ни одного периода");
      setInputs(Object.fromEntries(LINES.filter((l) => !l.control && p.values[l.key] != null).map((l) => [l.key, (Math.round(p.values[l.key]! * 100) / 100).toLocaleString("ru-RU")])));
      setNote(p.date === r.campaign.periodEnd ? t("Цифры взяты из файла «{file}» на {date}. Проверьте и сдайте.", { file: file.name, date: fmtDate(p.date) }) : t("В файле нет периода на {need} — взяты цифры на {date}. Проверьте даты.", { need: fmtDate(r.campaign.periodEnd), date: fmtDate(p.date) }));
    } catch (e) { setErr(e instanceof Error ? e.message : t("Не удалось прочитать Excel-файл")); }
  }

  async function call(method: "PUT" | "POST" | "PATCH", body: object, ok: string) {
    setBusy(true); setErr(null); setNote(null); setServerIssues([]);
    try {
      const x = await fetch(`/api/collect/${id}/${companyId}`, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const b = await x.json();
      if (!x.ok) { if (b.issues) setServerIssues(b.issues); throw new Error(b.error); }
      setNote(ok); load();
    } catch (e) { setErr(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  }

  if (err && !r) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-fl-red">{t(err)}</main>;
  if (!r) return <main className="mx-auto max-w-5xl px-4 py-10 text-sm text-fl-cream/50">{t("Загружаю…")}</main>;
  const c = r.campaign, left = daysLeft(c.deadline, new Date(Date.now() + 6 * 3600e3).toISOString().slice(0, 10));
  const edit = r.canFill;
  return (
    <main className="mx-auto max-w-5xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <Link href={r.organizer ? `/collect/${id}` : "/collect"} className="text-sm text-fl-cream/55 hover:text-fl-cream">← {r.organizer ? t(c.title) : t("Сбор отчётности")}</Link>
      <header className="mb-4 mt-2">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="font-display text-2xl font-bold text-fl-cream sm:text-3xl">{r.company?.name}</h1>
          <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${STATUS_TONE[r.status]}`}>{t(STATUS_LABEL[r.status])}</span>
        </div>
        <p className="mt-1 text-sm text-fl-cream/60">{t(c.title)} · {t("на {date}", { date: fmtDate(c.periodEnd) })} · {t("срок сдачи {date}", { date: fmtDate(c.deadline) })}{edit ? (left >= 0 ? ` · ${t("осталось {n} дн.", { n: left })}` : ` · ${t("срок прошёл")}`) : ""}</p>
        {c.note && <p className="mt-1 text-sm text-fl-cream/75">{c.note}</p>}
      </header>
      {r.status === "returned" && r.returnReason && <p className="mb-4 rounded-xl border border-fl-amber/60 bg-fl-amber/[0.08] px-4 py-3 text-sm text-fl-cream/90">{t("Ведомство вернуло отчёт на доработку: {text}", { text: r.returnReason })}</p>}
      {(r.status === "submitted" || r.status === "accepted") && <p className="mb-4 rounded-xl border border-fl-green/40 bg-fl-green/[0.06] px-4 py-3 text-sm text-fl-cream/90">{t("Сдан {when}, подписал {who}.", { when: r.submittedAt ? new Date(r.submittedAt).toLocaleString("ru-RU", { timeZone: "Asia/Bishkek" }) : "", who: [r.signerName, r.signerTitle].filter(Boolean).join(", ") })}{r.status === "accepted" ? ` ${t("Ведомство приняло отчёт.")}` : ""}</p>}
      {err && <p className="mb-3 text-sm text-fl-red">{t(err)}</p>}
      {note && <p className="mb-3 text-sm text-fl-green">{note}</p>}

      {edit && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
          <label className={`${btn} cursor-pointer`}>{t("Заполнить из Excel")}<input type="file" accept=".xlsx,.xls" className="hidden" onChange={(e) => { fromExcel(e.target.files?.[0]); e.target.value = ""; }} /></label>
          <a className="text-fl-gold underline" href="/api/reported/template" download>{t("Шаблон Excel")}</a>
          <span className="text-xs text-fl-cream/50">{t("Суммы — в сомах, доходы и расходы — за квартал. Итоговые строки считаются сами.")}</span>
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-fl-line bg-fl-charcoal-2">
        <table className="w-full min-w-[640px] text-sm">
          <thead><tr className="text-left text-xs text-fl-cream/50"><th className="w-12 px-3 py-2 font-normal">{t("Код")}</th><th className="px-3 py-2 font-normal">{t("Показатель")}</th><th className="w-44 px-3 py-2 text-right font-normal">{t("на {date}", { date: fmtDate(c.periodEnd) })}</th>{r.previous && <th className="w-36 px-3 py-2 text-right font-normal">{t("прошлый: {date}", { date: fmtDate(r.previous.date) })}</th>}</tr></thead>
          <tbody>{([1, 2, 3, 4] as const).map((sec) => [
            <tr key={`s${sec}`} className="bg-fl-surface-2/60"><td colSpan={r.previous ? 4 : 3} className="px-3 py-1.5 text-xs font-semibold text-fl-cream/80">{t(SECTIONS[sec])}</td></tr>,
            ...LINES.filter((l) => l.section === sec).map((l) => (
              <tr key={l.key} className="border-t border-fl-line">
                <td className="px-3 py-1 text-xs text-fl-cream/50">{l.code}</td>
                <td className={`px-3 py-1 ${l.indent ? "pl-8 text-fl-cream/75" : "text-fl-cream"} ${l.control ? "font-semibold" : ""}`}>{t(l.label)}</td>
                <td className="px-3 py-1">{l.control || !edit
                  ? <div className={`px-2 py-1.5 text-right tabular-nums ${l.control ? "font-semibold text-fl-cream" : "text-fl-cream/85"}`}>{money(l.control ? shown[l.key] : values[l.key])}</div>
                  : <input className={field} inputMode="decimal" value={inputs[l.key] ?? ""} onChange={(e) => setInputs((x) => ({ ...x, [l.key]: e.target.value }))} aria-label={`${l.code} ${t(l.label)}`} />}</td>
                {r.previous && <td className="px-3 py-1 text-right text-xs tabular-nums text-fl-cream/45">{money(l.control ? withControls(r.previous.values)[l.key] : r.previous.values[l.key])}</td>}
              </tr>
            )),
          ])}</tbody>
        </table>
      </div>

      {edit && (
        <section className="mt-5 space-y-3">
          {(serverIssues.length ? serverIssues : issues).length > 0 && (
            <div className="rounded-xl border border-fl-amber/50 bg-fl-amber/[0.06] px-4 py-3 text-sm">
              <div className="font-semibold text-fl-cream">{t("Перед сдачей исправьте:")}</div>
              <ul className="mt-1 list-disc space-y-0.5 pl-5 text-fl-cream/80">{(serverIssues.length ? serverIssues : issues).map((m, i) => <li key={i}>{t(m.text, m.vars)}</li>)}</ul>
            </div>
          )}
          <div className="grid gap-3 sm:grid-cols-2">
            <label><span className="mb-1 block text-xs text-fl-cream/55">{t("Подписант: ФИО")}</span><input className={text} value={signer.name} onChange={(e) => setSigner({ ...signer, name: e.target.value })} /></label>
            <label><span className="mb-1 block text-xs text-fl-cream/55">{t("Должность")}</span><input className={text} value={signer.title} onChange={(e) => setSigner({ ...signer, title: e.target.value })} placeholder={t("руководитель или главный бухгалтер")} /></label>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={btn} disabled={busy} onClick={() => call("PUT", { values }, t("Черновик сохранён"))}>{t("Сохранить черновик")}</button>
            <button className={primary} disabled={busy || issues.length > 0 || signer.name.trim().length < 3 || signer.title.trim().length < 2} onClick={() => { if (confirm(t("Сдать отчёт? После сдачи изменить его можно будет, только если ведомство вернёт его на доработку."))) call("POST", { values, signerName: signer.name, signerTitle: signer.title }, t("Отчёт сдан")); }}>{t("Сдать отчёт")}</button>
          </div>
        </section>
      )}

      {r.canReview && (
        <section className="mt-6 rounded-2xl border border-fl-line bg-fl-charcoal-2 p-4">
          <h2 className="font-semibold text-fl-cream">{t("Решение ведомства")}</h2>
          <div className="mt-2 flex flex-wrap items-start gap-2">
            {r.status === "submitted" && <button className={primary} disabled={busy} onClick={() => call("PATCH", { action: "accept" }, t("Отчёт принят"))}>{t("Принять")}</button>}
            <Link className={btn} href={`/diagnostics`}>{t("Финансовая диагностика")}</Link>
          </div>
          <label className="mt-3 block"><span className="mb-1 block text-xs text-fl-cream/55">{t("Вернуть на доработку — что исправить")}</span><textarea className={text} rows={2} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <button className={`${btn} mt-2`} disabled={busy || !reason.trim()} onClick={() => call("PATCH", { action: "return", reason }, t("Отчёт возвращён на доработку"))}>{t("Вернуть на доработку")}</button>
        </section>
      )}
    </main>
  );
}
