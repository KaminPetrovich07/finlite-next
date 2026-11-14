"use client";

// Every statement table on the «Отчётность» page. Rows are buttons when there
// is something behind them: clicking opens the entries that produced the
// number. Small «→ Баланс 541» links jump to the statement the row ties to.

import { useState } from "react";
import { useAccountView } from "@/components/AccountView";
import { ifrsName } from "@/lib/ledger/ifrs";
import { Info } from "@/components/Info";
import { accountTerm, balanceTerm } from "@/lib/glossary";
import { BALANCE_ROWS } from "@/lib/balance-sheet";
import { CF_TABLE } from "@/lib/cash-flow";
import { EQUITY_COLUMNS, EQUITY_ROWS, equityKey } from "@/lib/equity";
import type { Check, Statements } from "@/lib/ledger/engine";
import { formatNumber } from "@/lib/format";
import { useAccountName, useT } from "@/components/i18n";

export type TabKey = "tb" | "is" | "bs" | "cf" | "eq" | "tax";

export interface DrillRequest {
  title: string;
  subtitle?: string;
  accounts?: string[];
  entryIds?: string[];
}

interface StatementProps {
  s: Statements;
  onDrill: (r: DrillRequest) => void;
  onGoto: (tab: TabKey) => void;
}

const money = (n: number | undefined) => (n === undefined || Math.abs(n) < 0.005 ? "—" : formatNumber(n, 0));

function Link({ to, label, onGoto }: { to: TabKey; label: string; onGoto: (t: TabKey) => void }) {
  const t = useT();
  return (
    <button
      onClick={(e) => { e.stopPropagation(); onGoto(to); }}
      className="ml-2 rounded border border-fl-gold/25 px-1.5 py-px text-[11px] text-fl-gold/80 hover:border-fl-gold hover:text-fl-gold-bright"
    >
      {t(label)}
    </button>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  const t = useT();
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm text-fl-cream/55">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} className="accent-fl-gold" />
      {t(label)}
    </label>
  );
}

const th = "px-3 py-2 text-left text-xs font-medium text-fl-cream/45";
const thNum = "px-3 py-2 text-right text-xs font-medium text-fl-cream/45";
const td = "px-3 py-2 align-top";
const tdNum = "px-3 py-2 text-right num whitespace-nowrap";

function rowClass(clickable: boolean, kind: "line" | "sub" | "total" | "subtotal" | "section") {
  const base = "border-t border-fl-line";
  const tone =
    kind === "total" ? "bg-fl-gold/10 font-semibold text-fl-gold-bright" :
    kind === "subtotal" ? "font-medium text-fl-cream" :
    kind === "sub" ? "text-fl-cream/50" :
    kind === "section" ? "text-fl-gold/90" :
    "text-fl-cream/85";
  return `${base} ${tone} ${clickable ? "cursor-pointer hover:bg-fl-gold/5 focus-visible:bg-fl-gold/10" : ""}`;
}

function clickProps(enabled: boolean, fn: () => void) {
  if (!enabled) return {};
  return {
    onClick: fn,
    tabIndex: 0,
    role: "button" as const,
    onKeyDown: (e: React.KeyboardEvent) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); fn(); } },
  };
}

function Frame({ children, footer }: { children: React.ReactNode; footer?: React.ReactNode }) {
  const t = useT();
  return (
    <div className="overflow-hidden rounded-xl border border-fl-line bg-fl-charcoal-2">
      <div className="overflow-x-auto">{children}</div>
      {footer && <div className="border-t border-fl-line px-4 py-3 text-xs text-fl-cream/45">{typeof footer === "string" ? t(footer) : footer}</div>}
    </div>
  );
}

// ── ОСВ ────────────────────────────────────────────────────────────────────

