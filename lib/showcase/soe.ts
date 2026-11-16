// ════════════════════════════════════════════════════════════════════════
// lib/showcase/soe.ts — демо-портфель: 10 вымышленных государственных
// предприятий с ноября 2025 по середину ноября 2026, у каждого своё
// состояние — от устойчивых до неплатёжеспособных. Для показа экрана
// «Портфель компаний» министерству или ведомству-учредителю.
//
// Названия, контрагенты и цифры вымышлены; к названию добавлено «(демо)».
// Учёт услуг (проектные, строительные, транспортные работы): выручка с НДС,
// материалы от поставщиков, зарплата с подоходным налогом и взносами,
// коммунальные, аренда, налоги. Характер предприятия задают доли оплаты:
// сколько выручки собирается, сколько платится поставщикам, работникам и
// бюджету — так и получаются здоровые и больные предприятия.
// Чистые функции.
// ════════════════════════════════════════════════════════════════════════

import { PIT_RATE, SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER } from "@/lib/tax-engine";
import type { LedgerLine } from "@/lib/ledger/types";

export const SOE_SEGMENT = "Госпредприятия (демо)";

export interface SoeProfile {
  name: string;
  activity: string;
  /** выручка без НДС в первый месяц, сом */
  revenue: number;
  /** изменение выручки за месяц, доля (−0,05 — падает на 5 % в месяц) */
  growth: number;
  /** сезонность: множители по месяцам 1..12 */
  season?: number[];
  /** материалы и подрядчики, доля выручки */
  materials: number;
  /** фонд оплаты труда (начислено) в месяц, сом */
  payroll: number;
  /** коммунальные, аренда, услуги в месяц, сом */
  overhead: number;
  /** доля выставленного, которую заказчики платят в следующем месяце */
  collect: number;
  /** доля долга поставщикам, которую платят в следующем месяце */
  paySuppliers: number;
  /** доля чистой зарплаты, выплачиваемая в срок (остальное копится) */
  paySalary: number;
  /** доля налогов и взносов, уплачиваемая в срок */
  payTaxes: number;
  /** с какого месяца (0 — ноябрь 2025) начинаются трудности: доли оплаты падают вдвое */
  troubleFrom?: number;
  cash: number;
  fixedAssets: number;
  openingPayables: number;
  loan: number;
  customers: string[];
  supplier: string;
}

