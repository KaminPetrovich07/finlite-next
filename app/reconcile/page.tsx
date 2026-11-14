"use client";

// Сверка с 1С: ОСВ из 1С против журнала FinLite за тот же период — по счетам, контрагентам и номенклатуре.
import { useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { formatNumber } from "@/lib/format";
import { ACCOUNTS } from "@/lib/ledger/accounts";
import { parseRows, type Cell, type OsvRow } from "@/lib/import1c/parse";
import { osvRows } from "@/lib/import1c/map";
import type { RecEntry, RecResult, RecRow, RecStatus, Side } from "@/lib/reconcile/osv";

type Result = RecResult & { entries: Record<string, { list: RecEntry[]; total: number }> };

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const m2 = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n, 2));
const dmy = (iso: string) => iso.split("-").reverse().join(".");
/** сальдо: «12 345,00 Д» / «… К» */
const bal = (n: number | null | undefined) => (n == null ? "—" : Math.abs(n) < 0.005 ? "0" : `${formatNumber(Math.abs(n), 2)} ${n > 0 ? "Д" : "К"}`);
const TARGETS = ACCOUNTS.filter((a) => !a.header);

const STATUS: Record<RecStatus, { label: string; cls: string }> = {
  ok: { label: "сходится", cls: "border-fl-green/40 text-fl-green" },
  diff: { label: "расхождение", cls: "border-fl-red/40 text-fl-red" },
  only1c: { label: "только в 1С", cls: "border-fl-amber/50 text-fl-amber" },
  onlyOurs: { label: "только в FinLite", cls: "border-fl-amber/50 text-fl-amber" },
  info: { label: "справочно", cls: "border-fl-info/40 text-fl-info" },
};

async function readSheets(file: File): Promise<Array<{ name: string; rows: Cell[][] }>> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  let wb;
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1251").decode(buf);
    wb = XLSX.read(text, { type: "string", cellDates: true, raw: false });
  } else wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<Cell[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }) }));
}