export function TrialBalanceTable({ s, onDrill }: StatementProps) {
  const t = useT();
  const { rows, totals } = s.trialBalance;
  const [view] = useAccountView();
  const ifrs = view === "ifrs";
  const acc = useAccountName();
  const nameOf = (r: { account: string; name: string }) => (ifrs ? ifrsName(r.account) : acc(r.account, r.name));
  if (rows.length === 0) return <Empty />;
  return (
    <Frame footer="Нажмите на строку, чтобы увидеть проводки за период.">
      <table className="w-full min-w-[760px] text-sm">
        <thead>
          <tr>
            <th className={th} rowSpan={2}>{ifrs ? t("Статья") : t("Счёт")}</th>
            <th className={`${thNum} border-l border-fl-line`} colSpan={2}>{t("Сальдо на начало")}</th>
            <th className={`${thNum} border-l border-fl-line`} colSpan={2}>{t("Обороты за период")}</th>
            <th className={`${thNum} border-l border-fl-line`} colSpan={2}>{t("Сальдо на конец")}</th>
          </tr>
          <tr>
            {["Дт", "Кт", "Дт", "Кт", "Дт", "Кт"].map((h, i) => (
              <th key={i} className={`${thNum} ${i % 2 === 0 ? "border-l border-fl-line" : ""}`}>{t(h)}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr
              key={r.account}
              className={rowClass(true, "line")}
              {...clickProps(true, () => onDrill({ title: ifrs ? nameOf(r) : `${r.account} ${nameOf(r)}`, subtitle: ifrs ? t("Проводки по статье за период") : t("Проводки по счёту за период"), accounts: [r.account] }))}
            >
              <td className={td}>{!ifrs && <span className="num mr-2 text-fl-cream/50">{r.account}</span>}{nameOf(r)}<Info t={accountTerm(r.account)} label={nameOf(r)} /></td>
              <td className={tdNum}>{money(r.openingDr)}</td>
              <td className={tdNum}>{money(r.openingCr)}</td>
              <td className={tdNum}>{money(r.turnoverDr)}</td>
              <td className={tdNum}>{money(r.turnoverCr)}</td>
              <td className={tdNum}>{money(r.closingDr)}</td>
              <td className={tdNum}>{money(r.closingCr)}</td>
            </tr>
          ))}
          <tr className={rowClass(false, "total")}>
            <td className={td}>{t("Итого")}</td>
            <td className={tdNum}>{money(totals.openingDr)}</td>
            <td className={tdNum}>{money(totals.openingCr)}</td>
            <td className={tdNum}>{money(totals.turnoverDr)}</td>
            <td className={tdNum}>{money(totals.turnoverCr)}</td>
            <td className={tdNum}>{money(totals.closingDr)}</td>
            <td className={tdNum}>{money(totals.closingCr)}</td>
          </tr>
        </tbody>
      </table>
    </Frame>
  );
}

// ── ОПиУ ───────────────────────────────────────────────────────────────────

