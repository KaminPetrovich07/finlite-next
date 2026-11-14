"use client";

// Номенклатура: справочник товаров, материалов, продукции и услуг. Загрузка из 1С (Excel) и из журнала.
import { useCallback, useEffect, useMemo, useState } from "react";
import { NEW_COMPANY, useCompanies } from "@/components/ledger/useCompanies";
import { useToast } from "@/components/Toast";
import { OKEI_LIST_ID, OkeiDatalist } from "@/components/okei/UnitInput";
import { formatNumber } from "@/lib/format";
import { KIND_LABEL, newId, parseCatalogSheet, VAT_LABEL, type CatalogItem, type ItemKind, type SheetParse, type VatRate } from "@/lib/trade/catalog";
import { useT } from "@/components/i18n";

const card = "rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5";
const field = "w-full rounded-md border border-fl-line bg-fl-charcoal-2 px-2.5 py-2 text-sm text-fl-cream focus:border-fl-gold focus:outline-none";
const btn = "rounded-md border border-fl-line px-3 py-2 text-sm text-fl-cream/85 hover:border-fl-gold/40 hover:text-fl-cream disabled:opacity-50";
const money = (n: number | null | undefined) => (n == null ? "—" : formatNumber(n, 2));

async function readSheets(file: File): Promise<Array<{ name: string; rows: unknown[][] }>> {
  const XLSX = await import("xlsx");
  const buf = new Uint8Array(await file.arrayBuffer());
  let wb;
  if (/\.(csv|txt)$/i.test(file.name)) {
    let text = new TextDecoder("utf-8").decode(buf);
    if (text.includes("�")) text = new TextDecoder("windows-1251").decode(buf);
    wb = XLSX.read(text, { type: "string", raw: false });
  } else wb = XLSX.read(buf, { type: "array", cellDates: true });
  return wb.SheetNames.map((name) => ({ name, rows: XLSX.utils.sheet_to_json<unknown[]>(wb.Sheets[name], { header: 1, raw: true, defval: "" }) }));
}

const blank = (vat: VatRate): CatalogItem => ({ id: newId(), name: "", unit: "шт", kind: "goods", vat, salePrice: null, purchasePrice: null });