export const SOE_PROFILES: SoeProfile[] = [
  // устойчивые
  { name: "ГП «Ала-Тоо Жер Долбоор» (демо)", activity: "Землеустроительные и проектные работы", revenue: 2_400_000, growth: 0.008, materials: 0.2, payroll: 1_350_000, overhead: 210_000, collect: 0.93, paySuppliers: 1, paySalary: 1, payTaxes: 1, cash: 900_000, fixedAssets: 6_500_000, openingPayables: 600_000, loan: 0, customers: ["Айыл өкмөтү Демо-1", "Мэрия Демо-шаар", "ОсОО «Демо Курулуш»"], supplier: "ОсОО «Геоприбор»" },
  { name: "ГП «Чүй Басма Үйү» (демо)", activity: "Полиграфия и издательство", revenue: 1_600_000, growth: 0.01, materials: 0.38, payroll: 690_000, overhead: 150_000, collect: 0.92, paySuppliers: 1, paySalary: 1, payTaxes: 1, cash: 600_000, fixedAssets: 4_100_000, openingPayables: 400_000, loan: 0, customers: ["Министерство образования Демо", "ОсОО «Китеп-Демо»"], supplier: "ОсОО «Бумага-Демо»" },
  { name: "ГП «Бишкек Геодезия» (демо)", activity: "Геодезические и картографические работы", revenue: 1_250_000, growth: 0.012, materials: 0.15, payroll: 760_000, overhead: 110_000, collect: 0.94, paySuppliers: 1, paySalary: 1, payTaxes: 1, cash: 500_000, fixedAssets: 2_900_000, openingPayables: 150_000, loan: 0, customers: ["Мэрия Демо-шаар", "ОсОО «Демо Девелопмент»"], supplier: "ОсОО «Геоприбор»" },
  // требуют внимания
  { name: "ГП «Нарын Агросервис» (демо)", activity: "Агросервис: обработка земли, техника", revenue: 1_300_000, growth: 0, season: [0.5, 0.4, 0.5, 1.2, 1.6, 1.5, 1.4, 1.5, 1.6, 1.3, 0.7, 0.5], materials: 0.42, payroll: 560_000, overhead: 140_000, collect: 0.75, paySuppliers: 0.45, paySalary: 1, payTaxes: 0.8, cash: 350_000, fixedAssets: 9_800_000, openingPayables: 700_000, loan: 1_200_000, customers: ["Фермерское хозяйство Демо", "Айыл өкмөтү Демо-2"], supplier: "ОсОО «Агрозапчасть»" },
  { name: "ГП «Талас Суу Курулуш» (демо)", activity: "Строительство и ремонт ирригационных сетей", revenue: 1_900_000, growth: 0, materials: 0.45, payroll: 880_000, overhead: 160_000, collect: 0.8, paySuppliers: 0.85, paySalary: 1, payTaxes: 0.35, troubleFrom: 9, cash: 400_000, fixedAssets: 7_200_000, openingPayables: 800_000, loan: 0, customers: ["Департамент водных ресурсов Демо", "Айыл өкмөтү Демо-3"], supplier: "ОсОО «Трубы-Демо»" },
  { name: "ГП «Ысык-Көл Эс алуу» (демо)", activity: "Пансионат и услуги отдыха", revenue: 1_500_000, growth: 0, season: [0.2, 0.2, 0.3, 0.4, 0.8, 1.8, 2.6, 2.7, 1.5, 0.5, 0.3, 0.3], materials: 0.3, payroll: 720_000, overhead: 240_000, collect: 1, paySuppliers: 0.85, paySalary: 1, payTaxes: 0.6, cash: 300_000, fixedAssets: 18_000_000, openingPayables: 500_000, loan: 0, customers: ["Туроператор Демо", "Профсоюз Демо"], supplier: "ОсОО «Продукты-Демо»" },
  { name: "ГП «Жалал-Абад Транс» (демо)", activity: "Пассажирские и грузовые перевозки", revenue: 2_000_000, growth: -0.015, materials: 0.47, payroll: 900_000, overhead: 210_000, collect: 0.85, paySuppliers: 0.85, paySalary: 1, payTaxes: 0.8, troubleFrom: 8, cash: 500_000, fixedAssets: 11_000_000, openingPayables: 900_000, loan: 1_500_000, customers: ["Мэрия Демо-шаар", "ОсОО «Логистика-Демо»"], supplier: "ОсОО «ГСМ-Демо»" },
  // высокий риск
  { name: "ГП «Кара-Балта Механика» (демо)", activity: "Ремонт техники и металлообработка", revenue: 1_100_000, growth: -0.03, materials: 0.55, payroll: 560_000, overhead: 170_000, collect: 0.75, paySuppliers: 0.8, paySalary: 1, payTaxes: 0.9, troubleFrom: 6, cash: 400_000, fixedAssets: 5_900_000, openingPayables: 900_000, loan: 1_000_000, customers: ["ОсОО «Агро-Демо»", "ГП «Демо-Завод»"], supplier: "ОсОО «Металл-Демо»" },
  { name: "ГП «Ош Жол Курулуш» (демо)", activity: "Ремонт и содержание дорог", revenue: 3_100_000, growth: -0.04, materials: 0.55, payroll: 1_500_000, overhead: 260_000, collect: 0.72, paySuppliers: 0.7, paySalary: 0.95, payTaxes: 0.85, troubleFrom: 4, cash: 600_000, fixedAssets: 14_000_000, openingPayables: 2_600_000, loan: 4_000_000, customers: ["Дирекция дорог Демо", "Мэрия Демо-шаар"], supplier: "ОсОО «Асфальт-Демо»" },
  { name: "ГП «Баткен Энергосервис» (демо)", activity: "Обслуживание электросетей", revenue: 1_700_000, growth: -0.02, materials: 0.5, payroll: 900_000, overhead: 150_000, collect: 0.65, paySuppliers: 0.6, paySalary: 0.9, payTaxes: 0.7, troubleFrom: 2, cash: 250_000, fixedAssets: 8_600_000, openingPayables: 1_800_000, loan: 2_000_000, customers: ["Распределительная компания Демо"], supplier: "ОсОО «Кабель-Демо»" },
];

export interface SoeEntry { date: string; description: string; source: "opening" | "manual" | "payroll"; lines: LedgerLine[] }

const r2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;
const L = (account: string, debit: number, credit: number, extra: Partial<LedgerLine> = {}): LedgerLine => ({ account, debit: r2(debit), credit: r2(credit), ...extra });
/** 13 месяцев: ноябрь 2025 … ноябрь 2026 (ноябрь 2026 — до 15-го) */
export const SOE_MONTHS = Array.from({ length: 13 }, (_, i) => { const d = new Date(Date.UTC(2025, 10 + i, 1)); return d.toISOString().slice(0, 7); });
const end = (ym: string) => { const [y, m] = ym.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10); };
const day = (ym: string, d: number) => `${ym}-${String(d).padStart(2, "0")}`;