export default function ReconcilePage() {
  const { companies, companyId, setCompanyId, company } = useCompanies();
  const toast = useToast();
  const [file, setFile] = useState<{ name: string; title: string; rows: OsvRow[] } | null>(null);
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [res, setRes] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [onlyDiff, setOnlyDiff] = useState(true);
  const [open, setOpen] = useState<string | null>(null);

  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const sheets = await readSheets(f);
      const p = sheets.map((s) => parseRows(s.rows)).find((x) => x.kind === "osv" && x.osv.length);
      if (!p) { toast.show("Это не оборотно-сальдовая ведомость. В 1С: «Отчёты» → «Оборотно-сальдовая ведомость» → период → «Сформировать» → «Сохранить» как Excel.", "error"); return; }
      setFile({ name: f.name, title: p.title, rows: osvRows(p.osv) });
      if (p.period) { setFrom(p.period.from); setTo(p.period.to); }
      setRes(null); setMapping({});
    } catch { toast.show("Не удалось прочитать файл — сохраните ведомость в 1С как Excel (.xlsx)", "error"); }
  }

  async function run(extra: Record<string, string> = mapping) {
    if (!file || !companyId) return;
    if (!from || !to) { toast.show("Укажите период ведомости", "error"); return; }
    setBusy(true);
    try {
      const r = await fetch("/api/reconcile", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, from, to, rows: file.rows, mapping: extra }) });
      const b = await r.json();
      if (!r.ok) throw new Error(b.error ?? "Сверка не выполнена");
      setRes(b); setOpen(null);
    } catch (e) { toast.show(e instanceof Error ? e.message : "Сверка не выполнена", "error"); }
    finally { setBusy(false); }
  }
  async function saveMapping() {
    const m = Object.fromEntries(Object.entries(mapping).filter(([, v]) => v));
    if (!Object.keys(m).length) return;
    const r = await fetch("/api/import1c/mapping", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, mapping: m }) });
    if (!r.ok) { toast.show("Сопоставление не сохранено", "error"); return; }
    toast.show("Сопоставление сохранено — пригодится и при загрузке из 1С");
    run(m);
  }
  async function exportXlsx() {
    if (!res) return;
    const XLSX = await import("xlsx");
    const head = ["Счёт", "Наименование", "Счета 1С", "Статус", "Сальдо нач. 1С", "Сальдо нач. FinLite", "Обороты Дт 1С", "Обороты Дт FinLite", "Обороты Кт 1С", "Обороты Кт FinLite", "Сальдо кон. 1С", "Сальдо кон. FinLite", "Где искать"];
    const net = (s: Side | null, k: keyof Side) => (s ? s[k] : "");
    const rows: Array<Array<string | number>> = [[`Сверка с 1С: ${company?.name ?? ""}, ${dmy(res.period.from)} — ${dmy(res.period.to)}`], [], head];
    for (const r of res.rows) {
      rows.push([r.account, r.name, r.from1c.join(", "), STATUS[r.status].label, net(r.one, "open"), net(r.ours, "open"), net(r.one, "turnDr"), net(r.ours, "turnDr"), net(r.one, "turnCr"), net(r.ours, "turnCr"), net(r.one, "close"), net(r.ours, "close"), r.hint]);
      for (const s of r.subs) rows.push(["", `   ${s.name}`, "", r.subsBy === "party" ? "контрагент" : "номенклатура", "", "", "", "", "", "", s.one ?? "", s.ours ?? "", `разница ${s.diff}`]);
    }
    rows.push([], ["Прибыль за период (доходы − расходы)", "", "", "", "", "", "", "", "", "", res.profit.one, res.profit.ours]);
    if (res.unmapped.length) rows.push([], ["Не сопоставлены (не сверялись):", res.unmapped.map((u) => `${u.code} ${u.name}`).join("; ")]);
    const ws = XLSX.utils.aoa_to_sheet(rows);
    ws["!cols"] = [8, 34, 12, 14, ...Array(8).fill(14), 60].map((wch) => ({ wch }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Сверка");
    XLSX.writeFile(wb, `Сверка с 1С — ${company?.name ?? "компания"} — ${res.period.from}…${res.period.to}.xlsx`);
  }

  const shown = useMemo(() => (res?.rows ?? []).filter((r) => !onlyDiff || r.status !== "ok"), [res, onlyDiff]);

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Сверка с 1С</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Загрузите оборотно-сальдовую ведомость из 1С за период — программа сравнит её с журналом FinLite по каждому счёту,
          а если ведомость развёрнута по субконто — по контрагентам и номенклатуре, и подскажет, где искать расхождение.
        </p>
      </header>

      <section className={`${card} mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 lg:items-end`}>
        <label className="text-xs text-fl-cream/50">Компания
          <select value={companyId} onChange={(e) => { setCompanyId(e.target.value); setRes(null); }} className={`${field} mt-1`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ Добавить компанию…</option>
          </select>
        </label>
        <label className={`${btn} cursor-pointer text-center`}>
          {file ? `Файл: ${file.name}` : "Выбрать ОСВ из 1С (Excel)"}
          <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="text-xs text-fl-cream/50">С<input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={`${field} mt-1`} /></label>
          <label className="text-xs text-fl-cream/50">По<input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={`${field} mt-1`} /></label>
        </div>
        <button onClick={() => run()} disabled={!file || busy} className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{busy ? "Сверяю…" : "Сверить"}</button>
        {file && <p className="text-xs text-fl-cream/45 sm:col-span-2 lg:col-span-4">{file.title || "Ведомость"} · строк: {file.rows.length}{!from && " · период в заголовке не найден — укажите его"}</p>}
      </section>

      {!file && (
        <details className={`${card} mb-4 text-sm text-fl-cream/70`} open>
          <summary className="cursor-pointer font-semibold text-fl-cream">Как выгрузить ОСВ из 1С</summary>
          <ol className="mt-2 list-decimal space-y-1 pl-5">
            <li>«Отчёты» → «Оборотно-сальдовая ведомость», период — месяц, который сверяете.</li>
            <li>Чтобы сверить контрагентов и товары: «Показать настройки» → «Развёрнутое сальдо» / «По субконто» — отметьте счета расчётов (1410, 3110 или 62, 60) и запасов (1610 или 41).</li>
            <li>«Сформировать» → «Сохранить» (значок дискеты) → «Лист Excel 2007 (.xlsx)».</li>
            <li>Здесь: выберите компанию, файл, проверьте период и нажмите «Сверить».</li>
          </ol>
          <p className="mt-2 text-xs text-fl-cream/50">Подходит план счетов КР (1610, 1410…) и РФ (41, 62…): счета сопоставляются так же, как на странице «Обмен с 1С», и сопоставление там и здесь общее.</p>
        </details>
      )}

      {res && (
        <>
          <section className={`${card} mb-4`}>
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <span><b className="text-fl-green">{res.summary.ok}</b> сходится</span>
              <span><b className="text-fl-red">{res.summary.diff}</b> расхождений</span>
              <span><b className="text-fl-amber">{res.summary.only1c + res.summary.onlyOurs}</b> только в одной программе</span>
              {res.summary.info > 0 && <span className="text-fl-cream/60">{res.summary.info} справочно</span>}
              <span className="text-fl-cream/70">Прибыль за период: 1С <span className="num text-fl-cream">{m2(res.profit.one)}</span> · FinLite <span className="num text-fl-cream">{m2(res.profit.ours)}</span>
                {Math.abs(res.profit.one - res.profit.ours) >= 0.01 && <span className="ml-1 text-fl-red">(разница {m2(res.profit.ours - res.profit.one)})</span>}</span>
              <span className="ml-auto flex items-center gap-3">
                <label className="flex items-center gap-2 text-fl-cream/75"><input type="checkbox" checked={onlyDiff} onChange={(e) => setOnlyDiff(e.target.checked)} className="accent-fl-gold" /> только расхождения</label>
                <button onClick={exportXlsx} className={btn}>Excel</button>
              </span>
            </div>
          </section>

          {res.unmapped.length > 0 && (
            <section className={`${card} mb-4 border-fl-amber/40`}>
              <h2 className="font-display text-lg font-semibold text-fl-cream">Счета 1С без сопоставления — не сверялись</h2>
              <p className="mt-1 text-sm text-fl-cream/60">Укажите счёт FinLite для каждого. Сопоставление сохранится и пригодится при загрузке из 1С.</p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {res.unmapped.map((u) => (
                  <label key={u.code} className="text-xs text-fl-cream/60">{u.code} {u.name} <span className="num">({m2(u.amount)})</span>
                    <select value={mapping[u.code] ?? ""} onChange={(e) => setMapping({ ...mapping, [u.code]: e.target.value })} className={`${field} mt-1`}>
                      <option value="">— выберите счёт —</option>
                      {TARGETS.map((a) => <option key={a.code} value={a.code}>{a.code} {a.name}</option>)}
                    </select>
                  </label>
                ))}
              </div>
              <button onClick={saveMapping} disabled={!Object.values(mapping).some(Boolean)} className={`${btn} mt-3`}>Сохранить и сверить заново</button>
            </section>
          )}

          <section className={card}>
            {shown.length === 0 ? <p className="text-sm text-fl-green">Все счета сходятся с 1С за {dmy(res.period.from)} — {dmy(res.period.to)}.</p> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-sm">
                  <thead><tr className="text-left text-xs text-fl-cream/50">
                    <th className="py-2">Счёт</th><th>Статус</th>
                    <th className="text-right">Сальдо на начало<br />1С / FinLite</th>
                    <th className="text-right">Обороты Дт<br />1С / FinLite</th>
                    <th className="text-right">Обороты Кт<br />1С / FinLite</th>
                    <th className="text-right">Сальдо на конец<br />1С / FinLite</th>
                  </tr></thead>
                  <tbody>{shown.map((r) => <Row key={r.account} r={r} ops={res.entries?.[r.account]} open={open === r.account} onToggle={() => setOpen(open === r.account ? null : r.account)} />)}</tbody>
                </table>
              </div>
            )}
          </section>
        </>
      )}
      <toast.ToastContainer />
    </main>
  );
}

