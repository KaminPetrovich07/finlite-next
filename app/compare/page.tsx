"use client";

import { useCallback, useState } from "react";
import { MoneyInput } from "@/components/MoneyInput";
import { Info } from "@/components/Info";
import { LedgerSource, type LedgerLoad } from "@/components/ledger/LedgerSource";
import { comparableRegimes, compareRegimes, REGIME_INFO, type RegimeKey } from "@/lib/tax-engine";
import { formatNumber, formatPercent } from "@/lib/format";

const empty = { revenue: 0, otherIncome: 0, cogs: 0, salaries: 0, rent: 0, sellingExp: 0, adminExp: 0 };
type Inputs = typeof empty;

const FIELDS: Array<[keyof Inputs, string, string, boolean?]> = [
  ["revenue", "Выручка", "calc:revenue", true],
  ["otherIncome", "Прочие доходы", "calc:otherIncome"],
  ["cogs", "Себестоимость", "calc:cogs", true],
  ["salaries", "Зарплата (до удержаний)", "calc:salaries"],
  ["rent", "Аренда", "calc:rent"],
  ["sellingExp", "Коммерческие расходы", "calc:sellingExp"],
  ["adminExp", "Административные расходы", "calc:adminExp"],
];

export default function ComparePage() {
  const [inputs, setInputs] = useState<Inputs>(empty);
  const [current, setCurrent] = useState<RegimeKey | null>(null);
  const [source, setSource] = useState<string | null>(null);
  const [onlyApplicable, setOnlyApplicable] = useState(true);
  const [cashPct, setCashPct] = useState(70);
  const [extra, setExtra] = useState({ otherOpExp: 0, interestExp: 0, otherNonOp: 0, investInc: 0 });

  const onLoad = useCallback((d: LedgerLoad) => {
    const i = d.bridge.input;
    setInputs({
      revenue: i.revenue, otherIncome: i.otherIncome, cogs: i.cogs, salaries: i.salaries, rent: i.rent,
      sellingExp: i.sellingExp, adminExp: i.adminExp,
    });
    setExtra({ otherOpExp: i.otherOpExp, interestExp: i.interestExp, otherNonOp: i.otherNonOp, investInc: i.investInc });
    setCurrent(d.regimeMissing ? null : d.regime);
    setCashPct(Math.round(i.cashPct));
    setSource(`${d.companyName}, ${d.periodLabel.toLowerCase()}`);
  }, []);

  const allowed = new Set(comparableRegimes(current));
  const all = compareRegimes({ ...inputs, ...extra, cashPct });
  const results = onlyApplicable && current ? all.filter((r) => allowed.has(r.key as RegimeKey)) : all;
  const best = results[0];
  const cur = current ? all.find((r) => r.key === current) : null;

  return (
    <main className="mx-auto max-w-4xl px-4 pb-24 pt-6 sm:px-6 sm:pt-8">
      <header className="mb-6">
        <h1 className="font-display text-3xl font-bold text-fl-cream sm:text-4xl">Выбор налогового режима</h1>
        <p className="mt-1 max-w-3xl text-sm text-fl-cream/60">
          Сравнение режимов Налогового кодекса КР на одних и тех же доходах и расходах: сколько налогов заплатит компания и
          сколько прибыли останется. Заполните цифры вручную или возьмите их из журнала проводок.
        </p>
      </header>

      <div className="mb-5">
        <LedgerSource onLoad={onLoad} note="Поля ниже заполнятся суммами из проводок за период. Их можно поправить, чтобы проверить сценарий «что если»." />
      </div>

      <section className="mb-6 grid grid-cols-1 gap-4 rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:grid-cols-2 sm:p-5">
        {source && (
          <p className="text-xs text-fl-cream/55 sm:col-span-2">
            Данные: {source}. Суммы можно изменить.
            {(extra.interestExp || extra.otherOpExp || extra.otherNonOp || extra.investInc) ? <> Также учтены из журнала: прочие операционные расходы {formatNumber(extra.otherOpExp)}, проценты {formatNumber(extra.interestExp)}, внереализационные статьи {formatNumber(extra.investInc + extra.otherNonOp)} сом.</> : null}
          </p>
        )}
        {FIELDS.map(([k, label, info, req]) => (
          <MoneyInput key={k} label={label} info={info} required={req} value={inputs[k]} onChange={(v) => setInputs((s) => ({ ...s, [k]: v }))} />
        ))}
        <label className="block">
          <span className="text-sm font-medium text-fl-cream/80">Доля выручки наличными, %<Info k="calc:cashPct" /></span>
          <input type="range" min={0} max={100} value={cashPct} onChange={(e) => setCashPct(Number(e.target.value))} className="mt-3 w-full accent-[rgb(var(--c-accent))]" />
          <span className="num text-sm text-fl-cream/70">{cashPct}% наличными · {100 - cashPct}% безналично</span>
        </label>
      </section>

      {inputs.revenue > 0 && best && (
        <>
          <div className="mb-4 rounded-lg border border-fl-gold/40 bg-fl-gold/10 p-3 text-sm text-fl-cream">
            Выгоднее всего: <span className="font-semibold text-fl-gold">{best.name}</span> — чистая прибыль{" "}
            <span className="num font-semibold">{formatNumber(best.net)}</span> сом.
            {cur && cur.key !== best.key && (
              <> По сравнению с текущим режимом это <b>{formatNumber(best.net - cur.net)}</b> сом дополнительной прибыли за период.</>
            )}
            {cur && cur.key === best.key && <> Компания уже применяет этот режим.</>}
          </div>
          {current && (
            <label className="mb-3 flex items-center gap-2 text-sm text-fl-cream/75">
              <input type="checkbox" checked={onlyApplicable} onChange={(e) => setOnlyApplicable(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--c-accent))]" />
              Показывать только режимы, доступные для вида деятельности компании
            </label>
          )}

          <section className="overflow-x-auto rounded-xl border border-fl-line bg-fl-charcoal-2 p-4 shadow-card sm:p-5">
            <table className="w-full min-w-[560px] text-left text-sm">
              <thead>
                <tr className="text-xs text-fl-cream/55">
                  <th className="py-2 pr-3 font-medium">Режим</th>
                  <th className="py-2 pr-3 text-right font-medium">Налоги<Info k="calc:compareTax" /></th>
                  <th className="py-2 pr-3 text-right font-medium">Чистая прибыль<Info k="calc:compareNet" /></th>
                  <th className="py-2 pr-3 text-right font-medium">Рентабельность<Info k="calc:comparePct" /></th>
                  <th className="py-2 pr-2"></th>
                </tr>
              </thead>
              <tbody>
                {results.map((r) => (
                  <tr key={r.key} className={`border-t border-fl-line ${r.key === best.key ? "bg-fl-gold/5" : ""}`}>
                    <td className="py-2 pr-3 text-fl-cream/90">
                      {r.name}
                      <span className="block text-[11px] text-fl-cream/45">{REGIME_INFO[r.key as RegimeKey]?.article}</span>
                    </td>
                    <td className="num py-2 pr-3 text-right text-fl-cream">{formatNumber(r.tax)}</td>
                    <td className={`num py-2 pr-3 text-right ${r.key === best.key ? "font-semibold text-fl-gold" : "text-fl-cream"}`}>{formatNumber(r.net)}</td>
                    <td className="num py-2 pr-3 text-right text-fl-cream/75">{formatPercent(r.pct)}</td>
                    <td className="py-2 pr-2 text-right text-xs">
                      {r.key === best.key && <span className="rounded-full bg-fl-gold/15 px-2 py-0.5 font-medium text-fl-gold">лучший</span>}
                      {r.key === current && <span className="ml-1 rounded-full bg-fl-info/15 px-2 py-0.5 font-medium text-fl-info">текущий</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-3 text-xs text-fl-cream/50">
              Налоги — те, что компания платит из своих средств (налог на прибыль или единый налог/патент, налог с продаж, взносы работодателя).
              НДС не включён: его оплачивает покупатель. Перед сменой режима проверьте условия его применения в НК КР.
            </p>
          </section>
        </>
      )}
    </main>
  );
}
