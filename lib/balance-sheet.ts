// ════════════════════════════════════════════════════════════════════════
// lib/balance-sheet.ts — 1:1 port of BALANCE_ROWS / BALANCE_TOTALS in app.py
// ════════════════════════════════════════════════════════════════════════

export interface BalanceRow {
  code: number | null; // null = section header
  label: string;
  isSub: boolean;
  isTotal: boolean;
}

export const BALANCE_ROWS: BalanceRow[] = [
  { code: null, label: "1. ОБОРОТНЫЕ АКТИВЫ", isSub: false, isTotal: false },
  { code: 110, label: "Денежные средства в кассе (1100)", isSub: false, isTotal: false },
  { code: 120, label: "Денежные средства в банке (1200)", isSub: false, isTotal: false },
  { code: 130, label: "Краткосрочные инвестиции (1300)", isSub: false, isTotal: false },
  { code: 131, label: "  — Долговые ценные бумаги (1310)", isSub: true, isTotal: false },
  { code: 132, label: "  — Долевые ценные бумаги (1320)", isSub: true, isTotal: false },
  { code: 133, label: "  — Кредиты, займы, депозиты (1330,1340)", isSub: true, isTotal: false },
  { code: 134, label: "  — Тек. часть долгоср. инвестиций (1350)", isSub: true, isTotal: false },
  { code: 135, label: "  — Прочие краткоср. инвестиции (1390)", isSub: true, isTotal: false },
  { code: 140, label: "Счета к получению (1400)", isSub: false, isTotal: false },
  { code: 141, label: "  — за товары, услуги (1410)", isSub: true, isTotal: false },
  { code: 142, label: "  — Резерв на безнадёжные долги (1491)", isSub: true, isTotal: false },
  { code: 150, label: "Дебиторская задолженность прочая (1500)", isSub: false, isTotal: false },
  { code: 151, label: "  — Векселя к получению (1510)", isSub: true, isTotal: false },
  { code: 152, label: "  — Дебиторка сотрудников (1520)", isSub: true, isTotal: false },
  { code: 153, label: "  — Налоги авансом (1530,1540)", isSub: true, isTotal: false },
  { code: 154, label: "  — Проценты, дивиденды к получению (1550,1560)", isSub: true, isTotal: false },
  { code: 155, label: "  — Задолженность по строительству (1570)", isSub: true, isTotal: false },
  { code: 156, label: "  — Тек. часть долгоср. дебиторки (1580)", isSub: true, isTotal: false },
  { code: 157, label: "  — Прочая дебиторка (1590)", isSub: true, isTotal: false },
  { code: 160, label: "Товарно-материальные запасы (1600)", isSub: false, isTotal: false },
  { code: 161, label: "  — Товары (1610)", isSub: true, isTotal: false },
  { code: 162, label: "  — Запасы сырья и материалов (1620)", isSub: true, isTotal: false },
  { code: 163, label: "  — Незавершённое производство (1630)", isSub: true, isTotal: false },
  { code: 164, label: "  — Готовая продукция (1640)", isSub: true, isTotal: false },
  { code: 165, label: "  — Сельхозпродукция (1650)", isSub: true, isTotal: false },
  { code: 170, label: "  — Запасы вспомогательных материалов (1700)", isSub: true, isTotal: false },
  { code: 180, label: "Авансы выданные (1800)", isSub: false, isTotal: false },
  { code: 181, label: "  — Запасы авансом (1810)", isSub: true, isTotal: false },
  { code: 182, label: "  — Услуги авансом (1820)", isSub: true, isTotal: false },
  { code: 183, label: "  — Аренда авансом (1830)", isSub: true, isTotal: false },
  { code: 184, label: "  — Прочие авансы (1890)", isSub: true, isTotal: false },
  { code: 190, label: "Задолженность учредителей по взносам в УК (1900)", isSub: false, isTotal: false },
  { code: 191, label: "ИТОГО по разделу 1 «Оборотные активы»", isSub: false, isTotal: true },

  { code: null, label: "2. ВНЕОБОРОТНЫЕ АКТИВЫ", isSub: false, isTotal: false },
  { code: 210, label: "Балансовая стоимость основных средств (2100)", isSub: false, isTotal: false },
  { code: 211, label: "  — Земля (2110)", isSub: true, isTotal: false },
  { code: 212, label: "  — Незавершённое строительство (2120)", isSub: true, isTotal: false },
  { code: 213, label: "  — Здания, сооружения (2130,2193)", isSub: true, isTotal: false },
  { code: 214, label: "  — Оборудование (2140,2194)", isSub: true, isTotal: false },
  { code: 215, label: "  — Конторское оборудование (2150,2195)", isSub: true, isTotal: false },
  { code: 216, label: "  — Мебель и принадлежности (2160,2196)", isSub: true, isTotal: false },
  { code: 217, label: "  — Транспортные средства (2170,2197)", isSub: true, isTotal: false },
  { code: 218, label: "  — Благоустройство арендованной собственности (2180,2198)", isSub: true, isTotal: false },
  { code: 219, label: "  — Благоустройство земельных участков (2190,2199)", isSub: true, isTotal: false },
  { code: 220, label: "Биологические активы (2200)", isSub: false, isTotal: false },
  { code: 230, label: "Инвестиции в недвижимость (2300)", isSub: false, isTotal: false },
  { code: 240, label: "Отсроченные налоговые требования (2400)", isSub: false, isTotal: false },
  { code: 250, label: "Денежные средства, ограниченные к использованию (2500)", isSub: false, isTotal: false },
  { code: 270, label: "Долгосрочная дебиторская задолженность (2700)", isSub: false, isTotal: false },
  { code: 280, label: "Долгосрочные инвестиции (2800)", isSub: false, isTotal: false },
  { code: 286, label: "  — Прочие долгоср. инвестиции (2890)", isSub: true, isTotal: false },
  { code: 290, label: "Балансовая стоимость нематериальных активов (2900)", isSub: false, isTotal: false },
  { code: 294, label: "ИТОГО по разделу 2 «Внеоборотные активы»", isSub: false, isTotal: true },
  { code: 299, label: "ИТОГО АКТИВЫ (раздел 1 + раздел 2)", isSub: false, isTotal: true },

  { code: null, label: "3. КРАТКОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА", isSub: false, isTotal: false },
  { code: 310, label: "Счета к оплате (3100)", isSub: false, isTotal: false },
  { code: 320, label: "Авансы полученные (3210,3220)", isSub: false, isTotal: false },
  { code: 330, label: "Краткосрочные долговые обязательства (3300)", isSub: false, isTotal: false },
  { code: 334, label: "  — Прочие краткоср. долговые (3390)", isSub: true, isTotal: false },
  { code: 340, label: "Налоги к оплате (3400)", isSub: false, isTotal: false },
  { code: 341, label: "  — Налог на прибыль (3410)", isSub: true, isTotal: false },
  { code: 342, label: "  — НДФЛ (3420)", isSub: true, isTotal: false },
  { code: 343, label: "  — НДС (3430)", isSub: true, isTotal: false },
  { code: 344, label: "  — Акцизы (3460)", isSub: true, isTotal: false },
  { code: 345, label: "  — Прочие налоги (3490)", isSub: true, isTotal: false },
  { code: 350, label: "Краткосрочные начисленные обязательства (3500)", isSub: false, isTotal: false },
  { code: 352, label: "  — Начисленная заработная плата (3520)", isSub: true, isTotal: false },
  { code: 353, label: "  — Взносы на социальное страхование (3530)", isSub: true, isTotal: false },
  { code: 354, label: "  — Дивиденды к выплате (3540)", isSub: true, isTotal: false },
  { code: 355, label: "  — Начисленные проценты (3550)", isSub: true, isTotal: false },
  { code: 356, label: "  — Прочие начисленные расходы (3590)", isSub: true, isTotal: false },
  { code: 360, label: "Прочие краткосрочные обязательства (3610,3620)", isSub: false, isTotal: false },
  { code: 370, label: "Резервы (3710–3790)", isSub: false, isTotal: false },
  { code: 371, label: "ИТОГО по разделу 3 «Краткосрочные обязательства»", isSub: false, isTotal: true },

  { code: null, label: "4. ДОЛГОСРОЧНЫЕ ОБЯЗАТЕЛЬСТВА", isSub: false, isTotal: false },
  { code: 410, label: "Долгосрочные обязательства (4100)", isSub: false, isTotal: false },
  { code: 411, label: "  — Облигации к оплате (4110)", isSub: true, isTotal: false },
  { code: 412, label: "  — Банковские кредиты, займы (4120)", isSub: true, isTotal: false },
  { code: 413, label: "  — Прочие кредиты, займы (4130)", isSub: true, isTotal: false },
  { code: 414, label: "  — Векселя к оплате (4140)", isSub: true, isTotal: false },
  { code: 415, label: "  — Финансируемая аренда (4150)", isSub: true, isTotal: false },
  { code: 416, label: "  — Прочие долгоср. обязательства (4190)", isSub: true, isTotal: false },
  { code: 420, label: "Отсроченные доходы (4200)", isSub: false, isTotal: false },
  { code: 430, label: "Отсроченные налоговые обязательства (4300)", isSub: false, isTotal: false },
  { code: 431, label: "ИТОГО по разделу 4 «Долгосрочные обязательства»", isSub: false, isTotal: true },
  { code: 499, label: "ИТОГО ОБЯЗАТЕЛЬСТВА (раздел 3 + раздел 4)", isSub: false, isTotal: true },

  { code: null, label: "5. СОБСТВЕННЫЙ КАПИТАЛ", isSub: false, isTotal: false },
  { code: 510, label: "Уставный капитал (5100)", isSub: false, isTotal: false },
  { code: 511, label: "  — Простые акции (5110)", isSub: true, isTotal: false },
  { code: 512, label: "  — Привилегированные акции (5120)", isSub: true, isTotal: false },
  { code: 513, label: "  — Прочий уставный капитал (5130)", isSub: true, isTotal: false },
  { code: 514, label: "Выкупленные собственные акции (5191)", isSub: false, isTotal: false },
  { code: 520, label: "Прочий капитал (5200)", isSub: false, isTotal: false },
  { code: 521, label: "  — Дополнительный оплаченный капитал (5210)", isSub: true, isTotal: false },
  { code: 522, label: "  — Корректировки по переоценке (5220)", isSub: true, isTotal: false },
  { code: 524, label: "  — Капитал авансированный собственниками (5240)", isSub: true, isTotal: false },
  { code: 530, label: "Нераспределённая прибыль (5300)", isSub: false, isTotal: false },
  { code: 540, label: "Резервный капитал (5400)", isSub: false, isTotal: false },
  { code: 541, label: "ИТОГО по разделу 5 «Собственный капитал»", isSub: false, isTotal: true },
  { code: 599, label: "ИТОГО ОБЯЗАТЕЛЬСТВА И СОБСТВЕННЫЙ КАПИТАЛ (раздел 3+4+5)", isSub: false, isTotal: true },
];