function Pair({ a, b, d, kind }: { a: number | null; b: number | null; d: number | null; kind: "bal" | "turn" }) {
  const f = kind === "bal" ? bal : m2;
  const bad = d !== null && Math.abs(d) >= 0.01;
  return (
    <td className="num py-2 pl-3 text-right align-top">
      <span className="block text-fl-cream/70">{f(a)}</span>
      <span className={`block ${bad ? "font-semibold text-fl-red" : "text-fl-cream"}`}>{f(b)}</span>
      {bad && <span className="block text-[11px] text-fl-red">Δ {m2(d)}</span>}
    </td>
  );
}

function Row({ r, ops, open, onToggle }: { r: RecRow; ops?: { list: RecEntry[]; total: number }; open: boolean; onToggle: () => void }) {
  const st = STATUS[r.status];
  const skip = (k: "open" | "turnDr" | "turnCr" | "close") => r.pnl && r.diff[k] === null;
  return (
    <>
      <tr className="cursor-pointer border-t border-fl-line align-top hover:bg-fl-surface-2/40" onClick={onToggle}>
        <td className="py-2 pr-3">
          <span className="font-semibold text-fl-cream">{r.account}</span> <span className="text-fl-cream/75">{r.name}</span>
          {r.from1c.length > 0 && r.from1c.join() !== r.account && <span className="block text-[11px] text-fl-cream/45">в 1С: {r.from1c.join(", ")}</span>}
        </td>
        <td className="py-2 pr-3"><span className={`inline-block rounded border px-1.5 py-px text-[11px] ${st.cls}`}>{st.label}</span></td>
        {skip("open") ? <td className="py-2 pl-3 text-right text-[11px] text-fl-cream/40">не сравнивается</td> : <Pair a={r.one?.open ?? null} b={r.ours?.open ?? null} d={r.diff.open} kind="bal" />}
        {skip("turnDr") ? <td className="py-2 pl-3 text-right text-[11px] text-fl-cream/40">—</td> : <Pair a={r.one?.turnDr ?? null} b={r.ours?.turnDr ?? null} d={r.diff.turnDr} kind="turn" />}
        {skip("turnCr") ? <td className="py-2 pl-3 text-right text-[11px] text-fl-cream/40">—</td> : <Pair a={r.one?.turnCr ?? null} b={r.ours?.turnCr ?? null} d={r.diff.turnCr} kind="turn" />}
        {skip("close") ? <td className="py-2 pl-3 text-right text-[11px] text-fl-cream/40">не сравнивается</td> : <Pair a={r.one?.close ?? null} b={r.ours?.close ?? null} d={r.diff.close} kind="bal" />}
      </tr>
      {open && (r.hint || r.subs.length > 0 || !!ops?.list.length) && (
        <tr className="bg-fl-surface-2/30">
          <td colSpan={6} className="px-3 pb-3 pt-1 text-sm">
            {r.hint && <p className="text-fl-cream/80">{r.hint}</p>}
            {r.subs.length > 0 && (
              <table className="mt-2 w-full max-w-2xl text-xs">
                <thead><tr className="text-left text-fl-cream/50"><th className="py-1">{r.subsBy === "party" ? "Контрагент" : "Номенклатура"}</th><th className="text-right">Сальдо 1С</th><th className="text-right">Сальдо FinLite</th><th className="text-right">Разница</th></tr></thead>
                <tbody>{r.subs.map((s) => (
                  <tr key={s.name} className="border-t border-fl-line/60"><td className="py-1 pr-3">{s.name}</td><td className="num text-right">{bal(s.one)}</td><td className="num text-right">{bal(s.ours)}</td><td className="num text-right text-fl-red">{m2(s.diff)}</td></tr>
                ))}</tbody>
              </table>
            )}
            {ops && ops.list.length > 0 && (
              <>
                <p className="mt-3 text-xs text-fl-cream/55">Операции FinLite по счёту {r.account} за период{ops.total > ops.list.length ? ` (крупнейшие ${ops.list.length} из ${ops.total})` : ""} — сравните с карточкой счёта {r.from1c[0] ?? r.account} в 1С:</p>
                <table className="mt-1 w-full text-xs">
                  <thead><tr className="text-left text-fl-cream/50"><th className="py-1">Дата</th><th>Операция</th><th>Контрагент</th><th className="text-right">Дт</th><th className="text-right">Кт</th></tr></thead>
                  <tbody>{ops.list.map((e) => (
                    <tr key={e.id} className="border-t border-fl-line/60">
                      <td className="whitespace-nowrap py-1 pr-2">{dmy(e.date)}</td>
                      <td className="pr-2"><a href={`/ledger?entry=${e.id}&date=${e.date}`} className="text-fl-info hover:underline">{e.description || "проводка"}</a></td>
                      <td className="pr-2 text-fl-cream/65">{e.party}</td>
                      <td className="num text-right">{e.debit ? m2(e.debit) : ""}</td>
                      <td className="num text-right">{e.credit ? m2(e.credit) : ""}</td>
                    </tr>
                  ))}</tbody>
                </table>
              </>
            )}
          </td>
        </tr>
      )}
    </>
  );
}
