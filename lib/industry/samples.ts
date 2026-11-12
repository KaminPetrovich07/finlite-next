// Учебные примеры для первого открытия раздела — помечены как пример, не данные реальных организаций.
import type { BankInput, BankLimits } from "./bank";
import { BANK_LIMITS } from "./bank";
import type { InsurerInput, InsurerLimits } from "./insurance";
import { INSURER_LIMITS } from "./insurance";
import type { BudgetLine, PublicExtra } from "./public";

export interface BankData { input: BankInput; limits: BankLimits; stress: { nplShock: number; lgd: number; fxShock: number; outflow: number } }
export interface InsurerData { input: InsurerInput; limits: InsurerLimits; triangle: string; incremental: boolean; stress: { lossShock: number; investLoss: number } }
export interface PublicData { lines: BudgetLine[]; extra: PublicExtra }

export const SAMPLE_BANK: BankData = {
  input: {
    cet1: 9_000_000, at1: 1_000_000, tier2: 2_000_000, rwa: 80_000_000, exposure: 110_000_000, liquidAssets: 30_000_000, currentLiabilities: 60_000_000,
    hqla: 15_000_000, shortLiabilities: 40_000_000, maxBorrower: 2_000_000, maxRelated: 1_000_000, maxBank: 3_000_000,
    fxPositions: [{ code: "USD", position: 1_500_000 }, { code: "EUR", position: -600_000 }, { code: "RUB", position: 300_000 }],
    totalAssets: 120_000_000, equity: 13_000_000, netProfit: 2_600_000, interestIncome: 13_000_000, interestExpense: 5_000_000,
    operatingIncome: 11_000_000, operatingExpense: 5_500_000, loans: 70_000_000, npl: 3_500_000, provisions: 2_800_000, deposits: 85_000_000,
  },
  limits: BANK_LIMITS,
  stress: { nplShock: 10, lgd: 60, fxShock: 20, outflow: 15 },
};

export const SAMPLE_INSURER: InsurerData = {
  // в том же масштабе, что и треугольник: резервы в отчётности чуть ниже оценки по Маку
  input: { gpw: 21_000_000, npw: 16_000_000, npwPrev: 14_500_000, npe: 15_600_000, claims: 9_800_000, expenses: 5_200_000, investIncome: 1_700_000, surplus: 12_000_000, reservesBooked: 18_200_000, liabilities: 24_000_000, liquidAssets: 27_000_000, investedAssets: 26_000_000 },
  limits: INSURER_LIMITS,
  incremental: true,
  // Taylor & Ashe (1983) — классический треугольник из работы Mack (1993)
  triangle: `357848 766940 610542 482940 527326 574398 146342 139950 227229 67948
352118 884021 933894 1183289 445745 320996 527804 266172 425046
290507 1001799 926219 1016654 750816 146923 495992 280405
310608 1108250 776189 1562400 272482 352053 206286
443160 693190 991983 769488 504851 470639
396132 937085 847498 805037 705960
440832 847631 1131398 1063269
359480 1061648 1443370
376686 986608
344014`,
  stress: { lossShock: 5, investLoss: 10 },
};

export const SAMPLE_PUBLIC: PublicData = {
  lines: [
    { code: "13", name: "Трансферты из республиканского бюджета", kind: "revenue", original: 48_000_000, final: 51_500_000, actual: 51_500_000 },
    { code: "14", name: "Доходы от платных услуг (специальные средства)", kind: "revenue", original: 6_000_000, final: 6_000_000, actual: 5_100_000, own: true },
    { code: "211", name: "Оплата труда", kind: "expense", original: 31_000_000, final: 32_800_000, actual: 32_650_000 },
    { code: "212", name: "Взносы в Социальный фонд", kind: "expense", original: 5_300_000, final: 5_600_000, actual: 5_570_000 },
    { code: "221", name: "Приобретение прочих товаров и услуг", kind: "expense", original: 9_500_000, final: 10_400_000, actual: 8_300_000 },
    { code: "311", name: "Приобретение основных средств", kind: "expense", original: 7_000_000, final: 8_200_000, actual: 5_900_000 },
  ],
  extra: { payables: 1_900_000, overduePayables: 0, receivables: 400_000, staffCost: 32_650_000 },
};