export default function NomenclaturePage() {
  const { companies, companyId, setCompanyId, company, loaded } = useCompanies();
  const toast = useToast();
  const t = useT();
  const [items, setItems] = useState<CatalogItem[] | null>(null);
  const [vatPayer, setVatPayer] = useState(false);
  const [ro, setRo] = useState(true);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<ItemKind | "">("");
  const [edit, setEdit] = useState<CatalogItem | null>(null);
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [preview, setPreview] = useState<(SheetParse & { file: string }) | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) return;
    setItems(null); setPicked(new Set()); setEdit(null); setPreview(null);
    const r = await fetch(`/api/trade/catalog?companyId=${companyId}`);
    const b = await r.json().catch(() => ({}));
    setItems(r.ok ? b.items : []); setVatPayer(!!b.vatPayer); setRo(b.readOnly ?? true);
    if (!r.ok) toast.show(t(b.error ?? "Не удалось загрузить номенклатуру"), "error");
  }, [companyId]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (loaded) load(); }, [loaded, load]);

  const shown = useMemo(() => {
    const t = q.trim().toLowerCase();
    return (items ?? []).filter((x) => (!kind || x.kind === kind) && (!t || `${x.name} ${x.article ?? ""} ${x.group ?? ""}`.toLowerCase().includes(t)));
  }, [items, q, kind]);
  const groups = useMemo(() => [...new Set((items ?? []).map((x) => x.group).filter(Boolean))] as string[], [items]);

  async function post(body: object) {
    setBusy(true);
    const r = await fetch("/api/trade/catalog", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...body }) });
    const b = await r.json().catch(() => ({}));
    setBusy(false);
    if (!r.ok) { toast.show(t(b.error ?? "Не сохранено"), "error"); return null; }
    return b;
  }
  async function saveEdit() {
    if (!edit?.name.trim()) { toast.show(t("Укажите наименование"), "error"); return; }
    if (await post({ item: edit })) { toast.show(t("Сохранено")); setEdit(null); load(); }
  }
  async function fromJournal() {
    const b = await post({ fromJournal: true });
    if (b) { toast.show(b.added ? t("Добавлено из журнала: {n}", { n: b.added }) : t("Новых позиций в журнале нет"), "info"); load(); }
  }
  async function onFile(f: File | undefined) {
    if (!f) return;
    try {
      const sheets = await readSheets(f);
      // лист, где нашлось больше позиций
      let best: SheetParse | null = null;
      for (const sh of sheets) { const p = parseCatalogSheet(sh.rows as never, { vat: vatPayer ? "12" : "none" }); if (!best || p.items.length > best.items.length) best = p; }
      setPreview(best ? { ...best, file: f.name } : null);
    } catch { toast.show(t("Не удалось прочитать файл — сохраните его в 1С как Excel (.xlsx)"), "error"); }
  }
  async function importPreview() {
    if (!preview) return;
    const b = await post({ merge: preview.items });
    if (b) { toast.show(t("Добавлено: {a}, обновлено: {u}", { a: b.added, u: b.updated }) + (b.unchanged ? t(", без изменений: {n}", { n: b.unchanged }) : "")); load(); }
  }
  async function remove(ids: string[]) {
    if (!confirm(t("Удалить из справочника: {n}? Документы и проводки с этими позициями не изменятся.", { n: ids.length }))) return;
    setBusy(true);
    const r = await fetch("/api/trade/catalog", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ids }) });
    setBusy(false);
    if (r.ok) { toast.show(t("Удалено"), "info"); load(); } else toast.show(t("Не удалось удалить"), "error");
  }
  const toggle = (id: string) => setPicked((p) => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n; });

  return (
    <main className="mx-auto max-w-6xl px-4 pb-28 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-5">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">{t("Номенклатура")}</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">{t("Справочник товаров, материалов, продукции и услуг. Из него заполняются документы реализации и поступления: единица, цена и НДС подставляются сами.")}</p>
      </header>
      <OkeiDatalist />
      <section className={`${card} mb-4 flex flex-wrap items-end gap-3`}>
        <label className="text-xs text-fl-cream/50">{t("Компания")}
          <select value={companyId} onChange={(e) => setCompanyId(e.target.value)} className={`${field} mt-1 min-w-[220px]`}>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            <option value={NEW_COMPANY}>+ {t("Добавить компанию…")}</option>
          </select>
        </label>
        <label className="min-w-[220px] flex-1 text-xs text-fl-cream/50">{t("Поиск")}
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t("Наименование, артикул или группа")} className={`${field} mt-1`} />
        </label>
        <label className="text-xs text-fl-cream/50">{t("Вид")}
          <select value={kind} onChange={(e) => setKind(e.target.value as ItemKind | "")} className={`${field} mt-1`}>
            <option value="">{t("Все")}</option>
            {Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}
          </select>
        </label>
      </section>

      {!ro && (
        <div className="mb-4 flex flex-wrap gap-2">
          <button onClick={() => setEdit(blank(vatPayer ? "12" : "none"))} className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover">{t("Добавить позицию")}</button>
          <label className={`${btn} cursor-pointer`}>{t("Загрузить из 1С / Excel")}
            <input type="file" accept=".xlsx,.xls,.csv,.txt" className="hidden" onChange={(e) => { onFile(e.target.files?.[0]); e.target.value = ""; }} />
          </label>
          <button onClick={fromJournal} disabled={busy} className={btn}>{t("Собрать из журнала проводок")}</button>
        </div>
      )}

      {preview && (
        <section className={`${card} mb-4`}>
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="font-display text-lg font-semibold text-fl-cream">{t("Файл «{f}»", { f: preview.file })}</h2>
              <p className="text-sm text-fl-cream/65">{t("Найдено позиций: {n}", { n: preview.items.length })}{preview.groups ? t(", групп: {n}", { n: preview.groups }) : ""}{preview.skipped ? t(", пропущено строк: {n}", { n: preview.skipped }) : ""}.
                {" "}{t("Столбцы")}: {Object.entries(preview.columns).map(([k, v]) => `${t(({ name: "наименование", article: "артикул", code: "код", unit: "единица", sale: "цена продажи", purchase: "цена закупки", kind: "вид", group: "группа", vat: "НДС" } as Record<string, string>)[k])} — «${v}»`).join(", ")}.</p>
              {preview.warnings.map((w) => <p key={w} className="text-sm text-fl-amber">{t(w)}</p>)}
            </div>
            <div className="flex gap-2">
              <button onClick={importPreview} disabled={busy || !preview.items.length} className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{t("Добавить в справочник")}</button>
              <button onClick={() => setPreview(null)} className={btn}>{t("Отмена")}</button>
            </div>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50"><th className="py-1.5">{t("Наименование")}</th><th>{t("Артикул")}</th><th>{t("Группа")}</th><th>{t("Вид")}</th><th>{t("Ед.")}</th><th className="text-right">{t("Закупка")}</th><th className="text-right">{t("Продажа")}</th><th>{t("НДС")}</th></tr></thead>
              <tbody>{preview.items.slice(0, 12).map((x) => (
                <tr key={x.id} className="border-t border-fl-line"><td className="py-1.5 pr-2">{x.name}</td><td className="pr-2 text-fl-cream/60">{x.article ?? ""}</td><td className="pr-2 text-fl-cream/60">{x.group ?? ""}</td><td className="pr-2">{t(KIND_LABEL[x.kind])}</td><td className="pr-2">{x.unit}</td><td className="num pr-2 text-right">{money(x.purchasePrice)}</td><td className="num pr-2 text-right">{money(x.salePrice)}</td><td>{t(VAT_LABEL[x.vat])}</td></tr>
              ))}</tbody>
            </table>
            {preview.items.length > 12 && <p className="mt-1 text-xs text-fl-cream/50">{t("…и ещё {n}", { n: preview.items.length - 12 })}</p>}
          </div>
          <p className="mt-2 text-xs text-fl-cream/50">{t("Совпадающие по артикулу (или, без артикула, по наименованию) позиции обновятся; пустые ячейки файла не стирают то, что уже есть в справочнике.")}</p>
        </section>
      )}

      {edit && (
        <section className={`${card} mb-4`}>
          <h2 className="mb-3 font-display text-lg font-semibold text-fl-cream">{items?.some((x) => x.id === edit.id) ? t("Изменение позиции") : t("Новая позиция")}</h2>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <label className="text-xs text-fl-cream/55 sm:col-span-2">{t("Наименование")}<input autoFocus value={edit.name} onChange={(e) => setEdit({ ...edit, name: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Артикул")}<input value={edit.article ?? ""} onChange={(e) => setEdit({ ...edit, article: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Группа")}<input list="fl-groups" value={edit.group ?? ""} onChange={(e) => setEdit({ ...edit, group: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Вид")}<select value={edit.kind} onChange={(e) => setEdit({ ...edit, kind: e.target.value as ItemKind })} className={`${field} mt-1`}>{Object.entries(KIND_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
            <label className="text-xs text-fl-cream/55">{t("Единица (ОКЕИ)")}<input list={OKEI_LIST_ID} value={edit.unit} onChange={(e) => setEdit({ ...edit, unit: e.target.value })} className={`${field} mt-1`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Цена закупки, без НДС")}<input inputMode="decimal" value={edit.purchasePrice ?? ""} onChange={(e) => setEdit({ ...edit, purchasePrice: e.target.value === "" ? null : Number(e.target.value.replace(/\s/g, "").replace(",", ".")) })} className={`${field} mt-1 text-right`} /></label>
            <label className="text-xs text-fl-cream/55">{t("Цена продажи")}{edit.vat === "12" ? t(", с НДС") : ""}<input inputMode="decimal" value={edit.salePrice ?? ""} onChange={(e) => setEdit({ ...edit, salePrice: e.target.value === "" ? null : Number(e.target.value.replace(/\s/g, "").replace(",", ".")) })} className={`${field} mt-1 text-right`} /></label>
            <label className="text-xs text-fl-cream/55">{t("НДС")}<select value={edit.vat} onChange={(e) => setEdit({ ...edit, vat: e.target.value as VatRate })} className={`${field} mt-1`}>{Object.entries(VAT_LABEL).map(([k, v]) => <option key={k} value={k}>{t(v)}</option>)}</select></label>
          </div>
          <datalist id="fl-groups">{groups.map((g) => <option key={g} value={g} />)}</datalist>
          <div className="mt-3 flex gap-2">
            <button onClick={saveEdit} disabled={busy} className="rounded-md bg-fl-accent px-4 py-2 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50">{t("Сохранить")}</button>
            <button onClick={() => setEdit(null)} className={btn}>{t("Отмена")}</button>
          </div>
        </section>
      )}

      <section className={card}>
        <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-fl-cream/60">{items === null ? t("Загружаю…") : t("Позиций: {n}", { n: shown.length }) + (shown.length !== items.length ? t(" из {n}", { n: items.length }) : "")}{company?.demo ? t(" · у демо-компании справочник собран из журнала, только просмотр") : ""}</p>
          {picked.size > 0 && !ro && (
            <div className="flex items-center gap-3 text-sm">
              <span className="text-fl-cream/70">{t("Отмечено: {n}", { n: picked.size })}</span>
              <button onClick={() => remove([...picked])} className="rounded-md border border-fl-red/50 px-3 py-1 text-xs text-fl-red hover:bg-fl-red/10">{t("Удалить отмеченные")}</button>
              <button onClick={() => setPicked(new Set())} className="text-xs text-fl-cream/60 hover:underline">{t("снять отметки")}</button>
            </div>
          )}
        </div>
        {items && items.length === 0 ? (
          <div className="rounded-lg bg-fl-surface-2 p-4 text-sm text-fl-cream/75">
            <p className="font-semibold text-fl-cream">{t("Справочник пуст. Три способа заполнить:")}</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li><b>{t("Из 1С.")}</b> {t("В 1С откройте «Номенклатура» → «Ещё» → «Вывести список…» → отметьте колонки «Наименование», «Артикул», «Единица», «Вид номенклатуры», «Цена» → «ОК» → «Сохранить» (значок дискеты) → тип «Лист Excel 2007 (.xlsx)». Этот файл загрузите кнопкой «Загрузить из 1С / Excel». Подойдёт и любой прайс-лист в Excel.")}</li>
              <li><b>{t("Из журнала.")}</b> {t("Если остатки уже загружены из 1С (ОСВ по счёту 41 / 1610 с количеством) или проводки содержат номенклатуру — «Собрать из журнала проводок».")}</li>
              <li><b>{t("Вручную")}</b> — {t("«Добавить позицию», или прямо в документе: новые строки попадают в справочник сами.")}</li>
            </ol>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[760px] text-sm">
              <thead><tr className="text-left text-xs text-fl-cream/50">
                <th className="w-7 py-2">{!ro && <input type="checkbox" aria-label={t("Отметить все")} checked={shown.length > 0 && shown.every((x) => picked.has(x.id))} onChange={() => setPicked(shown.every((x) => picked.has(x.id)) ? new Set() : new Set(shown.map((x) => x.id)))} className="accent-fl-gold" />}</th>
                <th className="py-2">{t("Наименование")}</th><th>{t("Вид")}</th><th>{t("Ед.")}</th><th className="text-right">{t("Закупка")}</th><th className="text-right">{t("Продажа")}</th><th>{t("НДС")}</th><th />
              </tr></thead>
              <tbody>{shown.slice(0, 1000).map((x) => (
                <tr key={x.id} className="border-t border-fl-line align-top">
                  <td className="py-2">{!ro && <input type="checkbox" aria-label={`${t("Отметить")} ${x.name}`} checked={picked.has(x.id)} onChange={() => toggle(x.id)} className="accent-fl-gold" />}</td>
                  <td className="py-2 pr-3"><p className="text-fl-cream">{x.name}</p>{(x.article || x.group) && <p className="text-xs text-fl-cream/50">{[x.article && `${t("арт.")} ${x.article}`, x.group].filter(Boolean).join(" · ")}</p>}</td>
                  <td className="pr-3 text-fl-cream/75">{t(KIND_LABEL[x.kind])}</td>
                  <td className="pr-3">{x.unit}</td>
                  <td className="num pr-3 text-right">{money(x.purchasePrice)}</td>
                  <td className="num pr-3 text-right">{money(x.salePrice)}</td>
                  <td className="pr-3 text-xs text-fl-cream/70">{t(VAT_LABEL[x.vat])}</td>
                  <td className="whitespace-nowrap text-right text-xs">{!ro && <>
                    <button onClick={() => setEdit({ ...x })} className="text-fl-cream/55 hover:text-fl-gold hover:underline">{t("Изменить")}</button>
                    <button onClick={() => remove([x.id])} className="ml-2 text-fl-cream/40 hover:text-fl-red hover:underline">{t("Удалить")}</button>
                  </>}</td>
                </tr>
              ))}</tbody>
            </table>
            {shown.length > 1000 && <p className="mt-2 text-xs text-fl-cream/50">{t("Показаны первые 1000 — уточните поиск.")}</p>}
          </div>
        )}
      </section>
      <toast.ToastContainer />
    </main>
  );
}
