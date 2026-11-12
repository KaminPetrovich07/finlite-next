// ════════════════════════════════════════════════════════════════════════
// lib/ledger/ifrs.ts — работа без шифров счетов: статьи МСФО.
//
// Внутри программы каждая сумма по-прежнему лежит на счёте плана счетов КР
// (Пост. № 231): по кодам строятся ФОСАМК Ф.1–Ф.4, отчёты ГНС и обмен с 1С.
// Здесь каждому счёту дано имя статьи в терминах МСФО и строка отчёта по
// МСФО (IAS) 1, чтобы пользователь мог вообще не видеть кодов:
//   • в журнале выбирает «Выручка от реализации товаров и услуг», а не 6110;
//   • ОСВ и проводки показываются названиями статей;
//   • отчётность собирается по МСФО (IAS) 1 и (IAS) 7, без строк ФОСАМК.
//
// Отличия МСФО от национальной формы, которые здесь учтены:
//   • чрезвычайные статьи МСФО запрещает (IAS 1.87) — 9810/9820 идут
//     в прочие доходы и расходы;
//   • неоплаченный уставный капитал (1900) вычитается из капитала;
//   • процентные и курсовые доходы/расходы неоперационной деятельности —
//     финансовые доходы и расходы (IAS 1.82);
//   • гудвил не амортизируется (IFRS 3) — 2992 называется «обесценение».
// ════════════════════════════════════════════════════════════════════════

import { ACCOUNTS, getAccount, type Account, type CfRole } from "./accounts";
import type { Statements } from "./engine";
import type { LedgerEntry } from "./types";
import { round2 } from "./types";

// ── строки отчётов ─────────────────────────────────────────────────────────

export type SfpLine =
  // внеоборотные активы
  | "ppe" | "investProp" | "goodwill" | "intangibles" | "bio" | "groupInvest" | "finAssetsNc" | "recvNc" | "dta" | "otherNc"
  // оборотные активы
  | "inventories" | "tradeRecv" | "advancesPaid" | "taxAssets" | "finAssetsC" | "cash"
  // капитал
  | "shareCapital" | "treasury" | "unpaidCapital" | "addCapital" | "revaluation" | "fxReserve" | "legalReserve" | "retained"
  // долгосрочные обязательства
  | "borrowingsNc" | "leaseNc" | "deferredIncome" | "dtl" | "otherLiabNc"
  // краткосрочные обязательства
  | "tradePay" | "contractLiab" | "borrowingsC" | "employees" | "taxPay" | "provisions";

export type PlLine =
  | "revenue" | "cogs" | "otherIncome" | "selling" | "admin" | "otherExpense"
  | "financeIncome" | "financeCosts" | "shareOfAssoc" | "incomeTax";

export type IfrsLine = SfpLine | PlLine;

export const SFP_LABEL: Record<SfpLine, string> = {
  ppe: "Основные средства", investProp: "Инвестиционная недвижимость", goodwill: "Гудвил", intangibles: "Нематериальные активы",
  bio: "Биологические активы", groupInvest: "Инвестиции в дочерние, совместные и ассоциированные организации",
  finAssetsNc: "Прочие долгосрочные финансовые активы", recvNc: "Долгосрочная дебиторская задолженность",
  dta: "Отложенные налоговые активы", otherNc: "Прочие внеоборотные активы",
  inventories: "Запасы", tradeRecv: "Торговая и прочая дебиторская задолженность", advancesPaid: "Авансы выданные и расходы будущих периодов",
  taxAssets: "Текущие налоговые активы", finAssetsC: "Краткосрочные финансовые активы", cash: "Денежные средства и их эквиваленты",
  shareCapital: "Уставный капитал", treasury: "Выкупленные собственные акции (доли)", unpaidCapital: "Неоплаченный уставный капитал",
  addCapital: "Эмиссионный доход и вклады собственников", revaluation: "Резерв переоценки", fxReserve: "Резерв курсовых разниц при пересчёте",
  legalReserve: "Резервный капитал", retained: "Нераспределённая прибыль (непокрытый убыток)",
  borrowingsNc: "Долгосрочные кредиты и займы", leaseNc: "Обязательства по аренде", deferredIncome: "Отложенный доход",
  dtl: "Отложенные налоговые обязательства", otherLiabNc: "Прочие долгосрочные обязательства",
  tradePay: "Торговая и прочая кредиторская задолженность", contractLiab: "Обязательства по договорам с покупателями",
  borrowingsC: "Краткосрочные кредиты и займы", employees: "Обязательства перед работниками", taxPay: "Текущие налоговые обязательства",
  provisions: "Оценочные обязательства (резервы)",
};

export const PL_LABEL: Record<PlLine, string> = {
  revenue: "Выручка", cogs: "Себестоимость продаж", otherIncome: "Прочие доходы", selling: "Коммерческие расходы",
  admin: "Административные расходы", otherExpense: "Прочие расходы", financeIncome: "Финансовые доходы",
  financeCosts: "Финансовые расходы", shareOfAssoc: "Доля в прибыли дочерних и ассоциированных организаций",
  incomeTax: "Расход по налогу на прибыль",
};

