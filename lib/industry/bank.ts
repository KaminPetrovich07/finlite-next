// ════════════════════════════════════════════════════════════════════════
// lib/industry/bank.ts — экономические нормативы НБКР и стресс-тест банка.
// Пороги по умолчанию:
//   К2.1–К2.4 — аналитическая записка НБКР к проекту постановления
//   о минимальном капитале (12.2025): К2.1 ≥ 12 %, К2.2 ≥ 6 %, К2.3 ≥ 4,5 %,
//   К2.4 ≥ 8 %;
//   К1.1–К1.3, К3.1, К3.2, К4 — проект Положения об экономических нормативах
//   (НБКР, 11.2022): 20 / 15 / 30 %, ликвидность ≥ 45 % и ≥ 35 %, ОВП 15 / 20 / 20 %.
// Все пороги меняются в настройках расширения — сверяйте с действующей редакцией.
// ════════════════════════════════════════════════════════════════════════
import { pct, n, type Metric } from "./common";

const fmt = (v: number) => v.toLocaleString("ru-RU", { maximumFractionDigits: 2 });

export interface BankInput {
  cet1: number; at1: number; tier2: number;          // капитал: базовый первого уровня, добавочный, второго уровня
  rwa: number;                                       // активы, взвешенные по риску
  exposure: number;                                  // совокупная позиция для левериджа
  liquidAssets: number; currentLiabilities: number;  // К3.1
  hqla: number; shortLiabilities: number;            // К3.2
  maxBorrower: number; maxRelated: number; maxBank: number; // крупнейшие риски
  fxPositions: Array<{ code: string; position: number }>;  // + длинная, − короткая, в сомах
  // для финансовых показателей
  totalAssets: number; equity: number; netProfit: number; interestIncome: number; interestExpense: number;
  operatingExpense: number; operatingIncome: number; loans: number; npl: number; provisions: number; deposits: number;
}

export type BankLimits = Record<"k21" | "k22" | "k23" | "k24" | "k11" | "k12" | "k13" | "k31" | "k32" | "k41" | "k42" | "k43", number>;

export const BANK_LIMITS: BankLimits = { k21: 12, k22: 6, k23: 4.5, k24: 8, k11: 20, k12: 15, k13: 30, k31: 45, k32: 35, k41: 15, k42: 20, k43: 20 };

const SRC_CAP = "НБКР, аналитическая записка к проекту о минимальном капитале, 12.2025";
const SRC_NORM = "НБКР, проект Положения об экономических нормативах, 11.2022";

export function bankMetrics(i: BankInput, L: BankLimits = BANK_LIMITS): { normatives: Metric[]; ratios: Metric[]; capital: number } {
  const t1 = n(i.cet1) + n(i.at1), capital = t1 + n(i.tier2);
  const long = i.fxPositions.filter((p) => p.position > 0).reduce((s, p) => s + p.position, 0);
  const short = -i.fxPositions.filter((p) => p.position < 0).reduce((s, p) => s + p.position, 0);
  const maxOne = i.fxPositions.reduce((m, p) => Math.max(m, Math.abs(p.position)), 0);
  const normatives: Metric[] = [
    { key: "k21", title: "К2.1 Достаточность суммарного капитала", value: pct(capital, i.rwa), unit: "%", rule: { op: ">=", min: L.k21 }, source: SRC_CAP },
    { key: "k22", title: "К2.2 Достаточность капитала первого уровня", value: pct(t1, i.rwa), unit: "%", rule: { op: ">=", min: L.k22 }, source: SRC_CAP },
    { key: "k23", title: "К2.3 Достаточность базового капитала первого уровня", value: pct(i.cet1, i.rwa), unit: "%", rule: { op: ">=", min: L.k23 }, source: SRC_CAP },
    { key: "k24", title: "К2.4 Левередж (капитал первого уровня / совокупная позиция)", value: pct(t1, i.exposure), unit: "%", rule: { op: ">=", min: L.k24 }, source: SRC_CAP },
    { key: "k11", title: "К1.1 Риск на одного заёмщика (группу), не связанного с банком", value: pct(i.maxBorrower, capital), unit: "%", rule: { op: "<=", max: L.k11 }, source: SRC_NORM },
    { key: "k12", title: "К1.2 Риск на заёмщика, связанного с банком", value: pct(i.maxRelated, capital), unit: "%", rule: { op: "<=", max: L.k12 }, source: SRC_NORM },
    { key: "k13", title: "К1.3 Риск на банк-заёмщик", value: pct(i.maxBank, capital), unit: "%", rule: { op: "<=", max: L.k13 }, source: SRC_NORM },
    { key: "k31", title: "К3.1 Текущая ликвидность (ликвидные активы / обязательства)", value: pct(i.liquidAssets, i.currentLiabilities), unit: "%", rule: { op: ">=", min: L.k31 }, source: SRC_NORM },
    { key: "k32", title: "К3.2 Краткосрочная ликвидность (ВЛА / краткосрочные обязательства)", value: pct(i.hqla, i.shortLiabilities), unit: "%", rule: { op: ">=", min: L.k32 }, source: SRC_NORM },
    { key: "k41", title: "К4.1 Открытая позиция по одной валюте", value: pct(maxOne, capital), unit: "%", rule: { op: "<=", max: L.k41 }, source: SRC_NORM },
    { key: "k42", title: "К4.2 Суммарная длинная валютная позиция", value: pct(long, capital), unit: "%", rule: { op: "<=", max: L.k42 }, source: SRC_NORM },
    { key: "k43", title: "К4.3 Суммарная короткая валютная позиция", value: pct(short, capital), unit: "%", rule: { op: "<=", max: L.k43 }, source: SRC_NORM },
  ];
  const ratios: Metric[] = [
    { key: "roa", title: "ROA, рентабельность активов", value: pct(i.netProfit, i.totalAssets), unit: "%" },
    { key: "roe", title: "ROE, рентабельность капитала", value: pct(i.netProfit, i.equity), unit: "%" },
    { key: "nim", title: "Чистая процентная маржа к активам", value: pct(i.interestIncome - i.interestExpense, i.totalAssets), unit: "%" },
    { key: "cir", title: "Cost-to-income (расходы / операционный доход)", value: pct(i.operatingExpense, i.operatingIncome), unit: "%" },
    { key: "npl", title: "Доля проблемных кредитов (NPL)", value: pct(i.npl, i.loans), unit: "%" },
    { key: "cov", title: "Покрытие NPL резервами", value: pct(i.provisions, i.npl), unit: "%" },
    { key: "ltd", title: "Кредиты / депозиты", value: pct(i.loans, i.deposits), unit: "%" },
  ];
  return { normatives, ratios, capital };
}