/** Вымышленный ИНН контрагента: 000000000000 + две цифры (видно, что не настоящий). */
const fakeInn = (name: string) => `0000000000${String(1000 + ([...name].reduce((a, c) => (a * 31 + c.charCodeAt(0)) % 9000, 7))).slice(-4)}`;

export function soeEntries(p: SoeProfile): SoeEntry[] {
  const out: SoeEntry[] = [];
  const P = (name: string) => ({ party: name, partyInn: fakeInn(name) });
  const ar0 = r2(p.revenue * 1.12 * 0.8);
  const open: LedgerLine[] = [
    L("1210", p.cash, 0), L("2140", p.fixedAssets, 0), L("2194", 0, r2(p.fixedAssets * 0.25)),
    L("1410", ar0, 0, P(p.customers[0])),
    L("3110", 0, p.openingPayables, P(p.supplier)),
    ...(p.loan ? [L("4110", 0, p.loan, { party: "Банк (демо)" })] : []),
    L("5110", 0, 500_000),
  ];
  open.push(L("5300", 0, r2(open.reduce((s, l) => s + l.debit - l.credit, 0))));
  out.push({ date: "2025-11-01", description: "Начальные остатки на 01.11.2025", source: "opening", lines: open });

  const empSoc = (g: number) => r2(g * SOCIAL_EMPLOYEE), pit = (g: number) => r2((g - empSoc(g)) * PIT_RATE), netPay = (g: number) => r2(g - empSoc(g) - pit(g));
  // остатки, которые генератор ведёт сам: деньги, дебиторка по заказчикам, долг поставщику, зарплата, налоги
  let cash = p.cash, sup = p.openingPayables, sal = 0, tVat = 0, tPit = 0, tSoc = 0, owedServices = 0;
  const ar = new Map<string, number>([[p.customers[0], ar0]]);
  const spend = (want: number) => { const x = r2(Math.max(0, Math.min(want, cash - 20_000))); cash = r2(cash - x); return x; };

  SOE_MONTHS.forEach((ym, i) => {
    const partial = i === SOE_MONTHS.length - 1; // ноябрь 2026 — только первая половина месяца
    const hard = p.troubleFrom != null && i >= p.troubleFrom;
    const q = (share: number) => (hard ? share * 0.55 : share);
    const m = Number(ym.slice(5));
    if (i > 0) {
      // 1) заказчики платят часть своего долга
      for (const [c, debt] of ar) {
        const got = r2(debt * q(p.collect));
        if (got < 1) continue;
        ar.set(c, r2(debt - got)); cash = r2(cash + got);
        out.push({ date: day(ym, 10), description: `Оплата от заказчика: ${c}`, source: "manual", lines: [L("1210", got, 0), L("1410", 0, got, P(c))] });
      }
      // 2) зарплата — в первую очередь, 3) налоги, 4) поставщики — сколько позволяют деньги
      const s1 = spend(sal * q(p.paySalary));
      if (s1 > 0) { sal = r2(sal - s1); out.push({ date: day(ym, 12), description: "Выплата зарплаты", source: "manual", lines: [L("3520", s1, 0, { party: "Работники" }), L("1210", 0, s1)] }); }
      const tw = (tVat + tPit + tSoc) * q(p.payTaxes);
      const tp = spend(tw);
      if (tp > 0) {
        const k = tp / (tVat + tPit + tSoc);
        const v = r2(tVat * k), pi = r2(tPit * k), so = r2(tp - v - pi);
        tVat = r2(tVat - v); tPit = r2(tPit - pi); tSoc = r2(tSoc - so);
        out.push({ date: day(ym, 15), description: "Уплата НДС, подоходного налога и взносов в Социальный фонд", source: "manual", lines: [...(v > 0 ? [L("3430", v, 0)] : []), ...(pi > 0 ? [L("3420", pi, 0)] : []), ...(so > 0 ? [L("3530", so, 0)] : []), L("1210", 0, tp)] });
      }
      const sp = spend(sup * q(p.paySuppliers));
      if (sp > 0) { sup = r2(sup - sp); out.push({ date: day(ym, 14), description: `Оплата поставщику: ${p.supplier}`, source: "manual", lines: [L("3110", sp, 0, P(p.supplier)), L("1210", 0, sp)] }); }
      const os = spend(owedServices);
      if (os > 0) { owedServices = r2(owedServices - os); out.push({ date: day(ym, 14), description: "Оплата коммунальных услуг и аренды", source: "manual", lines: [L("3110", os, 0, P("ОсОО «Коммунсервис-Демо»")), L("1210", 0, os)] }); }
    }
    // ноябрь 2026: до середины месяца — акт за первую половину и закупка материалов
    const share = partial ? 0.5 : 1;
    // выручка месяца
    const rev = r2(p.revenue * Math.pow(1 + p.growth, i) * (p.season?.[m - 1] ?? 1) * share);
    const vat = r2(rev * 0.12);
    const cust = p.customers[i % p.customers.length];
    ar.set(cust, r2((ar.get(cust) ?? 0) + rev + vat));
    out.push({ date: day(ym, partial ? 13 : 25), description: `Акт выполненных работ: ${cust}`, source: "manual", lines: [L("1410", rev + vat, 0, P(cust)), L("6110", 0, rev), L("3430", 0, vat)] });
    // материалы и подрядчики — в долг поставщику
    const mat = r2(rev * p.materials), matVat = r2(mat * 0.12);
    sup = r2(sup + mat + matVat);
    out.push({ date: day(ym, partial ? 6 : 18), description: `Материалы и подрядчики: ${p.supplier}`, source: "manual", lines: [L("7110", mat, 0), L("1540", matVat, 0), L("3110", 0, mat + matVat, P(p.supplier))] });
    if (partial) return;
    // коммунальные и аренда: платим, если есть деньги, иначе долг
    const paidOh = spend(p.overhead), owe = r2(p.overhead - paidOh);
    owedServices = r2(owedServices + owe);
    out.push({ date: day(ym, 20), description: "Коммунальные услуги, аренда, связь", source: "manual", lines: [L("8040", p.overhead, 0), ...(paidOh > 0 ? [L("1210", 0, paidOh)] : []), ...(owe > 0 ? [L("3110", 0, owe, P("ОсОО «Коммунсервис-Демо»"))] : [])] });
    // зарплата
    const g = p.payroll, er = r2(g * SOCIAL_EMPLOYER);
    sal = r2(sal + netPay(g)); tPit = r2(tPit + pit(g)); tSoc = r2(tSoc + empSoc(g) + er);
    out.push({ date: end(ym), description: `Начисление зарплаты за ${ym.slice(5)}.${ym.slice(0, 4)}`, source: "payroll", lines: [
      L("7120", r2(g * 0.75), 0), L("8010", r2(g * 0.25), 0), L("3530", 0, empSoc(g)), L("3420", 0, pit(g)), L("3520", 0, netPay(g), { party: "Работники" }),
      L("7130", r2(er * 0.75), 0), L("8020", r2(er * 0.25), 0), L("3530", 0, er),
    ] });
    // НДС: зачёт входного, остаток — к уплате в следующем месяце
    const off = Math.min(vat, matVat);
    out.push({ date: end(ym), description: `Зачёт НДС к вычету за ${ym.slice(5)}.${ym.slice(0, 4)}`, source: "manual", lines: [L("3430", off, 0), L("1540", 0, off)] });
    tVat = r2(tVat + vat - off);
    out.push({ date: end(ym), description: "Амортизация основных средств", source: "manual", lines: [L("7150", r2(p.fixedAssets / 120), 0), L("2194", 0, r2(p.fixedAssets / 120))] });
    // свободные деньги сверх двух месяцев расходов — на обновление техники (как и делают устойчивые предприятия)
    const monthly = p.payroll * 1.2 + p.overhead + rev * p.materials;
    if (cash > monthly * 1.3) {
      const capex = r2((cash - monthly) * 0.8);
      cash = r2(cash - capex);
      out.push({ date: end(ym), description: "Приобретение оборудования и техники", source: "manual", lines: [L("2140", capex, 0), L("1210", 0, capex)] });
    }
    if (p.loan) {
      const pct = r2((p.loan * 0.16) / 12), paid = spend(pct);
      out.push({ date: day(ym, 28), description: "Проценты по кредиту", source: "manual", lines: [L("9510", pct, 0, { party: "Банк (демо)" }), ...(paid > 0 ? [L("1210", 0, paid)] : []), ...(pct - paid > 0.004 ? [L("3550", 0, r2(pct - paid), { party: "Банк (демо)" })] : [])] });
    }
  });
  return out;
}