export const SFP_SECTIONS: Array<{ key: string; title: string; side: "assets" | "equity" | "liabilities"; lines: SfpLine[] }> = [
  { key: "nca", title: "Внеоборотные активы", side: "assets", lines: ["ppe", "investProp", "goodwill", "intangibles", "bio", "groupInvest", "finAssetsNc", "recvNc", "dta", "otherNc"] },
  { key: "ca", title: "Оборотные активы", side: "assets", lines: ["inventories", "tradeRecv", "advancesPaid", "taxAssets", "finAssetsC", "cash"] },
  { key: "eq", title: "Капитал", side: "equity", lines: ["shareCapital", "treasury", "unpaidCapital", "addCapital", "revaluation", "fxReserve", "legalReserve", "retained"] },
  { key: "ncl", title: "Долгосрочные обязательства", side: "liabilities", lines: ["borrowingsNc", "leaseNc", "deferredIncome", "dtl", "otherLiabNc"] },
  { key: "cl", title: "Краткосрочные обязательства", side: "liabilities", lines: ["tradePay", "contractLiab", "borrowingsC", "employees", "taxPay", "provisions"] },
];

// ── статьи по счетам ───────────────────────────────────────────────────────
// [код, название статьи, строка отчёта]

const T: Array<[string, string, IfrsLine]> = [
  ["1110", "Наличные в кассе (сом)", "cash"],
  ["1120", "Наличные в кассе (валюта)", "cash"],
  ["1130", "Денежные документы", "cash"],
  ["1140", "Денежные эквиваленты", "cash"],
  ["1210", "Расчётный счёт в банке (сом)", "cash"],
  ["1220", "Валютный счёт в банке Кыргызстана", "cash"],
  ["1230", "Счёт в зарубежном банке", "cash"],
  ["1240", "Денежные средства с ограничением использования (краткосрочные)", "cash"],
  ["1250", "Переводы в пути", "cash"],
  ["1310", "Долговые ценные бумаги (краткосрочные)", "finAssetsC"],
  ["1320", "Долевые ценные бумаги (краткосрочные)", "finAssetsC"],
  ["1330", "Займы выданные (краткосрочные)", "finAssetsC"],
  ["1340", "Банковские депозиты (краткосрочные)", "finAssetsC"],
  ["1350", "Текущая часть долгосрочных финансовых активов", "finAssetsC"],
  ["1390", "Прочие краткосрочные финансовые активы", "finAssetsC"],
  ["1410", "Торговая дебиторская задолженность", "tradeRecv"],
  ["1491", "Оценочный резерв под ожидаемые кредитные убытки", "tradeRecv"],
  ["1510", "Векселя к получению", "tradeRecv"],
  ["1520", "Задолженность работников и директоров", "tradeRecv"],
  ["1530", "Налоги, уплаченные авансом", "taxAssets"],
  ["1540", "Налоги к возмещению из бюджета", "taxAssets"],
  ["1550", "Проценты к получению", "tradeRecv"],
  ["1560", "Дивиденды к получению", "tradeRecv"],
  ["1570", "Активы по договорам строительства", "tradeRecv"],
  ["1580", "Текущая часть долгосрочной дебиторской задолженности", "tradeRecv"],
  ["1590", "Прочая дебиторская задолженность", "tradeRecv"],
  ["1590.01", "Невыясненные платежи", "tradeRecv"],
  ["1610", "Товары для перепродажи", "inventories"],
  ["1691", "Торговая наценка в остатке товаров", "inventories"],
  ["1620", "Сырьё и основные материалы", "inventories"],
  ["1630", "Незавершённое производство", "inventories"],
  ["1640", "Готовая продукция", "inventories"],
  ["1650", "Сельскохозяйственная продукция", "inventories"],
  ["1710", "Топливо", "inventories"],
  ["1720", "Запасные части", "inventories"],
  ["1730", "Строительные материалы", "inventories"],
  ["1740", "Прочие материалы", "inventories"],
  ["1750", "Малоценные предметы на складе", "inventories"],
  ["1795", "Малоценные предметы в эксплуатации", "inventories"],
  ["1810", "Авансы поставщикам за запасы", "advancesPaid"],
  ["1820", "Авансы за услуги", "advancesPaid"],
  ["1830", "Аренда, оплаченная вперёд", "advancesPaid"],
  ["1890", "Прочие авансы выданные", "advancesPaid"],
  ["1900", "Неоплаченные вклады в уставный капитал", "unpaidCapital"],
  ["2110", "Земля", "ppe"],
  ["2120", "Незавершённое строительство", "ppe"],
  ["2130", "Здания и сооружения", "ppe"],
  ["2193", "Накопленная амортизация: здания и сооружения", "ppe"],
  ["2140", "Машины и оборудование", "ppe"],
  ["2194", "Накопленная амортизация: машины и оборудование", "ppe"],
  ["2150", "Офисная техника", "ppe"],
  ["2195", "Накопленная амортизация: офисная техника", "ppe"],
  ["2160", "Мебель и инвентарь", "ppe"],
  ["2196", "Накопленная амортизация: мебель и инвентарь", "ppe"],
  ["2170", "Транспортные средства", "ppe"],
  ["2197", "Накопленная амортизация: транспортные средства", "ppe"],
  ["2180", "Улучшения арендованного имущества", "ppe"],
  ["2198", "Накопленная амортизация: улучшения арендованного имущества", "ppe"],
  ["2190", "Благоустройство земельных участков", "ppe"],
  ["2199", "Накопленная амортизация: благоустройство участков", "ppe"],
  ["2210", "Животные на выращивании и откорме", "bio"],
  ["2220", "Продуктивные животные", "bio"],
  ["2230", "Посевы и потребляемые растения", "bio"],
  ["2240", "Плодоносящие растения", "bio"],
  ["2250", "Биологические активы по фактическим затратам", "bio"],
  ["2290", "Прочие биологические активы", "bio"],
  ["2310", "Инвестиционная недвижимость: земля", "investProp"],
  ["2320", "Инвестиционная недвижимость: здания", "investProp"],
  ["2330", "Реконструкция инвестиционной недвижимости", "investProp"],
  ["2400", "Отложенные налоговые активы", "dta"],
  ["2500", "Денежные средства с ограничением использования (долгосрочные)", "otherNc"],
  ["2710", "Векселя к получению (долгосрочные)", "recvNc"],
  ["2720", "Долгосрочная торговая дебиторская задолженность", "recvNc"],
  ["2780", "Долгосрочные расходы будущих периодов", "otherNc"],
  ["2790", "Прочая долгосрочная дебиторская задолженность", "recvNc"],
  ["2810", "Долговые ценные бумаги (долгосрочные)", "finAssetsNc"],
  ["2820", "Займы выданные (долгосрочные)", "finAssetsNc"],
  ["2830", "Инвестиции в дочерние организации", "groupInvest"],
  ["2840", "Инвестиции в совместные предприятия", "groupInvest"],
  ["2850", "Инвестиции в ассоциированные организации", "groupInvest"],
  ["2890", "Прочие долгосрочные финансовые активы", "finAssetsNc"],
  ["2910", "Франшизы", "intangibles"],
  ["2991", "Накопленная амортизация: франшизы", "intangibles"],
  ["2920", "Гудвил", "goodwill"],
  ["2992", "Накопленное обесценение гудвила", "goodwill"],
  ["2930", "Патенты", "intangibles"],
  ["2993", "Накопленная амортизация: патенты", "intangibles"],
  ["2940", "Товарные знаки", "intangibles"],
  ["2994", "Накопленная амортизация: товарные знаки", "intangibles"],
  ["2950", "Авторские права", "intangibles"],
  ["2995", "Накопленная амортизация: авторские права", "intangibles"],
  ["2960", "Программное обеспечение", "intangibles"],
  ["2996", "Накопленная амортизация: программное обеспечение", "intangibles"],
  ["2970", "Лицензии", "intangibles"],
  ["2997", "Накопленная амортизация: лицензии", "intangibles"],
  ["2980", "Прочие нематериальные активы", "intangibles"],
  ["2998", "Накопленная амортизация: прочие нематериальные активы", "intangibles"],
  ["2990", "Разработки в процессе создания", "intangibles"],
  ["3110", "Торговая кредиторская задолженность", "tradePay"],
  ["3190", "Прочая кредиторская задолженность", "tradePay"],
  ["3210", "Авансы, полученные от покупателей", "contractLiab"],
  ["3220", "Обязательства по договорам строительства", "contractLiab"],
  ["3310", "Банковские кредиты (краткосрочные)", "borrowingsC"],
  ["3320", "Прочие займы полученные (краткосрочные)", "borrowingsC"],
  ["3330", "Текущая часть долгосрочных кредитов и займов", "borrowingsC"],
  ["3390", "Прочие краткосрочные долговые обязательства", "borrowingsC"],
  ["3410", "Налог на прибыль к уплате", "taxPay"],
  ["3420", "Подоходный налог к перечислению", "taxPay"],
  ["3430", "НДС к уплате", "taxPay"],
  ["3440", "Акцизы к уплате", "taxPay"],
  ["3490", "Прочие налоги к уплате", "taxPay"],
  ["3510", "Начисленные обязательства перед поставщиками", "tradePay"],
  ["3520", "Заработная плата к выплате", "employees"],
  ["3530", "Страховые взносы к уплате", "employees"],
  ["3540", "Дивиденды к выплате", "tradePay"],
  ["3550", "Проценты к уплате", "borrowingsC"],
  ["3590", "Прочие начисленные обязательства", "tradePay"],
  ["3600", "Прочие краткосрочные обязательства", "tradePay"],
  ["3600.01", "Невыясненные поступления", "tradePay"],
  ["3710", "Резерв по гарантийным обязательствам", "provisions"],
  ["3720", "Резерв по судебным искам", "provisions"],
  ["3730", "Прочие оценочные обязательства", "provisions"],
  ["4110", "Выпущенные облигации", "borrowingsNc"],
  ["4120", "Банковские кредиты (долгосрочные)", "borrowingsNc"],
  ["4130", "Прочие займы полученные (долгосрочные)", "borrowingsNc"],
  ["4140", "Векселя к уплате (долгосрочные)", "borrowingsNc"],
  ["4150", "Обязательства по аренде", "leaseNc"],
  ["4190", "Прочие долгосрочные обязательства", "otherLiabNc"],
  ["4200", "Отложенный доход", "deferredIncome"],
  ["4300", "Отложенные налоговые обязательства", "dtl"],
  ["5110", "Уставный капитал: простые акции (доли)", "shareCapital"],
  ["5120", "Уставный капитал: привилегированные акции", "shareCapital"],
  ["5191", "Выкупленные собственные акции (доли)", "treasury"],
  ["5130", "Прочий уставный капитал", "shareCapital"],
  ["5210", "Эмиссионный доход", "addCapital"],
  ["5220", "Резерв переоценки", "revaluation"],
  ["5230", "Резерв курсовых разниц при пересчёте", "fxReserve"],
  ["5240", "Вклады собственника в капитал", "addCapital"],
  ["5300", "Нераспределённая прибыль", "retained"],
  ["5400", "Резервный капитал", "legalReserve"],
  ["5999", "Свод доходов и расходов (закрытие периода)", "retained"],
  ["6110", "Выручка от реализации товаров и услуг", "revenue"],
  ["6120", "Возвраты и скидки покупателям", "revenue"],
  ["6130", "Выручка по бартерным операциям", "revenue"],
  ["6140", "Выручка по договорам строительства", "revenue"],
  ["6150", "Выручка от предоставления активов в пользование", "revenue"],
  ["6151", "Процентная выручка", "revenue"],
  ["6152", "Дивидендная выручка", "revenue"],
  ["6153", "Выручка от роялти", "revenue"],
  ["6154", "Выручка от аренды", "revenue"],
  ["6160", "Выручка по договорам страхования", "revenue"],
  ["6200", "Прочие операционные доходы", "otherIncome"],
  ["6210", "Прочий доход от аренды", "otherIncome"],
  ["6220", "Прочий доход от роялти", "otherIncome"],
  ["6230", "Полученные штрафы и неустойки", "otherIncome"],
  ["6240", "Положительные курсовые разницы (операционные)", "otherIncome"],
  ["6250", "Восстановление ранее списанной задолженности", "otherIncome"],
  ["6260", "Доход от обмена валюты", "otherIncome"],
  ["6310", "Прибыль от первоначального признания биологических активов", "otherIncome"],
  ["6320", "Доход от сбора сельхозпродукции", "otherIncome"],
  ["6330", "Изменение справедливой стоимости биологических активов", "otherIncome"],
  ["7000", "Себестоимость продаж (непрерывный учёт запасов)", "cogs"],
  ["7110", "Себестоимость: сырьё и материалы", "cogs"],
  ["7120", "Себестоимость: оплата труда", "cogs"],
  ["7130", "Себестоимость: страховые взносы", "cogs"],
  ["7140", "Себестоимость: коммунальные услуги", "cogs"],
  ["7150", "Себестоимость: амортизация", "cogs"],
  ["7160", "Себестоимость: ремонт и обслуживание", "cogs"],
  ["7170", "Себестоимость: прочие затраты", "cogs"],
  ["7180", "Продукция для собственных нужд", "cogs"],
  ["7190", "Корректировка стоимости запасов (производство)", "cogs"],
  ["7200", "Себестоимость проданных товаров", "cogs"],
  ["7210", "Закупка товаров", "cogs"],
  ["7220", "Возвраты товаров поставщикам", "cogs"],
  ["7230", "Товары для собственных нужд", "cogs"],
  ["7290", "Корректировка стоимости запасов (торговля)", "cogs"],
  ["7300", "Затраты на биологические активы", "cogs"],
  ["7400", "Затраты по договорам строительства", "cogs"],
  ["7510", "Реклама и продвижение", "selling"],
  ["7520", "Коммерческие расходы: оплата труда", "selling"],
  ["7530", "Коммерческие расходы: страховые взносы", "selling"],
  ["7540", "Хранение и доставка", "selling"],
  ["7550", "Ожидаемые кредитные убытки по покупателям", "selling"],
  ["7560", "Гарантийное обслуживание", "selling"],
  ["7570", "Прочие коммерческие расходы", "selling"],
  ["7580", "Коммерческие расходы: амортизация", "selling"],
  ["7590", "Расходы на стимулирование продаж", "selling"],
  ["7600", "Прочие производственные расходы", "otherExpense"],
  ["8010", "Административные расходы: оплата труда", "admin"],
  ["8020", "Административные расходы: страховые взносы", "admin"],
  ["8030", "Аренда помещений и имущества", "admin"],
  ["8040", "Услуги сторонних организаций", "admin"],
  ["8050", "Налог на имущество", "admin"],
  ["8060", "Канцелярские товары", "admin"],
  ["8070", "Связь и интернет", "admin"],
  ["8080", "Страхование", "admin"],
  ["8090", "Лицензии и разрешения", "admin"],
  ["8110", "Ремонт и обслуживание основных средств", "admin"],
  ["8120", "Программное обеспечение и ИТ-услуги", "admin"],
  ["8130", "Представительские расходы", "admin"],
  ["8140", "Аудит", "admin"],
  ["8150", "Юридические услуги", "admin"],
  ["8160", "Обучение персонала", "admin"],
  ["8170", "Консультационные услуги", "admin"],
  ["8180", "Связи с общественностью", "admin"],
  ["8190", "Прочие налоги и сборы", "admin"],
  ["8210", "Командировки", "admin"],
  ["8220", "Коммунальные услуги", "admin"],
  ["8230", "Штрафы и пени в бюджет", "otherExpense"],
  ["8240", "Штрафы и неустойки по договорам", "otherExpense"],
  ["8300", "Исследования и разработки", "admin"],
  ["8470", "Административные расходы: амортизация основных средств", "admin"],
  ["8480", "Амортизация нематериальных активов", "admin"],
  ["8490", "Прочие административные расходы", "admin"],
  ["9110", "Процентный доход", "financeIncome"],
  ["9120", "Доля в прибыли дочерних и ассоциированных организаций", "shareOfAssoc"],
  ["9130", "Дивиденды полученные", "financeIncome"],
  ["9140", "Положительные курсовые разницы (финансовые)", "financeIncome"],
  ["9190", "Прочие неоперационные доходы", "otherIncome"],
  ["9510", "Процентные расходы", "financeCosts"],
  ["9520", "Отрицательные курсовые разницы", "financeCosts"],
  ["9530", "Списание безнадёжной задолженности", "otherExpense"],
  ["9590", "Прочие неоперационные расходы", "otherExpense"],
  ["9810", "Доходы от необычных событий", "otherIncome"],
  ["9820", "Убытки от необычных событий", "otherExpense"],
  ["9910", "Расход по налогу на прибыль (единый налог, патент)", "incomeTax"],
];