export const BALANCE_TOTALS: Record<number, number[]> = {
  191: [110, 120, 130, 140, 150, 160, 180, 190],
  294: [210, 220, 230, 240, 250, 270, 280, 290],
  299: [191, 294],
  371: [310, 320, 330, 340, 350, 360, 370],
  431: [410, 420, 430],
  499: [371, 431],
  541: [510, 514, 520, 530, 540],
  599: [499, 541],
};

/** Returns BALANCE_ROWS grouped into sections, in source order, for rendering. */
export function balanceSections(): Array<{ title: string; rows: BalanceRow[] }> {
  const sections: Array<{ title: string; rows: BalanceRow[] }> = [];
  let current: { title: string; rows: BalanceRow[] } | null = null;
  for (const row of BALANCE_ROWS) {
    if (row.code === null) {
      current = { title: row.label, rows: [] };
      sections.push(current);
    } else if (!row.isTotal && current) {
      current.rows.push(row);
    }
  }
  return sections;
}

/** Computes total rows from leaf inputs, mirroring the Python loop over BALANCE_TOTALS. */
export function computeBalanceTotals(values: Record<number, number>): Record<number, number> {
  const all = { ...values };
  // sums may reference other totals (e.g. 299 = 191+294), so process in code order
  for (const tc of Object.keys(BALANCE_TOTALS).map(Number).sort((a, b) => a - b)) {
    const sources = BALANCE_TOTALS[tc];
    all[tc] = sources.reduce((s, c) => s + (all[c] ?? 0), 0);
  }
  return all;
}
