// ════════════════════════════════════════════════════════════════════════
// lib/ledger/accounts.ts — план счетов бухгалтерского учёта КР
//
// Источник: Инструкция по применению плана счетов бухгалтерского учёта
// финансово-хозяйственной деятельности субъектов предпринимательства,
// некоммерческих организаций (утв. постановлением Правительства КР от
// 7 октября 2010 года № 231). Коды и названия — дословно из Инструкции.
// Таблица ниже сгенерирована из текста Инструкции; правки вносить здесь.
//
// Для каждого счёта задано:
//   bsRow / bsSub — строка ФОСАМК Ф.1 (lib/balance-sheet.ts), куда идёт сальдо;
//   pl            — раздел ОПиУ (по функции расходов, как в Ф.2);
//   nature        — элемент затрат (по характеру) для управленческого учёта и ESG;
//   cf            — роль в ОДДС прямым методом, когда счёт корреспондирует с деньгами.
// header = групповой счёт (1100, 1200 …): на него нельзя делать проводки.
// Исключения — 6200, 7000, 7200: Инструкция сама проводит операции по ним.
//
// Субсчета вида «1590.01» — аналитика внутри счёта Инструкции (она прямо
// допускает открытие субсчетов); сальдо идёт в строку родительского счёта.
//
// Учётная политика по налогам (видна в ОПиУ отдельной строкой):
//   налог на прибыль, единый налог, патент → 9910 (налоги «взамен налога на прибыль»);
//   налог с продаж, налог на имущество, прочие → 8190 / 8050.
// ════════════════════════════════════════════════════════════════════════

export type AccountType = "asset" | "liability" | "equity" | "income" | "expense";

/** Раздел ОПиУ (Ф.2), по функции. */
export type PlRole =
  | "revenue"              // 6100 выручка (6120 — уменьшает)
  | "otherOpIncome"        // 6200, 6300
  | "cogs"                 // 7000–7400 себестоимость
  | "selling"              // 7500 расходы по реализации
  | "otherOpExpense"       // 7600 прочие производственные расходы
  | "admin"                // 8000 общие и административные
  | "nonOpIncome"          // 9100
  | "nonOpExpense"         // 9500
  | "extraordinaryIncome"  // 9810
  | "extraordinaryExpense" // 9820
  | "incomeTax";           // 9910

/** Элемент затрат (по характеру). */
export type Nature =
  | "materials" | "payroll" | "social" | "utilities" | "depreciation" | "repairs" | "rent"
  | "services" | "marketing" | "logistics" | "badDebts" | "taxes" | "fines" | "training"
  | "rd" | "travel" | "office" | "interest" | "fx" | "other";

/** Role in the direct-method cash flow (ОДДС) when the account is the counterpart of a cash line. */
export type CfRole =
  | "cash"           // денежные средства (строки 110, 120 баланса)
  | "sales"          // 010 поступления от покупателей
  | "supplies"       // 050 закупка запасов
  | "services"       // 060 операционные расходы (услуги)
  | "interest"       // 070 проценты
  | "otherOperating" // 020 / 080 прочие (зарплата, налоги кроме налога на прибыль)
  | "incomeTax"      // 090 налог на прибыль
  | "fixedAssets"    // 210 / 280
  | "securities"     // 220 / 300
  | "intangibles"    // 230 / 290
  | "investIncome"   // 240
  | "loansGiven"     // 250 / 310
  | "ownerCapital"   // 430 / 490
  | "borrowings"     // 440 / 480
  | "dividends"      // — / 470
  | "otherInvesting";

export interface Account {
  code: string;
  name: string;
  type: AccountType;
  header?: true;
  contra?: true;
  /** for analytical sub-accounts like 1590.01 */
  parent?: string;
  bsRow?: number;
  bsSub?: number;
  pl?: PlRole;
  nature?: Nature;
  cf?: CfRole;
}