const BY_CODE = new Map(T.map(([code, name, line]) => [code, { name, line }]));

/** Fallback for codes not listed above (new sub-accounts, accounts added later). */
function fallbackLine(a: Account | undefined, code: string): IfrsLine {
  const parent = a?.parent ?? code.split(".")[0];
  const viaParent = parent !== code ? BY_CODE.get(parent)?.line : undefined;
  if (viaParent) return viaParent;
  switch (a?.type) {
    case "asset": return code.startsWith("2") ? "otherNc" : "tradeRecv";
    case "liability": return code.startsWith("4") ? "otherLiabNc" : "tradePay";
    case "equity": return "retained";
    case "income": return "otherIncome";
    default: return "otherExpense";
  }
}

export function ifrsName(code: string): string {
  const hit = BY_CODE.get(code);
  if (hit) return hit.name;
  const a = getAccount(code);
  if (a?.parent && BY_CODE.get(a.parent)) return `${BY_CODE.get(a.parent)!.name}: ${a.name.replace(/\s*\(субсчёт.*\)$/, "")}`;
  return a?.name ?? `Статья ${code}`;
}

export function ifrsLine(code: string): IfrsLine {
  return BY_CODE.get(code)?.line ?? fallbackLine(getAccount(code), code);
}

export function lineLabel(l: IfrsLine): string {
  return (SFP_LABEL as Record<string, string>)[l] ?? (PL_LABEL as Record<string, string>)[l] ?? l;
}