export function IncomeStatementTable({ s, onDrill, onGoto }: StatementProps) {
  const t = useT();
  const is = s.incomeStatement;
  return (
    <Frame footer={t("Рентабельность по чистой прибыли: {p}%", { p: is.margin.toFixed(1) })}>
      <table className="w-full min-w-[520px] text-sm">
        <thead><tr><th className={th}>{t("Статья")}</th><th className={thNum}>{t("За период, сом")}</th></tr></thead>
        <tbody>
          {is.lines.map((l) => {
            if (l.kind === "sub" && Math.abs(l.amount) < 0.005) return null;
            const clickable = l.accounts.length > 0;
            return (
              <tr
                key={l.key}
                className={rowClass(clickable, l.kind)}
                {...clickProps(clickable, () => onDrill({ title: t(l.label), subtitle: `${t("Счета")}: ${l.accounts.join(", ")}`, accounts: l.accounts }))}
              >
                <td className={`${td} ${l.kind === "sub" ? "pl-8" : ""}`}>
                  {t(l.label)}
                  <Info k={`is:${l.key}`} label={t(l.label)} />
                  {l.key === "net" && (<><Link to="eq" label="→ Капитал, стр. 080" onGoto={onGoto} /><Link to="bs" label="→ Баланс, стр. 530" onGoto={onGoto} /></>)}
                  {l.key === "incomeTax" && <Link to="tax" label="→ Налоги" onGoto={onGoto} />}
                </td>
                <td className={tdNum}>{money(l.amount)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </Frame>
  );
}

// ── Баланс ─────────────────────────────────────────────────────────────────

const BS_LINKS: Record<number, { to: TabKey; label: string }> = {
  110: { to: "cf", label: "→ ОДДС, стр. 710" },
  120: { to: "cf", label: "→ ОДДС, стр. 710" },
  340: { to: "tax", label: "← Налоги" },
  530: { to: "is", label: "← ОПиУ, чистая прибыль" },
  541: { to: "eq", label: "= Капитал, стр. 120" },
};

export function BalanceSheetTable({ s, onDrill, onGoto }: StatementProps) {
  const t = useT();
  const [showEmpty, setShowEmpty] = useState(false);
  const { opening, closing, accountsByRow } = s.balanceSheet;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Toggle on={showEmpty} set={setShowEmpty} label="Показать пустые строки" /></div>
      <Frame footer="Прибыль текущего периода показана в стр. 530 без закрывающих проводок — счета 6000–9900 закрываются на неё виртуально, пока период не закрыт проводкой через 5999.">
        <table className="w-full min-w-[620px] text-sm">
          <thead>
            <tr><th className={th}>{t("Код")}</th><th className={th}>{t("Статья")}</th><th className={thNum}>{t("На начало")}</th><th className={thNum}>{t("На конец")}</th></tr>
          </thead>
          <tbody>
            {BALANCE_ROWS.map((row, i) => {
              if (row.code === null) {
                return (
                  <tr key={`h${i}`} className={rowClass(false, "section")}>
                    <td className={`${td} pt-4`} colSpan={4}><span className="font-display text-sm font-semibold">{t(row.label)}</span></td>
                  </tr>
                );
              }
              const code = row.code;
              const o = opening[code] ?? 0, c = closing[code] ?? 0;
              if (!row.isTotal && !showEmpty && Math.abs(o) < 0.005 && Math.abs(c) < 0.005) return null;
              const accounts = accountsByRow[code] ?? [];
              const clickable = !row.isTotal && accounts.length > 0;
              const link = BS_LINKS[code];
              return (
                <tr
                  key={code}
                  className={rowClass(clickable, row.isTotal ? (code === 299 || code === 599 ? "total" : "subtotal") : row.isSub ? "sub" : "line")}
                  {...clickProps(clickable, () => onDrill({
                    title: `[${code}] ${t(row.label.trim())}`,
                    subtitle: `${t("Счета")}: ${accounts.filter((a) => !a.startsWith("6") && !a.startsWith("7")).join(", ")}${code === 530 ? ` + ${t("прибыль периода")}` : ""}`,
                    accounts,
                  }))}
                >
                  <td className={`${td} num text-fl-cream/45`}>{code}</td>
                  <td className={`${td} ${row.isSub ? "pl-6" : ""}`}>
                    {row.label.match(/^\s*—\s*/) ? "— " : ""}{t(row.label.replace(/^\s*—\s*/, "").trim())}
                    <Info t={balanceTerm(code, row.label)} label={t(row.label.replace(/^\s*—\s*/, "").trim())} />
                    {link && <Link to={link.to} label={link.label} onGoto={onGoto} />}
                  </td>
                  <td className={tdNum}>{money(o)}</td>
                  <td className={tdNum}>{money(c)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Frame>
    </div>
  );
}

// ── ОДДС ───────────────────────────────────────────────────────────────────

export function CashFlowTable({ s, onDrill, onGoto }: StatementProps) {
  const t = useT();
  const [showEmpty, setShowEmpty] = useState(false);
  const { values, entriesByRow } = s.cashFlow;
  return (
    <div className="space-y-3">
      <div className="flex justify-end"><Toggle on={showEmpty} set={setShowEmpty} label="Показать пустые строки" /></div>
      <Frame footer="Прямой метод: каждая денежная проводка разнесена по корреспондирующему счёту. Перемещения между кассой и банком не считаются потоком.">
        <table className="w-full min-w-[560px] text-sm">
          <thead><tr><th className={th}>{t("Код")}</th><th className={th}>{t("Статья")}</th><th className={thNum}>{t("Сумма, сом")}</th></tr></thead>
          <tbody>
            {CF_TABLE.map((row, i) => {
              if (row.code === null) {
                return (
                  <tr key={`h${i}`} className={rowClass(false, "section")}>
                    <td className={`${td} pt-4`} colSpan={3}><span className="font-display text-sm font-semibold">{t(row.label)}</span></td>
                  </tr>
                );
              }
              const code = row.code;
              const v = values[code] ?? 0;
              if (!row.isTotal && !showEmpty && Math.abs(v) < 0.005 && code !== 720) return null;
              const ids = entriesByRow[code] ?? [];
              const clickable = ids.length > 0;
              return (
                <tr
                  key={code}
                  className={rowClass(clickable, code === 700 || code === 710 ? "total" : row.isTotal ? "subtotal" : "line")}
                  {...clickProps(clickable, () => onDrill({ title: `[${String(code).padStart(3, "0")}] ${t(row.label)}`, subtitle: t("Денежные проводки, попавшие в строку"), entryIds: ids }))}
                >
                  <td className={`${td} num text-fl-cream/45`}>{String(code).padStart(3, "0")}</td>
                  <td className={td}>
                    {t(row.label)}
                    <Info k={`cf:${code}`} label={t(row.label)} />
                    {(code === 710 || code === 720) && <Link to="bs" label="= Баланс, стр. 110 + 120" onGoto={onGoto} />}
                  </td>
                  <td className={tdNum}>{money(v)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </Frame>
    </div>
  );
}

// ── Капитал ────────────────────────────────────────────────────────────────

export function EquityTable({ s, onDrill, onGoto }: StatementProps) {
  const t = useT();
  const v = s.equity.values;
  return (
    <Frame footer="Уставный капитал — счета 5100; прочий капитал — 5200 и резервный 5400; нераспределённая прибыль — 5300, 5999 и незакрытая прибыль периода.">
      <table className="w-full min-w-[720px] text-sm">
        <thead>
          <tr>
            <th className={th}>{t("Стр.")}</th>
            <th className={th}>{t("Показатель")}</th>
            {EQUITY_COLUMNS.map((c) => <th key={c} className={thNum}>{c}</th>)}
          </tr>
        </thead>
        <tbody>
          {EQUITY_ROWS.map((row) => {
            const ids = s.equity.entriesByRow[row.code] ?? [];
            const clickable = ids.length > 0;
            return (
              <tr
                key={row.code}
                className={rowClass(clickable, row.code === 120 ? "total" : row.isTotal ? "subtotal" : "line")}
                {...clickProps(clickable, () => onDrill({ title: t(row.label), subtitle: t("Проводки по счетам капитала"), entryIds: ids }))}
              >
                <td className={`${td} num text-fl-cream/45`}>{String(row.code).padStart(3, "0")}</td>
                <td className={td}>
                  {t(row.label)}
                  <Info k={`eq:${row.code}`} label={t(row.label)} />
                  {row.code === 80 && <Link to="is" label="= ОПиУ" onGoto={onGoto} />}
                  {row.code === 120 && <Link to="bs" label="= Баланс, стр. 541" onGoto={onGoto} />}
                </td>
                {EQUITY_COLUMNS.map((_, col) => <td key={col} className={tdNum}>{money(v[equityKey(row.code, col)])}</td>)}
              </tr>
            );
          })}
        </tbody>
      </table>
    </Frame>
  );
}

// ── Налоги ─────────────────────────────────────────────────────────────────

export function TaxPanel({ s, onDrill, onGoto, canPost, posting, onPost }: StatementProps & { canPost: boolean; posting: boolean; onPost: () => void }) {
  const t = useT();
  const tx = s.taxes;
  if (!tx.computed) {
    return <Notice>{t("Выберите налоговый режим компании вверху страницы — от него зависит расчёт.")}</Notice>;
  }
  const c = tx.computed;
  const diff = Math.round((c.total - tx.posted) * 100) / 100;
  return (
    <div className="space-y-4">
      <Frame>
        <table className="w-full min-w-[560px] text-sm">
          <thead>
            <tr><th className={th}>{t("Налог")}</th><th className={thNum}>{t("База")}</th><th className={thNum}>{t("Ставка")}</th><th className={thNum}>{t("Сумма")}</th><th className={th}>{t("Проводка")}</th></tr>
          </thead>
          <tbody>
            {c.lines.map((l, i) => (
              <tr key={i} className={rowClass(false, "line")}>
                <td className={td}>{t(l.label)}<Info k={taxKey(l.label)} label={t(l.label)} /></td>
                <td className={tdNum}>{l.rate === null ? `${l.base} ${t("мес.")}` : money(l.base)}</td>
                <td className={tdNum}>{l.rate === null ? t("фикс.") : `${Number((l.rate * 100).toPrecision(3))}%`}</td>
                <td className={tdNum}>{money(l.amount)}</td>
                <td className={`${td} num text-xs text-fl-cream/55`}>{t("Дт")} {l.debit} {t("Кт")} {l.credit}</td>
              </tr>
            ))}
            <tr className={rowClass(false, "total")}>
              <td className={td} colSpan={3}>{t("Расчёт за период")}</td>
              <td className={tdNum}>{money(c.total)}</td>
              <td />
            </tr>
            <tr
              className={rowClass(tx.postedEntryIds.length > 0, "line")}
              {...clickProps(tx.postedEntryIds.length > 0, () => onDrill({ title: t("Начисления налогов"), entryIds: tx.postedEntryIds }))}
            >
              <td className={td} colSpan={3}>{t("Начислено в журнале")}<Link to="is" label="→ ОПиУ" onGoto={onGoto} /><Link to="bs" label="→ Баланс, стр. 340" onGoto={onGoto} /></td>
              <td className={tdNum}>{money(tx.posted)}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </Frame>

      {s.regime === "general" && (
        <Notice>
          {t("НДС за период: начислено с выручки {a} сом (счёт 3430), к зачёту {b} сом (счёт 1540).", { a: money(tx.vatOutput), b: money(tx.vatInput) })}{" "}
          {t("НДС не входит в начисление выше — он выделяется в момент проведения выручки.")}
        </Notice>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {canPost ? (
          <button
            onClick={onPost}
            disabled={posting}
            className="rounded-md bg-fl-accent px-4 py-2.5 text-sm font-semibold text-fl-on-accent hover:bg-fl-accent-hover disabled:opacity-50"
          >
            {posting ? t("Начисляю…") : tx.postedEntryIds.length ? t("Пересчитать начисление") : t("Начислить налоги за период")}
          </button>
        ) : (
          <span className="text-sm text-fl-cream/50">{t("В демо-компании начисление уже проведено. Создайте свою копию демо в «Журнале», чтобы менять данные.")}</span>
        )}
        {Math.abs(diff) >= 1 && tx.postedEntryIds.length > 0 && (
          <span className="text-sm text-fl-amber">{t("Расхождение с расчётом: {d} сом", { d: money(diff) })}</span>
        )}
      </div>
    </div>
  );
}

/** Glossary key for a line of the tax accrual by its wording. */
function taxKey(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("ндс")) return "tax:vat";
  if (l.includes("с продаж")) return "tax:sales";
  if (l.includes("единый")) return "tax:unified";
  if (l.includes("патент")) return "tax:patent";
  if (l.includes("взнос")) return "tax:social";
  if (l.includes("подоходн")) return "tax:pit";
  return "tax:profit";
}

// ── Сверки ─────────────────────────────────────────────────────────────────

const DOT: Record<Check["status"], string> = { ok: "bg-fl-green", warn: "bg-fl-amber", error: "bg-fl-red" };
const WORD: Record<Check["status"], string> = { ok: "сходится", warn: "внимание", error: "не сходится" };

export function ChecksStrip({ checks, onSelect }: { checks: Check[]; onSelect?: (c: Check) => void }) {
  const t = useT();
  const ok = checks.filter((c) => c.status === "ok").length;
  const bad = checks.filter((c) => c.status === "error").length;
  return (
    <section aria-label={t("Сверки между формами")} className="rounded-xl border border-fl-line bg-fl-charcoal-2">
      <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-fl-line px-4 py-3 sm:px-5">
        <h2 className="font-display text-base font-semibold text-fl-cream">{t("Сверки между формами")}</h2>
        <p className={`text-sm ${bad ? "text-fl-red" : ok === checks.length ? "text-fl-green" : "text-fl-amber"}`}>
          {t("{a} из {b} сходятся", { a: ok, b: checks.length })}
        </p>
      </header>
      <ul className="grid grid-cols-1 divide-y divide-fl-line md:grid-cols-2 md:divide-y-0">
        {checks.map((c) => (
          <li key={c.id} className="md:border-b md:border-fl-line md:odd:border-r">
            <button
              onClick={() => onSelect?.(c)}
              className="flex w-full items-start gap-3 px-4 py-3 text-left hover:bg-fl-gold/5 sm:px-5"
            >
              <span className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${DOT[c.status]}`} aria-hidden />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-baseline justify-between gap-x-2">
                  <span className="text-sm text-fl-cream">{t(c.title)}</span>
                  <span className="sr-only">— {t(WORD[c.status])}</span>
                </span>
                {c.left && c.right ? (
                  <span className="mt-1 flex flex-wrap items-baseline gap-x-2 text-xs text-fl-cream/50">
                    <span>{t(c.left.label)} <span className="num text-fl-cream/80">{formatNumber(c.left.value, 0)}</span></span>
                    <span className={c.status === "ok" ? "text-fl-green" : "text-fl-red"}>{c.status === "ok" ? "=" : "≠"}</span>
                    <span>{t(c.right.label)} <span className="num text-fl-cream/80">{formatNumber(c.right.value, 0)}</span></span>
                  </span>
                ) : null}
                {(c.status !== "ok" || !c.left) && <span className="mt-1 block text-xs text-fl-cream/50">{c.detail}</span>}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function Notice({ children }: { children: React.ReactNode }) {
  return <div className="rounded-lg border border-fl-line bg-fl-gold/5 px-4 py-3 text-sm text-fl-cream/70">{children}</div>;
}

function Empty() {
  const t = useT();
  return <Notice>{t("За этот период проводок нет. Добавьте их в «Журнале» или загрузите банковскую выписку.")}</Notice>;
}

