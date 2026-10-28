// ════════════════════════════════════════════════════════════════════════
// lib/ledger/demo.ts — демо-компания «ОсОО Белес», III квартал 2026.
//
// Мебельное производство на едином налоге (производство, 4% нал. / 2% безнал.,
// ст. 423 ч.1 п.2 НК КР). Три месяца операций по плану счетов Пост. №231:
// наличная и безналичная выручка, продажа в долг и её оплата, аванс
// покупателя, закупка материалов на склад, выпуск и списание себестоимости
// (непрерывный учёт запасов, 1620 → 1640 → 7000), начисление зарплаты с
// удержаниями и выплатой, страховые взносы, аренда, энергия, амортизация,
// покупка оборудования, кредит + проценты, дивиденды, резервный капитал,
// инкассация кассы в банк, ежемесячное начисление единого налога.
//
// Используется в демо-режиме без базы данных, в POST /api/demo и в тестах.
// ════════════════════════════════════════════════════════════════════════

import type { EsgInput } from "@/lib/esg/input";
import { SOCIAL_EMPLOYEE, SOCIAL_EMPLOYER, PIT_RATE, type RegimeKey } from "@/lib/tax-engine";
import { buildStatements } from "./engine";
import { monthPeriod } from "./period";
import { taxSourceRef } from "./taxes";
import { round2, type LedgerEntry, type LedgerLine } from "./types";

export const DEMO_COMPANY = {
  id: "demo",
  name: "ОсОО «Белес» — демо",
  regime: "unified_production" as RegimeKey,
  patentAmount: 0,
  activity: "Производство корпусной мебели, Бишкек",
};

export const DEMO_PERIOD = { from: "2026-07-01", to: "2026-09-30" };

/** Non-financial inputs of the demo company for the ESG report. */
export const DEMO_ESG: Partial<EsgInput> = {
  industry: "production",
  region: "г. Бишкек",
  companyDescription:
    "ОсОО «Белес» — производитель корпусной мебели в Бишкеке: кухонные гарнитуры, шкафы и мебель для гостиниц и офисов по индивидуальным заказам. У компании собственный цех площадью около 900 м² с раскроечным и кромкооблицовочным оборудованием и выставочный салон в арендованном помещении.\n\n" +
    "Основное сырьё — ламинированная ДСП, МДФ и фурнитура — закупается у дистрибьюторов в Кыргызстане. Продукция продаётся частным покупателям через салон и Instagram и по договорам с гостиницами и застройщиками; доставка и сборка выполняются собственным транспортом.",
  ceoMessage: "",
  electricityKwh: 41_800,
  renewableKwh: 0,
  heatGcal: 0,
  vehiclePetrolL: 2_100,
  vehicleDieselL: 1_200,
  generatorDieselL: 150,
  gasM3: 0,
  coalT: 0,
  waterM3: 420,
  wasteT: 6.8,
  wasteRecycledT: 4.1,
  hazardousWasteT: 0.05,
  employees: 14,
  employeesStart: 13,
  women: 6,
  managers: 3,
  womenManagers: 1,
  under30: 5,
  age30to50: 7,
  over50: 2,
  contractors: 2,
  hires: 2,
  leavers: 1,
  trainingHours: 56,
  employeesTrained: 8,
  injuries: 0,
  lostDays: 0,
  nationalAvgWage: 51_900,
  commuteKmOneWay: 7,
  commuteShareCar: 30,
  commuteSharePublic: 60,
  businessAirKm: 1_600,
  businessCarKm: 900,
  boardMembers: 3,
  independentBoard: 1,
  womenBoard: 1,
  antiCorruptionPolicy: true,
  codeOfConduct: true,
  dataProtectionPolicy: false,
  environmentalPolicy: false,
  hrPolicy: true,
  customerComplaints: 3,
  localSuppliersPct: 70,
  donations: 25_000,
  esgOwner: "Финансовый директор",
};

const dr = (account: string, amount: number, memo?: string): LedgerLine => ({ account, debit: round2(amount), credit: 0, memo });
const cr = (account: string, amount: number, memo?: string): LedgerLine => ({ account, debit: 0, credit: round2(amount), memo });

let seq = 0;
function entry(date: string, description: string, lines: LedgerLine[], source: LedgerEntry["source"] = "demo"): LedgerEntry {
  seq += 1;
  return { id: `demo-${String(seq).padStart(3, "0")}`, date, description, source, lines };
}