export const isPlLine = (l: IfrsLine): l is PlLine => l in PL_LABEL;

// ── выбор статьи в журнале ─────────────────────────────────────────────────

export type AccountView = "codes" | "ifrs";

/** How an account is shown: «1210 Счета в национальной валюте» or «Расчётный счёт в банке (сом)». */
export function accountLabel(code: string, view: AccountView): string {
  if (view === "ifrs") return ifrsName(code);
  return `${code} ${getAccount(code)?.name ?? ""}`.trim();
}

const PICK_ORDER: IfrsLine[] = [
  "cash", "tradeRecv", "advancesPaid", "taxAssets", "inventories", "finAssetsC",
  "ppe", "intangibles", "goodwill", "investProp", "bio", "groupInvest", "finAssetsNc", "recvNc", "dta", "otherNc",
  "tradePay", "contractLiab", "employees", "taxPay", "borrowingsC", "provisions",
  "borrowingsNc", "leaseNc", "deferredIncome", "dtl", "otherLiabNc",
  "shareCapital", "treasury", "unpaidCapital", "addCapital", "revaluation", "fxReserve", "legalReserve", "retained",
  "revenue", "otherIncome", "financeIncome", "shareOfAssoc",
  "cogs", "selling", "admin", "otherExpense", "financeCosts", "incomeTax",
];