export const ACCOUNTS: Account[] = [
  // ── 1000 Оборотные активы ───────────────────────────────────────
  { code: "1000", name: "Оборотные активы", type: "asset", header: true },
  { code: "1100", name: "Денежные средства в кассе", type: "asset", header: true },
  { code: "1110", name: "Денежные средства в национальной валюте", type: "asset", cf: "cash", bsRow: 110 },
  { code: "1120", name: "Денежные средства в иностранной валюте", type: "asset", cf: "cash", bsRow: 110 },
  { code: "1130", name: "Денежные документы", type: "asset", cf: "cash", bsRow: 110 },
  { code: "1140", name: "Денежные эквиваленты", type: "asset", cf: "cash", bsRow: 110 },
  { code: "1200", name: "Денежные средства в банке", type: "asset", header: true },
  { code: "1210", name: "Счета в национальной валюте", type: "asset", cf: "cash", bsRow: 120 },
  { code: "1220", name: "Счета в иностранной валюте в местных банках", type: "asset", cf: "cash", bsRow: 120 },
  { code: "1230", name: "Счета в зарубежных банках", type: "asset", cf: "cash", bsRow: 120 },
  { code: "1240", name: "Денежные средства в банках, ограниченные к использованию", type: "asset", cf: "cash", bsRow: 120 },
  { code: "1250", name: "Денежные средства в пути", type: "asset", cf: "cash", bsRow: 120 },
  { code: "1300", name: "Краткосрочные инвестиции", type: "asset", header: true },
  { code: "1310", name: "Долговые ценные бумаги", type: "asset", cf: "securities", bsRow: 130, bsSub: 131 },
  { code: "1320", name: "Долевые ценные бумаги", type: "asset", cf: "securities", bsRow: 130, bsSub: 132 },
  { code: "1330", name: "Кредиты, займы выданные", type: "asset", cf: "loansGiven", bsRow: 130, bsSub: 133 },
  { code: "1340", name: "Депозитные вклады", type: "asset", cf: "loansGiven", bsRow: 130, bsSub: 133 },
  { code: "1350", name: "Текущая часть долгосрочных инвестиций", type: "asset", cf: "securities", bsRow: 130, bsSub: 134 },
  { code: "1390", name: "Прочие краткосрочные инвестиции", type: "asset", cf: "securities", bsRow: 130, bsSub: 135 },
  { code: "1400", name: "Счета к получению", type: "asset", header: true },
  { code: "1410", name: "Счета к получению за товары, услуги", type: "asset", cf: "sales", bsRow: 140, bsSub: 141 },
  { code: "1491", name: "Резерв на безнадежные долги по счетам к получению", type: "asset", contra: true, cf: "otherOperating", bsRow: 140, bsSub: 142 },
  { code: "1500", name: "Дебиторская задолженность по прочим операциям", type: "asset", header: true },
  { code: "1510", name: "Векселя к получению", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 151 },
  { code: "1520", name: "Дебиторская задолженность сотрудников и директоров", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 152 },
  { code: "1530", name: "Налоги, оплаченные авансом", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 153 },
  { code: "1540", name: "Налоги, подлежащие возмещению", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 153 },
  { code: "1550", name: "Проценты к получению", type: "asset", cf: "investIncome", bsRow: 150, bsSub: 154 },
  { code: "1560", name: "Дивиденды к получению", type: "asset", cf: "investIncome", bsRow: 150, bsSub: 154 },
  { code: "1570", name: "Задолженность заказчиков по договору на строительство", type: "asset", cf: "sales", bsRow: 150, bsSub: 155 },
  { code: "1580", name: "Текущая часть долгосрочной дебиторской задолженности", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 156 },
  { code: "1590", name: "Прочая дебиторская задолженность", type: "asset", cf: "otherOperating", bsRow: 150, bsSub: 157 },
  { code: "1590.01", name: "Невыясненные платежи (субсчёт 1590)", type: "asset", parent: "1590", cf: "otherOperating", bsRow: 150, bsSub: 157 },
  { code: "1600", name: "Товарно-материальные запасы", type: "asset", header: true },
  { code: "1610", name: "Товары", type: "asset", cf: "supplies", bsRow: 160, bsSub: 161 },
  { code: "1691", name: "Нереализованная торговая наценка", type: "asset", contra: true, cf: "supplies", bsRow: 160, bsSub: 161 },
  { code: "1620", name: "Запасы сырья и основных материалов", type: "asset", cf: "supplies", bsRow: 160, bsSub: 162 },
  { code: "1630", name: "Незавершенное производство", type: "asset", cf: "supplies", bsRow: 160, bsSub: 163 },
  { code: "1640", name: "Готовая продукция", type: "asset", cf: "supplies", bsRow: 160, bsSub: 164 },
  { code: "1650", name: "Сельхозпродукция с биологических активов", type: "asset", cf: "supplies", bsRow: 160, bsSub: 165 },
  { code: "1700", name: "Запасы вспомогательных материалов", type: "asset", header: true },
  { code: "1710", name: "Топливо", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1720", name: "Запасные части", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1730", name: "Строительные материалы", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1740", name: "Прочие материалы", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1750", name: "Малоценные и быстроизнашивающиеся предметы", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1795", name: "Малоценные и быстроизнашивающиеся предметы в эксплуатации", type: "asset", cf: "supplies", bsRow: 160, bsSub: 170 },
  { code: "1800", name: "Авансы выданные", type: "asset", header: true },
  { code: "1810", name: "Запасы, оплаченные авансом", type: "asset", cf: "supplies", bsRow: 180, bsSub: 181 },
  { code: "1820", name: "Услуги, оплаченные авансом", type: "asset", cf: "services", bsRow: 180, bsSub: 182 },
  { code: "1830", name: "Аренда, оплаченная авансом", type: "asset", cf: "services", bsRow: 180, bsSub: 183 },
  { code: "1890", name: "Прочие виды авансированных платежей", type: "asset", cf: "services", bsRow: 180, bsSub: 184 },
  { code: "1900", name: "Задолженность учредителей (участников) по вкладам в уставный капитал", type: "asset", cf: "ownerCapital", bsRow: 190 },

  // ── 2000 Внеоборотные активы ────────────────────────────────────
  { code: "2000", name: "Внеоборотные активы", type: "asset", header: true },
  { code: "2100", name: "Основные средства", type: "asset", header: true },
  { code: "2110", name: "Земля", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 211 },
  { code: "2120", name: "Незавершенное строительство", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 212 },
  { code: "2130", name: "Здания, сооружения", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 213 },
  { code: "2193", name: "Накопленная амортизация - здания, сооружения", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 213 },
  { code: "2140", name: "Оборудование", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 214 },
  { code: "2194", name: "Накопленная амортизация - оборудование", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 214 },
  { code: "2150", name: "Конторское оборудование", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 215 },
  { code: "2195", name: "Накопленная амортизация - конторское оборудование", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 215 },
  { code: "2160", name: "Мебель и принадлежности", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 216 },
  { code: "2196", name: "Накопленная амортизация - мебель и принадлежности", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 216 },
  { code: "2170", name: "Транспортные средства", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 217 },
  { code: "2197", name: "Накопленная амортизация - транспортные средства", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 217 },
  { code: "2180", name: "Благоустройство арендованной собственности", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 218 },
  { code: "2198", name: "Накопленная амортизация - благоустройство арендованной собственности", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 218 },
  { code: "2190", name: "Благоустройство земельных участков", type: "asset", cf: "fixedAssets", bsRow: 210, bsSub: 219 },
  { code: "2199", name: "Накопленная амортизация - благоустройство земельных участков", type: "asset", contra: true, cf: "fixedAssets", bsRow: 210, bsSub: 219 },
  { code: "2200", name: "Биологические активы", type: "asset", header: true },
  { code: "2210", name: "Животные (потребляемые биологические активы)", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2220", name: "Животные (плодоносящие биологические активы)", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2230", name: "Растения (потребляемые биологические активы)", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2240", name: "Плодоносящие растения", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2250", name: "Биологические активы, учитываемые по фактическим затратам", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2290", name: "Другие биологические активы", type: "asset", cf: "fixedAssets", bsRow: 220 },
  { code: "2300", name: "Инвестиции в недвижимость", type: "asset", header: true },
  { code: "2310", name: "Земля", type: "asset", cf: "fixedAssets", bsRow: 230 },
  { code: "2320", name: "Здания и сооружения", type: "asset", cf: "fixedAssets", bsRow: 230 },
  { code: "2330", name: "Реконструкция объектов инвестиций в недвижимость", type: "asset", cf: "fixedAssets", bsRow: 230 },
  { code: "2400", name: "Отсроченные налоговые требования", type: "asset", cf: "incomeTax", bsRow: 240 },
  { code: "2500", name: "Денежные средства, ограниченные к использованию", type: "asset", cf: "otherOperating", bsRow: 250 },
  { code: "2700", name: "Долгосрочная дебиторская задолженность", type: "asset", header: true },
  { code: "2710", name: "Векселя полученные", type: "asset", cf: "loansGiven", bsRow: 270 },
  { code: "2720", name: "Долгосрочная дебиторская задолженность покупателей и заказчиков", type: "asset", cf: "sales", bsRow: 270 },
  { code: "2780", name: "Долгосрочные отсроченные расходы", type: "asset", cf: "services", bsRow: 270 },
  { code: "2790", name: "Прочая долгосрочная дебиторская задолженность", type: "asset", cf: "loansGiven", bsRow: 270 },
  { code: "2800", name: "Долгосрочные инвестиции", type: "asset", header: true },
  { code: "2810", name: "Долговые ценные бумаги", type: "asset", cf: "securities", bsRow: 280 },
  { code: "2820", name: "Кредиты, займы выданные", type: "asset", cf: "loansGiven", bsRow: 280 },
  { code: "2830", name: "Инвестиции в дочерние компании", type: "asset", cf: "securities", bsRow: 280 },
  { code: "2840", name: "Инвестиции в совместную деятельность", type: "asset", cf: "securities", bsRow: 280 },
  { code: "2850", name: "Инвестиции в ассоциированные компании", type: "asset", cf: "securities", bsRow: 280 },
  { code: "2890", name: "Прочие долгосрочные инвестиции", type: "asset", cf: "securities", bsRow: 280, bsSub: 286 },
  { code: "2900", name: "Нематериальные активы", type: "asset", header: true },
  { code: "2910", name: "Франшиза", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2991", name: "Накопленная амортизация - франшиза", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2920", name: "Гудвилл", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2992", name: "Накопленная амортизация - гудвилл", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2930", name: "Патенты", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2993", name: "Накопленная амортизация - патенты", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2940", name: "Торговые марки", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2994", name: "Накопленная амортизация - торговые марки", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2950", name: "Авторские права", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2995", name: "Накопленная амортизация - авторские права", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2960", name: "Программное обеспечение", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2996", name: "Накопленная амортизация - программное обеспечение", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2970", name: "Лицензионное соглашение", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2997", name: "Накопленная амортизация - лицензионное соглашение", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2980", name: "Прочие активы", type: "asset", cf: "intangibles", bsRow: 290 },
  { code: "2998", name: "Накопленная амортизация - прочие активы", type: "asset", contra: true, cf: "intangibles", bsRow: 290 },
  { code: "2990", name: "Незавершенные разработки", type: "asset", cf: "intangibles", bsRow: 290 },

  // ── 3000 Краткосрочные обязательства ────────────────────────────
  { code: "3000", name: "Краткосрочные обязательства", type: "liability", header: true },
  { code: "3100", name: "Счета к оплате", type: "liability", header: true },
  { code: "3110", name: "Счета к оплате за товары и услуги", type: "liability", cf: "supplies", bsRow: 310 },
  { code: "3190", name: "Прочие счета к оплате", type: "liability", cf: "services", bsRow: 310 },
  { code: "3200", name: "Авансы полученные", type: "liability", header: true },
  { code: "3210", name: "Авансы покупателей и заказчиков", type: "liability", cf: "sales", bsRow: 320 },
  { code: "3220", name: "Задолженность заказчикам по договорам на строительство", type: "liability", cf: "sales", bsRow: 320 },
  { code: "3300", name: "Краткосрочные долговые обязательства", type: "liability", header: true },
  { code: "3310", name: "Банковские кредиты, займы", type: "liability", cf: "borrowings", bsRow: 330 },
  { code: "3320", name: "Прочие кредиты, займы", type: "liability", cf: "borrowings", bsRow: 330 },
  { code: "3330", name: "Текущая часть долгосрочных долговых обязательств", type: "liability", cf: "borrowings", bsRow: 330 },
  { code: "3390", name: "Прочие краткосрочные долговые обязательства", type: "liability", cf: "borrowings", bsRow: 330, bsSub: 334 },
  { code: "3400", name: "Налоги к оплате", type: "liability", header: true },
  { code: "3410", name: "Налог на прибыль к оплате", type: "liability", cf: "incomeTax", bsRow: 340, bsSub: 341 },
  { code: "3420", name: "Подоходный налог на доходы физических лиц", type: "liability", cf: "otherOperating", bsRow: 340, bsSub: 342 },
  { code: "3430", name: "НДС к оплате", type: "liability", cf: "otherOperating", bsRow: 340, bsSub: 343 },
  { code: "3440", name: "Акцизы к оплате", type: "liability", cf: "otherOperating", bsRow: 340, bsSub: 344 },
  { code: "3490", name: "Прочие налоги к оплате", type: "liability", cf: "otherOperating", bsRow: 340, bsSub: 345 },
  { code: "3500", name: "Краткосрочные начисленные обязательства", type: "liability", header: true },
  { code: "3510", name: "Начисленные обязательства по оплате товаров и услуг", type: "liability", cf: "services", bsRow: 350 },
  { code: "3520", name: "Начисленная заработная плата", type: "liability", cf: "otherOperating", bsRow: 350, bsSub: 352 },
  { code: "3530", name: "Начисленные взносы на социальное страхование", type: "liability", cf: "otherOperating", bsRow: 350, bsSub: 353 },
  { code: "3540", name: "Дивиденды к выплате", type: "liability", cf: "dividends", bsRow: 350, bsSub: 354 },
  { code: "3550", name: "Начисленные проценты по долговым обязательствам", type: "liability", cf: "interest", bsRow: 350, bsSub: 355 },
  { code: "3590", name: "Прочие начисленные расходы", type: "liability", cf: "services", bsRow: 350, bsSub: 356 },
  { code: "3600", name: "Прочие краткосрочные обязательства", type: "liability", cf: "otherOperating", bsRow: 360 },
  { code: "3600.01", name: "Невыясненные поступления (субсчёт 3600)", type: "liability", parent: "3600", cf: "otherOperating", bsRow: 360 },
  { code: "3700", name: "Резервы", type: "liability", header: true },
  { code: "3710", name: "Резерв на гарантийное обслуживание", type: "liability", cf: "otherOperating", bsRow: 370 },
  { code: "3720", name: "Резерв на оплату судебных исков", type: "liability", cf: "otherOperating", bsRow: 370 },
  { code: "3730", name: "Прочие резервы", type: "liability", cf: "otherOperating", bsRow: 370 },

  // ── 4000 Долгосрочные обязательства ─────────────────────────────
  { code: "4000", name: "Долгосрочные обязательства", type: "liability", header: true },
  { code: "4100", name: "Долгосрочные обязательства", type: "liability", header: true },
  { code: "4110", name: "Облигации к оплате", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 411 },
  { code: "4120", name: "Банковские кредиты, займы", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 412 },
  { code: "4130", name: "Прочие кредиты, займы", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 413 },
  { code: "4140", name: "Векселя к оплате", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 414 },
  { code: "4150", name: "Обязательства по финансовой аренде", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 415 },
  { code: "4190", name: "Прочие долгосрочные обязательства", type: "liability", cf: "borrowings", bsRow: 410, bsSub: 416 },
  { code: "4200", name: "Отсроченные доходы", type: "liability", cf: "sales", bsRow: 420 },
  { code: "4300", name: "Отсроченные налоговые обязательства", type: "liability", cf: "incomeTax", bsRow: 430 },

  // ── 5000 Собственный капитал ────────────────────────────────────
  { code: "5000", name: "Собственный капитал", type: "equity", header: true },
  { code: "5100", name: "Уставный капитал", type: "equity", header: true },
  { code: "5110", name: "Простые акции", type: "equity", cf: "ownerCapital", bsRow: 510, bsSub: 511 },
  { code: "5120", name: "Привилегированные акции", type: "equity", cf: "ownerCapital", bsRow: 510, bsSub: 512 },
  { code: "5191", name: "Выкупленные собственные акции", type: "equity", contra: true, cf: "ownerCapital", bsRow: 514 },
  { code: "5130", name: "Прочий уставный капитал", type: "equity", cf: "ownerCapital", bsRow: 510, bsSub: 513 },
  { code: "5200", name: "Прочий капитал", type: "equity", header: true },
  { code: "5210", name: "Дополнительно оплаченный капитал", type: "equity", cf: "ownerCapital", bsRow: 520, bsSub: 521 },
  { code: "5220", name: "Корректировки по переоценке активов", type: "equity", cf: "otherOperating", bsRow: 520, bsSub: 522 },
  { code: "5230", name: "Курсовые разницы по операциям в иностранной валюте по зарубежным компаниям", type: "equity", cf: "otherOperating", bsRow: 520 },
  { code: "5240", name: "Капитал, авансированный собственником (собственниками)", type: "equity", cf: "ownerCapital", bsRow: 520, bsSub: 524 },
  { code: "5300", name: "Нераспределенная прибыль", type: "equity", cf: "dividends", bsRow: 530 },
  { code: "5400", name: "Резервный капитал", type: "equity", cf: "otherOperating", bsRow: 540 },
  { code: "5999", name: "Свод доходов и расходов", type: "equity", cf: "dividends", bsRow: 530 },

  // ── 6000 Доходы от операционной деятельности ────────────────────
  { code: "6000", name: "Доходы от операционной деятельности", type: "income", header: true },
  { code: "6100", name: "Выручка", type: "income", header: true },
  { code: "6110", name: "Выручка от реализации товаров и услуг", type: "income", pl: "revenue", cf: "sales" },
  { code: "6120", name: "Возврат проданных товаров и скидки", type: "income", contra: true, pl: "revenue", cf: "sales" },
  { code: "6130", name: "Выручка от обмена товаров и услуг", type: "income", pl: "revenue", cf: "sales" },
  { code: "6140", name: "Выручка по договорам на строительство", type: "income", pl: "revenue", cf: "sales" },
  { code: "6150", name: "Выручка от использования другими организациями активов субъекта", type: "income", pl: "revenue", cf: "sales" },
  { code: "6151", name: "Выручка - проценты", type: "income", pl: "revenue", cf: "investIncome" },
  { code: "6152", name: "Выручка - дивиденды", type: "income", pl: "revenue", cf: "investIncome" },
  { code: "6153", name: "Выручка - лицензионные платежи", type: "income", pl: "revenue", cf: "sales" },
  { code: "6154", name: "Доход от операционной аренды", type: "income", pl: "revenue", cf: "sales" },
  { code: "6160", name: "Выручка по договорам страхования", type: "income", pl: "revenue", cf: "sales" },
  { code: "6200", name: "Прочие доходы от операционной деятельности", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6210", name: "Доход от операционной аренды", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6220", name: "Доход от лицензионных платежей", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6230", name: "Штрафы, пени, неустойки, полученные в связи с операционной деятельностью", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6240", name: "Положительные курсовые разницы по операционной деятельности", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6250", name: "Возврат долгов, списанных ранее как безнадежные", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6260", name: "Прибыль от обмена валюты", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6300", name: "Прибыль (убыток) от биологических активов", type: "income", header: true },
  { code: "6310", name: "Прибыль (убыток) от первоначального признания биологических активов", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6320", name: "Доход от сбора сельхозпродукции", type: "income", pl: "otherOpIncome", cf: "otherOperating" },
  { code: "6330", name: "Прибыль (убыток) от изменения справедливой стоимости биологических активов", type: "income", pl: "otherOpIncome", cf: "otherOperating" },

  // ── 7000–8000 Операционные расходы ──────────────────────────────
  { code: "7000", name: "Себестоимость реализованной продукции и услуг, определенная методом непрерывного учета товарно-материальных запасов", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7100", name: "Себестоимость реализованной продукции и услуг, определенная методом периодического учета товарно-материальных запасов", type: "expense", header: true },
  { code: "7110", name: "Затраты по приобретению сырья, материалов с учетом возврата", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7120", name: "Затраты по оплате труда", type: "expense", pl: "cogs", nature: "payroll", cf: "otherOperating" },
  { code: "7130", name: "Затраты по отчислениям в Социальный фонд", type: "expense", pl: "cogs", nature: "social", cf: "otherOperating" },
  { code: "7140", name: "Затраты на коммунальные услуги", type: "expense", pl: "cogs", nature: "utilities", cf: "supplies" },
  { code: "7150", name: "Затраты на амортизацию основных производственных средств", type: "expense", pl: "cogs", nature: "depreciation", cf: "supplies" },
  { code: "7160", name: "Затраты на ремонт и обслуживание основных средств", type: "expense", pl: "cogs", nature: "repairs", cf: "supplies" },
  { code: "7170", name: "Прочие производственные затраты", type: "expense", pl: "cogs", cf: "supplies" },
  { code: "7180", name: "Использование запасов продукции для собственных нужд", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7190", name: "Корректировки стоимости запасов", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7200", name: "Себестоимость реализованных товаров (торговля)", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7210", name: "Приобретение товаров", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7220", name: "Возврат приобретенного товара", type: "expense", contra: true, pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7230", name: "Использование товаров для собственных нужд", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7290", name: "Корректировки стоимости запасов", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7300", name: "Расходы по производству биологических активов", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7400", name: "Затраты по договорам на строительство", type: "expense", pl: "cogs", nature: "materials", cf: "supplies" },
  { code: "7500", name: "Расходы, связанные с реализацией", type: "expense", header: true },
  { code: "7510", name: "Расходы на рекламу и содействие продаже", type: "expense", pl: "selling", nature: "marketing", cf: "services" },
  { code: "7520", name: "Расходы по выплате заработной платы", type: "expense", pl: "selling", nature: "payroll", cf: "otherOperating" },
  { code: "7530", name: "Расходы по отчислениям в Социальный фонд", type: "expense", pl: "selling", nature: "social", cf: "otherOperating" },
  { code: "7540", name: "Расходы по хранению и транспортные расходы", type: "expense", pl: "selling", nature: "logistics", cf: "services" },
  { code: "7550", name: "Расходы по безнадежным долгам, относящимся к реализации", type: "expense", pl: "selling", nature: "badDebts", cf: "services" },
  { code: "7560", name: "Расходы по гарантийному обслуживанию", type: "expense", pl: "selling", cf: "services" },
  { code: "7570", name: "Прочие торговые издержки", type: "expense", pl: "selling", cf: "services" },
  { code: "7580", name: "Расходы по амортизации основных средств", type: "expense", pl: "selling", nature: "depreciation", cf: "services" },
  { code: "7590", name: "Расходы на премиальные продажи", type: "expense", pl: "selling", nature: "marketing", cf: "services" },
  { code: "7600", name: "Прочие производственные расходы", type: "expense", pl: "otherOpExpense", cf: "services" },
  { code: "8000", name: "Общие и административные расходы", type: "expense", header: true },
  { code: "8010", name: "Расходы по оплате труда", type: "expense", pl: "admin", nature: "payroll", cf: "otherOperating" },
  { code: "8020", name: "Расходы по отчислениям в Социальный фонд", type: "expense", pl: "admin", nature: "social", cf: "otherOperating" },
  { code: "8030", name: "Расходы по оплате аренды", type: "expense", pl: "admin", nature: "rent", cf: "services" },
  { code: "8040", name: "Расходы по оплате услуг", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8050", name: "Налог на имущество", type: "expense", pl: "admin", nature: "taxes", cf: "otherOperating" },
  { code: "8060", name: "Расходы на канцелярские принадлежности", type: "expense", pl: "admin", nature: "office", cf: "services" },
  { code: "8070", name: "Расходы на коммуникации", type: "expense", pl: "admin", nature: "office", cf: "services" },
  { code: "8080", name: "Расходы по оплате страховок", type: "expense", pl: "admin", nature: "office", cf: "services" },
  { code: "8090", name: "Расходы по приобретению лицензий и прочих соглашений", type: "expense", pl: "admin", nature: "office", cf: "services" },
  { code: "8100", name: "Расходы по НДС, не принимаемому к зачету", type: "expense", header: true, nature: "taxes" },
  { code: "8110", name: "Ремонт и техническое обслуживание основных средств", type: "expense", pl: "admin", nature: "repairs", cf: "services" },
  { code: "8120", name: "Расходы по компьютерному обеспечению - программное обеспечение", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8130", name: "Представительские расходы", type: "expense", pl: "admin", nature: "office", cf: "services" },
  { code: "8140", name: "Вознаграждение аудиторам", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8150", name: "Вознаграждение юристам", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8160", name: "Расходы по обучению", type: "expense", pl: "admin", nature: "training", cf: "services" },
  { code: "8170", name: "Расходы по консультациям", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8180", name: "Расходы по связям с общественностью", type: "expense", pl: "admin", nature: "services", cf: "services" },
  { code: "8190", name: "Расходы по прочим налогам", type: "expense", pl: "admin", nature: "taxes", cf: "otherOperating" },
  { code: "8200", name: "Командировочные расходы (местные)", type: "expense", header: true, nature: "travel" },
  { code: "8210", name: "Командировочные расходы (международные)", type: "expense", pl: "admin", nature: "travel", cf: "services" },
  { code: "8220", name: "Расходы по коммунальным услугам", type: "expense", pl: "admin", nature: "utilities", cf: "services" },
  { code: "8230", name: "Штрафы, пени, неустойки в бюджет", type: "expense", pl: "admin", nature: "fines", cf: "otherOperating" },
  { code: "8240", name: "Штрафы, пени, неустойки по хозяйственным договорам", type: "expense", pl: "admin", nature: "fines", cf: "otherOperating" },
  { code: "8300", name: "Расходы на исследования и научные разработки", type: "expense", pl: "admin", nature: "rd", cf: "services" },
  { code: "8470", name: "Расходы на амортизацию основных средств", type: "expense", pl: "admin", nature: "depreciation", cf: "services" },
  { code: "8480", name: "Расходы на амортизацию нематериальных активов", type: "expense", pl: "admin", nature: "depreciation", cf: "services" },
  { code: "8490", name: "Прочие общие и административные расходы", type: "expense", pl: "admin", cf: "services" },

  // ── 9000 Неоперационные доходы и расходы, налог на прибыль ──────
  { code: "9000", name: "Доходы и расходы от неоперационной деятельности", type: "expense", header: true },
  { code: "9100", name: "Доходы от неоперационной деятельности", type: "income", header: true },
  { code: "9110", name: "Доход в виде процентов", type: "income", pl: "nonOpIncome", cf: "investIncome" },
  { code: "9120", name: "Доход от ассоциированных, дочерних компаний", type: "income", pl: "nonOpIncome", cf: "investIncome" },
  { code: "9130", name: "Доход от дивидендов", type: "income", pl: "nonOpIncome", cf: "investIncome" },
  { code: "9140", name: "Доход от курсовых разниц по операциям в иностранной валюте", type: "income", pl: "nonOpIncome", cf: "otherOperating" },
  { code: "9190", name: "Прочие неоперационные доходы", type: "income", pl: "nonOpIncome", cf: "otherOperating" },
  { code: "9500", name: "Расходы по неоперационной деятельности", type: "expense", header: true },
  { code: "9510", name: "Расходы в виде процентов", type: "expense", pl: "nonOpExpense", nature: "interest", cf: "interest" },
  { code: "9520", name: "Убытки от курсовых разниц по операциям в иностранной валюте", type: "expense", pl: "nonOpExpense", nature: "fx", cf: "otherOperating" },
  { code: "9530", name: "Расходы по безнадежным долгам", type: "expense", pl: "nonOpExpense", nature: "badDebts", cf: "otherOperating" },
  { code: "9590", name: "Прочие неоперационные расходы", type: "expense", pl: "nonOpExpense", cf: "otherOperating" },
  { code: "9800", name: "Чрезвычайные статьи", type: "expense", header: true },
  { code: "9810", name: "Чрезвычайная прибыль", type: "income", pl: "extraordinaryIncome", cf: "otherOperating" },
  { code: "9820", name: "Чрезвычайный убыток", type: "expense", pl: "extraordinaryExpense", cf: "otherOperating" },
  { code: "9900", name: "Налоги на прибыль", type: "expense", header: true },
  { code: "9910", name: "Расходы (доходы) по налогу на прибыль", type: "expense", pl: "incomeTax", cf: "incomeTax" },
];

const BY_CODE = new Map(ACCOUNTS.map((a) => [a.code, a]));

export function getAccount(code: string): Account | undefined {
  return BY_CODE.get(code);
}

/** Exists and can be posted to (not a group header). */
export function isPostable(code: string): boolean {
  const a = BY_CODE.get(code);
  return !!a && !a.header;
}

export function accountName(code: string): string {
  return BY_CODE.get(code)?.name ?? `Счёт ${code}`;
}

export function isCash(code: string): boolean {
  return BY_CODE.get(code)?.cf === "cash";
}

export function isPl(code: string): boolean {
  const t = BY_CODE.get(code)?.type;
  return t === "income" || t === "expense";
}

export const POSTABLE_ACCOUNTS = ACCOUNTS.filter((a) => !a.header);
export const CASH_ACCOUNTS = POSTABLE_ACCOUNTS.filter((a) => a.cf === "cash").map((a) => a.code);
export const SUSPENSE_ACCOUNTS = ["1590.01", "3600.01"] as const;

/** The group header an account belongs to (1110 → 1100), for grouping in pickers. */
export function groupOf(code: string): Account | undefined {
  const base = code.split(".")[0];
  const g = `${base.slice(0, 2)}00`;
  const acc = BY_CODE.get(g);
  return acc && acc.code !== base ? acc : undefined;
}

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  asset: "Активы",
  liability: "Обязательства",
  equity: "Капитал",
  income: "Доходы",
  expense: "Расходы",
};

export const NATURE_LABEL: Record<Nature, string> = {
  materials: "Материалы и товары",
  payroll: "Оплата труда",
  social: "Отчисления в Социальный фонд",
  utilities: "Коммунальные услуги и энергия",
  depreciation: "Амортизация",
  repairs: "Ремонт и обслуживание",
  rent: "Аренда",
  services: "Услуги сторонних организаций",
  marketing: "Реклама и продвижение",
  logistics: "Хранение и транспорт",
  badDebts: "Безнадёжные долги",
  taxes: "Налоги в составе расходов",
  fines: "Штрафы и пени",
  training: "Обучение",
  rd: "Исследования и разработки",
  travel: "Командировки",
  office: "Офис, связь, страхование",
  interest: "Проценты по займам",
  fx: "Курсовые разницы",
  other: "Прочие расходы",
};