export interface BankStress { nplShock: number; lgd: number; fxShock: number; outflow: number }

/**
 * Три шока по отдельности и вместе:
 *  кредитный — доля проблемных растёт на nplShock п.п. портфеля, потери = рост × LGD − уже созданные резервы сверх NPL;
 *  валютный — сом дешевеет на fxShock %, переоценка открытых позиций;
 *  ликвидность — отток outflow % депозитов из ликвидных активов.
 * Потери уменьшают базовый капитал; RWA для простоты не меняются.
 */
export function bankStress(i: BankInput, s: BankStress, L: BankLimits = BANK_LIMITS) {
  const creditLoss = Math.max(0, (n(i.loans) * s.nplShock) / 100 * (s.lgd / 100));
  const fxResult = i.fxPositions.reduce((sum, p) => sum + p.position * (s.fxShock / 100), 0); // длинная позиция выигрывает при девальвации
  const run = (n(i.deposits) * s.outflow) / 100;
  const after = (loss: number) => {
    const cet1 = n(i.cet1) - loss;
    return { cet1, k21: pct(cet1 + n(i.at1) + n(i.tier2), i.rwa), k23: pct(cet1, i.rwa) };
  };
  const c = after(creditLoss), f = after(-fxResult), all = after(creditLoss - fxResult);
  const k31 = pct(Math.max(0, i.liquidAssets - run), Math.max(1, i.currentLiabilities - run));
  return {
    creditLoss, fxResult, run,
    rows: [
      { title: "Кредитный шок", loss: creditLoss, k21: c.k21, k23: c.k23 },
      { title: "Валютный шок", loss: -fxResult, k21: f.k21, k23: f.k23 },
      { title: "Вместе", loss: creditLoss - fxResult, k21: all.k21, k23: all.k23 },
    ],
    k31AfterRun: k31,
    breaches: [
      ...(all.k21 !== null && all.k21 < L.k21 ? [`К2.1 после шоков ${fmt(all.k21)} % — ниже ${fmt(L.k21)} %`] : []),
      ...(all.k23 !== null && all.k23 < L.k23 ? [`К2.3 после шоков ${fmt(all.k23)} % — ниже ${fmt(L.k23)} %`] : []),
      ...(k31 !== null && k31 < L.k31 ? [`К3.1 после оттока ${fmt(k31)} % — ниже ${fmt(L.k31)} %`] : []),
    ],
  };
}

export const BANK_FIELDS: Array<{ key: keyof BankInput; label: string; group: string }> = [
  { key: "cet1", label: "Базовый капитал первого уровня", group: "Капитал" },
  { key: "at1", label: "Добавочный капитал первого уровня", group: "Капитал" },
  { key: "tier2", label: "Капитал второго уровня", group: "Капитал" },
  { key: "rwa", label: "Активы, взвешенные по риску", group: "Капитал" },
  { key: "exposure", label: "Совокупная позиция для левериджа", group: "Капитал" },
  { key: "liquidAssets", label: "Ликвидные активы", group: "Ликвидность" },
  { key: "currentLiabilities", label: "Текущие обязательства", group: "Ликвидность" },
  { key: "hqla", label: "Высоколиквидные активы", group: "Ликвидность" },
  { key: "shortLiabilities", label: "Краткосрочные обязательства", group: "Ликвидность" },
  { key: "maxBorrower", label: "Крупнейший риск на заёмщика (не связанного)", group: "Концентрация" },
  { key: "maxRelated", label: "Крупнейший риск на связанного заёмщика", group: "Концентрация" },
  { key: "maxBank", label: "Крупнейший риск на банк-заёмщик", group: "Концентрация" },
  { key: "totalAssets", label: "Активы всего", group: "Финансовые показатели" },
  { key: "equity", label: "Собственный капитал (по балансу)", group: "Финансовые показатели" },
  { key: "netProfit", label: "Чистая прибыль за год", group: "Финансовые показатели" },
  { key: "interestIncome", label: "Процентные доходы", group: "Финансовые показатели" },
  { key: "interestExpense", label: "Процентные расходы", group: "Финансовые показатели" },
  { key: "operatingIncome", label: "Операционный доход", group: "Финансовые показатели" },
  { key: "operatingExpense", label: "Операционные расходы", group: "Финансовые показатели" },
  { key: "loans", label: "Кредитный портфель", group: "Финансовые показатели" },
  { key: "npl", label: "Проблемные кредиты (NPL)", group: "Финансовые показатели" },
  { key: "provisions", label: "Резервы на потери по кредитам", group: "Финансовые показатели" },
  { key: "deposits", label: "Депозиты", group: "Финансовые показатели" },
];