/** Postable accounts grouped by IFRS statement line, for the picker in IFRS mode. */
export function ifrsPickerGroups(): Array<{ title: string; accounts: Array<{ code: string; name: string }> }> {
  const groups = new Map<IfrsLine, Array<{ code: string; name: string }>>();
  for (const a of ACCOUNTS) {
    if (a.header || a.code === "5999") continue;
    const l = ifrsLine(a.code);
    (groups.get(l) ?? groups.set(l, []).get(l)!).push({ code: a.code, name: ifrsName(a.code) });
  }
  return PICK_ORDER.filter((l) => groups.has(l)).map((l) => ({ title: lineLabel(l), accounts: groups.get(l)! }));
}

// ── отчётность по МСФО ─────────────────────────────────────────────────────

export interface IfrsRow {
  key: string;
  label: string;
  current: number;
  previous: number;
  accounts: string[];
  kind: "line" | "subtotal" | "total" | "heading";
}

export interface IfrsCheck { title: string; ok: boolean; detail: string }

export interface IfrsStatements {
  sfp: IfrsRow[];
  pl: IfrsRow[];
  cf: IfrsRow[];
  equity: { columns: string[]; rows: Array<{ label: string; values: number[]; total: number; kind: "line" | "total" }> };
  checks: IfrsCheck[];
  /** account → its IFRS line, for drill-down */
  breakdown: Record<string, Array<{ code: string; name: string; current: number; previous: number }>>;
}

type Bal = Map<string, number>; // account → Dr − Cr

function balances(st: Statements): { open: Bal; close: Bal } {
  const open: Bal = new Map(), close: Bal = new Map();
  for (const r of st.trialBalance.rows) {
    open.set(r.account, r.openingDr - r.openingCr);
    close.set(r.account, r.closingDr - r.closingCr);
  }
  return { open, close };
}

const isPlAccount = (code: string) => {
  const t = getAccount(code)?.type;
  return t === "income" || t === "expense";
};

/** Statement-of-financial-position line amounts (assets Dr-positive, equity and liabilities Cr-positive). */
function sfpAmounts(b: Bal): { lines: Partial<Record<SfpLine, number>>; byAccount: Map<string, { line: SfpLine; amount: number }> } {
  const lines: Partial<Record<SfpLine, number>> = {};
  const byAccount = new Map<string, { line: SfpLine; amount: number }>();
  let cumulativePl = 0;
  for (const [code, net] of b) {
    if (isPlAccount(code)) { cumulativePl += net; continue; }
    const line = ifrsLine(code) as SfpLine;
    const a = getAccount(code);
    const sideAssets = SFP_SECTIONS.find((s) => s.lines.includes(line))?.side === "assets";
    const amount = sideAssets ? net : -net;
    lines[line] = (lines[line] ?? 0) + amount;
    byAccount.set(code, { line, amount });
    void a;
  }
  // P&L not yet closed to retained earnings belongs to retained earnings
  lines.retained = (lines.retained ?? 0) - cumulativePl;
  for (const k of Object.keys(lines) as SfpLine[]) lines[k] = round2(lines[k]!);
  return { lines, byAccount };
}

