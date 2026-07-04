// ════════════════════════════════════════════════════════════════════════
// lib/cash-flow.ts — 1:1 port of CF_TABLE / CF_FIELDS / auto-calc in app.py
// ════════════════════════════════════════════════════════════════════════

export interface CashFlowRow {
  code: number | null;
  label: string;
  isTotal: boolean;
}

export const CF_TABLE: CashFlowRow[] = [
  { code: null, label: "1. ОПЕРАЦИОННАЯ ДЕЯТЕЛЬНОСТЬ", isTotal: false },
  { code: null, label: "Валовые поступления:", isTotal: false },
  { code: 10, label: "Денежные средства от реализации продукции, работ, услуг", isTotal: false },
  { code: 20, label: "Прочие денежные поступления от операционной деятельности", isTotal: false },
  { code: 30, label: "Чрезвычайный доход в части операционной деятельности", isTotal: false },
  { code: 40, label: "Итого валовые поступления от операционной деятельности (010+020+030)", isTotal: true },
  { code: null, label: "Валовые платежи:", isTotal: false },
  { code: 50, label: "Денежные средства, выплаченные при закупке запасов", isTotal: false },
  { code: 60, label: "Оплаченные операционные расходы (услуги)", isTotal: false },
  { code: 70, label: "Погашение процентов", isTotal: false },
  { code: 80, label: "Прочие выплаты по операционной деятельности", isTotal: false },
  { code: 90, label: "Погашение налога на прибыль", isTotal: false },
  { code: 100, label: "Прочие выбытия денежных средств", isTotal: false },
  { code: 110, label: "Чрезвычайные убытки в части операционной деятельности", isTotal: false },
  { code: 120, label: "Итого валовые платежи по операционной деятельности", isTotal: true },
  { code: 190, label: "ЧИСТЫЙ ПОТОК от операционной деятельности", isTotal: true },

  { code: null, label: "2. ИНВЕСТИЦИОННАЯ ДЕЯТЕЛЬНОСТЬ", isTotal: false },
  { code: 210, label: "Денежные средства от продажи основных средств", isTotal: false },
  { code: 220, label: "Денежные средства от реализации ценных бумаг", isTotal: false },
  { code: 230, label: "Денежные средства от реализации нематериальных активов", isTotal: false },
  { code: 240, label: "Полученные проценты, дивиденды", isTotal: false },
  { code: 250, label: "Погашение представленных займов", isTotal: false },
  { code: 260, label: "Прочие поступления от инвестиционной деятельности", isTotal: false },
  { code: 270, label: "Итого валовые поступления от инвестиционной деятельности", isTotal: true },
  { code: 280, label: "Денежные средства при покупке основных средств", isTotal: false },
  { code: 290, label: "Денежные средства при приобретении НМА", isTotal: false },
  { code: 300, label: "Денежные средства при покупке ценных бумаг", isTotal: false },
  { code: 310, label: "Предоставление денежных займов", isTotal: false },
  { code: 320, label: "Прочие выплаты от инвестиционной деятельности", isTotal: false },
  { code: 330, label: "Итого валовые платежи по инвестиционной деятельности", isTotal: true },
  { code: 390, label: "ЧИСТЫЙ ПОТОК от инвестиционной деятельности", isTotal: true },

  { code: null, label: "3. ФИНАНСОВАЯ ДЕЯТЕЛЬНОСТЬ", isTotal: false },
  { code: 410, label: "Денежные средства от эмиссии акций", isTotal: false },
  { code: 420, label: "Денежные средства от эмиссии облигаций", isTotal: false },
  { code: 430, label: "Денежный взнос учредителей", isTotal: false },
  { code: 440, label: "Полученные кредиты и займы", isTotal: false },
  { code: 450, label: "Прочие поступления от финансовой деятельности", isTotal: false },
  { code: 460, label: "Итого валовые поступления от финансовой деятельности", isTotal: true },
  { code: 470, label: "Выплаченные дивиденды", isTotal: false },
  { code: 480, label: "Погашение кредитов, займов", isTotal: false },
  { code: 490, label: "Выкуп собственных акций", isTotal: false },
  { code: 500, label: "Прочие выплаты от финансовой деятельности", isTotal: false },
  { code: 510, label: "Итого валовые платежи по финансовой деятельности", isTotal: true },
  { code: 590, label: "ЧИСТЫЙ ПОТОК от финансовой деятельности", isTotal: true },

  { code: null, label: "ИТОГОВЫЕ ПОКАЗАТЕЛИ", isTotal: false },
  { code: 600, label: "Нереализованные прибыли и убытки от курсовых разниц", isTotal: false },
  { code: 700, label: "Чистое изменение в состоянии денежных средств", isTotal: true },
  { code: 710, label: "Денежные средства на КОНЕЦ отчётного периода по балансу", isTotal: true },
  { code: 720, label: "Денежные средства на НАЧАЛО отчётного периода по балансу", isTotal: false },
];

export const OP_IN = [10, 20, 30];
export const OP_OUT = [50, 60, 70, 80, 90, 100, 110];
export const INV_IN = [210, 220, 230, 240, 250, 260];
export const INV_OUT = [280, 290, 300, 310, 320];
export const FIN_IN = [410, 420, 430, 440, 450];
export const FIN_OUT = [470, 480, 490, 500];

/** Mirrors the auto-calc block in app.py (the AUTO codes: 40,120,190,270,330,390,460,510,590,700,710). */
export function computeCashFlowTotals(values: Record<number, number>): Record<number, number> {
  const v = (c: number) => values[c] ?? 0;
  const sum = (codes: number[]) => codes.reduce((s, c) => s + v(c), 0);

  const all: Record<number, number> = { ...values };
  all[40] = sum(OP_IN);
  all[120] = sum(OP_OUT);
  all[190] = all[40] - all[120];
  all[270] = sum(INV_IN);
  all[330] = sum(INV_OUT);
  all[390] = all[270] - all[330];
  all[460] = sum(FIN_IN);
  all[510] = sum(FIN_OUT);
  all[590] = all[460] - all[510];
  all[700] = all[190] + all[390] + all[590] + v(600);
  all[710] = v(720) + all[700];
  return all;
}