interface MonthPlan {
  m: string; // "07"
  name: string;
  cashSales: number;
  bankSales: number;
  creditSales: number;
  collected: number;
  materials: number;
  consumed: number;
  cogs: number;
  prodWages: number;
  adminWages: number;
  kwh: number;
  energy: number;
  marketing: number;
  transport: number;
}

const MONTHS: MonthPlan[] = [
  { m: "07", name: "июль", cashSales: 380_000, bankSales: 1_120_000, creditSales: 700_000, collected: 900_000,
    materials: 820_000, consumed: 860_000, cogs: 1_180_000, prodWages: 310_000, adminWages: 140_000,
    kwh: 13_600, energy: 41_000, marketing: 45_000, transport: 38_000 },
  { m: "08", name: "август", cashSales: 420_000, bankSales: 1_310_000, creditSales: 560_000, collected: 650_000,
    materials: 960_000, consumed: 930_000, cogs: 1_290_000, prodWages: 320_000, adminWages: 140_000,
    kwh: 14_100, energy: 42_300, marketing: 60_000, transport: 41_000 },
  { m: "09", name: "сентябрь", cashSales: 360_000, bankSales: 1_480_000, creditSales: 820_000, collected: 760_000,
    materials: 1_010_000, consumed: 990_000, cogs: 1_420_000, prodWages: 330_000, adminWages: 145_000,
    kwh: 14_100, energy: 42_300, marketing: 52_000, transport: 47_000 },
];

function payroll(date: string, label: string, gross: number, expense: string, social: string): LedgerEntry[] {
  const employee = round2(gross * SOCIAL_EMPLOYEE);
  const pit = round2((gross - employee) * PIT_RATE);
  const employer = round2(gross * SOCIAL_EMPLOYER);
  return [
    entry(date, `Начисление заработной платы: ${label}`, [
      dr(expense, gross), cr("3520", gross),
    ], "payroll"),
    entry(date, `Удержания из зарплаты: ${label}`, [
      dr("3520", employee + pit),
      cr("3530", employee, "страховые взносы работника 10%"),
      cr("3420", pit, "подоходный налог 10%"),
    ], "payroll"),
    entry(date, `Страховые взносы работодателя 2,25%: ${label}`, [
      dr(social, employer), cr("3530", employer),
    ], "payroll"),
  ];
}