const CF_LABEL: Partial<Record<CfRole, [string, string]>> = {
  sales: ["Поступления от покупателей", "Возвраты покупателям"],
  supplies: ["Возвраты от поставщиков запасов", "Платежи поставщикам за запасы"],
  services: ["Возвраты за услуги", "Платежи за услуги"],
  otherOperating: ["Прочие операционные поступления", "Выплаты работникам, налоги (кроме налога на прибыль) и прочие платежи"],
  interest: ["Проценты полученные", "Проценты уплаченные"],
  incomeTax: ["Возврат налога на прибыль", "Налог на прибыль уплаченный"],
  fixedAssets: ["Поступления от продажи основных средств", "Приобретение основных средств"],
  intangibles: ["Поступления от продажи нематериальных активов", "Приобретение нематериальных активов"],
  securities: ["Поступления от продажи финансовых активов", "Приобретение финансовых активов"],
  investIncome: ["Проценты и дивиденды полученные", "Прочие платежи по инвестициям"],
  loansGiven: ["Возврат выданных займов и депозитов", "Займы выданные и размещённые депозиты"],
  otherInvesting: ["Прочие инвестиционные поступления", "Прочие инвестиционные платежи"],
  ownerCapital: ["Вклады собственников", "Выплаты собственникам (выкуп долей)"],
  borrowings: ["Кредиты и займы полученные", "Погашение кредитов и займов"],
  dividends: ["Дивиденды полученные", "Дивиденды выплаченные"],
};
const CF_SECTION: Record<string, "op" | "inv" | "fin"> = {
  sales: "op", supplies: "op", services: "op", otherOperating: "op", interest: "op", incomeTax: "op",
  fixedAssets: "inv", intangibles: "inv", securities: "inv", investIncome: "inv", loansGiven: "inv", otherInvesting: "inv",
  ownerCapital: "fin", borrowings: "fin", dividends: "fin",
};

export function buildIfrs(st: Statements, prev?: Statements | null, entries: LedgerEntry[] = []): IfrsStatements {
  const cur = balances(st);
  const sfpCur = sfpAmounts(cur.close);
  const sfpPrev = sfpAmounts(cur.open); // comparative = opening of the period (IAS 1.38)
  const breakdown: IfrsStatements["breakdown"] = {};

  // ── отчёт о финансовом положении ──
  const sfp: IfrsRow[] = [];
  const totals = { assets: [0, 0], equity: [0, 0], liabilities: [0, 0] };
  for (const s of SFP_SECTIONS) {
    if (s.side === "equity") sfp.push({ key: "h-eqliab", label: "КАПИТАЛ И ОБЯЗАТЕЛЬСТВА", current: 0, previous: 0, accounts: [], kind: "heading" });
    if (s.key === "nca") sfp.push({ key: "h-assets", label: "АКТИВЫ", current: 0, previous: 0, accounts: [], kind: "heading" });
    let c = 0, p = 0;
    const rows: IfrsRow[] = [];
    for (const l of s.lines) {
      const cv = sfpCur.lines[l] ?? 0, pv = sfpPrev.lines[l] ?? 0;
      const accounts = [...new Set([...sfpCur.byAccount, ...sfpPrev.byAccount].filter(([, v]) => v.line === l).map(([k]) => k))];
      if (Math.abs(cv) < 0.005 && Math.abs(pv) < 0.005 && l !== "retained") continue;
      rows.push({ key: l, label: SFP_LABEL[l], current: cv, previous: pv, accounts, kind: "line" });
      breakdown[l] = accounts.map((code) => ({ code, name: ifrsName(code), current: round2(sfpCur.byAccount.get(code)?.amount ?? 0), previous: round2(sfpPrev.byAccount.get(code)?.amount ?? 0) }));
      if (l === "retained") {
        const plCodes = [...cur.close.keys(), ...cur.open.keys()].filter(isPlAccount);
        if (plCodes.length) breakdown[l].push({ code: "pl", name: "Прибыль, не закрытая на нераспределённую прибыль", current: round2(-[...cur.close].filter(([k]) => isPlAccount(k)).reduce((x, [, v]) => x + v, 0)), previous: round2(-[...cur.open].filter(([k]) => isPlAccount(k)).reduce((x, [, v]) => x + v, 0)) });
      }
      c += cv; p += pv;
    }
    sfp.push(...rows);
    sfp.push({ key: `t-${s.key}`, label: `Итого: ${s.title.toLowerCase()}`, current: round2(c), previous: round2(p), accounts: [], kind: "subtotal" });
    totals[s.side][0] += c; totals[s.side][1] += p;
    if (s.key === "ca") sfp.push({ key: "t-assets", label: "ИТОГО АКТИВЫ", current: round2(totals.assets[0]), previous: round2(totals.assets[1]), accounts: [], kind: "total" });
    if (s.key === "eq") {
      // section headers for liabilities come next
    }
  }
  sfp.push({ key: "t-liab", label: "Итого обязательства", current: round2(totals.liabilities[0]), previous: round2(totals.liabilities[1]), accounts: [], kind: "subtotal" });
  sfp.push({ key: "t-eqliab", label: "ИТОГО КАПИТАЛ И ОБЯЗАТЕЛЬСТВА", current: round2(totals.equity[0] + totals.liabilities[0]), previous: round2(totals.equity[1] + totals.liabilities[1]), accounts: [], kind: "total" });

  // ── отчёт о прибыли или убытке ──
  const plOf = (s: Statements | null | undefined) => {
    const v: Partial<Record<PlLine, number>> = {};
    const acc: Partial<Record<PlLine, string[]>> = {};
    if (!s) return { v, acc };
    for (const [code, amount] of Object.entries(s.incomeStatement.byAccount)) {
      const l = ifrsLine(code) as PlLine;
      const a = getAccount(code);
      const signed = a?.type === "income" ? amount : -amount; // income +, expense −
      v[l] = (v[l] ?? 0) + signed;
      (acc[l] ??= []).push(code);
    }
    return { v, acc };
  };
  const pc = plOf(st), pp = plOf(prev);
  const g = (o: Partial<Record<PlLine, number>>, l: PlLine) => round2(o[l] ?? 0);
  const sub = (o: Partial<Record<PlLine, number>>, ls: PlLine[]) => round2(ls.reduce((s, l) => s + (o[l] ?? 0), 0));
  const plRow = (l: PlLine): IfrsRow => {
    const accounts = [...new Set([...(pc.acc[l] ?? []), ...(pp.acc[l] ?? [])])];
    breakdown[`pl-${l}`] = accounts.map((code) => {
      const sign = getAccount(code)?.type === "income" ? 1 : -1;
      return { code, name: ifrsName(code), current: round2(sign * (st.incomeStatement.byAccount[code] ?? 0)), previous: round2(sign * (prev?.incomeStatement.byAccount[code] ?? 0)) };
    });
    return { key: `pl-${l}`, label: PL_LABEL[l], current: g(pc.v, l), previous: g(pp.v, l), accounts, kind: "line" };
  };
  const grossL: PlLine[] = ["revenue", "cogs"];
  const opL: PlLine[] = [...grossL, "otherIncome", "selling", "admin", "otherExpense"];
  const ebtL: PlLine[] = [...opL, "financeIncome", "financeCosts", "shareOfAssoc"];
  const netL: PlLine[] = [...ebtL, "incomeTax"];
  const pl: IfrsRow[] = ([
    plRow("revenue"), plRow("cogs"),
    { key: "gross", label: "Валовая прибыль", current: sub(pc.v, grossL), previous: sub(pp.v, grossL), accounts: [], kind: "subtotal" },
    plRow("otherIncome"), plRow("selling"), plRow("admin"), plRow("otherExpense"),
    { key: "operating", label: "Операционная прибыль", current: sub(pc.v, opL), previous: sub(pp.v, opL), accounts: [], kind: "subtotal" },
    plRow("financeIncome"), plRow("financeCosts"), plRow("shareOfAssoc"),
    { key: "ebt", label: "Прибыль до налогообложения", current: sub(pc.v, ebtL), previous: sub(pp.v, ebtL), accounts: [], kind: "subtotal" },
    plRow("incomeTax"),
    { key: "net", label: "Прибыль (убыток) за период", current: sub(pc.v, netL), previous: sub(pp.v, netL), accounts: [], kind: "total" },
    { key: "oci", label: "Прочий совокупный доход", current: 0, previous: 0, accounts: [], kind: "line" },
    { key: "tci", label: "Итого совокупный доход за период", current: sub(pc.v, netL), previous: sub(pp.v, netL), accounts: [], kind: "total" },
  ] as IfrsRow[]).filter((r) => r.kind !== "line" || Math.abs(r.current) > 0.004 || Math.abs(r.previous) > 0.004 || r.key === "pl-revenue");

  // ── отчёт о движении денежных средств (прямой метод, IAS 7.18a) ──
  const cfFrom = (s: Statements | null | undefined) => {
    const v = new Map<string, number>(); // role:in / role:out
    if (!s) return v;
    for (const [code, amount] of Object.entries(s.cashFlow.byAccount)) {
      const role = (getAccount(code)?.cf ?? "otherOperating") as CfRole;
      if (role === "cash") continue;
      const k = `${role}:${amount >= 0 ? "in" : "out"}`;
      v.set(k, (v.get(k) ?? 0) + amount);
    }
    return v;
  };
  const cc = cfFrom(st), cp = cfFrom(prev);
  const cf: IfrsRow[] = [];
  const section = (sec: "op" | "inv" | "fin", title: string, totalLabel: string) => {
    cf.push({ key: `h-${sec}`, label: title, current: 0, previous: 0, accounts: [], kind: "heading" });
    let tc = 0, tp = 0;
    for (const [role, labels] of Object.entries(CF_LABEL) as Array<[CfRole, [string, string]]>) {
      if (CF_SECTION[role] !== sec) continue;
      for (const dir of ["in", "out"] as const) {
        const k = `${role}:${dir}`;
        const c = round2(cc.get(k) ?? 0), p = round2(cp.get(k) ?? 0);
        if (Math.abs(c) < 0.005 && Math.abs(p) < 0.005) continue;
        cf.push({ key: `cf-${k}`, label: labels[dir === "in" ? 0 : 1], current: c, previous: p, accounts: [], kind: "line" });
        tc += c; tp += p;
      }
    }
    cf.push({ key: `t-${sec}`, label: totalLabel, current: round2(tc), previous: round2(tp), accounts: [], kind: "subtotal" });
    return [tc, tp];
  };
  const [opC, opP] = section("op", "Денежные потоки от операционной деятельности", "Чистые денежные средства от операционной деятельности");
  const [invC, invP] = section("inv", "Денежные потоки от инвестиционной деятельности", "Чистые денежные средства от инвестиционной деятельности");
  const [finC, finP] = section("fin", "Денежные потоки от финансовой деятельности", "Чистые денежные средства от финансовой деятельности");
  const netC = round2(opC + invC + finC), netP = round2(opP + invP + finP);
  const cashOpen = sfpPrev.lines.cash ?? 0, cashClose = sfpCur.lines.cash ?? 0;
  const prevOpen = prev ? (sfpAmounts(balances(prev).open).lines.cash ?? 0) : 0;
  cf.push(
    { key: "net", label: "Чистое изменение денежных средств", current: netC, previous: netP, accounts: [], kind: "subtotal" },
    { key: "open", label: "Денежные средства на начало периода", current: round2(cashOpen), previous: round2(prevOpen), accounts: [], kind: "line" },
    { key: "close", label: "Денежные средства на конец периода", current: round2(cashOpen + netC), previous: round2(prevOpen + netP), accounts: [], kind: "total" },
  );

  // ── отчёт об изменениях в капитале ──
  const eqCols: Array<{ title: string; lines: SfpLine[] }> = [
    { title: "Уставный капитал", lines: ["shareCapital", "treasury", "unpaidCapital"] },
    { title: "Прочий капитал и резервы", lines: ["addCapital", "revaluation", "fxReserve", "legalReserve"] },
    { title: "Нераспределённая прибыль", lines: ["retained"] },
  ];
  const colSum = (lines: Partial<Record<SfpLine, number>>, c: { lines: SfpLine[] }) => round2(c.lines.reduce((s, l) => s + (lines[l] ?? 0), 0));
  const opening = eqCols.map((c) => colSum(sfpPrev.lines, c));
  const closing = eqCols.map((c) => colSum(sfpCur.lines, c));
  const profit = pl.find((r) => r.key === "net")?.current ?? 0;
  let dividends = 0;
  for (const e of entries) {
    if (e.source === "opening" || e.source === "closing" || e.date < st.period.from || e.date > st.period.to) continue;
    const toPayable = e.lines.some((l) => l.account === "3540" && l.credit > 0) || e.lines.some((l) => getAccount(l.account)?.cf === "cash" && l.credit > 0);
    for (const l of e.lines) if ((l.account === "5300" || l.account === "5999") && l.debit > 0 && toPayable) dividends += l.debit;
  }
  dividends = round2(dividends);
  const owners = closing.map((c, i) => (i === 2 ? round2(c - opening[i] - profit + dividends) : round2(c - opening[i])));
  const sum = (v: number[]) => round2(v.reduce((s, x) => s + x, 0));
  const equity = {
    columns: eqCols.map((c) => c.title),
    rows: [
      { label: `Остаток на ${st.period.from.split("-").reverse().join(".")}`, values: opening, total: sum(opening), kind: "total" as const },
      { label: "Прибыль (убыток) за период", values: [0, 0, round2(profit)], total: round2(profit), kind: "line" as const },
      { label: "Прочий совокупный доход", values: [0, 0, 0], total: 0, kind: "line" as const },
      { label: "Дивиденды", values: [0, 0, -dividends], total: -dividends, kind: "line" as const },
      { label: "Вклады собственников и прочие изменения", values: owners, total: sum(owners), kind: "line" as const },
      { label: `Остаток на ${st.period.to.split("-").reverse().join(".")}`, values: closing, total: sum(closing), kind: "total" as const },
    ].filter((r) => r.kind === "total" || Math.abs(r.total) > 0.004 || r.values.some((x) => Math.abs(x) > 0.004)),
  };

  // ── проверки ──
  const assets = totals.assets[0], eqLiab = totals.equity[0] + totals.liabilities[0];
  const checks: IfrsCheck[] = [
    { title: "Активы = капитал + обязательства", ok: Math.abs(assets - eqLiab) < 0.01, detail: `${fmt(assets)} и ${fmt(eqLiab)}` },
    { title: "Денежные средства в ОДДС и в отчёте о финансовом положении совпадают", ok: Math.abs(cashOpen + netC - cashClose) < 0.01, detail: `${fmt(cashOpen + netC)} и ${fmt(cashClose)}` },
    { title: "Капитал в отчёте об изменениях и в отчёте о финансовом положении совпадает", ok: Math.abs(sum(closing) - totals.equity[0]) < 0.01, detail: `${fmt(sum(closing))} и ${fmt(totals.equity[0])}` },
  ];
  const negCash = [...cur.close].filter(([k, v]) => getAccount(k)?.cf === "cash" && v < -0.004);
  if (negCash.length) checks.push({ title: "Отрицательный остаток денежных средств", ok: false, detail: `${negCash.map(([k]) => ifrsName(k)).join(", ")}: по МСФО (IAS) 7 банковский овердрафт показывают как заём, если он не часть управления денежными средствами` });
  const susp = ["1590.01", "3600.01"].filter((k) => Math.abs(cur.close.get(k) ?? 0) > 0.004);
  if (susp.length) checks.push({ title: "Есть невыясненные суммы", ok: false, detail: "Невыясненные платежи и поступления нужно разнести до выпуска отчётности" });

  return { sfp, pl, cf, equity, checks, breakdown };
}

const fmt = (n: number) => round2(n).toLocaleString("ru-RU", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

/** Every postable account has an IFRS article; names are unique, so they can replace codes. */
export function ifrsCoverage(): { missing: string[]; duplicates: string[] } {
  const missing = ACCOUNTS.filter((a) => !a.header && !BY_CODE.has(a.code)).map((a) => a.code);
  const seen = new Map<string, string>();
  const duplicates: string[] = [];
  for (const [code, { name }] of BY_CODE) {
    if (seen.has(name)) duplicates.push(`${seen.get(name)}/${code} ${name}`);
    seen.set(name, code);
  }
  return { missing, duplicates };
}