export function demoEntries(): LedgerEntry[] {
  seq = 0;
  const openingLines: LedgerLine[] = [
    dr("1110", 380_000), dr("1210", 6_500_000),
    dr("1410", 3_200_000), dr("1620", 2_800_000), dr("1640", 4_000_000),
    dr("2130", 9_000_000), cr("2193", 1_350_000),
    dr("2140", 14_000_000), cr("2194", 1_600_000),
    dr("2960", 1_200_000), cr("2996", 240_000),
    dr("2850", 4_500_000),
    cr("3110", 4_000_000), cr("3310", 2_000_000), cr("3410", 480_000),
    cr("3520", 395_000), cr("3530", 61_000), cr("3420", 54_000),
    cr("4120", 5_000_000),
    cr("5130", 15_000_000),
  ];
  // retained earnings is whatever balances the opening position
  openingLines.push(cr("5300", round2(openingLines.reduce((s, l) => s + l.debit - l.credit, 0))));
  const entries: LedgerEntry[] = [entry("2026-07-01", "Начальные остатки на 01.07.2026", openingLines, "opening")];

  entries.push(
    entry("2026-07-05", "Выплата заработной платы за июнь", [dr("3520", 395_000), cr("1210", 395_000)]),
    entry("2026-07-15", "Перечисление страховых взносов и подоходного налога за июнь", [
      dr("3530", 61_000), dr("3420", 54_000), cr("1210", 115_000),
    ]),
    entry("2026-07-20", "Уплата единого налога за II квартал 2026 г.", [dr("3410", 480_000), cr("1210", 480_000)]),
    entry("2026-08-12", "Покупка кромкооблицовочного станка", [dr("2140", 640_000), cr("1210", 640_000)]),
    entry("2026-08-26", "Объявлены дивиденды участникам за I полугодие", [dr("5300", 500_000), cr("3540", 500_000)]),
    entry("2026-08-30", "Выплата дивидендов", [dr("3540", 500_000), cr("1210", 500_000)]),
    entry("2026-09-10", "Аванс от ОсОО «СтройДом» за кухонные гарнитуры", [dr("1210", 600_000), cr("3210", 600_000)]),
    entry("2026-09-30", "Отчисление в резервный капитал", [dr("5300", 150_000), cr("5400", 150_000)]),
  );

  for (const p of MONTHS) {
    const d = (day: number) => `2026-${p.m}-${String(day).padStart(2, "0")}`;
    entries.push(
      entry(d(3), `Закупка ЛДСП и фурнитуры у ОсОО «ТехноМебель», ${p.name}`, [dr("1620", p.materials), cr("1210", p.materials)]),
      entry(d(8), `Розничные продажи в салоне за наличные, ${p.name}`, [dr("1110", p.cashSales), cr("6110", p.cashSales)]),
      entry(d(9), "Инкассация: сдача наличной выручки в банк", [dr("1210", round2(p.cashSales * 0.8)), cr("1110", round2(p.cashSales * 0.8))]),
      entry(d(14), `Безналичная оплата заказов, ${p.name}`, [dr("1210", p.bankSales), cr("6110", p.bankSales)]),
      entry(d(18), "Аренда выставочного салона", [dr("8030", 90_000), cr("1210", 90_000)]),
      entry(d(20), `Отгрузка партии ОсОО «Ала-Тоо Отель» с отсрочкой оплаты, ${p.name}`, [dr("1410", p.creditSales), cr("6110", p.creditSales)]),
      entry(d(22), "Оплата от покупателей по ранее выставленным счетам", [dr("1210", p.collected), cr("1410", p.collected)]),
      entry(d(24), "Погашение кредита и процентов, Бакай Банк", [dr("3310", 150_000), dr("9510", round2(2_000_000 * 0.18 / 12)), cr("1210", round2(150_000 + 2_000_000 * 0.18 / 12))]),
      entry(d(25), "Оплата электроэнергии цеха", [dr("7140", p.energy, `${p.kwh.toLocaleString("ru-RU")} кВт·ч`), cr("1210", p.energy)]),
      entry(d(26), "Реклама в Instagram и на 2ГИС", [dr("7510", p.marketing), cr("1210", p.marketing)]),
      entry(d(27), "Доставка мебели покупателям", [dr("7540", p.transport), cr("1210", p.transport)]),
      entry(d(28), "Комиссия банка за обслуживание счёта", [dr("8040", 4_500), cr("1210", 4_500)]),
      entry(d(28), "Списание материалов в производство, выпуск готовой продукции", [dr("1640", p.consumed), cr("1620", p.consumed)]),
      entry(d(28), "Себестоимость реализованной мебели", [dr("7000", p.cogs), cr("1640", p.cogs)]),
      entry(d(30), "Амортизация оборудования и цеха", [dr("7150", 98_000), cr("2194", 68_000), cr("2193", 30_000)]),
      entry(d(30), "Амортизация программного обеспечения", [dr("8480", 10_000), cr("2996", 10_000)]),
      ...payroll(d(30), `производственный персонал, ${p.name}`, p.prodWages, "7120", "7130"),
      ...payroll(d(30), `администрация, ${p.name}`, p.adminWages, "8010", "8020"),
    );
    if (p.m !== "09") {
      const next = p.m === "07" ? "08" : "09";
      const net = round2((p.prodWages + p.adminWages) * (1 - SOCIAL_EMPLOYEE) - (p.prodWages + p.adminWages) * (1 - SOCIAL_EMPLOYEE) * PIT_RATE);
      const funds = round2((p.prodWages + p.adminWages) * (SOCIAL_EMPLOYEE + SOCIAL_EMPLOYER) + (p.prodWages + p.adminWages) * (1 - SOCIAL_EMPLOYEE) * PIT_RATE);
      entries.push(
        entry(`2026-${next}-05`, `Выплата заработной платы за ${p.name}`, [dr("3520", net), cr("1210", net)]),
        entry(`2026-${next}-15`, `Перечисление взносов в Соцфонд и подоходного налога за ${p.name}`, [
          dr("3530", round2((p.prodWages + p.adminWages) * (SOCIAL_EMPLOYEE + SOCIAL_EMPLOYER))),
          dr("3420", round2((p.prodWages + p.adminWages) * (1 - SOCIAL_EMPLOYEE) * PIT_RATE)),
          cr("1210", funds),
        ]),
      );
    }
  }

  entries.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));

  // Monthly accrual of the unified tax by the same engine the app uses
  for (const p of MONTHS) {
    const period = monthPeriod(2026, Number(p.m));
    const s = buildStatements(entries, period, { regime: DEMO_COMPANY.regime });
    const acc = s.taxes.computed;
    if (acc && acc.total > 0) {
      const e = entry(period.to, `Начисление единого налога за ${p.name} 2026`, acc.entryLines, "tax");
      e.sourceRef = taxSourceRef(period.from, period.to);
      entries.push(e);
    }
  }
  return entries;
}
